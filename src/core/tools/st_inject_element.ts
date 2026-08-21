import { ITool } from '../tool_registry';
import { UICustomizationEngine } from '../ui_customization_engine';

let engineInstance: UICustomizationEngine | null = null;

export function initInjectElementTool(engine: UICustomizationEngine) {
    engineInstance = engine;
}

export const stInjectElementTool: ITool = {
    schema: {
        name: 'st_inject_element',
        description:
            'Chèn, gỡ bỏ và quản lý các phần tử HTML tuỳ chỉnh trong giao diện SillyTavern. HTML KHÔNG bị sanitize — hỗ trợ đầy đủ mọi tag, attribute, inline style, img src, iframe... Hỗ trợ rollback (undo) mọi thay đổi giao diện (CSS, element, theme). LƯU Ý: Dùng tool này cho các action undo/rollback_all/remove_all để hoàn tác mọi loại thay đổi.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description:
                        'Hành động: "inject" (chèn HTML), "remove" (gỡ element), "list" (liệt kê elements), "undo" (rollback bước gần nhất), "rollback_all" (rollback toàn bộ), "remove_all" (gỡ hết customization + xoá snapshots)',
                    enum: ['inject', 'remove', 'list', 'undo', 'rollback_all', 'remove_all'],
                },
                element_id: {
                    type: 'string',
                    description:
                        'ID cho element (tự động prefix "kaiz-injected-"). Bắt buộc cho action "inject" và "remove".',
                },
                html_content: {
                    type: 'string',
                    description:
                        'Nội dung HTML cần chèn. Không bị lọc — hỗ trợ đầy đủ mọi tag, attribute, inline style, img src, iframe... Bắt buộc cho action "inject".',
                },
                parent_selector: {
                    type: 'string',
                    description:
                        'CSS selector của phần tử cha mà HTML sẽ được chèn vào. Ví dụ: "#top-bar", "#form_sheld", ".mes:last-child .mes_buttons". Bắt buộc cho action "inject".',
                },
                position: {
                    type: 'string',
                    description:
                        'Vị trí chèn: "beforeend" (cuối phần tử cha, mặc định), "afterbegin" (đầu phần tử cha), "before" (trước phần tử cha), "after" (sau phần tử cha)',
                    enum: ['beforeend', 'afterbegin', 'before', 'after'],
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
                    if (!args.element_id) {
                        return { content: 'Lỗi: Thiếu tham số "element_id".', isError: true };
                    }
                    if (!args.html_content) {
                        return { content: 'Lỗi: Thiếu tham số "html_content".', isError: true };
                    }
                    if (!args.parent_selector) {
                        return { content: 'Lỗi: Thiếu tham số "parent_selector".', isError: true };
                    }

                    const position = args.position || 'beforeend';
                    await engineInstance.injectElement(
                        args.element_id,
                        args.html_content,
                        args.parent_selector,
                        position,
                    );
                    return {
                        content: `Đã chèn element "${args.element_id}" vào ${args.parent_selector} (position: ${position}). ID đầy đủ: kaiz-injected-${args.element_id}. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'remove': {
                    if (!args.element_id) {
                        return { content: 'Lỗi: Thiếu tham số "element_id".', isError: true };
                    }

                    await engineInstance.removeElement(args.element_id);
                    return {
                        content: `Đã gỡ bỏ element "${args.element_id}" thành công. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'list': {
                    const elements = engineInstance.listElements();
                    if (elements.length === 0) {
                        return { content: 'Hiện chưa có element nào được chèn vào giao diện.' };
                    }

                    let output = `Có ${elements.length} element(s) đang được chèn:\n\n`;
                    for (const el of elements) {
                        output += `• [${el.id}] <${el.tag}> trong ${el.parent}: ${el.preview || '(trống)'}\n`;
                    }
                    return { content: output };
                }

                case 'undo': {
                    const snapshot = await engineInstance.undo();
                    if (!snapshot) {
                        return { content: 'Không có thay đổi nào để hoàn tác.' };
                    }
                    return {
                        content: `Đã hoàn tác: "${snapshot.label}" (${snapshot.type}, ${new Date(snapshot.timestamp).toLocaleTimeString()}).`,
                    };
                }

                case 'rollback_all': {
                    const count = await engineInstance.rollbackAll();
                    if (count === 0) {
                        return { content: 'Không có thay đổi nào để hoàn tác.' };
                    }
                    return {
                        content: `Đã rollback ${count} thay đổi. Giao diện đã được khôi phục về trạng thái ban đầu.`,
                    };
                }

                case 'remove_all': {
                    await engineInstance.removeAllCustomizations();
                    return {
                        content:
                            'Đã gỡ bỏ tất cả CSS tuỳ chỉnh, element đã chèn, và xoá toàn bộ snapshot history.',
                    };
                }

                default:
                    return { content: `Lỗi: Action "${action}" không hợp lệ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi st_inject_element: ${e.message}`, isError: true };
        }
    },
};
