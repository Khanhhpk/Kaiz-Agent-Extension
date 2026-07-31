import { ITool } from '../tool_registry';
import { StateManager } from '../state';

export const renameAgentChatTool: ITool = {
    schema: {
        name: 'rename_agent_chat',
        description:
            "Đổi tên một phiên chat NỘI BỘ của agent theo ID, hoặc chat nội bộ đang hoạt động hiện tại nếu không cung cấp ID. Hoạt động trong phạm vi Workspace đang kích hoạt (hoặc Default nếu không có). (LƯU Ý: Lệnh này chỉ ảnh hưởng đến bộ nhớ riêng của Agent, KHÔNG ảnh hưởng đến chat chính của nhân vật trong SillyTavern).",
        parameters: {
            type: 'object',
            properties: {
                newName: { type: 'string', description: 'Tên mới cho đoạn chat.' },
                chatId: {
                    type: 'number',
                    description: 'Tùy chọn. ID của đoạn chat cần đổi tên. Nếu không cung cấp, sẽ đổi tên đoạn chat hiện tại.',
                },
            },
            required: ['newName'],
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available in context.', isError: true };

            const name = args.newName;
            const id = args.chatId || stateManager.currentChatId;

            if (!id) return { content: 'Error: No active chat to rename and no ID provided.', isError: true };

            await stateManager.updateChatName(id, name);

            return { content: `Successfully renamed chat ${id} to "${name}".` };
        } catch (e: any) {
            return { content: `Error renaming chat: ${e.message}`, isError: true };
        }
    },
};

export const openNewAgentChatTool: ITool = {
    schema: {
        name: 'open_new_agent_chat',
        description:
            "Đóng phiên chat nội bộ hiện tại của agent và mở một phiên chat nội bộ trống mới trong Workspace đang kích hoạt (hoặc Default nếu không có). (LƯU Ý: Lệnh này chỉ ảnh hưởng đến bộ nhớ riêng của Agent, KHÔNG ảnh hưởng đến chat chính của nhân vật trong SillyTavern).",
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available in context.', isError: true };

            stateManager.currentChatId = null;
            if (stateManager.onChatSwitched) stateManager.onChatSwitched(-1, []);

            // Remove selection in list UI
            const chats = await stateManager.loadChatList();
            if (stateManager.onChatsListUpdated) stateManager.onChatsListUpdated(chats);

            return { content: 'Successfully opened a new blank chat session.' };
        } catch (e: any) {
            return { content: `Error opening new chat: ${e.message}`, isError: true };
        }
    },
};

export const listAgentChatsTool: ITool = {
    schema: {
        name: 'list_agent_chats',
        description:
            "Liệt kê tất cả các phiên chat nội bộ của agent (ID, Tên, Ngày tạo, Ngày cập nhật) TRONG PHẠM VI Workspace đang kích hoạt. Nếu ở chế độ Default, sẽ liệt kê toàn bộ các đoạn chat global. Sử dụng list_agent_workspaces trước để hiểu cấu trúc workspace. (LƯU Ý: Lệnh này chỉ ảnh hưởng đến bộ nhớ riêng của Agent, KHÔNG ảnh hưởng đến chat chính của nhân vật trong SillyTavern).",
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available in context.', isError: true };

            const chats = await stateManager.loadChatList();
            if (chats.length === 0) return { content: 'No chats found.' };

            const listStr = chats
                .map((c) => `ID: ${c.id} | Name: "${c.name}" | Updated: ${new Date(c.updatedAt).toLocaleString()}`)
                .join('\n');
            return {
                content: `Found ${chats.length} chat(s):\n${listStr}\n\nCurrent active Chat ID: ${stateManager.currentChatId || 'None (New Blank Chat)'} | Active Workspace: ${stateManager.currentWorkspaceId ? `ID ${stateManager.currentWorkspaceId} ("${stateManager.currentWorkspace?.name}")` : 'Default (global)'}`,
            };
        } catch (e: any) {
            return { content: `Error listing chats: ${e.message}`, isError: true };
        }
    },
};

export const deleteAgentChatTool: ITool = {
    schema: {
        name: 'delete_agent_chat',
        description:
            "Xóa một đoạn chat nội bộ của agent theo ID, hoặc chat nội bộ đang hoạt động hiện tại nếu không cung cấp ID. Chỉ xóa các đoạn chat nằm trong phạm vi Workspace đang kích hoạt. (LƯU Ý: Lệnh này chỉ ảnh hưởng đến bộ nhớ riêng của Agent, KHÔNG ảnh hưởng đến chat chính của nhân vật trong SillyTavern).",
        parameters: {
            type: 'object',
            properties: {
                chatId: {
                    type: 'number',
                    description: 'Tùy chọn. ID của đoạn chat cần xóa. Nếu không cung cấp, sẽ xóa đoạn chat hiện tại.',
                },
            },
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available in context.', isError: true };

            const id = args.chatId || stateManager.currentChatId;
            if (!id) return { content: 'Error: No active chat to delete and no ID provided.', isError: true };

            await stateManager.deleteChat(id);

            return { content: `Successfully deleted chat ${id}.` };
        } catch (e: any) {
            return { content: `Error deleting chat: ${e.message}`, isError: true };
        }
    },
};
