import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getLorebookInfoTool: ITool = {
    schema: {
        name: 'get_lorebook_info',
        description: 'Lấy thông tin từ Sổ tay thế giới (Lorebook / World Info). Có 7 chế độ (mode): summary (tóm tắt danh sách các book đang bật, hoặc tóm tắt 1 cuốn cụ thể nếu truyền book_name), all_full (chi tiết toàn bộ book đang bật), char_full (chi tiết thẻ nhân vật), by_name (chi tiết 1 cuốn BẤT KỲ, kể cả sách đang bị TẮT), search (tìm kiếm), by_uid (tìm qua UID), simulate (kiểm tra kích hoạt).',
        parameters: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['summary', 'all_full', 'char_full', 'by_name', 'search', 'by_uid', 'simulate'],
                    description: 'Chế độ lấy dữ liệu. LƯU Ý: Chế độ "all_full" tốn rất nhiều token, CHỈ NÊN DÙNG khi đã thử các cách khác (search, simulate, by_uid) mà vẫn không tìm thấy thông tin người dùng cần.'
                },
                book_name: {
                    type: 'string',
                    description: 'Tên của cuốn Lorebook (bắt buộc nếu mode = by_name)'
                },
                query: {
                    type: 'string',
                    description: 'Từ khóa cần tìm (nếu mode = search) hoặc đoạn hội thoại cần giả lập kiểm tra (nếu mode = simulate)'
                },
                uid: {
                    type: 'string',
                    description: 'UID của Entry cần lấy chi tiết (nếu mode = by_uid)'
                },
                include_disabled: {
                    type: 'boolean',
                    description: 'Nếu true, sẽ lấy cả nội dung chi tiết của các entry đang bị tắt. (Mặc định: false)'
                }
            },
            required: ['mode']
        }
    },
    validate: async () => {
        try {
            const ST_WorldInfo = await new Function('return import("/scripts/world-info.js")')();
            if (!ST_WorldInfo) throw new Error('Module loaded but empty');
        } catch (e: any) {
            throw new Error('Failed to load /scripts/world-info.js - ' + e.message);
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
            const query = args.query;
            const uid = args.uid;
            const includeDisabled = args.include_disabled === true;
            const lorebookText = await context.adapter.getLorebookInfo({ mode, bookName, includeDisabled, query, uid });
            return { content: lorebookText || 'Không có Lorebook nào đang được kích hoạt hoặc Lorebook trống.' };
        } catch (error: any) {
            return {
                content: `Error getting Lorebook info: ${error.message || String(error)}`,
                isError: true
            };
        }
    }
};
