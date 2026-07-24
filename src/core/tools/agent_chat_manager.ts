import { ITool } from '../tool_registry';
import { StateManager } from '../state';

export const renameAgentChatTool: ITool = {
    schema: {
        name: 'rename_agent_chat',
        description:
            "Rename a specific INTERNAL Kaiz agent chat session by ID, or the current active internal chat if no ID is provided. (NOTE: This only affects the Agent's own memory, NOT the main SillyTavern character chat).",
        parameters: {
            type: 'object',
            properties: {
                newName: { type: 'string', description: 'The new name for the chat.' },
                chatId: {
                    type: 'number',
                    description: 'Optional. The ID of the chat to rename. If not provided, renames the current chat.',
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
            "Closes the current internal Kaiz agent chat and opens a new blank internal chat session. (NOTE: This only affects the Agent's own memory, NOT the main SillyTavern character chat).",
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
            "List all existing internal Kaiz agent chat sessions (ID, Name, Created At, Updated At). (NOTE: This only affects the Agent's own memory, NOT the main SillyTavern character chat).",
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
                content: `Found ${chats.length} chat(s):\n${listStr}\n\nCurrent active Chat ID: ${stateManager.currentChatId || 'None (New Blank Chat)'}`,
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
            "Delete a specific internal Kaiz agent chat by ID, or the current active internal chat if no ID is provided. (NOTE: This only affects the Agent's own memory, NOT the main SillyTavern character chat).",
        parameters: {
            type: 'object',
            properties: {
                chatId: {
                    type: 'number',
                    description: 'Optional. The ID of the chat to delete. If not provided, deletes the current chat.',
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
