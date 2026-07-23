import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getRegexListTool: ITool = {
    schema: {
        name: 'get_regex_list',
        description:
            'Lấy danh sách các Regex Scripts hiện có trong SillyTavern. Bao gồm tên, ID (uuid), phạm vi áp dụng (Global, Scoped, Preset), thứ tự và trạng thái Bật/Tắt (disabled).',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    execute: async (
        args: any,
        context: { adapter: SillyTavernAdapter },
    ): Promise<ToolResult> => {
        try {
            // Sử dụng Function để bypass trình biên dịch TypeScript không nhận dạng được đường dẫn module tương đối của máy chủ
            const regexEngine = await new Function('return import("/scripts/extensions/regex/engine.js")')();

            if (!regexEngine || !regexEngine.SCRIPT_TYPES || !regexEngine.getScriptsByType) {
                return {
                    isError: true,
                    content:
                        'Không thể tải Regex Engine của SillyTavern. Đảm bảo bạn đang sử dụng phiên bản ST có hỗ trợ extension regex.',
                };
            }

            const { SCRIPT_TYPES, getScriptsByType } = regexEngine;

            const results: any[] = [];

            // Lấy Global Scripts
            const globalScripts = getScriptsByType(SCRIPT_TYPES.GLOBAL) || [];
            globalScripts.forEach((script: any, index: number) => {
                results.push({
                    id: script.id,
                    name: script.scriptName || 'Unnamed Script',
                    scope: 'Global',
                    order: index + 1,
                    disabled: !!script.disabled,
                });
            });

            // Lấy Scoped Scripts (Character specific)
            const scopedScripts = getScriptsByType(SCRIPT_TYPES.SCOPED) || [];
            scopedScripts.forEach((script: any, index: number) => {
                results.push({
                    id: script.id,
                    name: script.scriptName || 'Unnamed Script',
                    scope: 'Scoped',
                    order: index + 1,
                    disabled: !!script.disabled,
                });
            });

            // Lấy Preset Scripts
            const presetScripts = getScriptsByType(SCRIPT_TYPES.PRESET) || [];
            presetScripts.forEach((script: any, index: number) => {
                results.push({
                    id: script.id,
                    name: script.scriptName || 'Unnamed Script',
                    scope: 'Preset',
                    order: index + 1,
                    disabled: !!script.disabled,
                });
            });

            if (results.length === 0) {
                return {
                    content: 'Không có Regex Script nào được tìm thấy.',
                };
            }

            // Trả về dữ liệu dạng JSON cho LLM dễ phân tích
            return {
                content: JSON.stringify(results, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi lấy danh sách Regex: ${error.message || String(error)}`,
            };
        }
    },
};
