import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { MvuManager, MvuMutationOptions } from '../mvu_manager';

export const mutateMvuSchemaTool: ITool = {
    schema: {
        name: 'mutate_mvu_schema',
        description:
            'Thực hiện modding / biến đổi cấu trúc Schema của hệ thống MVU trên thẻ nhân vật hiện tại.\n' +
            'Áp dụng Ma trận lan truyền thay đổi (Change Propagation Matrix) chuẩn của MVU Zod:\n' +
            '- Tự động cập nhật Zod 4 Schema trong script của Tửu quán trợ thủ (tavern_helper.scripts).\n' +
            '- Tự động cập nhật giá trị khởi tạo trong Worldbook ([InitVar] YAML).\n' +
            '- Tự động cập nhật quy tắc suy luận của AI trong Worldbook ([mvu_update] YAML).\n' +
            '- Tự động lưu và đồng bộ về SillyTavern Backend (/api/characters/merge-attributes).\n' +
            'Dùng khi người dùng yêu cầu: "Thêm cho nhân vật này chỉ số thể lực", "Xóa biến vàng", "Đặt giới hạn máu từ 0 đến 200", v.v.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['add', 'modify', 'delete', 'rename'],
                    description:
                        'Hành động cấu trúc: "add" (thêm biến mới), "modify" (sửa kiểu/giới hạn/giá trị), "delete" (xóa biến), "rename" (đổi tên biến).',
                },
                variable_path: {
                    type: 'string',
                    description: 'Đường dẫn biến (VD: "Thể_lực" hoặc "Người_chơi.Thuộc_tính.Thể_chất").',
                },
                new_name: {
                    type: 'string',
                    description: 'Tên mới của biến khi thực hiện hành động "rename".',
                },
                type: {
                    type: 'string',
                    enum: ['number', 'string', 'boolean', 'array', 'object'],
                    description: 'Kiểu dữ liệu của biến (mặc định là "number" nếu có min/max, ngược lại là "string").',
                },
                min: {
                    type: 'number',
                    description: 'Giá trị nhỏ nhất (nếu là số, hệ thống sẽ tự động clamp/kẹp trong khoảng này).',
                },
                max: {
                    type: 'number',
                    description: 'Giá trị lớn nhất (nếu là số, hệ thống sẽ tự động clamp/kẹp trong khoảng này).',
                },
                default_value: {
                    description:
                        'Giá trị khởi tạo ban đầu đưa vào [InitVar] (có thể là số, chuỗi, boolean, mảng hoặc object).',
                },
                rule_check: {
                    type: 'string',
                    description:
                        'Lời hướng dẫn bằng ngôn ngữ tự nhiên để AI biết khi nào và thay đổi biến như thế nào (đưa vào [mvu_update]).',
                },
            },
            required: ['action', 'variable_path'],
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

            const options: MvuMutationOptions = {
                action: args.action,
                variablePath: args.variable_path,
                newName: args.new_name,
                type: args.type,
                min: args.min,
                max: args.max,
                defaultValue: args.default_value,
                ruleCheck: args.rule_check,
            };

            const result = await MvuManager.mutateMvuSchema(context.adapter, options);

            return {
                content: JSON.stringify(result, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi biến đổi cấu trúc MVU Schema: ${error?.message || String(error)}`,
            };
        }
    },
};
