import YAML from 'yaml';
import { SillyTavernAdapter } from '../adapters/st_adapter';

export interface MvuVariableDescriptor {
    path: string;
    name: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'object' | 'record' | 'unknown';
    min?: number;
    max?: number;
    defaultValue?: any;
    description?: string;
    children?: MvuVariableDescriptor[];
    recordTemplate?: MvuVariableDescriptor[];
}

export interface MvuFloorInfo {
    messageId: number;
    displayIndex: number;
    role: string;
    name: string;
    preview: string;
    source: 'mvu' | 'helper' | 'fallback';
}

export interface MvuInspectionResult {
    hasMvu: boolean;
    characterName: string;
    zodScriptName?: string;
    zodSchemaCode?: string;
    parsedSchema: MvuVariableDescriptor[];
    liveVariables: any;
    rawWrapper?: any;
    currentFloor?: MvuFloorInfo | null;
    availableFloors?: MvuFloorInfo[];
    dataSource?: 'mvu' | 'helper' | 'fallback';
    initvarVariables: any;
    updateRulesSummary: string;
    hasEjsController?: boolean;
    ejsControllerSummary?: string;
    healthWarnings: string[];
    inconsistencies?: string[];
}

export interface MvuMutationOptions {
    action: 'add' | 'rename' | 'delete' | 'modify';
    variablePath: string; // e.g. "Trạng_thái.Sức_khỏe" or "stat_data.Nhân_vật..."
    type?: 'number' | 'string' | 'boolean' | 'array' | 'object';
    min?: number;
    max?: number;
    defaultValue?: any;
    description?: string;
    ruleCheck?: string; // Natural language rule for Quy_tắc_cập_nhật (Update rules)
    newName?: string; // For rename action
}

export interface MvuVariableInput {
    path: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'object';
    defaultValue?: any;
    min?: number;
    max?: number;
    ruleCheck?: string;
    description?: string;
}

export interface MvuScaffoldOptions {
    variables?: MvuVariableInput[];
    customZodSchema?: string;
    customInitvarYaml?: string | Record<string, any>;
    customRulesYaml?: string | Record<string, any>;
    title?: string;
    characterName?: string;
}

export class MvuManager {
    private static cachedStatData: any = null;
    private static cachedWrapper: any = null;
    private static cachedCurrentFloor: MvuFloorInfo | null = null;
    private static cachedFloors: MvuFloorInfo[] = [];
    private static cachedDataSource: 'mvu' | 'helper' | 'fallback' = 'fallback';

    /**
     * Truy xuất ngữ cảnh toàn cục (hỗ trợ cả iframe và window cha)
     */
    public static getGlobalContext(): { win: any; th: any; mvu: any; stContext: any } {
        let win: any = window;
        try {
            if (window.parent && window.parent !== window) {
                win = window.parent;
            }
        } catch {}
        const th = win.TavernHelper || (globalThis as any).TavernHelper || (window as any).TavernHelper || null;
        const mvu = win.Mvu || (globalThis as any).Mvu || (window as any).Mvu || null;
        let stContext: any = null;
        try {
            stContext =
                win.SillyTavern?.getContext?.() ||
                (globalThis as any).SillyTavern?.getContext?.() ||
                (window as any).SillyTavern?.getContext?.() ||
                null;
        } catch {}
        return { win, th, mvu, stContext };
    }

    /**
     * Lấy SillyTavern Context
     */
    public static getContext(): any {
        return this.getGlobalContext().stContext;
    }

    /**
     * Lấy nhân vật đang hoạt động hiện tại
     */
    public static getActiveCharacter(): any {
        const ctx = this.getContext();
        return ctx?.characters?.[ctx?.characterId] || null;
    }

