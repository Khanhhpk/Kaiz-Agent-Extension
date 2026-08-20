import { ITool } from '../tool_registry';
import { UICustomizationEngine } from '../ui_customization_engine';

let engineInstance: UICustomizationEngine | null = null;

export function initCSSManagerTool(engine: UICustomizationEngine) {
    engineInstance = engine;
}

export const stCSSManagerTool: ITool = {
    schema: {
        name: 'st_css_manager',
        description:
            'Quản lý các stylesheet CSS tuỳ chỉnh. Cho phép inject, sửa, xoá các block CSS vào giao diện SillyTavern. Mỗi style có ID riêng biệt để quản lý. Dùng để thay đổi layout, animation, color scheme, font... của bất kỳ thành phần nào. Mỗi thay đổi đều được snapshot để rollback.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description:
                        'Hành động cần thực hiện: "inject" (chèn style mới), "update" (cập nhật style đã có), "remove" (xoá style), "list" (liệt kê tất cả custom styles)',
                    enum: ['inject', 'update', 'remove', 'list'],
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

                default:
                    return { content: `Lỗi: Action "${action}" không hợp lệ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi st_css_manager: ${e.message}`, isError: true };
        }
    },
};
