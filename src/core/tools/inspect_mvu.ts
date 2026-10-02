import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { MvuManager } from '../mvu_manager';

export const inspectMvuTool: ITool = {
    schema: {
        name: 'inspect_mvu',
        description:
            'Khảo sát và bóc tách chuyên sâu hệ thống biến trạng thái MVU (MagVarUpdate) và Zod 4 Schema của nhân vật hiện tại.\n' +
            'Trả về:\n' +
            '1. Trạng thái kích hoạt MVU và kịch bản Zod Schema (định nghĩa các kiểu dữ liệu, min, max, prefault).\n' +
            '2. Toàn bộ giá trị thời gian thực (live stats) hiện tại trong bộ nhớ chat (stat_data).\n' +
            '3. Giá trị khởi tạo mặc định [InitVar] trong Worldbook.\n' +
            '4. Các quy tắc cập nhật biến tự nhiên [mvu_update].\n' +
            '5. Cảnh báo lỗi không đồng bộ giữa Zod Schema và dữ liệu khởi tạo.',
        userDescription: 'Soi chiếu cấu trúc biến trạng thái MVU, Zod 4 Schema và giá trị live stats của nhân vật.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Đường dẫn biến cụ thể cần lọc (VD: "Trạng_thái.Sức_khỏe" hoặc "stat_data.Thuộc_tính"). Nếu để trống sẽ trả về toàn bộ cây biến.',
                },
                floor: {
                    type: 'number',
                    description:
                        'Tùy chọn: Tầng tin nhắn (Message ID) cụ thể cần khảo sát trạng thái biến. Nếu để trống sẽ lấy tầng tin nhắn hiện tại hoặc mới nhất.',
                },
            },
        },
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            if (!context || !context.adapter) {
                return {
                    isError: true,
                    content: 'Lỗi: Adapter không được cung cấp trong context.',
                };
            }

            const filterPath = args.path as string | undefined;
            const floor = args.floor !== undefined ? Number(args.floor) : undefined;
            const report = await MvuManager.inspectMvu(context.adapter, filterPath, floor);

            return {
                content: JSON.stringify(report, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi khảo sát hệ thống MVU: ${error?.message || String(error)}`,
            };
        }
    },
};
