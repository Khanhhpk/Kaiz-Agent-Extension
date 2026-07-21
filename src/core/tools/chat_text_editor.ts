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
                    enum: ['find_and_highlight', 'find_and_replace', 'clear_highlight'],
                    description: 'Hành động cần thực hiện. find_and_highlight: làm sáng khung chat. find_and_replace: thay thế chữ. clear_highlight: Xóa toàn bộ highlight hiện tại.'
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
                },
                whole_word: {
                    type: 'boolean',
                    description: 'Nếu true, chỉ tìm kiếm các từ độc lập (không nằm trong từ khác). Mặc định false.'
                },
                case_insensitive: {
                    type: 'boolean',
                    description: 'Nếu true, không phân biệt chữ hoa chữ thường. Mặc định false.'
                },
                dry_run: {
                    type: 'boolean',
                    description: 'Nếu true (chỉ dùng cho find_and_replace), sẽ CHỈ trả về danh sách các thay đổi dự kiến mà KHÔNG thực sự lưu thay đổi. Rất hữu ích để xem trước kết quả. Mặc định false.'
                }
            },
            required: ['action']
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
        const wholeWord = args.whole_word === true;
        const caseInsensitive = args.case_insensitive === true;
        const dryRun = args.dry_run === true;
        
        if (action !== 'clear_highlight' && !query) {
            return { content: 'Lỗi: Thiếu tham số query (từ khóa cần tìm).', isError: true };
        }
        
        try {
            if (action === 'clear_highlight') {
                context.adapter.clearHighlight();
                return { content: 'Thành công: Đã xóa toàn bộ highlight trên màn hình.' };
            }
            else if (action === 'find_and_highlight') {
                const result = context.adapter.findAndHighlight(query, isRegex, caseInsensitive, wholeWord);
                return { content: `Thành công: Đã tìm thấy và bôi sáng ${result.count} tin nhắn chứa từ khóa "${query}".\nID các tin nhắn: ${result.messageIds.join(', ')}` };
            } 
            else if (action === 'find_and_replace') {
                const result = await context.adapter.findAndReplace(query, replacement, isRegex, caseInsensitive, wholeWord, dryRun);
                if (dryRun) {
                    let preview = `DRY-RUN (XEM TRƯỚC): Tìm thấy ${result.count} tin nhắn sẽ bị thay đổi.\n\n`;
                    result.messages.forEach(m => {
                        preview += `--- ID: ${m.id} ---\n- Cũ: ${m.oldText}\n+ Mới: ${m.newText}\n\n`;
                    });
                    return { content: preview };
                } else {
                    const ids = result.messages.map(m => m.id);
                    return { content: `Thành công: Đã tìm thấy và thay thế nội dung trong ${result.count} tin nhắn.\nID các tin nhắn đã sửa: ${ids.join(', ')}` };
                }
            }
            else {
                return { content: `Lỗi: Hành động "${action}" không được hỗ trợ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi: ${e.message}`, isError: true };
        }
    }
};
