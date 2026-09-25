/**
 * preset_helpers.ts
 * Core Git Engine & Staging Sandbox cho Preset Tools trong Kaiz Agent Extension.
 * Lấy cảm hứng từ kiến trúc Git Internals kết hợp tinh hoa của ST Multitool Preset Editor Agency.
 */

import { KaizDB, PresetCommitEntry } from '../db';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface PromptBlock {
    identifier: string;
    id?: string;
    name: string;
    content: string;
    enabled: boolean;
    role: 'system' | 'user' | 'assistant';
    system_prompt?: boolean;
    marker?: boolean;
    forbid_overrides?: boolean;
    injection_position?: number;
    injection_depth?: number;
    injection_order?: number;
}

export interface PresetContainer {
    prompts: PromptBlock[];
    prompt_order?: any[];
    preset_settings_openai?: string;
    [key: string]: any;
}

export interface PresetDiffItem {
    type: 'create' | 'update' | 'delete' | 'reorder' | 'varUpdate' | 'varRename';
    identifier?: string;
    name?: string;
    field?: string;
    oldValue?: any;
    newValue?: any;
    summary: string;
}

export interface PresetDiffResult {
    isDirty: boolean;
    totalChanges: number;
    added: number;
    modified: number;
    deleted: number;
    summary: string;
    items: PresetDiffItem[];
}

export interface SyntaxValidationResult {
    ok: boolean;
    totalBlocksChecked: number;
    errorCount: number;
    warningCount: number;
    errors: Array<{ identifier: string; name: string; error: string }>;
    warnings: Array<{ identifier: string; name: string; line?: number; warning: string }>;
    status: 'SYNTAX_OK' | 'SYNTAX_ERRORS_FOUND';
}

export interface ScannedVarRef {
    id: string;
    name: string;
    type: string;
    value: string;
    scope: 'chat' | 'global';
    promptName: string;
    promptId: string;
    fullMatch: string;
}

// ─── PresetGitManager Singleton ─────────────────────────────────────────────

export class PresetGitManager {
    private static instance: PresetGitManager | null = null;

    public static getInstance(): PresetGitManager {
        if (!PresetGitManager.instance) {
            PresetGitManager.instance = new PresetGitManager();
        }
        return PresetGitManager.instance;
    }

    // ─── Staging Sandbox State ──────────────────────────────────────────────
    private _stagingMap = new Map<string, Partial<PromptBlock>>(); // identifier -> changes
    private _stagingCreates: Array<{ block: PromptBlock; addToLinked: boolean; position?: number }> = [];
    private _stagingDeletes = new Set<string>(); // set of identifiers
    private _stagingOrder: string[] | null = null; // custom reordered identifiers
    private _stagingVars: Record<
        string,
        { promptId?: string; varName: string; oldValueMatch?: string; newValue: string; matchType?: string }
    > = {};
    private _stagingVarRenames: Record<string, string> = {}; // oldName -> newName
    private _activeHeads = new Map<string, string>(); // presetName -> commitHash

    private db = KaizDB.getInstance();

    // ─── SillyTavern Context Accessors ──────────────────────────────────────

    public getContainer(): PresetContainer | null {
        const win = window as any;
        if (win.SillyTavern && typeof win.SillyTavern.getContext === 'function') {
            const ctx = win.SillyTavern.getContext();
            if (ctx?.chatCompletionSettings && Array.isArray(ctx.chatCompletionSettings.prompts)) {
                return ctx.chatCompletionSettings;
            }
            if (ctx?.power_user?.instruct && Array.isArray(ctx.power_user.instruct.prompts)) {
                return ctx.power_user.instruct;
            }
        }
        if (win.chatCompletionSettings && Array.isArray(win.chatCompletionSettings.prompts)) {
            return win.chatCompletionSettings;
        }
        return null;
    }

    public getActivePresetName(): string {
        const container = this.getContainer();
        const win = window as any;
        if (container?.preset_settings_openai) {
            return String(container.preset_settings_openai);
        }
        const $el = (win.$ ? win.$('#chat_completion_preset') : null) || (win.$ ? win.$('#openai_preset') : null);
        if ($el && $el.length && $el.val()) {
            return String($el.val());
        }
        return 'Default Preset';
    }

    public getRawLivePrompts(): PromptBlock[] {
        const container = this.getContainer();
        return (container?.prompts || []).map((p) => ({ ...p }));
    }

    public getRawLiveOrder(): string[] {
        const container = this.getContainer();
        if (!container) return [];
        const raw = container.prompt_order || [];
        if (!Array.isArray(raw) || raw.length === 0) {
            return (container.prompts || []).map((p) => p.identifier);
        }
        if (typeof raw[0] === 'object' && Array.isArray(raw[0].order)) {
            const win = window as any;
            const ctx = win.SillyTavern?.getContext?.() || {};
            const charId = ctx.characterId;
            const targetObj = raw.find((o: any) => String(o.character_id) === String(charId)) || raw[0];
            const orderList = targetObj?.order || [];
            return orderList.map((o: any) => (typeof o === 'string' ? o : o.identifier)).filter(Boolean);
        }
        return raw.map((o: any) => (typeof o === 'string' ? o : o.identifier)).filter(Boolean);
    }

