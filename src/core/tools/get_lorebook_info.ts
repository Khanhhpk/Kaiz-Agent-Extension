import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getLorebookInfoTool: ITool = {
    schema: {
        name: 'get_lorebook_info',
        description: 'Lấy thông tin từ Sổ tay thế giới (Lorebook / World Info) đang được kích hoạt trong phòng chat. Có 4 chế độ (mode): summary (tóm tắt toàn bộ danh sách entry), all_full (lấy chi tiết toàn bộ, tốn token), char_full (chỉ lấy chi tiết thẻ nhân vật), by_name (lấy chi tiết 1 cuốn Lorebook cụ thể).',
        parameters: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['summary', 'all_full', 'char_full', 'by_name'],
                    description: 'Chế độ lấy dữ liệu. Mặc định là summary nếu chỉ cần tra cứu nhanh tên các entry.'
                },
                book_name: {
                    type: 'string',
                    description: 'Tên của cuốn Lorebook (bắt buộc nếu mode = by_name)'
                }
            },
            required: ['mode']
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        try {
            const mode = args.mode || 'summary';
            const bookName = args.book_name;
            const lorebookText = await context.adapter.getLorebookInfo({ mode, bookName });
            return { content: lorebookText || 'Không có Lorebook nào đang được kích hoạt hoặc Lorebook trống.' };
        } catch (error: any) {
            return {
                content: `Error getting Lorebook info: ${error.message || String(error)}`,
                isError: true
            };
        }
    }
};
