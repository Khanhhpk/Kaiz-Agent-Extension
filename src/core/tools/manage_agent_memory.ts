import { ITool } from '../tool_registry';

export const manageAgentMemory: ITool = {
    schema: {
        name: 'manage_agent_memory',
        description:
            'Công cụ giúp Kaiz Agent tự động thêm, sửa, hoặc xóa các ghi nhớ (memories) về người dùng. Sử dụng khi người dùng yêu cầu "hãy nhớ...", "từ nay...", hoặc thay đổi thói quen/luật lệ. Ghi nhớ được lưu trữ vĩnh viễn và tiêm vào system prompt.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['add', 'edit', 'delete', 'clear_all'],
                    description: 'Hành động: add (thêm mới), edit (sửa), delete (xóa), clear_all (xóa tất cả).',
                },
                key: {
                    type: 'string',
                    description:
                        'Tên định danh (Key) của memory. Ví dụ: "Tên người dùng", "Sở thích". Bắt buộc với add, edit, delete.',
                },
                content: {
                    type: 'string',
                    description: 'Nội dung ghi nhớ chi tiết. Bắt buộc đối với action add và edit.',
                },
            },
            required: ['action'],
        },
    },
    execute: async (args: any) => {
        try {
            const action = args.action;
            const key = args.key;
            const content = args.content;
            
            // Check for window and SillyTavern safely
            if (typeof window === 'undefined' || !(window as any).SillyTavern || typeof (window as any).SillyTavern.getContext !== 'function') {
                return { content: 'Error: SillyTavern context not available.', isError: true };
            }
            const ctx = (window as any).SillyTavern.getContext();

            if (!ctx?.extensionSettings?.kaiz_agent) {
                return { content: 'Error: Kaiz Agent settings not initialized.', isError: true };
            }
            const settings = ctx.extensionSettings.kaiz_agent;

            if (!settings.memories) {
                settings.memories = [];
            }

            if (action === 'clear_all') {
                settings.memories = [];
                ctx.saveSettingsDebounced();
                document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                return {
                    content: 'Đã xóa toàn bộ memory.',
                };
            }

            if (!key) {
                return { isError: true, content: 'Thiếu tham số key. Bắt buộc phải có key cho add, edit, delete.' };
            }

            const existingIndex = settings.memories.findIndex((mem: any) => {
                if (typeof mem === 'string') return false;
                return mem.key && mem.key.toLowerCase() === key.toLowerCase();
            });

            if (action === 'add') {
                if (!content) return { isError: true, content: 'Thiếu tham số content cho action add.' };
                if (existingIndex !== -1) {
                    return {
                        isError: true,
                        content: `Memory với key "${key}" đã tồn tại. Hãy sử dụng action "edit" để sửa đổi.`,
                    };
                }
                settings.memories.push({ key, content });
                ctx.saveSettingsDebounced();
                document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                return {
                    content: `Đã thêm ghi nhớ mới: [${key}] ${content}`,
                };
            }

            if (action === 'edit') {
                if (!content) return { isError: true, content: 'Thiếu tham số content cho action edit.' };
                if (existingIndex === -1) {
                    return {
                        isError: true,
                        content: `Không tìm thấy memory với key "${key}". Hãy dùng action "add" để thêm mới.`,
                    };
                }
                settings.memories[existingIndex].content = content;
                ctx.saveSettingsDebounced();
                document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                return {
                    content: `Đã cập nhật ghi nhớ: [${key}] ${content}`,
                };
            }

            if (action === 'delete') {
                if (existingIndex !== -1) {
                    settings.memories.splice(existingIndex, 1);
                    ctx.saveSettingsDebounced();
                    document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                    return {
                        content: `Đã xóa ghi nhớ có key: "${key}"`,
                    };
                } else {
                    // Hỗ trợ tìm kiếm theo chuỗi (Legacy fallback) nếu user yêu cầu xóa theo content
                    let legacyIndex = -1;
                    for (let i = 0; i < settings.memories.length; i++) {
                        const mem = settings.memories[i];
                        if (typeof mem === 'string' && mem.toLowerCase().includes(key.toLowerCase())) {
                            legacyIndex = i;
                            break;
                        } else if (
                            typeof mem === 'object' &&
                            mem.content &&
                            mem.content.toLowerCase().includes(key.toLowerCase())
                        ) {
                            legacyIndex = i;
                            break;
                        }
                    }

                    if (legacyIndex !== -1) {
                        settings.memories.splice(legacyIndex, 1);
                        ctx.saveSettingsDebounced();
                        document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                        return {
                            content: `Đã xóa ghi nhớ dựa trên khớp nội dung với từ khóa: "${key}"`,
                        };
                    }

                    return {
                        isError: true,
                        content: `Không tìm thấy ghi nhớ nào khớp với key hoặc nội dung "${key}".`,
                    };
                }
            }

            return { isError: true, content: `Action không hợp lệ: ${action}` };
        } catch (error: any) {
            return { isError: true, content: error.message || String(error) };
        }
    },
};
