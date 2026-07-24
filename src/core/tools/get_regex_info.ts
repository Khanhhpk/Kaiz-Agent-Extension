import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getRegexInfoTool: ITool = {
    schema: {
        name: 'get_regex_info',
        description: 'Lấy thông tin chi tiết đầy đủ của một Regex Script cụ thể bằng ID (uuid).',
        parameters: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'ID (uuid) của Regex Script cần lấy thông tin.',
                },
            },
            required: ['id'],
        },
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            if (!args.id) {
                return { isError: true, content: 'Thiếu tham số bắt buộc: id' };
            }

            // Sử dụng Function để bypass trình biên dịch TypeScript
            const regexEngine = await new Function('return import("/scripts/extensions/regex/engine.js")')();

            if (!regexEngine || !regexEngine.SCRIPT_TYPES || !regexEngine.getScriptsByType) {
                return {
                    isError: true,
                    content: 'Không thể tải Regex Engine của SillyTavern.',
                };
            }

            const { SCRIPT_TYPES, getScriptsByType } = regexEngine;

            // Lấy tất cả scripts từ các scope để tìm kiếm
            const globalScripts = getScriptsByType(SCRIPT_TYPES.GLOBAL) || [];
            const scopedScripts = getScriptsByType(SCRIPT_TYPES.SCOPED) || [];
            const presetScripts = getScriptsByType(SCRIPT_TYPES.PRESET) || [];

            const allScripts = [...globalScripts, ...scopedScripts, ...presetScripts];

            const targetScript = allScripts.find((script: any) => script.id === args.id);

            if (!targetScript) {
                return {
                    isError: true,
                    content: `Không tìm thấy Regex Script nào với ID: ${args.id}`,
                };
            }

            // Trả về toàn bộ chi tiết Regex dưới dạng JSON
            return {
                content: JSON.stringify(targetScript, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi lấy thông tin chi tiết Regex: ${error.message || String(error)}`,
            };
        }
    },
};
