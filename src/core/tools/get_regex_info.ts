import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getRegexInfoTool: ITool = {
    schema: {
        name: 'get_regex_info',
        description:
            'Lấy thông tin chi tiết đầy đủ của Regex Script (ID). Hướng dẫn đọc dữ liệu ST:\n' +
            '- placement: [1]=User Input, [2]=AI Output, [3]=Slash Commands, [4]=World Info, [5]=Reasoning.\n' +
            '- Ephemerality (RẤT QUAN TRỌNG):\n' +
            '  + markdownOnly: true = Alter Chat Display (Chỉ bọc "mặt nạ" đổi hiển thị UI cho user xem, không gửi đi, an toàn nhất).\n' +
            '  + promptOnly: true = Alter Outgoing Prompt (Chỉ sửa data ngầm gửi cho LLM, không lưu vào lịch sử DB).\n' +
            '  + NGUY HIỂM: Nếu CẢ 2 đều false, Regex sẽ sửa và LƯU CHẾT vĩnh viễn vào Database hội thoại. Tránh dùng trừ khi user yêu cầu!\n' +
            "- substituteRegex: 0 = Don't substitute, 1 = Sub before regex, 2 = Sub after regex.\n" +
            '- runOnEdit: Chạy khi edit tin nhắn.',
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