    // ─── Staging / Sandbox Overlay Read ─────────────────────────────────────

    public getPrompts(): PromptBlock[] {
        const basePrompts = this.getRawLivePrompts();

        // 1. Map existing blocks with staging changes & filter deleted
        const prompts: PromptBlock[] = basePrompts
            .map((p) => {
                if (this._stagingDeletes.has(p.identifier)) return null;
                if (this._stagingMap.has(p.identifier)) {
                    const stagedFields = this._stagingMap.get(p.identifier)!;
                    return { ...p, ...stagedFields, identifier: p.identifier };
                }
                return { ...p };
            })
            .filter((p): p is PromptBlock => p !== null);

        // 2. Add staged new blocks
        for (const created of this._stagingCreates) {
            if (!this._stagingDeletes.has(created.block.identifier)) {
                prompts.push({ ...created.block });
            }
        }

        return prompts;
    }

    public getPromptOrder(): string[] {
        if (this._stagingOrder && Array.isArray(this._stagingOrder)) {
            return this._stagingOrder.filter((id) => id && !this._stagingDeletes.has(id));
        }

        const rawLiveOrder = this.getRawLiveOrder();
        const filteredLive = rawLiveOrder.filter((id) => id && !this._stagingDeletes.has(id));

        // Append created blocks that have addToLinked = true
        for (const created of this._stagingCreates) {
            if (created.addToLinked && !this._stagingDeletes.has(created.block.identifier)) {
                if (!filteredLive.includes(created.block.identifier)) {
                    if (
                        typeof created.position === 'number' &&
                        created.position >= 0 &&
                        created.position <= filteredLive.length
                    ) {
                        filteredLive.splice(created.position, 0, created.block.identifier);
                    } else {
                        filteredLive.push(created.block.identifier);
                    }
                }
            }
        }

        return filteredLive;
    }

    public findPrompt(identifier: string): PromptBlock | null {
        return this.getPrompts().find((p) => p.identifier === identifier) || null;
    }

    public findRawPrompt(identifier: string): PromptBlock | null {
        return this.getRawLivePrompts().find((p) => p.identifier === identifier) || null;
    }

    // ─── Staging Actions (Working Tree Sandbox) ─────────────────────────────

    public hasStagingChanges(): boolean {
        return (
            this._stagingMap.size > 0 ||
            this._stagingCreates.length > 0 ||
            this._stagingDeletes.size > 0 ||
            this._stagingOrder !== null ||
            Object.keys(this._stagingVars).length > 0 ||
            Object.keys(this._stagingVarRenames).length > 0
        );
    }

    public clearStaging(): void {
        this._stagingMap.clear();
        this._stagingCreates = [];
        this._stagingDeletes.clear();
        this._stagingOrder = null;
        this._stagingVars = {};
        this._stagingVarRenames = {};
    }

    public stageCreate(args: {
        name: string;
        content?: string;
        role?: 'system' | 'user' | 'assistant';
        injection_position?: number;
        injection_depth?: number;
        injection_order?: number;
        addToLinked?: boolean;
        position?: number;
    }): { ok: boolean; identifier: string; summary: string } {
        const identifier = 'block_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        const newBlock: PromptBlock = {
            identifier,
            id: identifier,
            name: args.name || 'New Block',
            content: args.content || '',
            role: args.role || 'system',
            enabled: true,
            injection_position: args.injection_position ?? 0,
            injection_depth: args.injection_depth ?? 4,
            injection_order: args.injection_order ?? 100,
        };

        const addToLinked = args.addToLinked ?? true;
        this._stagingCreates.push({ block: newBlock, addToLinked, position: args.position });

