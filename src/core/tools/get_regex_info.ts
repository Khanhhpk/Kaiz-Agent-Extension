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

            if (!regexEngine || !regexEngine.getRegexScripts) {
                return {
                    isError: true,
                    content: 'Không thể tải Regex Engine của SillyTavern.',
                };
            }

            // getRegexScripts trả về mảng kết hợp từ tất cả các Scope
            const allScripts = regexEngine.getRegexScripts();

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
