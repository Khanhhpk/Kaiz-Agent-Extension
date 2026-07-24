import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const updateKaizExtensionTool: ITool = {
    schema: {
        name: 'update_kaiz_extension',
        description:
            'Kiểm tra thông báo update của Kaiz-Agent-Extension từ Extension Manager. Nếu có bản cập nhật mới, tự động click để update.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    validate: () => {
        return; // Luôn dùng được trên trình duyệt có jQuery
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const $ = (window as any).$;
            if (!$) {
                return { content: 'Lỗi: Không tìm thấy jQuery ($) trên trang.', isError: true };
            }

            // Tìm thẻ chứa Kaiz-Agent-Extension
            // Trong ST, mỗi extension thường được bọc trong thẻ có data-name hoặc class chứa tên
            let extBlock = $('[data-name="Kaiz-Agent-Extension"]');

            // Fallback nếu không tìm thấy bằng data-name
            if (extBlock.length === 0) {
                extBlock = $('.extension_name')
                    .filter(function (this: any) {
                        return $(this).text().trim().toLowerCase().includes('kaiz-agent-extension');
                    })
                    .closest('.extension_list_item, .extension_wrapper, .extension_row, [data-name]');
            }

            if (extBlock.length === 0) {
                return {
                    content:
                        'Không tìm thấy Kaiz-Agent-Extension trong danh sách Extension Manager. Có thể thẻ chưa được load vào DOM.',
                    isError: true,
                };
            }

            // Tìm nút update bên trong block này
            // ST thường dùng class .extension_update hoặc nút có icon download/text "Update"
            let updateBtn = extBlock.find('.extension_update');
            if (updateBtn.length === 0) {
                updateBtn = extBlock.find('.menu_button').filter(function (this: any) {
                    const text = $(this).text().toLowerCase();
                    const title = ($(this).attr('title') || '').toLowerCase();
                    return text.includes('update') || text.includes('cập nhật') || title.includes('update');
                });
            }

            if (updateBtn.length > 0 && updateBtn.is(':visible')) {
                // Nếu nút bị disable thì tức là đang update dở hoặc không cho click
                if (updateBtn.prop('disabled') || updateBtn.hasClass('disabled')) {
                    return {
                        content: 'Nút Update tồn tại nhưng đang bị vô hiệu hóa (Disabled). Có thể đang cập nhật rồi.',
                    };
                }

                updateBtn.trigger('click');
                return {
                    content:
                        '✅ Đã tìm thấy bản cập nhật! Đã tự động nhấn nút Update. Vui lòng đợi SillyTavern tải về và có thể sẽ yêu cầu Restart.',
                };
            } else {
                return {
                    content: 'ℹ️ Không tìm thấy thông báo/nút cập nhật. Kaiz-Agent-Extension hiện đã ở phiên bản mới nhất!',
                };
            }
        } catch (e: any) {
            return {
                content: `Lỗi khi chạy công cụ update_kaiz_extension: ${e.message}`,
                isError: true,
            };
        }
    },
};
