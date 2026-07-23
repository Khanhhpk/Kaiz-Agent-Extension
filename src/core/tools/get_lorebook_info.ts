import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getLorebookInfoTool: ITool = {
    schema: {
        name: 'get_lorebook_info',
        description:
            'Công cụ ĐỌC dữ liệu Sổ tay thế giới (Lorebook / World Info). Gồm 7 chế độ (mode): \n1. "summary": Lấy MỤC LỤC TÓM TẮT (UID, Tên, Keys) của các sách đang bật. ĐẶC BIỆT: Nếu truyền thêm "book_name", sẽ lấy mục lục của riêng cuốn sách đó (cho dù nó đang tắt). LUÔN ƯU TIÊN dùng chế độ này đầu tiên để khảo sát.\n2. "by_uid": Đọc CHI TIẾT nội dung của 1 entry khi đã biết UID.\n3. "by_name": Đọc CHI TIẾT toàn bộ 1 cuốn sách (cho dù nó đang tắt).\n4. "search": Tìm kiếm entry theo từ khóa.\n5. "simulate": Kiểm tra xem câu thoại nào kích hoạt entry nào.\n6. "char_full": Đọc sách gắn cứng theo thẻ nhân vật.\n7. "all_full": Đọc toàn bộ sách đang bật (Rất tốn token, chỉ dùng khi cần thiết).',
        parameters: {
            type: 'object',
            properties: {
                mode: {
                    type: 'string',
                    enum: ['summary', 'all_full', 'char_full', 'by_name', 'search', 'by_uid', 'simulate'],
                    description:
                        'Chế độ lấy dữ liệu. LƯU Ý: Chế độ "all_full" tốn rất nhiều token, CHỈ NÊN DÙNG khi đã thử các cách khác (search, simulate, by_uid) mà vẫn không tìm thấy thông tin người dùng cần.',
                },
                book_name: {
                    type: 'string',
                    description: 'Tên của cuốn Lorebook (bắt buộc nếu mode = by_name)',
                },
                query: {
                    type: 'string',
                    description:
                        'Từ khóa cần tìm (nếu mode = search) hoặc đoạn hội thoại cần giả lập kiểm tra (nếu mode = simulate)',
                },
                uid: {
                    type: 'string',
                    description: 'UID của Entry cần lấy chi tiết (nếu mode = by_uid)',
                },
                include_disabled: {
                    type: 'boolean',
                    description: 'Nếu true, sẽ lấy cả nội dung chi tiết của các entry đang bị tắt. (Mặc định: false)',
                },
            },
            required: ['mode'],
        },
    },
    validate: async () => {
        try {
            const ST_WorldInfo = await new Function('return import("/scripts/world-info.js")')();
            if (!ST_WorldInfo) throw new Error('Module loaded but empty');
        } catch (e: any) {
            throw new Error('Failed to load /scripts/world-info.js - ' + e.message, { cause: e });
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true,
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
                isError: true,
            };
        }
    },
};
