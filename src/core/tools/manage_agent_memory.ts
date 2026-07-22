import { ITool } from '../tool_registry';

export const manageAgentMemory: ITool = {
    schema: {
        name: 'manage_agent_memory',
        description:
            'Công cụ giúp Kaiz Agent tự động thêm hoặc xóa các ghi nhớ (memories) về người dùng. Sử dụng khi người dùng yêu cầu "hãy nhớ...", "từ nay...", hoặc thay đổi thói quen/luật lệ. Ghi nhớ được lưu trữ vĩnh viễn và sẽ được tự động tiêm vào system prompt trong mọi cuộc trò chuyện.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['add', 'delete', 'clear_all'],
                    description: 'Hành động: add (thêm mới), delete (xóa), clear_all (xóa tất cả).',
                },
                content: {
                    type: 'string',
                    description: 'Nội dung ghi nhớ. Ví dụ: "Người dùng tên là Khang". Bắt buộc đối với action add và delete. Không cần đối với clear_all. Khi delete, nhập nội dung gần giống để AI tìm và xóa.',
                },
            },
            required: ['action'],
        },
    },
    execute: async (args: any) => {
        const action = args.action;
        const content = args.content;
        const ctx = (window as any).SillyTavern.getContext();
        const settings = ctx.extensionSettings.kaiz_agent;

        if (!settings.memories) {
            settings.memories = [];
        }

        if (action === 'clear_all') {
            settings.memories = [];
            ctx.saveSettingsDebounced();
            document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
            return {
                status: 'success',
                content: 'Đã xóa toàn bộ memory.',
            };
        }

        if (!content) {
            throw new Error('Thiếu tham số content.');
        }

        if (action === 'add') {
            settings.memories.push(content);
            ctx.saveSettingsDebounced();
            document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
            return {
                status: 'success',
                content: `Đã thêm ghi nhớ mới: "${content}"`,
            };
        }

        if (action === 'delete') {
            const lowerContent = content.toLowerCase();
            let indexToRemove = -1;
            
            for (let i = 0; i < settings.memories.length; i++) {
                if (settings.memories[i].toLowerCase().includes(lowerContent)) {
                    indexToRemove = i;
                    break;
                }
            }

            if (indexToRemove !== -1) {
                const removed = settings.memories.splice(indexToRemove, 1);
                ctx.saveSettingsDebounced();
                document.dispatchEvent(new CustomEvent('kaiz_memory_updated'));
                return {
                    status: 'success',
                    content: `Đã xóa ghi nhớ: "${removed[0]}"`,
                };
            } else {
                return {
                    status: 'not_found',
                    content: `Không tìm thấy ghi nhớ nào khớp với "${content}". Danh sách hiện tại: ${JSON.stringify(settings.memories)}`,
                };
            }
        }

        throw new Error(`Action không hợp lệ: ${action}`);
    },
};
