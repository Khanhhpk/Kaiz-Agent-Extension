import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { MvuManager } from '../mvu_manager';

export const setMvuVariableTool: ITool = {
    schema: {
        name: 'set_mvu_variable',
        description:
            'Trực tiếp sửa đổi giá trị của một biến trạng thái MVU trong thời gian thực (Runtime) thông qua TavernHelper API.\n' +
            'Không cần phải sửa tin nhắn chat hay chờ AI sinh thẻ <UpdateVariable>. Thao tác có hiệu lực ngay lập tức trong phiên chat và cập nhật thẳng vào giao diện thanh trạng thái (Status Bar) nếu có.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description:
                        'Đường dẫn biến cần sửa (VD: "stat_data.Thuộc_tính.Sức_khỏe" hoặc "Trạng_thái" hoặc "Nhân_vật.Túi_đồ").',
                },
                value: {
                    type: 'string',
                    description:
                        'Giá trị mới cần gán cho biến (có thể là số, chuỗi, boolean, mảng hoặc object tùy theo Schema).',
                },
                reason: {
                    type: 'string',
                    description:
                        'Lý do thực hiện thay đổi chỉ số/biến (để ghi nhận ngữ cảnh hoặc thông báo cho người dùng).',
                },
            },
            required: ['path', 'value'],
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

            const { path, value, reason } = args;
            if (!path) {
                return {
                    isError: true,
                    content: 'Lỗi: Thiếu tham số "path" (đường dẫn biến).',
                };
            }

            const result = await MvuManager.setLiveVariable(path, value);

            return {
                content: JSON.stringify(
                    {
                        success: true,
                        path,
                        oldValue: result.oldValue,
                        newValue: result.newValue,
                        reason: reason || 'Thay đổi bởi Agent',
                        message: `Đã cập nhật biến "${path}" thành công: ${JSON.stringify(result.oldValue)} ➔ ${JSON.stringify(result.newValue)}`,
                    },
                    null,
                    2,
                ),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi cập nhật biến MVU: ${error?.message || String(error)}`,
            };
        }
    },
};
