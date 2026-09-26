import { ITool, ToolResult } from '../tool_registry';
import { PresetGitManager } from './preset_helpers';

export const getPresetInfoTool: ITool = {
    schema: {
        name: 'get_preset_info',
        description:
            'Lấy thông tin tổng quan về AI Prompt Preset đang kích hoạt trong SillyTavern.\n' +
            'Bao gồm: Tên Preset, commit HEAD hiện tại (Git control version), trạng thái nháp trong Sandbox (is_dirty), ' +
            'danh sách tóm tắt các prompt blocks (ID, tên, vai trò, trạng thái bật/tắt, thứ tự liên kết, độ sâu injection), ' +
            'và danh sách các biến macro {{setvar}} nếu yêu cầu.',
        parameters: {
            type: 'object',
            properties: {
                include_vars: {
                    type: 'boolean',
                    description:
                        'Nếu true, quét và liệt kê tất cả các biến macro {{setvar}} / {{getvar}} có trong preset.',
                },
                raw_live_only: {
                    type: 'boolean',
                    description:
                        'Nếu true, chỉ đọc dữ liệu gốc của SillyTavern, bỏ qua các thay đổi nháp đang có trong Sandbox.',
                },
            },
        },
    },
    validate: () => {
        const manager = PresetGitManager.getInstance();
        if (!manager.getContainer()) {
            throw new Error('Chưa chọn Chat Completion Preset nào hoặc SillyTavern chưa nạp preset.');
        }
    },
    execute: async (args: Record<string, any>): Promise<ToolResult> => {
        try {
            const manager = PresetGitManager.getInstance();
            const container = manager.getContainer();

            if (!container) {
                return {
                    isError: true,
                    content: 'Không tìm thấy cấu trúc ChatCompletion / Instruct Preset của SillyTavern trong bộ nhớ.',
                };
            }

            const rawLiveOnly = Boolean(args.raw_live_only);
            const includeVars = Boolean(args.include_vars);

            const presetName = manager.getActivePresetName();
            const headCommitHash = await manager.getHeadCommitHash(presetName);
            const dirtyInfo = await manager.isDirtyAgainstHead();
            const diff = dirtyInfo.diff;

            const prompts = rawLiveOnly ? manager.getRawLivePrompts() : manager.getPrompts();
            const order = rawLiveOnly ? manager.getRawLiveOrder() : manager.getPromptOrder();
            const linkedSet = new Set(order);

            const blocksSummary = prompts.map((p, index) => {
                const isLinked = linkedSet.has(p.identifier);
                const orderIndex = isLinked ? order.indexOf(p.identifier) + 1 : null;
                const preview = (p.content || '').replace(/\s+/g, ' ').trim().substring(0, 70);

                return {
                    index: index + 1,
                    identifier: p.identifier,
                    name: p.name,
                    role: p.role || 'system',
                    enabled: p.enabled !== false,
                    linked: isLinked,
                    linked_order: orderIndex,
                    injection_position: p.injection_position ?? 0,
                    injection_depth: p.injection_depth ?? 4,
                    injection_order: p.injection_order ?? 100,
                    system_prompt: p.system_prompt ?? false,
                    marker: p.marker ?? false,
                    char_count: (p.content || '').length,
                    preview: preview ? `${preview}${p.content.length > 70 ? '...' : ''}` : '(Empty)',
                };
            });

            // Sort: Linked blocks first by order, then unlinked
            blocksSummary.sort((a, b) => {
                if (a.linked && b.linked) return (a.linked_order || 0) - (b.linked_order || 0);
                if (a.linked && !b.linked) return -1;
                if (!a.linked && b.linked) return 1;
                return a.index - b.index;
            });

            const result: Record<string, any> = {
                active_preset: presetName,
                git_status: {
                    head_commit: headCommitHash || 'Chưa có commit nào (Initial)',
                    is_dirty: dirtyInfo.isDirty,
                    is_staged: dirtyInfo.isStaged,
                    staging_summary: diff.summary,
                    staged_stats: {
                        added: diff.added,
                        modified: diff.modified,
                        deleted: diff.deleted,
                        total_changes: diff.totalChanges,
                    },
                },
                stats: {
                    total_blocks: prompts.length,
                    linked_blocks: order.length,
                    unlinked_blocks: prompts.length - order.length,
                },
                linked_order: order,
                blocks: blocksSummary,
            };

            if (includeVars) {
                result.variables = manager.scanVariables().map((v) => ({
                    name: v.name,
                    type: v.type,
                    value: v.value,
                    scope: v.scope,
                    prompt_name: v.promptName,
                    prompt_id: v.promptId,
                }));
                result.variables_total = result.variables.length;
            }

            return {
                content: JSON.stringify(result, null, 2),
            };
        } catch (e: any) {
            console.error('[getPresetInfoTool] Error:', e);
            return {
                isError: true,
                content: `Lỗi khi lấy thông tin Preset: ${e.message}`,
            };
        }
    },
};
