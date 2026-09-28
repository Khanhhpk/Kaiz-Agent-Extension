import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { MvuManager, MvuScaffoldOptions } from '../mvu_manager';

export const scaffoldMvuCardTool: ITool = {
    schema: {
        name: 'scaffold_mvu_card',
        description:
            'Nạp hạ tầng kỹ thuật MVU Zod 4 vào một thẻ nhân vật, biến card thành sàn dữ liệu trạng thái động.\n' +
            'LƯU Ý QUAN TRỌNG VỀ PHẠM VI SỬ DỤNG:\n' +
            '- Công cụ này dùng để "khai thiên lập địa" MVU từ con số 0 cho card CHƯA CÓ MVU.\n' +
            '- Nếu thẻ ĐÃ CÓ MVU: hãy ưu tiên sử dụng "mutate_mvu_schema" để thêm/sửa/xoá biến nhằm bảo toàn dữ liệu hiện tại, hoặc truyền "force: true" nếu muốn xoá sạch và dựng lại từ đầu.\n' +
            'HOÀN TOÀN TỰ ĐỘNG & TOÀN DIỆN:\n' +
            '1. Script lõi MagVarUpdate (MVU) chạy nền & Script Zod 4 Schema cấu trúc dữ liệu an toàn.\n' +
            '2. Tự động BẬT TOGGLE "Character Script" trong Tửu quán trợ thủ (TavernHelper) để kịch bản được phép thực thi.\n' +
            '3. Bộ 4 Regex Scripts chuẩn (ẩn cập nhật, làm đẹp thẻ, thanh trạng thái) và tự động bật Scoped Scripts.\n' +
            '4. Bộ 4 mục Worldbook chuẩn ([InitVar], [mvu_update] Quy tắc, [mvu_update] Định dạng đầu ra, Danh sách biến). ĐẶC BIỆT: Nếu card ban đầu là card đơn thuần KHÔNG có Worldbook liên kết, hệ thống sẽ tự động tạo mới một Worldbook chuyên dụng trên SillyTavern và liên kết vào thẻ, đảm bảo các entry prompt MVU hoạt động 100% trong phòng chat (không bị rơi vào hư vô).',
        parameters: {
            type: 'object',
            properties: {
                variables: {
                    type: 'array',
                    description:
                        'Danh sách các biến trạng thái tùy ý do AI thiết kế phù hợp với nhân vật (hỗ trợ phân cấp bằng dấu chấm, VD: "Nhân_vật.Tâm_trạng", "Chỉ_số.Sinh_mệnh", "Vật_phẩm").',
                    items: {
                        type: 'object',
                        properties: {
                            path: {
                                type: 'string',
                                description: 'Đường dẫn biến (VD: "Sức_khỏe", "Thế_giới.Thời_tiết", "Tâm_trạng").',
                            },
                            type: {
                                type: 'string',
                                enum: ['number', 'string', 'boolean', 'array', 'object'],
                                description: 'Kiểu dữ liệu của biến.',
                            },
                            defaultValue: {
                                description: 'Giá trị khởi tạo ban đầu cho biến (đưa vào [InitVar]).',
                            },
                            min: {
                                type: 'number',
                                description: 'Giá trị tối thiểu (nếu là số, hệ thống sẽ tự sinh hàm clamp của Zod).',
                            },
                            max: {
                                type: 'number',
                                description: 'Giá trị tối đa (nếu là số, hệ thống sẽ tự sinh hàm clamp của Zod).',
                            },
                            ruleCheck: {
                                type: 'string',
                                description:
                                    'Lời hướng dẫn ngôn ngữ tự nhiên giải thích khi nào biến thay đổi để AI điều chỉnh chính xác trong phản hồi.',
                            },
                            description: {
                                type: 'string',
                                description: 'Mô tả ngắn gọn ý nghĩa của biến.',
                            },
                        },
                        required: ['path', 'type'],
                    },
                },
                custom_zod_schema: {
                    type: 'string',
                    description:
                        'Mã nguồn Zod 4 Schema đầy đủ (nếu AI hoặc người dùng muốn tự viết trực tiếp toàn bộ kịch bản Zod 4).',
                },
                custom_initvar_yaml: {
                    type: 'string',
                    description: 'Nội dung YAML tùy chỉnh cho mục [InitVar] trong Worldbook.',
                },
                custom_rules_yaml: {
                    type: 'string',
                    description: 'Nội dung YAML tùy chỉnh cho mục [mvu_update] Quy tắc cập nhật biến trong Worldbook.',
                },
                concept_summary: {
                    type: 'string',
                    description:
                        'Mô tả ngắn gọn về hệ thống biến đang khởi tạo (VD: "Hệ thống sinh tồn", "Chỉ số tâm lý").',
                },
                force: {
                    type: 'boolean',
                    description:
                        'Bắt buộc ghi đè lại toàn bộ hệ thống MVU từ đầu nếu thẻ nhân vật đã có sẵn MVU (mặc định false). Thẻ chưa có MVU thì không cần truyền.',
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

            const options: MvuScaffoldOptions = {
                variables: args.variables,
                customZodSchema: args.custom_zod_schema,
                customInitvarYaml: args.custom_initvar_yaml,
                customRulesYaml: args.custom_rules_yaml,
                title: args.concept_summary,
                force: Boolean(args.force),
            };

            const result = await MvuManager.scaffoldMvuCard(context.adapter, options);

            return {
                content: JSON.stringify(
                    {
                        success: true,
                        concept: args.concept_summary || 'Tùy biến linh hoạt',
                        variablesCount: args.variables?.length || 0,
                        linkedWorldbook: result.linkedWorldbook,
                        message: 'Đã nạp thành công hạ tầng kỹ thuật MVU linh hoạt vào thẻ nhân vật hiện tại.',
                        characterScriptsEnabled: true,
                        injectedScripts: result.injectedScripts,
                        injectedRegexes: result.injectedRegexes,
                        injectedLorebookEntries: result.injectedLorebookEntries,
                    },
                    null,
                    2,
                ),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi nạp hệ thống MVU vào thẻ nhân vật: ${error?.message || String(error)}`,
            };
        }
    },
};
