import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const manageChatTextTool: ITool = {
    schema: {
        name: 'manage_chat_text',
        description: 'Tìm kiếm, bôi sáng (highlight) hoặc thay thế (replace) văn bản hàng loạt trong chính đoạn chat hiện tại của SillyTavern. Tool này tác động TRỰC TIẾP lên mảng chat của SillyTavern và giao diện hiển thị. Mẹo: Bạn có thể đọc lịch sử bằng get_chat_history trước để lấy chính xác câu văn cần sửa rồi truyền vào tool này.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['find_and_highlight', 'find_and_replace'],
                    description: 'Hành động cần thực hiện. find_and_highlight sẽ làm sáng rực khung chat chứa từ khóa. find_and_replace sẽ thay thế chữ trực tiếp.'
                },
                query: {
                    type: 'string',
                    description: 'Từ khóa hoặc câu văn cần tìm.'
                },
                replacement: {
                    type: 'string',
                    description: 'Chuỗi thay thế (chỉ dùng khi action = find_and_replace). Mặc định là chuỗi rỗng nếu không truyền.'
                },
                is_regex: {
                    type: 'boolean',
                    description: 'Set thành true nếu query là một biểu thức Regex. Mặc định là false (tìm chuỗi chính xác).'
                }
            },
            required: ['action', 'query']
        }
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('chat')) {
            throw new Error('Tính năng chat không tồn tại hoặc phiên bản SillyTavern không hỗ trợ.');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        const action = args.action;
        const query = args.query;
        const replacement = args.replacement || '';
        const isRegex = args.is_regex === true;
        
        if (!query) {
            return { content: 'Lỗi: Thiếu tham số query (từ khóa cần tìm).', isError: true };
        }
        
        try {
            if (action === 'find_and_highlight') {
                const count = context.adapter.findAndHighlight(query, isRegex);
                return { content: `Thành công: Đã tìm thấy và bôi sáng ${count} tin nhắn chứa từ khóa "${query}".` };
            } 
            else if (action === 'find_and_replace') {
                const count = await context.adapter.findAndReplace(query, replacement, isRegex);
                return { content: `Thành công: Đã tìm thấy và thay thế nội dung trong ${count} tin nhắn.` };
            }
            else {
                return { content: `Lỗi: Hành động "${action}" không được hỗ trợ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi: ${e.message}`, isError: true };
        }
    }
};