        return {
            ok: true,
            identifier,
            summary: `[Staged] Đã tạo block mới "${newBlock.name}" (${addToLinked ? 'Linked' : 'Unlinked'}) [ID: ${identifier}]`,
        };
    }

    public stageUpdateContent(identifier: string, content: string): { ok: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
        this._stagingMap.get(identifier)!.content = content;

        return {
            ok: true,
            summary: `[Staged] Đã cập nhật toàn bộ nội dung của block "${p.name}" (${content.length} ký tự).`,
        };
    }

    public stageReplaceText(
        identifier: string | null,
        target_string: string,
        replacement_string: string,
        isGlobal: boolean = false,
        onlyLinked: boolean = false,
    ): { ok: boolean; summary: string; modified_count: number } {
        if (!target_string) throw new Error('Tham số target_string không được để trống.');

        const prompts = this.getPrompts();
        const linkedSet = new Set(this.getPromptOrder());
        let modifiedCount = 0;
        const modifiedNames: string[] = [];

        if (isGlobal || !identifier) {
            for (const p of prompts) {
                if (onlyLinked && !linkedSet.has(p.identifier)) continue;
                if (!this._stagingMap.has(p.identifier)) this._stagingMap.set(p.identifier, {});
                const currentContent =
                    this._stagingMap.get(p.identifier)!.content !== undefined
                        ? this._stagingMap.get(p.identifier)!.content!
                        : p.content || '';

                if (currentContent.includes(target_string)) {
                    this._stagingMap.get(p.identifier)!.content = currentContent
                        .split(target_string)
                        .join(replacement_string);
                    modifiedCount++;
                    modifiedNames.push(p.name);
                }
            }

            if (modifiedCount === 0) {
                return {
                    ok: true,
                    summary: `Không tìm thấy đoạn "${target_string}" trong bất kỳ block nào.`,
                    modified_count: 0,
                };
            }
            return {
                ok: true,
                summary: `[Staged] Đã thay thế toàn cục trong ${modifiedCount} block: ${modifiedNames.join(', ')}`,
                modified_count: modifiedCount,
            };
        } else {
            const p = this.findPrompt(identifier);
            if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

            if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
            const currentContent =
                this._stagingMap.get(identifier)!.content !== undefined
                    ? this._stagingMap.get(identifier)!.content!
                    : p.content || '';

            if (!currentContent.includes(target_string)) {
                throw new Error(`Không tìm thấy đoạn "${target_string}" trong nội dung của block "${p.name}".`);
            }

            this._stagingMap.get(identifier)!.content = currentContent.split(target_string).join(replacement_string);
            return {
                ok: true,
                summary: `[Staged] Đã thay thế đoạn văn bản trong block "${p.name}".`,
                modified_count: 1,
            };
        }
    }

    public stageAppendContent(identifier: string, append_text: string): { ok: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
        const currentContent =
            this._stagingMap.get(identifier)!.content !== undefined
                ? this._stagingMap.get(identifier)!.content!
                : p.content || '';

        this._stagingMap.get(identifier)!.content =
            currentContent + (currentContent && append_text ? '\n' : '') + append_text;

        return {
            ok: true,
            summary: `[Staged] Đã nối thêm ${append_text.length} ký tự vào block "${p.name}".`,
        };
    }

    public stageUpdateMeta(identifier: string, meta: Partial<PromptBlock>): { ok: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        const allowedKeys: Array<keyof PromptBlock> = [
            'name',
            'role',
            'enabled',
            'injection_position',
            'injection_depth',
            'injection_order',
            'system_prompt',
            'marker',
            'forbid_overrides',
        ];

        const updates: Partial<PromptBlock> = {};
        for (const k of allowedKeys) {
            if (meta[k] !== undefined) (updates as any)[k] = meta[k];
        }

        if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
        Object.assign(this._stagingMap.get(identifier)!, updates);

        return {
            ok: true,
            summary: `[Staged] Đã cập nhật metadata [${Object.keys(updates).join(', ')}] cho block "${p.name}".`,
        };
    }

    public stageToggle(identifier: string, enabled?: boolean): { ok: boolean; enabled: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        const newEnabled = enabled !== undefined ? Boolean(enabled) : !p.enabled;
        if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
        this._stagingMap.get(identifier)!.enabled = newEnabled;

        return {
            ok: true,
            enabled: newEnabled,
            summary: `[Staged] Đã ${newEnabled ? 'BẬT' : 'TẮT'} block "${p.name}".`,
        };
    }

    public stageSetLinked(identifier: string, linked: boolean, position?: number): { ok: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        const currentOrder = this.getPromptOrder().slice();
        const idx = currentOrder.indexOf(identifier);

        if (linked) {
            if (idx === -1) {
                if (typeof position === 'number' && position >= 0 && position <= currentOrder.length) {
                    currentOrder.splice(position, 0, identifier);
                } else {
                    currentOrder.push(identifier);
                }
            } else if (
                typeof position === 'number' &&
                position >= 0 &&
                position < currentOrder.length &&
                position !== idx
            ) {
                currentOrder.splice(idx, 1);
                currentOrder.splice(position, 0, identifier);
            }
        } else {
            if (idx !== -1) {
                currentOrder.splice(idx, 1);
            }
        }

        this._stagingOrder = currentOrder;

        return {
            ok: true,
            summary: `[Staged] Đã chuyển block "${p.name}" thành ${linked ? `Linked (Vị trí #${currentOrder.indexOf(identifier) + 1})` : 'Unlinked'}.`,
        };
    }

    public stageReorder(order: string[]): { ok: boolean; summary: string } {
        if (!Array.isArray(order)) throw new Error('Tham số order phải là một mảng identifier.');
        const allPrompts = this.getPrompts();
        const missing = order.filter((id) => !allPrompts.some((p) => p.identifier === id));
        if (missing.length > 0) {
            throw new Error(`Các ID sau không tồn tại trong preset: ${missing.join(', ')}`);
        }

        this._stagingOrder = order.slice();
        return {
            ok: true,
            summary: `[Staged] Đã sắp xếp lại thứ tự của ${order.length} prompt blocks.`,
        };
    }

    public stageDuplicate(identifier: string, newName?: string): { ok: boolean; identifier: string; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        const duplicateName = newName || `${p.name} (Copy)`;
        const isLinked = this.getPromptOrder().includes(identifier);

        return this.stageCreate({
            name: duplicateName,
            content: p.content,
            role: p.role,
            injection_position: p.injection_position,
            injection_depth: p.injection_depth,
            injection_order: p.injection_order,
            addToLinked: isLinked,
        });
    }

    public stageDelete(identifier: string): { ok: boolean; summary: string } {
        const p = this.findPrompt(identifier);
        if (!p) throw new Error(`Không tìm thấy prompt block với ID: "${identifier}"`);

        // If it was created in this staging session, remove it directly
        const createdIdx = this._stagingCreates.findIndex((c) => c.block.identifier === identifier);
        if (createdIdx !== -1) {
            this._stagingCreates.splice(createdIdx, 1);
        } else {
            this._stagingDeletes.add(identifier);
        }

        if (this._stagingOrder) {
            this._stagingOrder = this._stagingOrder.filter((id) => id !== identifier);
        }

        return {
            ok: true,
            summary: `[Staged] Đã đánh dấu xóa block "${p.name}" [ID: ${identifier}].`,
        };
    }

    public stageBatchUpdate(updates: Array<{ identifier: string; [key: string]: any }>): {
        ok: boolean;
        summary: string;
        results: any[];
    } {
        if (!Array.isArray(updates)) throw new Error('Tham số updates phải là một mảng.');

        const results: any[] = [];
        let successCount = 0;

        for (const upd of updates) {
            const { identifier, ...fields } = upd;
            if (!this.findPrompt(identifier)) {
                results.push({ identifier, ok: false, error: 'Không tìm thấy ID' });
                continue;
            }

            if (!this._stagingMap.has(identifier)) this._stagingMap.set(identifier, {});
            const allowed: Array<keyof PromptBlock> = [
                'name',
                'content',
                'role',
                'enabled',
                'injection_position',
                'injection_depth',
                'injection_order',
                'system_prompt',
                'marker',
                'forbid_overrides',
            ];

            for (const k of allowed) {
                if (fields[k] !== undefined) (this._stagingMap.get(identifier)! as any)[k] = fields[k];
            }

            results.push({ identifier, ok: true });
            successCount++;
        }

        return {
            ok: true,
            summary: `[Staged] Đã cập nhật thành công ${successCount}/${updates.length} blocks trong batch.`,
            results,
        };
    }

    public stageUpdateVar(args: { varName: string; newValue: string; promptId?: string; oldValueMatch?: string }): {
        ok: boolean;
        summary: string;
    } {
        const { varName, newValue, promptId, oldValueMatch } = args;
        if (!varName || newValue === undefined) throw new Error('Thiếu varName hoặc newValue.');

        const prompts = this.getPrompts();
        let targetBlock: PromptBlock | null = null;
        let matchStr = oldValueMatch || '';

        for (const p of prompts) {
            if (promptId && p.identifier !== promptId) continue;
            const content = p.content || '';

            if (matchStr && content.includes(matchStr)) {
                targetBlock = p;
                break;
            }

            const regex = new RegExp(
                `\\{\\{(setvar|addvar|setglobalvar|addglobalvar)::${varName}::([\\s\\S]*?)\\}\\}`,
                'i',
            );
            const m = content.match(regex);
            if (m) {
                targetBlock = p;
                matchStr = m[0];
                break;
            }
        }

        if (!targetBlock || !matchStr) {
            throw new Error(`Không tìm thấy khai báo biến "${varName}" trong các prompt blocks.`);
        }

        const stId = `${targetBlock.identifier}::${varName}`;
        this._stagingVars[stId] = {
            promptId: targetBlock.identifier,
            varName,
            oldValueMatch: matchStr,
            newValue: String(newValue),
        };

        // Also reflect into staging content immediately
        if (!this._stagingMap.has(targetBlock.identifier)) this._stagingMap.set(targetBlock.identifier, {});
        const curContent =
            this._stagingMap.get(targetBlock.identifier)!.content !== undefined
                ? this._stagingMap.get(targetBlock.identifier)!.content!
                : targetBlock.content || '';

        const replaced = matchStr.replace(/::([^}]*)\}\}$/, `::${newValue}}}`);
        this._stagingMap.get(targetBlock.identifier)!.content = curContent.replace(matchStr, replaced);

        return {
            ok: true,
            summary: `[Staged] Đã cập nhật biến "${varName}" = "${newValue}" trong block "${targetBlock.name}".`,
        };
    }

    public stageRenameVar(oldName: string, newName: string): { ok: boolean; summary: string } {
        if (!oldName || !newName) throw new Error('Thiếu oldName hoặc newName.');

        this._stagingVarRenames[oldName] = newName;
        const prompts = this.getPrompts();
        let affected = 0;

        for (const p of prompts) {
            const content = p.content || '';
            const regex = new RegExp(
                `\\{\\{(setvar|addvar|getvar|setglobalvar|addglobalvar|getglobalvar)::${oldName}::`,
                'gi',
            );
            if (regex.test(content)) {
                if (!this._stagingMap.has(p.identifier)) this._stagingMap.set(p.identifier, {});
                const cur =
                    this._stagingMap.get(p.identifier)!.content !== undefined
                        ? this._stagingMap.get(p.identifier)!.content!
                        : content;

                this._stagingMap.get(p.identifier)!.content = cur.replace(regex, `{{$1::${newName}::`);
                affected++;
            }
        }

        return {
            ok: true,
            summary: `[Staged] Đã đổi tên biến "${oldName}" -> "${newName}" trên ${affected} blocks.`,
        };
    }

    // ─── Git Diff Engine ────────────────────────────────────────────────────

    public calculateDiff(): PresetDiffResult {
        const livePrompts = this.getRawLivePrompts();
        const liveOrder = this.getRawLiveOrder();
        const stagedPrompts = this.getPrompts();
        const stagedOrder = this.getPromptOrder();

        const items: PresetDiffItem[] = [];
        let added = 0;
        let modified = 0;
        let deleted = 0;

        const liveMap = new Map(livePrompts.map((p) => [p.identifier, p]));
        const stagedMap = new Map(stagedPrompts.map((p) => [p.identifier, p]));

        // Check creates
        for (const [id, sBlock] of stagedMap.entries()) {
            if (!liveMap.has(id)) {
                added++;
                items.push({
                    type: 'create',
                    identifier: id,
                    name: sBlock.name,
                    newValue: sBlock,
                    summary: `+ [CREATE] "${sBlock.name}" (${sBlock.role}, ${sBlock.content.length} chars)`,
                });
            } else {
                // Check updates
                const lBlock = liveMap.get(id)!;
                const changes: string[] = [];
                if (sBlock.name !== lBlock.name) changes.push(`name: "${lBlock.name}" -> "${sBlock.name}"`);
                if (sBlock.content !== lBlock.content)
                    changes.push(`content (${lBlock.content.length} -> ${sBlock.content.length} chars)`);
                if (sBlock.role !== lBlock.role) changes.push(`role: ${lBlock.role} -> ${sBlock.role}`);
                if (sBlock.enabled !== lBlock.enabled) changes.push(`enabled: ${lBlock.enabled} -> ${sBlock.enabled}`);
                if (sBlock.injection_depth !== lBlock.injection_depth)
                    changes.push(`depth: ${lBlock.injection_depth} -> ${sBlock.injection_depth}`);

                if (changes.length > 0) {
                    modified++;
                    items.push({
                        type: 'update',
                        identifier: id,
                        name: sBlock.name,
                        oldValue: lBlock,
                        newValue: sBlock,
                        summary: `~ [MODIFY] "${sBlock.name}": ${changes.join(', ')}`,
                    });
                }
            }
        }

        // Check deletes
        for (const [id, lBlock] of liveMap.entries()) {
            if (!stagedMap.has(id) || this._stagingDeletes.has(id)) {
                deleted++;
                items.push({
                    type: 'delete',
                    identifier: id,
                    name: lBlock.name,
                    oldValue: lBlock,
                    summary: `- [DELETE] "${lBlock.name}" [ID: ${id}]`,
                });
            }
        }

        // Check reorders
        if (JSON.stringify(liveOrder) !== JSON.stringify(stagedOrder)) {
            items.push({
                type: 'reorder',
                oldValue: liveOrder,
                newValue: stagedOrder,
                summary: `↺ [REORDER] Thứ tự linked blocks thay đổi (${liveOrder.length} -> ${stagedOrder.length} items)`,
            });
        }

        const totalChanges =
            added + modified + deleted + (JSON.stringify(liveOrder) !== JSON.stringify(stagedOrder) ? 1 : 0);
        const isDirty = totalChanges > 0;
        const summary = isDirty
            ? `Preset có ${totalChanges} thay đổi đang staged: +${added} tạo mới, ~${modified} chỉnh sửa, -${deleted} xóa bỏ.`
            : 'Working tree clean. Không có thay đổi nào trong Staging Sandbox.';

        return {
            isDirty,
            totalChanges,
            added,
            modified,
            deleted,
            summary,
            items,
        };
    }

    // ─── Git Hash Generator ─────────────────────────────────────────────────

    public async generateCommitHash(content: string): Promise<string> {
        try {
            if (crypto?.subtle?.digest) {
                const encoder = new TextEncoder();
                const data = encoder.encode(content);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
                return hashHex.substring(0, 8);
            }
        } catch {
            // fallback
        }
        // Fallback FNV-1a hash
        let hash = 2166136261;
        for (let i = 0; i < content.length; i++) {
            hash ^= content.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0').substring(0, 8);
    }

    // ─── Git Commit & Rollback ──────────────────────────────────────────────

    public async getHeadCommitHash(presetName: string): Promise<string | null> {
        if (this._activeHeads.has(presetName)) {
            return this._activeHeads.get(presetName)!;
        }
        const commits = await this.db.getPresetCommits(presetName, 1);
        if (commits.length > 0) {
            this._activeHeads.set(presetName, commits[0].hash);
            return commits[0].hash;
        }
        return null;
    }

    public async ensureInitialCommit(presetName: string): Promise<string> {
        const head = await this.getHeadCommitHash(presetName);
        if (head) return head;

        const livePrompts = this.getRawLivePrompts();
        const liveOrder = this.getRawLiveOrder();
        const timestamp = Date.now();
        const hash = await this.generateCommitHash(`root:${presetName}:${timestamp}:${JSON.stringify(liveOrder)}`);

        const rootCommit: PresetCommitEntry = {
            hash,
            parentHash: null,
            presetName,
            message: 'Initial preset snapshot',
            author: 'user',
            timestamp,
            tree: {
                prompts: JSON.parse(JSON.stringify(livePrompts)),
                prompt_order: JSON.parse(JSON.stringify(liveOrder)),
            },
            stats: {
                added: livePrompts.length,
                modified: 0,
                deleted: 0,
                totalBlocks: livePrompts.length,
            },
            diffSummary: `Initial snapshot with ${livePrompts.length} prompt blocks`,
        };

        await this.db.addPresetCommit(rootCommit);
        this._activeHeads.set(presetName, hash);
        return hash;
    }

    public async commit(
        message: string,
        author: 'agent' | 'user' = 'agent',
        tag?: string,
    ): Promise<{ ok: boolean; hash: string; summary: string }> {
        const presetName = this.getActivePresetName();
        const diff = this.calculateDiff();

        if (!diff.isDirty) {
            return {
                ok: true,
                hash: (await this.getHeadCommitHash(presetName)) || 'HEAD',
                summary: 'Working tree clean. Không có thay đổi nào để commit.',
            };
        }

        const parentHash = await this.ensureInitialCommit(presetName);
        const finalPrompts = this.getPrompts();
        const finalOrder = this.getPromptOrder();
        const timestamp = Date.now();
        const hashSeed = `${parentHash}:${timestamp}:${message}:${JSON.stringify(finalOrder)}`;
        const commitHash = await this.generateCommitHash(hashSeed);

        const newCommit: PresetCommitEntry = {
            hash: commitHash,
            parentHash,
            presetName,
            message: message || 'Update preset prompts',
            author,
            timestamp,
            tag,
            tree: {
                prompts: JSON.parse(JSON.stringify(finalPrompts)),
                prompt_order: JSON.parse(JSON.stringify(finalOrder)),
            },
            stats: {
                added: diff.added,
                modified: diff.modified,
                deleted: diff.deleted,
                totalBlocks: finalPrompts.length,
            },
            diffSummary: diff.summary,
            diffItems: diff.items,
        };

        // 1. Save commit to IndexedDB
        await this.db.addPresetCommit(newCommit);
        this._activeHeads.set(presetName, commitHash);

        // 2. Flush to SillyTavern Live Context
        await this.flushToSillyTavern(finalPrompts, finalOrder);

        // 3. Clear Staging Sandbox
        this.clearStaging();

        return {
            ok: true,
            hash: commitHash,
            summary: `✅ Commit thành công [${commitHash}]: "${message}" (${diff.summary})`,
        };
    }

    public async getLog(limit: number = 20): Promise<PresetCommitEntry[]> {
        const presetName = this.getActivePresetName();
        return await this.db.getPresetCommits(presetName, limit);
    }

    public async traceCommitChain(
        fromHash: string | null,
        toHash: string,
    ): Promise<{ direction: 'backward' | 'forward' | 'same' | 'diverged'; chain: PresetCommitEntry[] }> {
        if (!fromHash || fromHash === toHash) {
            const target = await this.db.getPresetCommitByHash(toHash);
            return { direction: 'same', chain: target ? [target] : [] };
        }

        const presetName = this.getActivePresetName();
        const allCommits = await this.db.getPresetCommits(presetName, 500);
        const commitMap = new Map<string, PresetCommitEntry>(allCommits.map((c) => [c.hash, c]));

        // Check if moving backward: walk parents from fromHash to toHash
        const backwardChain: PresetCommitEntry[] = [];
        let curr: string | null = fromHash;
        while (curr && curr !== toHash) {
            const node = commitMap.get(curr);
            if (!node) break;
            backwardChain.push(node);
            curr = node.parentHash;
        }

        if (curr === toHash) {
            const targetNode = commitMap.get(toHash);
            if (targetNode) backwardChain.push(targetNode);
            return { direction: 'backward', chain: backwardChain };
        }

        // Check if moving forward: walk parents from toHash down to fromHash
        const forwardChain: PresetCommitEntry[] = [];
        curr = toHash;
        while (curr && curr !== fromHash) {
            const node = commitMap.get(curr);
            if (!node) break;
            forwardChain.unshift(node);
            curr = node.parentHash;
        }

        if (curr === fromHash) {
            return { direction: 'forward', chain: forwardChain };
        }

        return { direction: 'diverged', chain: [] };
    }

    public async rollback(
        target: string,
        hard: boolean = false,
    ): Promise<{ ok: boolean; hash: string; summary: string; pruned_count?: number }> {
        const presetName = this.getActivePresetName();
        let targetCommit = await this.db.getPresetCommitByHash(target);

        if (!targetCommit) {
            // Try lookup by tag
            targetCommit = await this.db.getPresetCommitByTag(presetName, target);
        }

        if (!targetCommit) {
            throw new Error(`Không tìm thấy commit hoặc tag nào với mã: "${target}"`);
        }

        const currentHead = await this.getHeadCommitHash(presetName);
        const chainInfo = await this.traceCommitChain(currentHead, targetCommit.hash);

        // Unpack tree to SillyTavern Live Context
        const targetPrompts = targetCommit.tree.prompts || [];
        const targetOrder = targetCommit.tree.prompt_order || [];

        await this.flushToSillyTavern(targetPrompts, targetOrder);

        // Update HEAD and reset Staging
        this._activeHeads.set(presetName, targetCommit.hash);
        this.clearStaging();

        let prunedCount = 0;
        if (hard) {
            prunedCount = await this.db.deletePresetCommitsAfter(presetName, targetCommit.timestamp);
        }

        let chainSummary: string;
        if (chainInfo.direction === 'backward') {
            const steps = chainInfo.chain.map((c) => c.hash.substring(0, 8)).join(' ➔ ');
            const revertedCount = Math.max(1, chainInfo.chain.length - 1);
            chainSummary = `🔄 Revert chuỗi (${steps}): Đã hoàn tác toàn bộ thay đổi của ${revertedCount} commit(s), đưa preset về đúng mốc [${targetCommit.hash}].`;
        } else if (chainInfo.direction === 'forward') {
            const steps = [
                currentHead ? currentHead.substring(0, 8) : null,
                ...chainInfo.chain.map((c) => c.hash.substring(0, 8)),
            ]
                .filter(Boolean)
                .join(' ➔ ');
            chainSummary = `⏩ Fast-forward tiến chuỗi (${steps}): Đã áp dụng toàn bộ thay đổi tích lũy của ${chainInfo.chain.length} commit(s), đưa preset lên mốc [${targetCommit.hash}].`;
        } else if (chainInfo.direction === 'diverged') {
            chainSummary = `🔀 Chuyển nhánh (Diverged branch): Đã chuyển trạng thái preset từ [${currentHead ? currentHead.substring(0, 8) : 'HEAD'}] sang [${targetCommit.hash}].`;
        } else {
            chainSummary = `🔄 Đã đồng bộ lại về mốc [${targetCommit.hash}].`;
        }

        const hardMsg = hard
            ? ` (Hard reset: Đã dọn dẹp và xóa ${prunedCount} commit mới hơn khỏi bộ nhớ)`
            : ' (Soft reset: Giữ nguyên lịch sử commit trong DB)';

        return {
            ok: true,
            hash: targetCommit.hash,
            pruned_count: prunedCount,
            summary: `${chainSummary} Đã phục hồi ${targetPrompts.length} prompt blocks.${hardMsg}`,
        };
    }

    public async checkout(
        target: string,
    ): Promise<{ ok: boolean; hash: string; summary: string; pruned_count?: number }> {
        return await this.rollback(target, false);
    }

    public async pruneCommits(keepCount: number = 30): Promise<{ ok: boolean; pruned_count: number; summary: string }> {
        const presetName = this.getActivePresetName();
        const pruned = await this.db.prunePresetCommits(presetName, keepCount);
        return {
            ok: true,
            pruned_count: pruned,
            summary: `Đã dọn dẹp lịch sử: Xóa ${pruned} commit cũ hơn giới hạn ${keepCount} commit gần nhất.`,
        };
    }

    public async clearHistory(): Promise<{ ok: boolean; summary: string }> {
        const presetName = this.getActivePresetName();
        await this.db.deletePresetCommits(presetName);
        this._activeHeads.delete(presetName);
        return {
            ok: true,
            summary: `Đã xóa sạch toàn bộ lịch sử commit của preset "${presetName}".`,
        };
    }

    public async getStorageStats() {
        return await this.db.getPresetStorageStats();
    }

    public async getDistinctPresetNames(): Promise<string[]> {
        return await this.db.getDistinctPresetNames();
    }

    public async manualCommit(message: string, tag?: string): Promise<{ ok: boolean; hash: string; summary: string }> {
        return await this.commit(message, 'user', tag);
    }

    public discard(): { ok: boolean; summary: string } {
        const hasChanges = this.hasStagingChanges();
        this.clearStaging();
        return {
            ok: true,
            summary: hasChanges
                ? 'Đã hủy bỏ toàn bộ các thay đổi nháp trong Staging Sandbox. Đưa working tree về bằng HEAD.'
                : 'Working tree vốn đã sạch, không có thay đổi nào cần hủy.',
        };
    }

    public async tagCommit(target: string, tagName: string): Promise<{ ok: boolean; summary: string }> {
        const presetName = this.getActivePresetName();
        let commit = await this.db.getPresetCommitByHash(target);
        if (!commit) {
            const head = await this.getHeadCommitHash(presetName);
            if (head) commit = await this.db.getPresetCommitByHash(head);
        }

        if (!commit) throw new Error(`Không tìm thấy commit hợp lệ để gắn tag "${tagName}".`);

        commit.tag = tagName;
        // Re-save commit with tag
        await this.db.addPresetCommit(commit);

        return {
            ok: true,
            summary: `🏷️ Đã gắn nhãn tag "${tagName}" cho commit [${commit.hash}].`,
        };
    }

    // ─── SillyTavern Synchronization (Save to Disk & Emit Events) ───────────

    public async flushToSillyTavern(prompts: PromptBlock[], order: string[]): Promise<boolean> {
        const container = this.getContainer();
        if (!container || !Array.isArray(container.prompts)) {
            console.warn('[PresetGitManager] Không tìm thấy ST container để ghi.');
            return false;
        }

        // 1. Ghi prompts vào ST memory
        container.prompts.length = 0;
        prompts.forEach((p) => container.prompts.push(JSON.parse(JSON.stringify(p))));

        // 2. Ghi prompt_order (xử lý cả ST 1.18+ nested format lẫn flat format)
        if (
            Array.isArray(container.prompt_order) &&
            container.prompt_order.length > 0 &&
            typeof container.prompt_order[0] === 'object' &&
            Array.isArray(container.prompt_order[0]?.order)
        ) {
            const win = window as any;
            const ctx = win.SillyTavern?.getContext?.() || {};
            const charId = ctx.characterId;
            const targetObj =
                container.prompt_order.find((o: any) => String(o.character_id) === String(charId)) ||
                container.prompt_order[0];
            if (targetObj) {
                targetObj.order = order.map((id) => {
                    const found = prompts.find((p) => p.identifier === id);
                    return { identifier: id, enabled: found ? found.enabled : true };
                });
            }
        } else {
            container.prompt_order = order.slice();
        }

        // 3. Emit events and trigger SillyTavern UI Save
        const win = window as any;
        if (win.SillyTavern && typeof win.SillyTavern.getContext === 'function') {
            const stCtx = win.SillyTavern.getContext();
            stCtx?.eventSource?.emit?.('oai_preset_changed_after');

            setTimeout(() => {
                const saveBtn =
                    document.querySelector('#update_oai_preset') ||
                    document.querySelector('#chat_completion_save_preset') ||
                    document.querySelector('#preset_save_button');

                if (saveBtn && typeof (saveBtn as HTMLElement).click === 'function') {
                    (saveBtn as HTMLElement).click();
                }

                (stCtx?.saveSettingsDebounced || win.saveSettingsDebounced)?.();
            }, 500);
        }

        return true;
    }

    // ─── Syntax Validator ───────────────────────────────────────────────────

    public validatePresetSyntax(): SyntaxValidationResult {
        const prompts = this.getPrompts();
        const errors: Array<{ identifier: string; name: string; error: string }> = [];
        const warnings: Array<{ identifier: string; name: string; line?: number; warning: string }> = [];

        for (const p of prompts) {
            const content = p.content || '';
            const openMatches = content.match(/\{\{/g) || [];
            const closeMatches = content.match(/\}\}/g) || [];

            if (openMatches.length !== closeMatches.length) {
                errors.push({
                    identifier: p.identifier,
                    name: p.name,
                    error: `Lệch dấu ngoặc nhọn: Số dấu mở {{ (${openMatches.length}) không khớp số dấu đóng }} (${closeMatches.length}).`,
                });
            }

            const lines = content.split('\n');
            lines.forEach((line, idx) => {
                if (/\{\{(setvr|setva|getvr|setvar::[^:}]+$|\/getvar)/i.test(line)) {
                    warnings.push({
                        identifier: p.identifier,
                        name: p.name,
                        line: idx + 1,
                        warning: `Nghi vấn sai cú pháp biến macro: "${line.trim()}"`,
                    });
                }
            });

            if (p.injection_depth !== undefined && p.injection_depth < 0) {
                warnings.push({
                    identifier: p.identifier,
                    name: p.name,
                    warning: `Injection depth âm (${p.injection_depth}), có thể không hoạt động đúng chuẩn ST.`,
                });
            }
        }

        return {
            ok: errors.length === 0,
            totalBlocksChecked: prompts.length,
            errorCount: errors.length,
            warningCount: warnings.length,
            errors,
            warnings,
            status: errors.length === 0 ? 'SYNTAX_OK' : 'SYNTAX_ERRORS_FOUND',
        };
    }

    // ─── Variable Scanner ───────────────────────────────────────────────────

    public scanVariables(): ScannedVarRef[] {
        const prompts = this.getPrompts();
        const refs: ScannedVarRef[] = [];
        for (const p of prompts) {
            const content = p.content || '';
            const macroRegex =
                /\{\{(setvar|addvar|setglobalvar|addglobalvar|getvar|getglobalvar)::([^:}]+)(?:::([\s\S]*?))?\}\}/gi;
            let match: RegExpExecArray | null;

            while ((match = macroRegex.exec(content)) !== null) {
                const fullMatch = match[0];
                const type = match[1].toLowerCase();
                const name = (match[2] || '').trim();
                const value = (match[3] || '').trim();
                const scope = type.includes('global') ? 'global' : 'chat';

                if (name) {
                    refs.push({
                        id: `${p.identifier}::${name}::${type}::${refs.length}`,
                        name,
                        type,
                        value,
                        scope,
                        promptName: p.name,
                        promptId: p.identifier,
                        fullMatch,
                    });
                }
            }
        }

        return refs;
    }
}

if (typeof window !== 'undefined') {
    (window as any).PresetGitManager = PresetGitManager;
}
