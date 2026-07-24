import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getTavernHelperScriptsTool: ITool = {
    schema: {
        name: 'get_tavern_helper_scripts',
        description:
            'Lấy danh sách các script của JS-Slash-Runner (Tavern Helper) đang có (Global, Preset). Bao gồm ID, tên, mô tả, và trạng thái kích hoạt (enabled). Cần thiết để kiểm tra script trước khi sửa/xoá.',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    execute: async (args: any, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const th = (window as any).TavernHelper;
            if (!th) {
                return {
                    isError: true,
                    content: 'TavernHelper API chưa được tải hoặc extension JS-Slash-Runner chưa được kích hoạt trong SillyTavern.',
                };
            }

            const results: any[] = [];

            // Lấy Global Scripts
            let globalScripts = [];
            try {
                globalScripts = await th.getScriptTrees({ type: 'global' });
            } catch (e) {
                console.warn('[KaizAgent] Failed to fetch global scripts', e);
            }

            if (Array.isArray(globalScripts)) {
                globalScripts.forEach((script: any) => {
                    results.push({
                        id: script.id,
                        name: script.name || 'Unnamed Script',
                        scope: 'Global',
                        enabled: script.enabled !== false,
                        authorNote: script.authorNote || script.info || '',
                    });
                });
            }

            // Lấy Preset Scripts
            let presetScripts = [];
            try {
                presetScripts = await th.getScriptTrees({ type: 'preset' });
            } catch (e) {
                console.warn('[KaizAgent] Failed to fetch preset scripts', e);
            }

            if (Array.isArray(presetScripts)) {
                presetScripts.forEach((script: any) => {
                    results.push({
                        id: script.id,
                        name: script.name || 'Unnamed Script',
                        scope: 'Preset',
                        enabled: script.enabled !== false,
                        authorNote: script.authorNote || script.info || '',
                    });
                });
            }

            if (results.length === 0) {
                return {
                    content: 'Không có Script nào được tìm thấy.',
                };
            }

            return {
                content: JSON.stringify(results, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi lấy danh sách Tavern Helper Scripts: ${error.message || String(error)}`,
            };
        }
    },
};
