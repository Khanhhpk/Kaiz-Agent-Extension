import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { MvuManager, MvuScaffoldOptions } from '../mvu_manager';

export const scaffoldMvuCardTool: ITool = {
    schema: {
        name: 'scaffold_mvu_card',
        description:
            'Nạp hạ tầng kỹ thuật MVU Zod 4 vào một thẻ nhân vật, biến card thành sàn dữ liệu trạng thái động.\n' +
            'HOÀN TOÀN LINH HOẠT - KHÔNG HẠN CHẾ: Bạn (AI) có thể tự do định nghĩa danh sách biến tùy biến dựa theo Lore và bối cảnh card, hoặc truyền mã Zod 4 Schema / YAML tùy chỉnh.\n' +
            'Hệ thống tự động đồng bộ và thiết lập toàn bộ hạ tầng kỹ thuật chuẩn:\n' +
            '1. Script lõi MagVarUpdate (MVU) chạy nền.\n' +
            '2. Script Zod 4 Schema cấu trúc dữ liệu an toàn theo kịch bản được định nghĩa.\n' +
            '3. Bộ 4 Regex Scripts thiết yếu (ẩn cập nhật khỏi AI, làm đẹp thẻ cập nhật, thanh trạng thái, ẩn trạng thái khỏi prompt AI).\n' +
            '4. Bộ 4 mục Worldbook chuẩn ([InitVar] Khởi tạo biến cấm bật, [mvu_update] Quy tắc cập nhật biến, [mvu_update] Định dạng đầu ra của biến, Danh sách biến).\n' +
            'Dùng khi người dùng yêu cầu: "Thêm hệ thống biến MVU cho nhân vật này", "Tạo hệ thống thể lực, đói, khát cho card", "Biến card này thành card có chỉ số", v.v.',
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
            };

            const result = await MvuManager.scaffoldMvuCard(context.adapter, options);

            return {
                content: JSON.stringify(
                    {
                        success: true,
                        concept: args.concept_summary || 'Tùy biến linh hoạt',
                        variablesCount: args.variables?.length || 0,
                        message: 'Đã nạp thành công hạ tầng kỹ thuật MVU linh hoạt vào thẻ nhân vật hiện tại.',
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