    /**
     * Kiểm tra xem nhân vật hiện tại có hệ thống MVU hay không
     */
    public static hasMvu(char: any): boolean {
        if (!char) return false;
        const scripts = char.data?.extensions?.tavern_helper?.scripts;
        if (!scripts || typeof scripts !== 'object') return false;

        for (const [key, script] of Object.entries(scripts)) {
            const s = script as any;
            const content = s?.content || '';
            const scriptName = s?.name || key;
            if (
                scriptName.toLowerCase().includes('mvu') ||
                scriptName.toLowerCase().includes('zod') ||
                scriptName.includes('Cấu trúc biến') ||
                content.includes('registerMvuSchema') ||
                content.includes('MagVarUpdate') ||
                content.includes('mvu_zod.js')
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Tìm script Zod Schema của nhân vật
     */
    public static getZodScript(char: any): { key: string; name: string; content: string; script: any } | null {
        if (!char) return null;
        const scripts = char.data?.extensions?.tavern_helper?.scripts;
        if (!scripts || typeof scripts !== 'object') return null;

        for (const [key, script] of Object.entries(scripts)) {
            const s = script as any;
            const content = s?.content || '';
            const scriptName = s?.name || key;

            if (
                content.includes('registerMvuSchema') ||
                scriptName.toLowerCase().includes('zod') ||
                scriptName.includes('Cấu trúc biến')
            ) {
                return {
                    key,
                    name: scriptName,
                    content,
                    script: s,
                };
            }
        }
        return null;
    }

    /**
     * Đọc dữ liệu biến của một lượt tin nhắn (floor/message) cụ thể
     */
    public static async readFloor(messageId?: number): Promise<{
        wrapper: any;
        statData: any;
        messageId?: number;
        source: 'mvu' | 'helper' | 'fallback';
    } | null> {
        const { mvu, th } = this.getGlobalContext();
        const targetId = typeof messageId === 'number' ? messageId : undefined;
        const opts = targetId !== undefined ? { type: 'message', message_id: targetId } : undefined;

        let raw: any = null;
        let source: 'mvu' | 'helper' | 'fallback' = 'mvu';

        // 1. Thử gọi API MVU chính thống (SillyTavern-MVU plugin)
        if (mvu && typeof mvu.getMvuData === 'function') {
            try {
                raw = opts ? await mvu.getMvuData(opts) : await mvu.getMvuData();
            } catch (e) {
                console.warn('[MvuManager] Error fetching via Mvu.getMvuData:', e);
            }
        }

        // 2. Fallback sang TavernHelper API (tương thích)
        if (!raw && th && typeof th.getVariables === 'function') {
            source = 'helper';
            try {
                raw = opts ? await th.getVariables(opts) : await th.getVariables();
            } catch (e) {
                console.warn('[MvuManager] Error fetching via TavernHelper.getVariables:', e);
            }
        }

        // 3. Fallback sang SillyTavern chat memory trực tiếp
        if (!raw && typeof targetId === 'number') {
            const { stContext } = this.getGlobalContext();
            const msg = stContext?.chat?.[targetId];
            if (msg) {
                if (msg.variables && typeof msg.variables === 'object') {
                    if (Array.isArray(msg.variables)) {
                        const swipe = typeof msg.swipe_id === 'number' ? msg.swipe_id : 0;
                        raw = msg.variables[swipe] || msg.variables[0];
                    } else {
                        raw = msg.variables;
                    }
                } else if (msg.stat_data && typeof msg.stat_data === 'object') {
                    raw = msg;
                }
                if (raw) source = 'fallback';
            }
        }

        if (!raw || typeof raw !== 'object') {
            return null;
        }

        // 4. Chuẩn hóa bóc tách: Phân tách wrapper và stat_data
        const hasStatData =
            Object.prototype.hasOwnProperty.call(raw, 'stat_data') &&
            raw.stat_data &&
            typeof raw.stat_data === 'object';

        const statData = hasStatData ? raw.stat_data : raw;

        return {
            wrapper: raw,
            statData,
            messageId: targetId,
            source,
        };
    }

    /**
     * Quét danh sách các lượt tin nhắn (floor) có dữ liệu stat_data trong cuộc hội thoại hiện tại
     */
    public static async listValidFloors(maxScan: number = 100): Promise<MvuFloorInfo[]> {
        const { stContext } = this.getGlobalContext();
        const chat = Array.isArray(stContext?.chat) ? stContext.chat : [];
        const floors: MvuFloorInfo[] = [];
        const scanStart = Math.max(0, chat.length - maxScan);

        for (let i = chat.length - 1; i >= scanStart; i--) {
            const msg = chat[i];
            if (!msg) continue;
            const isSystem = !!(msg.is_system || msg.role === 'system' || msg.mes_role === 'system');
            if (isSystem) continue;

            const floorData = await this.readFloor(i);
            if (
                floorData &&
                floorData.statData &&
                typeof floorData.statData === 'object' &&
                Object.keys(floorData.statData).length > 0
            ) {
                const rawText = String(msg.mes || msg.message || '').replace(/\s+/g, ' ').trim();
                const preview = rawText.length > 70 ? rawText.slice(0, 70) + '…' : rawText;
                floors.push({
                    messageId: i,
                    displayIndex: i + 1,
                    role: msg.role ? String(msg.role) : msg.is_user ? 'user' : 'assistant',
                    name: String(msg.name || msg.ch_name || (msg.is_user ? 'User' : 'Character')),
                    preview: preview || '(Không có văn bản)',
                    source: floorData.source,
                });
            }
        }
        return floors;
    }

    /**
     * Lấy toàn bộ biến thời gian thực của nhân vật (đã bóc tách sạch khỏi preset prompts)
     */
    public static getLiveVariables(subPath?: string, messageId?: number): any {
        let data = this.cachedStatData;
        let wrapper = this.cachedWrapper;

        // Nếu chưa có cache, lấy nhanh từ context hiện tại
        if (!data) {
            const { th, mvu } = this.getGlobalContext();
            let raw: any = null;
            try {
                if (mvu && typeof mvu.getMvuData === 'function') {
                    raw = mvu.getMvuData();
                    // Guard: nếu API trả về Promise, giải quyết đồng bộ fallback sang cache
                    if (raw && typeof raw === 'object' && typeof raw.then === 'function') {
                        raw = null; // Bỏ qua Promise, dùng readFloor async thay thế
                    }
                }
            } catch {}
            if (!raw && th && typeof th.getVariables === 'function') {
                try {
                    raw = th.getVariables();
                    if (raw && typeof raw === 'object' && typeof raw.then === 'function') {
                        raw = null;
                    }
                } catch {}
            }
            if (raw && typeof raw === 'object') {
                wrapper = raw;
                data =
                    raw.stat_data && typeof raw.stat_data === 'object'
                        ? raw.stat_data
                        : raw;
            }
        }

        if (!data) return null;

        if (subPath) {
            const cleanPath = subPath.replace(/^stat_data\./, '');
            const parts = cleanPath.split('.');

            // Ưu tiên 1: Tìm trong cây statData (chuẩn MVU)
            let curr = data;
            let found = true;
            for (const p of parts) {
                if (curr && typeof curr === 'object' && p in curr) {
                    curr = curr[p];
                } else {
                    found = false;
                    break;
                }
            }
            if (found) return curr;

            // Ưu tiên 2: Fallback tìm trong root wrapper (phòng trường hợp biến root)
            if (wrapper && typeof wrapper === 'object') {
                let rootCurr = wrapper;
                let rootFound = true;
                for (const p of parts) {
                    if (rootCurr && typeof rootCurr === 'object' && p in rootCurr) {
                        rootCurr = rootCurr[p];
                    } else {
                        rootFound = false;
                        break;
                    }
                }
                if (rootFound) return rootCurr;
            }

            return undefined;
        }

        return data;
    }

    /**
     * Cập nhật trực tiếp biến ở Runtime qua TavernHelper hoặc Mvu API
     */
    public static async setLiveVariable(
        path: string,
        value: any,
        messageId?: number,
    ): Promise<{ success: boolean; oldValue: any; newValue: any }> {
        const { th, mvu } = this.getGlobalContext();
        if (!th && !mvu) {
            throw new Error('Không tìm thấy TavernHelper hoặc Mvu API trong SillyTavern.');
        }

        let targetMessageId = messageId;
        if (targetMessageId === undefined) {
            if (this.cachedCurrentFloor) {
                targetMessageId = this.cachedCurrentFloor.messageId;
            } else {
                const floors = await this.listValidFloors();
                if (floors.length > 0) {
                    targetMessageId = floors[0].messageId;
                }
            }
        }

        if (targetMessageId === undefined) {
            throw new Error('Chưa có tin nhắn nào trong phòng chat để gán biến runtime. Hãy gửi ít nhất một tin nhắn (hoặc bắt đầu cuộc hội thoại) trước khi dùng set_mvu_variable.');
        }

        const cleanPath = path.replace(/^stat_data\./, '');
        const cleanParts = cleanPath.split('.');
        const oldValue = this.getLiveVariables(cleanPath, targetMessageId);

        // Tự động ép kiểu thông minh nếu truyền vào dạng chuỗi
        let parsedValue = value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === 'true') {
                parsedValue = true;
            } else if (trimmed === 'false') {
                parsedValue = false;
            } else if (trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.startsWith('0x')) {
                parsedValue = Number(trimmed);
            } else if (
                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
                try {
                    parsedValue = JSON.parse(trimmed);
                } catch {
                    parsedValue = value;
                }
            }
        }

        const setDeep = (obj: any, parts: string[], val: any) => {
            let curr = obj;
            for (let i = 0; i < parts.length - 1; i++) {
                const p = parts[i];
                if (!curr[p] || typeof curr[p] !== 'object') {
                    curr[p] = {};
                }
                curr = curr[p];
            }
            const lastKey = parts[parts.length - 1];
            const existing = curr[lastKey];
            if (
                Array.isArray(existing) &&
                existing.length === 2 &&
                typeof existing[1] === 'string' &&
                (existing[0] === null || ['string', 'number', 'boolean'].includes(typeof existing[0]))
            ) {
                existing[0] = val;
            } else {
                curr[lastKey] = val;
            }
        };

        let updated = false;

        // Phương thức 1: Mvu.replaceMvuData
        if (mvu && typeof mvu.replaceMvuData === 'function' && targetMessageId !== undefined) {
            try {
                const floor = await this.readFloor(targetMessageId);
                if (floor && floor.wrapper) {
                    const clone =
                        typeof structuredClone === 'function'
                            ? structuredClone(floor.wrapper)
                            : JSON.parse(JSON.stringify(floor.wrapper));
                    if (clone.stat_data && typeof clone.stat_data === 'object') {
                        setDeep(clone.stat_data, cleanParts, parsedValue);
                    } else {
                        setDeep(clone, cleanParts, parsedValue);
                    }
                    await mvu.replaceMvuData(clone, { type: 'message', message_id: targetMessageId });
                    updated = true;
                }
            } catch (e) {
                console.warn('[MvuManager] replaceMvuData failed, falling back to TavernHelper:', e);
            }
        }

        // Phương thức 2: TavernHelper.updateVariablesWith
        if (!updated && th && typeof th.updateVariablesWith === 'function' && targetMessageId !== undefined) {
            try {
                await th.updateVariablesWith(
                    (existing: any) => {
                        const clone =
                            typeof structuredClone === 'function'
                                ? structuredClone(existing || {})
                                : JSON.parse(JSON.stringify(existing || {}));
                        if (clone.stat_data && typeof clone.stat_data === 'object') {
                            setDeep(clone.stat_data, cleanParts, parsedValue);
                        } else {
                            setDeep(clone, cleanParts, parsedValue);
                        }
                        return clone;
                    },
                    { type: 'message', message_id: targetMessageId },
                );
                updated = true;
            } catch (e) {
                console.warn('[MvuManager] updateVariablesWith failed, falling back to setVariable:', e);
            }
        }

        // Phương thức 3: TavernHelper.setVariable / updateVariable
        if (!updated && th && typeof th.setVariable === 'function') {
            const fullPath = path.startsWith('stat_data.') ? path : `stat_data.${cleanPath}`;
            const opts = { type: 'message', message_id: targetMessageId };
            await th.setVariable(fullPath, parsedValue, opts);
            updated = true;
        } else if (!updated && th && typeof th.updateVariable === 'function') {
            const fullPath = path.startsWith('stat_data.') ? path : `stat_data.${cleanPath}`;
            const opts = { type: 'message', message_id: targetMessageId };
            await th.updateVariable(fullPath, parsedValue, opts);
            updated = true;
        }

        if (!updated) {
            throw new Error('Không thể cập nhật biến qua bất kỳ API MVU nào.');
        }

        // Làm mới cache sau khi cập nhật
        const refreshed = await this.readFloor(targetMessageId);
        if (refreshed) {
            this.cachedStatData = refreshed.statData;
            this.cachedWrapper = refreshed.wrapper;
        }
        const newValue = this.getLiveVariables(cleanPath, targetMessageId);
        return { success: true, oldValue, newValue };
    }

    /**
     * Tìm các entry Worldbook liên quan đến MVU
     */
    public static async getLorebookMvuEntries(
        adapter: SillyTavernAdapter,
        char: any,
    ): Promise<{
        initvarEntry?: any;
        updateRulesEntry?: any;
        formatEntry?: any;
        varListEntry?: any;
        ejsControllerEntry?: any;
    }> {
        const result: {
            initvarEntry?: any;
            updateRulesEntry?: any;
            formatEntry?: any;
            varListEntry?: any;
            ejsControllerEntry?: any;
        } = {};

        // 1. Kiểm tra embedded character_book
        const embeddedEntries = char?.data?.character_book?.entries || [];
        for (const entry of embeddedEntries) {
            const comment = (entry.comment || '').toLowerCase();
            const content = (entry.content || '').toLowerCase();
            if (comment.includes('initvar') || comment.includes('khởi tạo biến') || comment.includes('[initvar]')) {
                result.initvarEntry = entry;
            } else if (
                comment.includes('mvu_update') ||
                comment.includes('quy tắc cập nhật') ||
                comment.includes('cập nhật biến') ||
                content.includes('【cập nhật biến】') ||
                content.includes('quy tắc cập nhật')
            ) {
                result.updateRulesEntry = entry;
            } else if (
                comment.includes('mvu_format') ||
                comment.includes('định dạng đầu ra') ||
                comment.includes('output_format')
            ) {
                result.formatEntry = entry;
            } else if (comment.includes('biến') && comment.includes('danh sách')) {
                result.varListEntry = entry;
            } else if (
                content.includes('@@preprocessing') ||
                comment.includes('bộ điều khiển') ||
                comment.includes('preprocessing')
            ) {
                result.ejsControllerEntry = entry;
            }
        }

        // 2. Nếu nhân vật có linked Worldbook (Sổ tay thế giới liên kết ngoài), kiểm tra trong đó
        const linkedWorld = char?.data?.extensions?.world || char?.world;
        if (linkedWorld && (!result.initvarEntry || !result.updateRulesEntry)) {
            try {
                const ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")();
                if (ST_WorldInfo && typeof ST_WorldInfo.loadWorldInfo === 'function') {
                    const worldData = await ST_WorldInfo.loadWorldInfo(linkedWorld);
                    const entries = worldData?.entries
                        ? (Array.isArray(worldData.entries) ? worldData.entries : Object.values(worldData.entries))
                        : [];
                    for (const entry of entries as any[]) {
                        const comment = (entry?.comment || entry?.name || '').toLowerCase();
                        const content = (entry?.content || '').toLowerCase();
                        if (!result.initvarEntry && (comment.includes('initvar') || comment.includes('khởi tạo biến') || comment.includes('[initvar]'))) {
                            result.initvarEntry = entry;
                        }
                        if (
                            !result.updateRulesEntry &&
                            (comment.includes('mvu_update') ||
                                comment.includes('quy tắc cập nhật') ||
                                comment.includes('cập nhật biến') ||
                                content.includes('【cập nhật biến】') ||
                                content.includes('quy tắc cập nhật'))
                        ) {
                            result.updateRulesEntry = entry;
                        }
                    }
                }
            } catch (e) {
                // Ignore
            }
        }

        // 3. Nếu vẫn chưa tìm thấy, tìm trong global / active lorebook của SillyTavern
        if (!result.initvarEntry || !result.updateRulesEntry) {
            try {
                const worldInfo = (window as any).world_info;
                const entries = Array.isArray(worldInfo?.entries)
                    ? worldInfo.entries
                    : worldInfo?.entries && typeof worldInfo.entries === 'object'
                      ? Object.values(worldInfo.entries)
                      : [];
                for (const entry of entries as any[]) {
                    const comment = (entry?.comment || '').toLowerCase();
                    const content = (entry?.content || '').toLowerCase();
                    if (!result.initvarEntry && (comment.includes('initvar') || comment.includes('khởi tạo biến'))) {
                        result.initvarEntry = entry;
                    }
                    if (
                        !result.updateRulesEntry &&
                        (comment.includes('mvu_update') ||
                            comment.includes('quy tắc cập nhật') ||
                            comment.includes('cập nhật biến') ||
                            content.includes('【cập nhật biến】'))
                    ) {
                        result.updateRulesEntry = entry;
                    }
                }
            } catch {
                // Ignore lorebook search errors
            }
        }

        return result;
    }

    /**
     * Bóc tách cây Schema từ code Zod JavaScript (hỗ trợ nested z.object đệ quy)
     */
    /**
     * Tách đối số của một lời gọi hàm (ví dụ: So(100, 0, 100) -> ['100', '0', '100'])
     */
    private static parseCallArgs(argsStr: string): string[] {
        if (!argsStr) return [];
        const args: string[] = [];
        let i = 0;
        const len = argsStr.length;
        let start = 0;
        let parenDepth = 0;
        let inStr: string | null = null;

        while (i < len) {
            const ch = argsStr[i];
            const prev = i > 0 ? argsStr[i - 1] : '';

            if (inStr) {
                if (ch === inStr && prev !== '\\') inStr = null;
            } else if (ch === '"' || ch === "'" || ch === '`') {
                inStr = ch;
            } else if (ch === '(') {
                parenDepth++;
            } else if (ch === ')') {
                parenDepth--;
            } else if (ch === ',' && parenDepth === 0) {
                args.push(argsStr.substring(start, i).trim());
                start = i + 1;
            }
            i++;
        }
        if (start < len) {
            args.push(argsStr.substring(start).trim());
        }
        return args;
    }

    /**
     * Bóc tách cây Schema từ code Zod JavaScript (hỗ trợ nested z.object đệ quy, helpers và sub-schemas)
     */
    public static parseZodCode(code: string): MvuVariableDescriptor[] {
        if (!code) return [];

        // 1. Tự động phát hiện mọi hàm helper tạo kiểu Schema Zod trong code
        const helpers: Record<
            string,
            { type: 'string' | 'number' | 'boolean' | 'record' | 'array' | 'object' }
        > = {};

        const helperRegex =
            /(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_$]+)?\s*=>([\s\S]*?)(?=(?:const|let|var|function|\/\*|export|\n\s*\n[a-zA-Z_$]|$))|function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
        let hMatch: RegExpExecArray | null;
        while ((hMatch = helperRegex.exec(code)) !== null) {
            const hName = hMatch[1] || hMatch[3];
            const hBody = hMatch[2] || hMatch[4] || '';
            if (hBody.includes('z.record')) {
                helpers[hName] = { type: 'record' };
            } else if (hBody.includes('z.object')) {
                helpers[hName] = { type: 'object' };
            } else if (hBody.includes('z.array')) {
                helpers[hName] = { type: 'array' };
            } else if (hBody.includes('z.coerce.number') || hBody.includes('z.number')) {
                helpers[hName] = { type: 'number' };
            } else if (hBody.includes('z.boolean')) {
                helpers[hName] = { type: 'boolean' };
            } else if (hBody.includes('z.string')) {
                helpers[hName] = { type: 'string' };
            }
        }

        // 2. Quét các Zod Object con độc lập khai báo trước Schema (TaiSan, NPC, DiChung, VatPham...)
        const knownSubSchemas: Record<string, MvuVariableDescriptor[]> = {};
        const subSchemaRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*z(?:\s*\.\s*)object\s*\(\s*\{/g;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = subSchemaRegex.exec(code)) !== null) {
            const sName = sMatch[1];
            if (sName.toLowerCase() === 'schema') continue;
            const braceIdx = sMatch.index + sMatch[0].length - 1;
            const inner = this.extractMatchingBraceContent(code, braceIdx);
            if (inner) {
                knownSubSchemas[sName] = this.parseZodObjectContent(inner, '', knownSubSchemas, helpers);
            }
        }

        // 3. Tìm Schema chính
        const match =
            code.match(/(?:export\s+)?const\s+Schema\s*=\s*z(?:\s*\.\s*)object\s*\(\s*\{/i) ||
            code.match(/Schema\s*=\s*z(?:\s*\.\s*)object\s*\(\s*\{/i) ||
            code.match(/z(?:\s*\.\s*)object\s*\(\s*\{/i);
        if (!match || match.index === undefined) return [];

        const startIdx = match.index + match[0].length - 1; // vị trí ký tự '{'
        const innerContent = this.extractMatchingBraceContent(code, startIdx);
        if (!innerContent) return [];

        return this.parseZodObjectContent(innerContent, '', knownSubSchemas, helpers);
    }

    /**
     * Trích xuất nội dung bên trong cặp ngoặc nhọn { ... } tương ứng
     */
    private static extractMatchingBraceContent(str: string, openBraceIdx: number): string | null {
        let depth = 0;
        let start = -1;
        let inString: string | null = null;

        for (let i = openBraceIdx; i < str.length; i++) {
            const ch = str[i];
            const prev = i > 0 ? str[i - 1] : '';

            if (inString) {
                if (ch === inString && prev !== '\\') {
                    inString = null;
                }
                continue;
            }

            if (ch === '"' || ch === "'" || ch === '`') {
                inString = ch;
                continue;
            }

            if (ch === '{') {
                if (depth === 0) start = i + 1;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return str.substring(start, i);
                }
            }
        }
        return null;
    }

    /**
     * Parse nội dung bên trong z.object({ ... }) thành danh sách descriptor
     */
    private static parseZodObjectContent(
        content: string,
        parentPath: string,
        knownSubSchemas: Record<string, MvuVariableDescriptor[]> = {},
        helpers: Record<string, { type: 'string' | 'number' | 'boolean' | 'record' | 'array' | 'object' }> = {},
    ): MvuVariableDescriptor[] {
        const descriptors: MvuVariableDescriptor[] = [];
        let i = 0;
        const len = content.length;

        while (i < len) {
            // Bỏ qua khoảng trắng và comment
            while (i < len && /\s/.test(content[i])) i++;
            if (i >= len) break;

            if (content.startsWith('//', i)) {
                const nextNl = content.indexOf('\n', i);
                i = nextNl === -1 ? len : nextNl + 1;
                continue;
            }
            if (content.startsWith('/*', i)) {
                const nextClose = content.indexOf('*/', i);
                i = nextClose === -1 ? len : nextClose + 2;
                continue;
            }

            // Đọc key
            let key: string;
            if (content[i] === "'" || content[i] === '"') {
                const quote = content[i++];
                const keyStart = i;
                while (i < len && content[i] !== quote) {
                    if (content[i] === '\\') i++;
                    i++;
                }
                key = content.substring(keyStart, i);
                if (i < len && content[i] === quote) i++;
            } else {
                const keyStart = i;
                while (i < len && /[a-zA-Z0-9_$\u00C0-\u024F\u1EA0-\u1EF9\u4E00-\u9FFF]/.test(content[i])) {
                    i++;
                }
                key = content.substring(keyStart, i);
            }

            if (!key) {
                i++;
                continue;
            }

            // Tìm dấu ':'
            while (i < len && content[i] !== ':') i++;
            if (i >= len) break;
            i++; // qua ':'

            // Bỏ qua khoảng trắng
            while (i < len && /\s/.test(content[i])) i++;
            if (i >= len) break;

            // Đọc biểu thức giá trị
            const exprStart = i;
            let parenDepth = 0;
            let braceDepth = 0;
            let bracketDepth = 0;
            let inStr: string | null = null;

            while (i < len) {
                const c = content[i];
                const prev = i > 0 ? content[i - 1] : '';

                if (inStr) {
                    if (c === inStr && prev !== '\\') inStr = null;
                } else if (c === '"' || c === "'" || c === '`') {
                    inStr = c;
                } else if (c === '(') {
                    parenDepth++;
                } else if (c === ')') {
                    parenDepth--;
                } else if (c === '{') {
                    braceDepth++;
                } else if (c === '}') {
                    if (braceDepth === 0) break;
                    braceDepth--;
                } else if (c === '[') {
                    bracketDepth++;
                } else if (c === ']') {
                    bracketDepth--;
                } else if (c === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                    break;
                }
                i++;
            }

            const expr = content.substring(exprStart, i).trim();
            if (i < len && content[i] === ',') i++;

            const currentPath = parentPath ? `${parentPath}.${key}` : key;

            // Phân tích biểu thức
            let type: MvuVariableDescriptor['type'] = 'unknown';
            let children: MvuVariableDescriptor[] | undefined;
            let recordTemplate: MvuVariableDescriptor[] | undefined;
            let min: number | undefined;
            let max: number | undefined;
            let defaultValue: any;

            // 1. Kiểm tra outermost z.record hoặc z.object({ ... })
            const isRecord = /^\s*z(?:\s*\.\s*)record\s*\(/.test(expr);
            const isObject = /^\s*z(?:\s*\.\s*)object\s*\(/.test(expr);

            if (isRecord) {
                type = 'record';
                const objMatch = expr.match(/\bz(?:\s*\.\s*)object\s*\(\s*\{/);
                if (objMatch && objMatch.index !== undefined) {
                    const openIdx = expr.indexOf('{', objMatch.index);
                    if (openIdx !== -1) {
                        const inner = this.extractMatchingBraceContent(expr, openIdx);
                        if (inner) {
                            recordTemplate = this.parseZodObjectContent(inner, currentPath, knownSubSchemas, helpers);
                        }
                    }
                }
            } else if (isObject || /\bz(?:\s*\.\s*)object\s*\(\s*\{/.test(expr)) {
                type = 'object';
                const objMatch = expr.match(/\bz(?:\s*\.\s*)object\s*\(\s*\{/);
                if (objMatch && objMatch.index !== undefined) {
                    const openIdx = expr.indexOf('{', objMatch.index);
                    if (openIdx !== -1) {
                        const inner = this.extractMatchingBraceContent(expr, openIdx);
                        if (inner) {
                            children = this.parseZodObjectContent(inner, currentPath, knownSubSchemas, helpers);
                        }
                    }
                }
            }

            // 2. Kiểm tra tham chiếu tới knownSubSchemas (ví dụ: `Tài_sản: TaiSan` hoặc `Bang(NPC)`)
            if (type === 'unknown' || (type === 'record' && !recordTemplate) || (type === 'object' && (!children || children.length === 0))) {
                for (const [subName, subDescriptors] of Object.entries(knownSubSchemas)) {
                    const wordRegex = new RegExp(`\\b${subName}\\b`);
                    if (wordRegex.test(expr)) {
                        const isRecordHelper = Object.entries(helpers).some(
                            ([hName, hInfo]) =>
                                hInfo.type === 'record' &&
                                (expr.includes(`${hName}(${subName})`) || (expr.includes(hName) && expr.includes(subName))),
                        );
                        if (isRecord || isRecordHelper || expr.includes(`z.record`)) {
                            type = 'record';
                            recordTemplate = subDescriptors;
                            children = [];
                        } else {
                            type = 'object';
                            children = subDescriptors.map(d => ({
                                ...d,
                                path: `${currentPath}.${d.name}`,
                                children: d.children
                                    ? d.children.map(c => ({ ...c, path: `${currentPath}.${d.name}.${c.name}` }))
                                    : undefined,
                            }));
                        }
                        break;
                    }
                }
            }

            // 3. Kiểm tra các hàm helper kiểu dữ liệu (So, Chuoi, Co, Bang...)
            if (type === 'unknown') {
                for (const [hName, hInfo] of Object.entries(helpers)) {
                    const callRegex = new RegExp(`^${hName}\\s*\\((.*)\\)`, 's');
                    const callMatch = expr.match(callRegex);
                    if (callMatch) {
                        type = hInfo.type;
                        const args = this.parseCallArgs(callMatch[1].trim());
                        if (hInfo.type === 'number') {
                            if (args.length > 0 && args[0] !== '' && !isNaN(Number(args[0]))) {
                                defaultValue = Number(args[0]);
                            }
                            if (args.length > 1 && !isNaN(Number(args[1])) && args[1] !== '-Infinity') {
                                min = Number(args[1]);
                            }
                            if (args.length > 2 && !isNaN(Number(args[2])) && args[2] !== 'Infinity') {
                                const m = Number(args[2]);
                                if (m <= 1e7) max = m;
                            }
                        } else if (hInfo.type === 'string') {
                            if (args.length > 0) {
                                defaultValue = args[0].replace(/^['"`]|['"`]$/g, '');
                            }
                        } else if (hInfo.type === 'boolean') {
                            if (args.length > 0) {
                                defaultValue = args[0].trim() === 'true';
                            }
                        } else if (hInfo.type === 'record' || hInfo.type === 'object') {
                            defaultValue = {};
                            const innerArg = args[0] || '';
                            for (const [subName, subDescriptors] of Object.entries(knownSubSchemas)) {
                                if (innerArg.includes(subName)) {
                                    recordTemplate = subDescriptors;
                                    break;
                                }
                            }
                        } else if (hInfo.type === 'array') {
                            defaultValue = [];
                        }
                        break;
                    }
                }
            }

            // 4. Kiểm tra các kiểu Zod cơ bản trực tiếp (thứ tự ưu tiên: record, array, coerce.number, boolean, string)
            if (type === 'unknown') {
                if (/\bz(?:\s*\.\s*)record\b/.test(expr)) {
                    type = 'record';
                } else if (/\bz(?:\s*\.\s*)array\b/.test(expr)) {
                    type = 'array';
                } else if (/\bz(?:\s*\.\s*)(?:coerce\s*\.\s*)?number\b/.test(expr)) {
                    type = 'number';
                } else if (/\bz(?:\s*\.\s*)boolean\b/.test(expr)) {
                    type = 'boolean';
                } else if (/\bz(?:\s*\.\s*)string\b/.test(expr)) {
                    type = 'string';
                }
            }

            // 5. Trích xuất min / max / clamp (chỉ áp dụng cho number)
            if (type === 'number') {
                if (min === undefined || max === undefined) {
                    const clampMatch = expr.match(/clamp\s*\([^,]+,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/i);
                    if (clampMatch) {
                        if (min === undefined) min = Number(clampMatch[1]);
                        if (max === undefined) max = Number(clampMatch[2]);
                    }
                }
                if (min === undefined) {
                    const minMatch = expr.match(/\.min\s*\(\s*(-?\d+)\s*\)/);
                    if (minMatch) min = Number(minMatch[1]);
                }
                if (max === undefined) {
                    const maxMatch = expr.match(/\.max\s*\(\s*(-?\d+)\s*\)/);
                    if (maxMatch) max = Number(maxMatch[1]);
                }
            }

            if (defaultValue === undefined) {
                const prefaultMatch = expr.match(
                    /\.prefault\s*\(\s*(['"][^'"]*['"]|-?\d+(?:\.\d+)?|true|false|\{\}|\[\])\s*\)/,
                );
                if (prefaultMatch) {
                    try {
                        defaultValue = JSON.parse(prefaultMatch[1].replace(/'/g, '"'));
                    } catch {
                        defaultValue = prefaultMatch[1];
                    }
                }
            }

            descriptors.push({
                path: currentPath,
                name: key,
                type,
                min,
                max,
                defaultValue,
                children,
                recordTemplate,
            });
        }

        return descriptors;
    }

    /**
     * Bổ sung kiểu dữ liệu, giới hạn min/max và các instance động dựa trên dữ liệu Runtime thực tế
     */
    public static enrichWithLiveData(descriptors: MvuVariableDescriptor[], liveData: any): void {
        if (!liveData || typeof liveData !== 'object') return;

        for (const desc of descriptors) {
            const parts = desc.path.split('.');
            let curr = liveData;
            for (const p of parts) {
                if (curr && typeof curr === 'object' && p in curr) {
                    curr = curr[p];
                } else {
                    curr = undefined;
                    break;
                }
            }

            if (curr !== undefined) {
                const isTuple =
                    Array.isArray(curr) &&
                    curr.length === 2 &&
                    typeof curr[1] === 'string' &&
                    (curr[0] === null || ['string', 'number', 'boolean'].includes(typeof curr[0]));

                const realVal = isTuple ? curr[0] : curr;

                if (desc.type === 'unknown') {
                    if (typeof realVal === 'number') {
                        desc.type = 'number';
                    } else if (typeof realVal === 'string') {
                        desc.type = 'string';
                    } else if (typeof realVal === 'boolean') {
                        desc.type = 'boolean';
                    } else if (Array.isArray(realVal)) {
                        desc.type = 'array';
                    } else if (typeof realVal === 'object' && realVal !== null) {
                        desc.type = 'object';
                    }
                }

                // Nếu là record có recordTemplate (bộ sưu tập thực thể như Quan_hệ, Nhiệm_vụ, Túi_đồ, Di_chứng):
                if (
                    desc.type === 'record' &&
                    typeof realVal === 'object' &&
                    realVal !== null &&
                    !Array.isArray(realVal)
                ) {
                    if (desc.recordTemplate && desc.recordTemplate.length > 0) {
                        if (Object.keys(realVal).length > 0) {
                            desc.children = Object.entries(realVal).map(([subK, subV]) => {
                                const subPath = `${desc.path}.${subK}`;
                                const instanceChildren: MvuVariableDescriptor[] = desc.recordTemplate!.map(t => ({
                                    ...t,
                                    path: `${subPath}.${t.name}`,
                                    children: t.children
                                        ? t.children.map(c => ({ ...c, path: `${subPath}.${t.name}.${c.name}` }))
                                        : undefined,
                                }));
                                this.enrichWithLiveData(instanceChildren, subV);
                                return {
                                    name: subK,
                                    path: subPath,
                                    type: 'object' as const,
                                    defaultValue: subV,
                                    children: instanceChildren,
                                };
                            });
                        } else {
                            desc.children = [];
                        }
                    } else {
                        // Record kiểu nguyên thủy (primitive record dictionary như Kỹ_năng, Manh_mối, Hồ_sơ_chi_tiết, Nghịch_lý):
                        // Giữ desc đại diện cho toàn bộ dictionary để hiển thị key-value gọn gàng
                        desc.defaultValue = realVal;
                        desc.children = undefined;
                    }
                } else if (
                    desc.type === 'object' &&
                    (!desc.children || desc.children.length === 0) &&
                    typeof realVal === 'object' &&
                    realVal !== null &&
                    !Array.isArray(realVal)
                ) {
                    desc.children = Object.entries(realVal).map(([subK, subV]) => {
                        const subPath = `${desc.path}.${subK}`;
                        const subType =
                            typeof subV === 'number'
                                ? 'number'
                                : typeof subV === 'boolean'
                                  ? 'boolean'
                                  : Array.isArray(subV)
                                    ? 'array'
                                    : typeof subV === 'object' && subV !== null
                                      ? 'object'
                                      : 'string';
                        return {
                            name: subK,
                            path: subPath,
                            type: subType,
                            defaultValue: subV,
                        };
                    });
                }
            }

            if (desc.children && desc.children.length > 0) {
                this.enrichWithLiveData(desc.children, liveData);
            }
        }
    }

    /**
     * Tự động sinh cấu trúc Schema từ dữ liệu Live Variables nếu không có Zod Script
     */
    public static generateSchemaFromData(data: any, parentPath = ''): MvuVariableDescriptor[] {
        if (!data || typeof data !== 'object') return [];
        const descriptors: MvuVariableDescriptor[] = [];

        for (const [key, val] of Object.entries(data)) {
            if (key.startsWith('$')) continue; // Bỏ qua $meta, $__, etc. (nội bộ MVU engine)

            const currentPath = parentPath ? `${parentPath}.${key}` : key;
            const isTuple =
                Array.isArray(val) &&
                val.length === 2 &&
                typeof val[1] === 'string' &&
                (val[0] === null || ['string', 'number', 'boolean'].includes(typeof val[0]));

            if (isTuple) {
                const rawVal = val[0];
                const descText = val[1];
                const t = typeof rawVal === 'number' ? 'number' : typeof rawVal === 'boolean' ? 'boolean' : 'string';
                let min: number | undefined;
                let max: number | undefined;
                if (t === 'number') {
                    const rangeMatch =
                        descText.match(/(?:khoảng|trong|từ)?\s*\[\s*(-?\d+)\s*[,~-]\s*(-?\d+)\s*\]/i) ||
                        descText.match(/(-?\d+)\s*[-~]\s*(-?\d+)/);
                    if (rangeMatch) {
                        min = Number(rangeMatch[1]);
                        max = Number(rangeMatch[2]);
                    }
                }
                descriptors.push({
                    name: key,
                    path: currentPath,
                    type: t,
                    defaultValue: rawVal,
                    description: descText,
                    min,
                    max,
                });
            } else if (typeof val === 'number') {
                descriptors.push({ name: key, path: currentPath, type: 'number', defaultValue: val });
            } else if (typeof val === 'boolean') {
                descriptors.push({ name: key, path: currentPath, type: 'boolean', defaultValue: val });
            } else if (Array.isArray(val)) {
                descriptors.push({ name: key, path: currentPath, type: 'array', defaultValue: val });
            } else if (typeof val === 'object' && val !== null) {
                const children = this.generateSchemaFromData(val, currentPath);
                descriptors.push({ name: key, path: currentPath, type: 'object', children });
            } else {
                descriptors.push({ name: key, path: currentPath, type: 'string', defaultValue: String(val) });
            }
        }
        return descriptors;
    }

    /**
     * Báo cáo toàn diện hệ thống MVU của nhân vật hiện hành
     */
    public static async inspectMvu(
        adapter: SillyTavernAdapter,
        filterPath?: string,
        targetFloorId?: number,
    ): Promise<MvuInspectionResult> {
        const liveChar = this.getActiveCharacter();
        const charName = liveChar?.name || 'Unknown Character';

        if (!liveChar) {
            return {
                hasMvu: false,
                characterName: charName,
                parsedSchema: [],
                liveVariables: null,
                rawWrapper: null,
                currentFloor: null,
                availableFloors: [],
                dataSource: 'fallback',
                initvarVariables: null,
                updateRulesSummary: '',
                healthWarnings: ['Không tìm thấy nhân vật nào đang được chọn.'],
            };
        }

        const isMvu = this.hasMvu(liveChar);
        const zodScript = this.getZodScript(liveChar);

        // 1. Quét danh sách floor hợp lệ trong chat
        const floors = await this.listValidFloors();
        let effectiveFloorId = targetFloorId;
        if (effectiveFloorId === undefined && floors.length > 0) {
            effectiveFloorId = floors[0].messageId;
        }

        // 2. Đọc dữ liệu floor mục tiêu
        const floorData = await this.readFloor(effectiveFloorId);
        if (floorData) {
            this.cachedStatData = floorData.statData;
            this.cachedWrapper = floorData.wrapper;
            this.cachedDataSource = floorData.source;
            const matchedFloor = floors.find(f => f.messageId === floorData.messageId);
            this.cachedCurrentFloor =
                matchedFloor ||
                (floorData.messageId !== undefined
                    ? {
                          messageId: floorData.messageId,
                          displayIndex: floorData.messageId + 1,
                          role: 'assistant',
                          name: charName,
                          preview: '',
                          source: floorData.source,
                      }
                    : null);
        } else {
            this.cachedStatData = null;
            this.cachedWrapper = null;
            this.cachedCurrentFloor = null;
            this.cachedDataSource = 'fallback';
        }
        this.cachedFloors = floors;

        const liveVars = filterPath
            ? this.getLiveVariables(filterPath, effectiveFloorId)
            : this.cachedStatData;

        const lorebookMvu = await this.getLorebookMvuEntries(adapter, liveChar);

        let initvarParsed: any = null;
        if (lorebookMvu.initvarEntry?.content) {
            try {
                initvarParsed = YAML.parse(lorebookMvu.initvarEntry.content);
            } catch (e) {
                console.warn('[MvuManager] Failed to parse YAML of initvar:', e);
            }
        }

        const warnings: string[] = [];
        const inconsistencies: string[] = [];
        if (!isMvu) {
            warnings.push('Nhân vật này chưa kích hoạt hệ thống MVU.');
        } else {
            if (!zodScript) {
                warnings.push('Có dấu hiệu MVU nhưng không tìm thấy kịch bản Zod Schema trong tavern_helper.scripts.');
            }
            if (!lorebookMvu.initvarEntry) {
                warnings.push('Thiếu mục [InitVar] trong Worldbook để khởi tạo giá trị ban đầu.');
            }
            if (!lorebookMvu.updateRulesEntry) {
                warnings.push('Thiếu mục [mvu_update] trong Worldbook để hướng dẫn AI quy tắc cập nhật biến.');
            }
            if (!liveVars) {
                warnings.push('Chưa tìm thấy dữ liệu stat_data trong bộ nhớ (có thể cuộc hội thoại chưa bắt đầu hoặc chưa gửi tin nhắn).');
            }
        }

        let parsedSchema = zodScript ? this.parseZodCode(zodScript.content) : [];
        if (parsedSchema.length === 0 && initvarParsed) {
            parsedSchema = this.generateSchemaFromData(initvarParsed);
        }
        if (liveVars) {
            if (parsedSchema.length === 0) {
                parsedSchema = this.generateSchemaFromData(liveVars);
            }
            this.enrichWithLiveData(parsedSchema, liveVars);
        }

        // Kiểm tra tính nhất quán giữa Schema và InitVar (theo chuẩn Zod 4 & MVUZOD)
        if (parsedSchema.length > 0 && initvarParsed) {
            const checkLeaves = (items: MvuVariableDescriptor[]) => {
                for (const desc of items) {
                    if (desc.type === 'object' && desc.children && desc.children.length > 0) {
                        checkLeaves(desc.children);
                        continue;
                    }
                    if (desc.type === 'record') {
                        // Record là danh sách thực thể động (như Túi_đồ, Quan_hệ), không yêu cầu instance mẫu trong InitVar
                        continue;
                    }
                    // Theo chuẩn Zod 4: Các trường có .prefault() tự động nạp fallback an toàn tại runtime
                    if (desc.defaultValue !== undefined) {
                        continue;
                    }
                    const parts = desc.path.split('.');
                    let curr = initvarParsed;
                    let found = true;
                    for (const p of parts) {
                        if (curr && typeof curr === 'object' && p in curr) {
                            curr = curr[p];
                        } else {
                            found = false;
                            break;
                        }
                    }
                    if (!found) {
                        inconsistencies.push(
                            `Biến "${desc.path}" chưa có giá trị khởi tạo trong [InitVar] và không có .prefault().`,
                        );
                    }
                }
            };
            checkLeaves(parsedSchema);
        }

        const hasEjs = Boolean(lorebookMvu.ejsControllerEntry);

        // 5. Lọc dữ liệu nếu có filterPath
        let effectiveLiveVars = liveVars;
        let effectiveInitvar = initvarParsed;
        let effectiveParsedSchema = parsedSchema;

        if (filterPath && typeof filterPath === 'string' && filterPath.trim()) {
            const cleanFilter = filterPath.replace(/^stat_data\./, '').trim();
            if (cleanFilter) {
                const parts = cleanFilter.split('.');
                const getDeep = (obj: any, pathParts: string[]) => {
                    let curr = obj;
                    for (const p of pathParts) {
                        if (curr && typeof curr === 'object' && p in curr) {
                            curr = curr[p];
                        } else {
                            return undefined;
                        }
                    }
                    return curr;
                };

                if (effectiveLiveVars) {
                    effectiveLiveVars = getDeep(effectiveLiveVars, parts);
                }
                if (effectiveInitvar) {
                    effectiveInitvar = getDeep(effectiveInitvar, parts);
                }
                if (effectiveParsedSchema && effectiveParsedSchema.length > 0) {
                    const filterDescriptors = (items: MvuVariableDescriptor[]): MvuVariableDescriptor[] => {
                        const matched: MvuVariableDescriptor[] = [];
                        for (const it of items) {
                            if (it.path === cleanFilter || it.name === cleanFilter) {
                                matched.push(it);
                            } else if (it.path.startsWith(cleanFilter + '.')) {
                                matched.push(it);
                            } else if (cleanFilter.startsWith(it.path + '.')) {
                                if (it.children) {
                                    const childMatches = filterDescriptors(it.children);
                                    if (childMatches.length > 0) {
                                        matched.push({
                                            ...it,
                                            children: childMatches,
                                        });
                                    }
                                }
                            }
                        }
                        return matched;
                    };
                    effectiveParsedSchema = filterDescriptors(effectiveParsedSchema);
                }
            }
        }

        return {
            hasMvu: isMvu,
            characterName: charName,
            zodScriptName: zodScript?.name,
            zodSchemaCode: zodScript?.content,
            parsedSchema: effectiveParsedSchema,
            liveVariables: effectiveLiveVars,
            rawWrapper: this.cachedWrapper,
            currentFloor: this.cachedCurrentFloor,
            availableFloors: floors,
            dataSource: this.cachedDataSource,
            initvarVariables: effectiveInitvar,
            updateRulesSummary: lorebookMvu.updateRulesEntry?.content || '',
            hasEjsController: hasEjs,
            ejsControllerSummary: lorebookMvu.ejsControllerEntry?.comment || '',
            healthWarnings: warnings,
            inconsistencies,
        };
    }

    /**
     * Lan truyền thay đổi biến (Change Propagation Matrix)
     * Đồng bộ sửa: 1. Zod Script -> 2. [InitVar] YAML -> 3. [mvu_update] YAML -> 4. Ghi đè vào ST backend
     */
    public static async mutateMvuSchema(
        adapter: SillyTavernAdapter,
        options: MvuMutationOptions,
    ): Promise<{
        success: boolean;
        modifiedFiles: string[];
        details: string;
    }> {
        const liveChar = this.getActiveCharacter();
        if (!liveChar) throw new Error('Không có nhân vật nào đang hoạt động.');

        const zodScriptInfo = this.getZodScript(liveChar);
        if (!zodScriptInfo) throw new Error('Không tìm thấy kịch bản Zod Schema trong nhân vật.');

        const lorebookMvu = await this.getLorebookMvuEntries(adapter, liveChar);
        const modifiedFiles: string[] = [];

        // 1. Cập nhật Zod Script
        let zodCode = zodScriptInfo.content;
        const varPath = options.variablePath.replace(/^stat_data\./, '');
        const parts = varPath.split('.');
        const leafName = parts[parts.length - 1];

        const buildZodLine = () => {
            let zodLine = `z.string()`;
            if (
                options.type === 'number' ||
                (options.type === undefined && (options.min !== undefined || options.max !== undefined))
            ) {
                if (options.min !== undefined && options.max !== undefined) {
                    zodLine = `z.coerce.number().transform(v => _.clamp(v, ${options.min}, ${options.max}))`;
                } else {
                    zodLine = `z.coerce.number()`;
                }
            } else if (options.type === 'boolean') {
                zodLine = `z.boolean()`;
            } else if (options.type === 'array') {
                zodLine = `z.array(z.string())`;
            } else if (options.type === 'object') {
                zodLine = `z.record(z.string(), z.any())`;
            }

            if (options.defaultValue !== undefined) {
                zodLine += `.prefault(${JSON.stringify(options.defaultValue)})`;
            }
            return zodLine;
        };

        if (options.action === 'add') {
            const zodLine = buildZodLine();

            // Nếu là biến lồng nhau, thử chèn vào object cha
            let inserted = false;
            if (parts.length > 1) {
                const parentName = parts[parts.length - 2];
                const parentPattern = new RegExp(`(['"])?${parentName}\\1?\\s*:\\s*z\\.object\\s*\\(\\s*\\{`, 'i');
                if (parentPattern.test(zodCode)) {
                    zodCode = zodCode.replace(parentPattern, `$&\n    '${leafName}': ${zodLine},`);
                    inserted = true;
                }
            }

            if (!inserted) {
                const insertPattern = /(export\s+const\s+Schema\s*=\s*z\.object\s*\(\s*\{)/i;
                if (insertPattern.test(zodCode)) {
                    zodCode = zodCode.replace(insertPattern, `$1\n  '${leafName}': ${zodLine},`);
                } else {
                    const objMatch = zodCode.match(/(z\.object\s*\(\s*\{)/);
                    if (objMatch) {
                        zodCode = zodCode.replace(objMatch[1], `${objMatch[1]}\n  '${leafName}': ${zodLine},`);
                    }
                }
            }
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        } else if (options.action === 'modify') {
            const zodLine = buildZodLine();
            // Scope chính xác hơn: chỉ match dòng key: value, word boundary trước leafName
            const escapedLeaf = leafName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const modifyRegex = new RegExp(`^(\\s*)(['"])?${escapedLeaf}\\2?\\s*:\\s*z\\.[^,\\n]+`, 'gm');
            if (modifyRegex.test(zodCode)) {
                modifyRegex.lastIndex = 0; // Reset lastIndex sau test()
                zodCode = zodCode.replace(modifyRegex, `$1'${leafName}': ${zodLine}`);
                modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
            }
        } else if (options.action === 'rename') {
            if (!options.newName) {
                throw new Error('Cần cung cấp "newName" khi thực hiện đổi tên biến.');
            }
            const escapedLeaf = leafName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const renameRegex = new RegExp(`^(\\s*)(['"])?${escapedLeaf}\\2?\\s*:`, 'gm');
            zodCode = zodCode.replace(renameRegex, `$1'${options.newName}':`);
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        } else if (options.action === 'delete') {
            const escapedLeaf = leafName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const removeRegex = new RegExp(`^\\s*['"]?${escapedLeaf}['"]?\\s*:\\s*z\\.[^,\\n]+,?\\n?`, 'gm');
            zodCode = zodCode.replace(removeRegex, '');
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        }

        // Cập nhật script trong bộ nhớ của nhân vật (Hỗ trợ cả dạng mảng chuẩn TavernHelper và Object)
        if (zodScriptInfo.script) {
            zodScriptInfo.script.content = zodCode;
        }
        if (Array.isArray(liveChar.data?.extensions?.tavern_helper?.scripts)) {
            const idx = liveChar.data.extensions.tavern_helper.scripts.findIndex(
                (s: any) => s && (s.name === zodScriptInfo.name || s.id === zodScriptInfo.key),
            );
            if (idx !== -1) {
                liveChar.data.extensions.tavern_helper.scripts[idx].content = zodCode;
            }
        } else if (liveChar.data?.extensions?.tavern_helper?.scripts?.[zodScriptInfo.key]) {
            liveChar.data.extensions.tavern_helper.scripts[zodScriptInfo.key].content = zodCode;
        }

        try {
            const th = (window as any).TavernHelper;
            if (th && typeof th.updateScriptTreesWith === 'function') {
                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        if (Array.isArray(trees)) {
                            for (const node of trees) {
                                if (node && (node.name === zodScriptInfo.name || node.id === zodScriptInfo.key)) {
                                    node.content = zodCode;
                                }
                            }
                        }
                        return trees;
                    },
                    { type: 'character' },
                );
            }
        } catch (e) {
            console.warn('[MvuManager] TavernHelper updateScriptTreesWith warning in mutate:', e);
        }

        // 2. Cập nhật [InitVar] YAML
        if (lorebookMvu.initvarEntry?.content) {
            try {
                const yamlData = YAML.parse(lorebookMvu.initvarEntry.content) || {};
                if (options.action === 'add' || options.action === 'modify') {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]]) curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    curr[leafName] =
                        options.defaultValue !== undefined ? options.defaultValue : options.type === 'number' ? 0 : '';
                } else if (options.action === 'rename' && options.newName) {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (curr[parts[i]]) curr = curr[parts[i]];
                    }
                    if (leafName in curr) {
                        curr[options.newName] = curr[leafName];
                        delete curr[leafName];
                    }
                } else if (options.action === 'delete') {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (curr[parts[i]]) curr = curr[parts[i]];
                    }
                    delete curr[leafName];
                }
                lorebookMvu.initvarEntry.content = YAML.stringify(yamlData);
                modifiedFiles.push(`Worldbook: ${lorebookMvu.initvarEntry.comment || '[InitVar]'}`);
            } catch (e) {
                console.warn('[MvuManager] Error modifying initvar YAML:', e);
            }
        }

        // 3. Cập nhật [mvu_update] Quy tắc
        if (lorebookMvu.updateRulesEntry?.content) {
            try {
                const ruleData = YAML.parse(lorebookMvu.updateRulesEntry.content) || {};
                const keys = Object.keys(ruleData);
                let rootKey: string | undefined = keys.find((k) => k === 'Quy_tắc_cập_nhật' || k === 'Update_Rules');
                if (!rootKey && keys.length > 0) {
                    rootKey = keys[0];
                }
                if (!rootKey) {
                    rootKey = 'Quy_tắc_cập_nhật';
                    ruleData[rootKey] = {};
                }

                if (options.action === 'add' || options.action === 'modify') {
                    if (options.ruleCheck) {
                        ruleData[rootKey][varPath] = {
                            type: options.type || 'string',
                            range:
                                options.min !== undefined && options.max !== undefined
                                    ? `${options.min}~${options.max}`
                                    : undefined,
                            check: [options.ruleCheck],
                        };
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                } else if (options.action === 'rename' && options.newName) {
                    const newPath = varPath.replace(new RegExp(`${leafName}$`), options.newName);
                    if (ruleData[rootKey][varPath]) {
                        ruleData[rootKey][newPath] = ruleData[rootKey][varPath];
                        delete ruleData[rootKey][varPath];
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                } else if (options.action === 'delete') {
                    if (ruleData[rootKey][varPath]) {
                        delete ruleData[rootKey][varPath];
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                }
                lorebookMvu.updateRulesEntry.content = YAML.stringify(ruleData);
            } catch (e) {
                console.warn('[MvuManager] Error modifying update rules:', e);
            }
        }

        // Nếu nhân vật có linked Worldbook (Sổ tay liên kết), đồng bộ ghi đè vào file Worldbook ngoài
        const linkedWorld = liveChar.data?.extensions?.world || liveChar.world;
        if (linkedWorld && typeof linkedWorld === 'string' && linkedWorld.trim()) {
            try {
                const ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")();
                if (ST_WorldInfo && typeof ST_WorldInfo.loadWorldInfo === 'function' && typeof ST_WorldInfo.saveWorldInfo === 'function') {
                    const worldData = await ST_WorldInfo.loadWorldInfo(linkedWorld);
                    if (worldData && worldData.entries) {
                        for (const entry of Object.values(worldData.entries) as any[]) {
                            const c = (entry.comment || entry.name || '').toLowerCase();
                            if (lorebookMvu.initvarEntry && (c.includes('initvar') || c.includes('khởi tạo biến'))) {
                                entry.content = lorebookMvu.initvarEntry.content;
                            }
                            if (lorebookMvu.updateRulesEntry && (c.includes('mvu_update') || c.includes('quy tắc cập nhật') || c.includes('cập nhật biến'))) {
                                entry.content = lorebookMvu.updateRulesEntry.content;
                            }
                        }
                        await ST_WorldInfo.saveWorldInfo(linkedWorld, worldData, true);
                        if (typeof ST_WorldInfo.reloadEditor === 'function') {
                            ST_WorldInfo.reloadEditor(linkedWorld);
                        }
                    }
                }
            } catch (e) {
                console.warn('[MvuManager] Lỗi khi đồng bộ Worldbook liên kết ngoài trong mutate:', e);
            }
        }

        // 4. Lưu lại toàn bộ vào SillyTavern Backend qua merge-attributes
        const mergePayload = {
            avatar: liveChar.avatar,
            avatar_url: liveChar.avatar,
            ch_name: liveChar.name,
            data: {
                extensions: liveChar.data.extensions,
                character_book: liveChar.data.character_book,
            },
        };

        const ctx = this.getContext();
        const res = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(mergePayload),
        });

        if (!res.ok) {
            throw new Error(`Lỗi khi lưu vào SillyTavern Backend: HTTP ${res.status}`);
        }

        // Tải lại dữ liệu nhân vật mới nhất vào bộ nhớ ST Frontend (TUYỆT ĐỐI KHÔNG GỌI saveCharacterDebounced vì sẽ trigger form submit đè mất extensions)
        if (typeof (window as any).getOneCharacter === 'function') {
            await (window as any).getOneCharacter(liveChar.avatar);
        } else if (typeof ctx.getOneCharacter === 'function') {
            await ctx.getOneCharacter(liveChar.avatar);
        }
        try {
            const { eventSource, event_types } = await new Function('return import("/scripts/events.js")')();
            eventSource.emit(event_types.CHARACTER_EDITED, { detail: { id: ctx.characterId, character: liveChar } });
        } catch {}

        return {
            success: true,
            modifiedFiles,
            details: `Đã thực hiện hành động "${options.action}" trên biến "${varPath}" đồng bộ trên toàn bộ chuỗi mắt xích Zod và Worldbook.`,
        };
    }

    /**
     * Chuyển đổi mảng biến linh hoạt thành cây phân cấp lồng nhau
     */
    private static buildVariableTree(variables: MvuVariableInput[]): any {
        const root: any = {};
        for (const v of variables) {
            const cleanPath = v.path.replace(/^stat_data\./, '').trim();
            if (!cleanPath) continue;
            const parts = cleanPath.split('.');
            let curr = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!curr[part] || typeof curr[part] !== 'object' || curr[part]._isLeaf) {
                    curr[part] = { _isNode: true, _children: {} };
                }
                curr = curr[part]._children;
            }
            const leafName = parts[parts.length - 1];
            curr[leafName] = {
                _isLeaf: true,
                def: v,
            };
        }
        return root;
    }

    /**
     * Sinh mã Zod 4 Schema đệ quy theo cây biến
     */
    private static renderTreeToZod(tree: any, indentLevel = 1): string {
        const indent = '  '.repeat(indentLevel);
        const lines: string[] = [];

        for (const key of Object.keys(tree)) {
            const item = tree[key];
            if (item._isLeaf) {
                const def: MvuVariableInput = item.def;
                let zodTypeStr = 'z.string()';

                if (def.type === 'number') {
                    if (def.min !== undefined && def.max !== undefined) {
                        zodTypeStr = `z.coerce.number().transform(v => _.clamp(v, ${def.min}, ${def.max}))`;
                    } else if (def.min !== undefined) {
                        zodTypeStr = `z.coerce.number().min(${def.min})`;
                    } else if (def.max !== undefined) {
                        zodTypeStr = `z.coerce.number().max(${def.max})`;
                    } else {
                        zodTypeStr = `z.coerce.number()`;
                    }
                } else if (def.type === 'boolean') {
                    zodTypeStr = `z.boolean()`;
                } else if (def.type === 'array') {
                    zodTypeStr = `z.array(z.string())`;
                } else if (def.type === 'object') {
                    zodTypeStr = `z.record(z.string(), z.any())`;
                }

                if (def.defaultValue !== undefined) {
                    zodTypeStr += `.prefault(${JSON.stringify(def.defaultValue)})`;
                } else {
                    if (def.type === 'number') {
                        const fallbackNum = def.min !== undefined ? def.min : 0;
                        zodTypeStr += `.prefault(${fallbackNum})`;
                    } else if (def.type === 'boolean') {
                        zodTypeStr += `.prefault(false)`;
                    } else if (def.type === 'array') {
                        zodTypeStr += `.prefault([])`;
                    } else if (def.type === 'object') {
                        zodTypeStr += `.prefault({})`;
                    } else {
                        zodTypeStr += `.prefault('')`;
                    }
                }

                lines.push(`${indent}'${key}': ${zodTypeStr},`);
            } else if (item._isNode) {
                const inner = this.renderTreeToZod(item._children, indentLevel + 1);
                lines.push(`${indent}'${key}': z.object({\n${inner}\n${indent}}),`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Sinh cấu trúc dữ liệu khởi tạo InitVar (JavaScript Object)
     */
    private static renderTreeToInitvar(tree: any): any {
        const result: any = {};
        for (const key of Object.keys(tree)) {
            const item = tree[key];
            if (item._isLeaf) {
                const def: MvuVariableInput = item.def;
                if (def.defaultValue !== undefined) {
                    result[key] = def.defaultValue;
                } else if (def.type === 'number') {
                    result[key] = def.min !== undefined ? def.min : 0;
                } else if (def.type === 'boolean') {
                    result[key] = false;
                } else if (def.type === 'array') {
                    result[key] = [];
                } else if (def.type === 'object') {
                    result[key] = {};
                } else {
                    result[key] = '';
                }
            } else if (item._isNode) {
                result[key] = this.renderTreeToInitvar(item._children);
            }
        }
        return result;
    }

    /**
     * Sinh cấu trúc Quy tắc cập nhật biến ([mvu_update])
     */
    private static renderRulesFromVariables(variables: MvuVariableInput[]): any {
        const rules: Record<string, any> = {};
        for (const v of variables) {
            const cleanPath = v.path.replace(/^stat_data\./, '').trim();
            if (!cleanPath) continue;

            const parts = cleanPath.split('.');
            const leafName = parts[parts.length - 1];
            if (leafName.startsWith('_') || leafName.startsWith('$')) continue;

            const ruleObj: any = {
                type: v.type,
            };
            if (v.min !== undefined && v.max !== undefined) {
                ruleObj.range = `${v.min}~${v.max}`;
            } else if (v.min !== undefined) {
                ruleObj.range = `>=${v.min}`;
            } else if (v.max !== undefined) {
                ruleObj.range = `<=${v.max}`;
            }
            if (v.ruleCheck) {
                ruleObj.check = [v.ruleCheck];
            } else if (v.description) {
                ruleObj.check = [v.description];
            }

            rules[cleanPath] = ruleObj;
        }
        return { Quy_tắc_cập_nhật: rules };
    }

    /**
     * Nạp toàn bộ hạ tầng kỹ thuật MVU (Substrate Platform) vào một Card
     * Hoàn toàn linh hoạt, không giới hạn, không hardcode bất kỳ template nào.
     */
    public static async scaffoldMvuCard(
        adapter: SillyTavernAdapter,
        options: MvuScaffoldOptions = {},
    ): Promise<{
        success: boolean;
        injectedScripts: string[];
        injectedRegexes: string[];
        injectedLorebookEntries: string[];
    }> {
        const liveChar = this.getActiveCharacter();
        if (!liveChar) throw new Error('Không có nhân vật nào đang hoạt động để nạp MVU.');

        if (this.hasMvu(liveChar)) {
            console.warn('[MvuManager] Cảnh báo: Card đã có hệ thống MVU. Thao tác scaffold sẽ ghi đè lên cấu hình hiện tại.');
        }

        if (!liveChar.data) liveChar.data = {};
        if (!liveChar.data.extensions) liveChar.data.extensions = {};
        if (!liveChar.data.extensions.tavern_helper) liveChar.data.extensions.tavern_helper = { scripts: [], variables: {} };
        if (!Array.isArray(liveChar.data.extensions.tavern_helper.scripts)) {
            if (liveChar.data.extensions.tavern_helper.scripts && typeof liveChar.data.extensions.tavern_helper.scripts === 'object') {
                liveChar.data.extensions.tavern_helper.scripts = Object.values(liveChar.data.extensions.tavern_helper.scripts);
            } else {
                liveChar.data.extensions.tavern_helper.scripts = [];
            }
        }
        if (!Array.isArray(liveChar.data.extensions.regex_scripts)) {
            if (liveChar.data.extensions.regex_scripts && typeof liveChar.data.extensions.regex_scripts === 'object') {
                liveChar.data.extensions.regex_scripts = Object.values(liveChar.data.extensions.regex_scripts);
            } else {
                liveChar.data.extensions.regex_scripts = [];
            }
        }
        if (!liveChar.data.character_book) {
            liveChar.data.character_book = {
                name: liveChar.name ? `${liveChar.name}'s Lorebook` : 'Character Book',
                description: '',
                extensions: {},
                entries: [],
            };
        } else {
            if (!liveChar.data.character_book.extensions) liveChar.data.character_book.extensions = {};
            if (!Array.isArray(liveChar.data.character_book.entries)) liveChar.data.character_book.entries = [];
        }

        let zodCode = '';
        let initvarData: any = {};
        let updateRulesData: any = { Quy_tắc_cập_nhật: {} };

        // 1. Phân giải Schema & Dữ liệu
        if (options.customZodSchema && options.customZodSchema.trim()) {
            zodCode = options.customZodSchema.trim();
            if (!zodCode.includes('registerMvuSchema')) {
                if (!zodCode.includes('export const Schema')) {
                    zodCode = `export const Schema = z.object({\n${zodCode}\n});`;
                }
                zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\n${zodCode}\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            }
        }

        if (options.customInitvarYaml) {
            if (typeof options.customInitvarYaml === 'string') {
                try {
                    initvarData = YAML.parse(options.customInitvarYaml);
                } catch {
                    initvarData = { raw: options.customInitvarYaml };
                }
            } else {
                initvarData = options.customInitvarYaml;
            }
        }

        if (options.customRulesYaml) {
            if (typeof options.customRulesYaml === 'string') {
                try {
                    updateRulesData = YAML.parse(options.customRulesYaml);
                } catch {
                    updateRulesData = { Quy_tắc_cập_nhật: { raw: options.customRulesYaml } };
                }
            } else {
                updateRulesData = options.customRulesYaml;
            }
        }

        // Nếu có danh sách biến cụ thể
        if (options.variables && options.variables.length > 0) {
            const tree = this.buildVariableTree(options.variables);
            if (!zodCode) {
                const schemaInner = this.renderTreeToZod(tree, 1);
                zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\nexport const Schema = z.object({\n${schemaInner}\n});\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            }
            if (!options.customInitvarYaml) {
                initvarData = this.renderTreeToInitvar(tree);
            }
            if (!options.customRulesYaml) {
                updateRulesData = this.renderRulesFromVariables(options.variables);
            }
        } else if (!zodCode) {
            // Không có biến nào truyền vào và không có custom code: Cung cấp sàn trống linh hoạt sẵn sàng mở rộng
            zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\nexport const Schema = z.object({\n  'Trạng_thái': z.record(z.string(), z.any()).prefault({}),\n});\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            if (!options.customInitvarYaml) {
                initvarData = { Trạng_thái: {} };
            }
        }

        // 2. Tiêm Scripts Tửu quán trợ thủ (TavernHelper) dạng MẢNG chuẩn SillyTavern
        const mvuBundleCode = `import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';`;

        const mvuScript = {
            type: 'script',
            name: 'MVU',
            content: mvuBundleCode,
            enabled: true,
            id: 'mvu-core-' + Date.now(),
            info: 'MagVarUpdate Core Engine',
            button: { enabled: true, buttons: [] },
            data: {},
            export_with: { data: true, button: true },
        };

        const zodScript = {
            type: 'script',
            name: 'Cấu trúc biến',
            content: zodCode,
            enabled: true,
            id: 'zod-schema-' + Date.now(),
            info: 'Zod 4 Schema for MVU',
            button: { enabled: true, buttons: [] },
            data: {},
            export_with: { data: true, button: true },
        };

        const upsertTavernScript = (arr: any[], scriptObj: any) => {
            const idx = arr.findIndex((s: any) => s && (s.name === scriptObj.name || (s.id && s.id === scriptObj.id)));
            if (idx !== -1) {
                arr[idx] = { ...arr[idx], ...scriptObj };
            } else {
                arr.push(scriptObj);
            }
        };

        upsertTavernScript(liveChar.data.extensions.tavern_helper.scripts, mvuScript);
        upsertTavernScript(liveChar.data.extensions.tavern_helper.scripts, zodScript);

        try {
            const th = (window as any).TavernHelper;
            if (th && typeof th.updateScriptTreesWith === 'function') {
                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        const arr = Array.isArray(trees) ? trees : [];
                        upsertTavernScript(arr, mvuScript);
                        upsertTavernScript(arr, zodScript);
                        return arr;
                    },
                    { type: 'character' },
                );
            }
        } catch (e) {
            console.warn('[MvuManager] TavernHelper updateScriptTreesWith warning in scaffold:', e);
        }

        // 3. Tiêm Regex Scripts chuẩn (Tiếng Việt / English)
        const regexes = [
            {
                scriptName: '[MVU] Ẩn cập nhật biến khỏi AI',
                findRegex: '/<(update(?:variable)?)>(?:(?!.*<\\/\\1>)(?:(?!<\\1>).)*$|(?:(?!<\\1>).)*<\\/\\1?>)/gsi',
                replaceString: '',
                placement: [1, 2],
                promptOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Làm đẹp cập nhật biến',
                findRegex: '/<(update(?:variable)?)>\\s*((?:(?!<\\1>).)*)\\s*<\\/\\1>/gsi',
                replaceString:
                    '<div class="mvu-update-box" style="border:1px solid #4a5568;padding:8px;border-radius:6px;margin:8px 0;background:rgba(0,0,0,0.2);"><strong>📊 Cập nhật trạng thái:</strong><pre style="font-size:12px;margin:4px 0;">$2</pre></div>',
                placement: [1, 2],
                markdownOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Giao diện thanh trạng thái',
                findRegex: '<StatusPlaceHolderImpl/>',
                replaceString:
                    '<div class="mvu-status-bar" style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:8px;font-size:12px;">{{format_message_variable::stat_data}}</div>',
                placement: [2],
                markdownOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Ẩn thanh trạng thái khỏi AI',
                findRegex: '<StatusPlaceHolderImpl/>',
                replaceString: '',
                placement: [2],
                promptOnly: true,
                disabled: false,
            },
        ];

        const upsertRegexScript = (arr: any[], reg: any) => {
            const idx = arr.findIndex((r: any) => r && (r.scriptName === reg.scriptName || r.id === reg.id));
            const regData = {
                id: idx !== -1 ? arr[idx].id : `regex-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                ...reg,
                runOnEdit: true,
                substituteRegex: 0,
                minDepth: null,
                maxDepth: null,
            };
            if (idx !== -1) {
                arr[idx] = { ...arr[idx], ...regData };
            } else {
                arr.push(regData);
            }
        };

        for (const reg of regexes) {
            upsertRegexScript(liveChar.data.extensions.regex_scripts, reg);
        }

        try {
            const regexEngine = await new Function('return import("/scripts/extensions/regex/engine.js")')();
            if (regexEngine && regexEngine.SCRIPT_TYPES && typeof regexEngine.saveScriptsByType === 'function') {
                const { SCRIPT_TYPES, getScriptsByType, saveScriptsByType, allowScopedScripts } = regexEngine;
                let scoped = (typeof getScriptsByType === 'function' ? getScriptsByType(SCRIPT_TYPES.SCOPED) : null) || [];
                if (!Array.isArray(scoped)) scoped = [];
                for (const reg of regexes) {
                    upsertRegexScript(scoped, reg);
                }
                await saveScriptsByType(scoped, SCRIPT_TYPES.SCOPED);
                if (typeof allowScopedScripts === 'function') {
                    allowScopedScripts(liveChar);
                }
                try {
                    const { eventSource, event_types } = await new Function('return import("/scripts/events.js")')();
                    eventSource.emit(event_types.PRESET_CHANGED);
                } catch {}
            }
        } catch (e) {
            console.warn('[MvuManager] Regex Engine sync warning in scaffold:', e);
        }

        // 4. Tiêm Worldbook Entries chuẩn
        const outputFormatContent = `---
<update_variable_rules>
rule:
  - you must output the update analysis and the actual update commands at once in the end of the next reply
  - the update commands must strictly follow the **JSON Patch (RFC 6902)** standard, but can only use the following operations: replace (replace existing paths), delta (numeric increments), insert (new keys into object or array), remove; that is, the output must be a valid JSON array containing operation objects
format: |-
  <UpdateVariable>
  <Analysis>$(IN ENGLISH, no more than 80 words)
  - \${calculate time passed: ...}
  - \${decide whether dramatic updates are allowed as it's in a special case or the time passed is more than usual: yes/no}
  - \${analyze every variable based on its corresponding \`check\`, according only to current reply instead of previous plots: ...}
  </Analysis>
  <JSONPatch>
  [
    { "op": "replace", "path": "\${/path/to/variable}", "value": \${new_value} },
    { "op": "delta", "path": "\${/path/to/number}", "value": \${delta_value} },
    { "op": "insert", "path": "\${/path/to/object/newKey}", "value": \${content} },
    { "op": "remove", "path": "\${/path/to/array/0}" }
  ]
  </JSONPatch>
  </UpdateVariable>
</update_variable_rules>`;

        const now = Date.now();
        const newEntries = [
            {
                id: now,
                keys: [],
                secondary_keys: [],
                comment: '[InitVar] Khởi tạo biến cấm bật',
                content: YAML.stringify(initvarData),
                enabled: false, // Bắt buộc vô hiệu hóa: MVU chỉ đọc các mục initvar bị vô hiệu hóa để không tốn token prompt
                constant: false,
                selective: false,
                position: 'before_char',
                insertion_order: 100,
                use_regex: false,
                extensions: {},
            },
            {
                id: now + 1,
                keys: [],
                secondary_keys: [],
                comment: '[mvu_update] Quy tắc cập nhật biến',
                content: YAML.stringify(updateRulesData),
                enabled: true,
                constant: true,
                selective: false,
                position: 'before_char',
                insertion_order: 101,
                use_regex: false,
                extensions: {},
            },
            {
                id: now + 2,
                keys: [],
                secondary_keys: [],
                comment: '[mvu_update] Định dạng đầu ra của biến',
                content: outputFormatContent,
                enabled: true,
                constant: true,
                selective: false,
                position: 'before_char',
                insertion_order: 102,
                use_regex: false,
                extensions: {},
            },
            {
                id: now + 3,
                keys: [],
                secondary_keys: [],
                comment: 'Danh sách biến',
                content: `<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>`,
                enabled: true,
                constant: true,
                selective: false,
                position: 'before_char',
                insertion_order: 103,
                use_regex: false,
                extensions: {},
            },
        ];

        // 4. Tiêm Worldbook Entries chuẩn (hỗ trợ cả linked worldbook và embedded character_book)
        const linkedWorld = liveChar.data?.extensions?.world || liveChar.world;
        if (linkedWorld && typeof linkedWorld === 'string' && linkedWorld.trim()) {
            try {
                let ST_WorldInfo: any = null;
                try {
                    ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")();
                } catch {}

                if (ST_WorldInfo && typeof ST_WorldInfo.loadWorldInfo === 'function' && typeof ST_WorldInfo.saveWorldInfo === 'function') {
                    const worldData = await ST_WorldInfo.loadWorldInfo(linkedWorld);
                    if (worldData) {
                        if (!worldData.entries) worldData.entries = {};
                        const entriesMap = worldData.entries;
                        for (const ne of newEntries) {
                            let foundKey: string | null = null;
                            for (const [k, v] of Object.entries(entriesMap)) {
                                if ((v as any)?.comment === ne.comment || (v as any)?.name === ne.comment) {
                                    foundKey = k;
                                    break;
                                }
                            }

                            if (foundKey && entriesMap[foundKey]) {
                                entriesMap[foundKey].content = ne.content;
                                entriesMap[foundKey].disable = !ne.enabled;
                                entriesMap[foundKey].constant = Boolean(ne.constant);
                            } else {
                                if (typeof ST_WorldInfo.createWorldInfoEntry === 'function') {
                                    const created = ST_WorldInfo.createWorldInfoEntry(linkedWorld, worldData);
                                    if (created) {
                                        created.comment = ne.comment;
                                        created.name = ne.comment;
                                        created.content = ne.content;
                                        created.constant = Boolean(ne.constant);
                                        created.disable = !ne.enabled;
                                        created.key = ne.keys || [];
                                        created.keys = ne.keys || [];
                                        created.position = 0;
                                    }
                                } else {
                                    const nextUid = Date.now() + Math.floor(Math.random() * 1000);
                                    entriesMap[nextUid] = {
                                        uid: nextUid,
                                        comment: ne.comment,
                                        name: ne.comment,
                                        content: ne.content,
                                        constant: Boolean(ne.constant),
                                        disable: !ne.enabled,
                                        key: ne.keys || [],
                                        keys: ne.keys || [],
                                        position: 0,
                                    };
                                }
                            }
                        }
                        await ST_WorldInfo.saveWorldInfo(linkedWorld, worldData, true);
                        if (typeof ST_WorldInfo.reloadEditor === 'function') {
                            ST_WorldInfo.reloadEditor(linkedWorld);
                        }
                    }
                }
            } catch (e) {
                console.warn('[MvuManager] Lỗi khi lưu vào linked Worldbook trong scaffold:', e);
            }
        }

        const existingComments = new Set((liveChar.data.character_book.entries || []).map((e: any) => e.comment));
        for (const ne of newEntries) {
            if (!existingComments.has(ne.comment)) {
                liveChar.data.character_book.entries.push(ne);
            } else {
                const found = liveChar.data.character_book.entries.find((e: any) => e.comment === ne.comment);
                if (found) {
                    found.content = ne.content;
                    found.enabled = ne.enabled;
                    found.constant = ne.constant;
                }
            }
        }

        // 5. Lưu lại vào SillyTavern Backend
        const ctx = this.getContext();
        const res = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                avatar: liveChar.avatar,
                avatar_url: liveChar.avatar,
                ch_name: liveChar.name,
                data: {
                    extensions: liveChar.data.extensions,
                    character_book: liveChar.data.character_book,
                },
            }),
        });

        if (!res.ok) {
            throw new Error(`Lưu MVU vào SillyTavern thất bại: HTTP ${res.status}`);
        }

        // Tải lại dữ liệu nhân vật mới nhất vào bộ nhớ ST Frontend (TUYỆT ĐỐI KHÔNG GỌI saveCharacterDebounced vì sẽ trigger form submit đè mất extensions/lorebook)
        if (typeof (window as any).getOneCharacter === 'function') {
            await (window as any).getOneCharacter(liveChar.avatar);
        } else if (typeof ctx.getOneCharacter === 'function') {
            await ctx.getOneCharacter(liveChar.avatar);
        }
        try {
            const { eventSource, event_types } = await new Function('return import("/scripts/events.js")')();
            eventSource.emit(event_types.CHARACTER_EDITED, { detail: { id: ctx.characterId, character: liveChar } });
        } catch {}

        return {
            success: true,
            injectedScripts: ['MVU', 'Cấu trúc biến'],
            injectedRegexes: [
                '[MVU] Ẩn cập nhật biến khỏi AI',
                '[MVU] Làm đẹp cập nhật biến',
                '[MVU] Giao diện thanh trạng thái',
                '[MVU] Ẩn thanh trạng thái khỏi AI',
            ],
            injectedLorebookEntries: [
                '[InitVar] Khởi tạo biến cấm bật',
                '[mvu_update] Quy tắc cập nhật biến',
                '[mvu_update] Định dạng đầu ra của biến',
                'Danh sách biến',
            ],
        };
    }
}
