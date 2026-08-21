import { ITool } from '../tool_registry';
import { UICustomizationEngine } from '../ui_customization_engine';

let engineInstance: UICustomizationEngine | null = null;

export function initCSSManagerTool(engine: UICustomizationEngine) {
    engineInstance = engine;
}

/**
 * Bản đồ CSS selectors phổ biến nhất của SillyTavern
 * Giúp AI biết chính xác cần target element nào khi viết CSS
 */
const ST_SELECTORS_GUIDE = `## SillyTavern CSS Selectors Guide

### Layout chính
- \`body\` — Body trang
- \`#sheld\` — Container chat chính (bao gồm cả sidebar)
- \`#chat\` — Danh sách tin nhắn (scrollable)
- \`#top-bar\` — Thanh điều hướng trên cùng
- \`#top-settings-holder\` — Container settings bên phải
- \`#form_sheld\` — Khu vực nhập tin nhắn (input area)
- \`#send_textarea\` — Textarea nhập tin nhắn
- \`#send_but\` — Nút gửi tin nhắn

### Tin nhắn
- \`.mes\` — Mỗi tin nhắn (chung)
- \`.mes[is_user="true"]\` — Tin nhắn của User
- \`.mes[is_user="false"]\` — Tin nhắn của Bot/Character
- \`.mes_text\` — Nội dung text của tin nhắn
- \`.mes_block\` — Block chứa avatar + text
- \`.mes_buttons\` — Container các nút (edit, copy, delete...)
- \`.mesAvatarWrapper\` — Wrapper avatar
- \`.avatar img\` — Ảnh avatar

### Sidebar
- \`#left-nav-panel\` — Sidebar trái (character list)
- \`#right-nav-panel\` — Sidebar phải (settings)
- \`#options\` — Menu options (hamburger)

### Character
- \`#character_popup\` — Popup thông tin nhân vật
- \`#avatar_div\` — Container avatar chính
- \`#rm_print_characters_block\` — Danh sách character cards

### CSS Variables (Có thể thay đổi qua st_theme_manager)
- \`--SmartThemeBodyColor\` — Màu text chính
- \`--SmartThemeEmColor\` — Màu text nghiêng
- \`--SmartThemeQuoteColor\` — Màu quote
- \`--SmartThemeBlurTintColor\` — Màu tint blur nền
- \`--SmartThemeChatTintColor\` — Màu tint chat area
- \`--SmartThemeUserMesBlurTintColor\` — Màu tint tin nhắn user
- \`--SmartThemeBotMesBlurTintColor\` — Màu tint tin nhắn bot
- \`--SmartThemeShadowColor\` — Màu shadow
- \`--SmartThemeBorderColor\` — Màu border
- \`--SmartThemeBlurStrength\` — Độ mạnh blur (px)
- \`--SmartThemeFontScale\` — Tỉ lệ font
- \`--sheldWidth\` — Độ rộng chat container (%)

### Ví dụ CSS phổ biến
1. Bo tròn avatar: \`.avatar img { border-radius: 50%; }\`
2. Bubble chat: \`.mes { border-radius: 18px; padding: 12px 16px; margin: 4px 0; }\`
3. Ẩn sidebar: \`#left-nav-panel { display: none; }\`
4. Custom font: \`body, .mes_text { font-family: 'Noto Sans', sans-serif; }\`
5. Gradient background: \`body { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }\`
`;

export const stCSSManagerTool: ITool = {
    schema: {
        name: 'st_css_manager',
        description:
            'Quản lý các stylesheet CSS tuỳ chỉnh. Cho phép inject, sửa, xoá các block CSS vào giao diện SillyTavern. Mỗi style có ID riêng biệt để quản lý. Dùng để thay đổi layout, animation, color scheme, font... của bất kỳ thành phần nào. Mỗi thay đổi đều được snapshot để rollback. Dùng action "get_selectors_guide" để xem bản đồ CSS selectors của SillyTavern.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description:
                        'Hành động cần thực hiện: "inject" (chèn style mới), "update" (cập nhật style đã có), "remove" (xoá style), "list" (liệt kê tất cả custom styles), "get_selectors_guide" (xem bản đồ CSS selectors phổ biến của SillyTavern)',
                    enum: ['inject', 'update', 'remove', 'list', 'get_selectors_guide'],
                },
                style_id: {
                    type: 'string',
                    description:
                        'ID định danh cho style block (tự động prefix "kaiz-custom-"). Ví dụ: "chat-bubbles", "dark-mode-fix". Bắt buộc cho action "inject", "update", "remove".',
                },
                css_content: {
                    type: 'string',
                    description:
                        'Nội dung CSS thuần tuý. Ví dụ: ".mes { border-radius: 16px; background: rgba(0,0,0,0.3); }". Bắt buộc cho action "inject" và "update".',
                },
            },
            required: ['action'],
        },
    },

    execute: async (args: any) => {
        try {
            if (!engineInstance) {
                return { content: 'Lỗi: UI Customization Engine chưa được khởi tạo.', isError: true };
            }

            const action = args.action;

            switch (action) {
                case 'inject': {
                    if (!args.style_id) {
                        return { content: 'Lỗi: Thiếu tham số "style_id".', isError: true };
                    }
                    if (!args.css_content) {
                        return { content: 'Lỗi: Thiếu tham số "css_content".', isError: true };
                    }

                    await engineInstance.injectCSS(args.style_id, args.css_content);
                    return {
                        content: `Đã inject CSS style "${args.style_id}" thành công (ID đầy đủ: kaiz-custom-${args.style_id}). Đã tạo snapshot để rollback.`,
                    };
                }

                case 'update': {
                    if (!args.style_id) {
                        return { content: 'Lỗi: Thiếu tham số "style_id".', isError: true };
                    }
                    if (!args.css_content) {
                        return { content: 'Lỗi: Thiếu tham số "css_content".', isError: true };
                    }

                    await engineInstance.updateCSS(args.style_id, args.css_content);
                    return {
                        content: `Đã cập nhật CSS style "${args.style_id}" thành công. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'remove': {
                    if (!args.style_id) {
                        return { content: 'Lỗi: Thiếu tham số "style_id".', isError: true };
                    }

                    await engineInstance.removeCSS(args.style_id);
                    return {
                        content: `Đã xoá CSS style "${args.style_id}" thành công. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'list': {
                    const styles = engineInstance.listCSS();
                    if (styles.length === 0) {
                        return { content: 'Hiện chưa có custom CSS nào đang hoạt động.' };
                    }

                    let output = `Có ${styles.length} custom style(s) đang hoạt động:\n\n`;
                    for (const s of styles) {
                        output += `• [${s.id}]: ${s.preview}\n`;
                    }
                    return { content: output };
                }

                case 'get_selectors_guide': {
                    return { content: ST_SELECTORS_GUIDE };
                }

                default:
                    return { content: `Lỗi: Action "${action}" không hợp lệ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi st_css_manager: ${e.message}`, isError: true };
        }
    },
};
