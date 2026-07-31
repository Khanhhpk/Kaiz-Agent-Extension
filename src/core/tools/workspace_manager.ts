import { ITool } from '../tool_registry';
import { StateManager } from '../state';

export const listWorkspacesTool: ITool = {
    schema: {
        name: 'list_agent_workspaces',
        description:
            'Liệt kê tất cả các Agent Workspace hiện có (ID, Tên, số công cụ được bật, có prompt tùy chỉnh không). Cũng hiển thị workspace nào đang được kích hoạt. Sử dụng công cụ này để hiểu cấu trúc workspace trước khi chuyển đổi hoặc quản lý.',
        parameters: { type: 'object', properties: {} },
    },
    execute: async (_args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available.', isError: true };

            const workspaces = await stateManager.db.getAllWorkspaces();
            const currentId = stateManager.currentWorkspaceId;

            if (workspaces.length === 0) {
                return {
                    content: `No workspaces found.\nCurrent context: Default (global chat, all tools follow global settings).`,
                };
            }

            const lines = workspaces.map((ws) => {
                const enabledCount = Object.values(ws.toolsConfig || {}).filter(Boolean).length;
                const hasPrompt = ws.systemPrompt && ws.systemPrompt.trim() ? 'Yes' : 'No';
                const active = ws.id === currentId ? ' [ACTIVE]' : '';
                return `ID: ${ws.id} | Name: "${ws.name}" | Tools: ${enabledCount} | Custom Prompt: ${hasPrompt}${active}`;
            });

            const activeLabel = currentId
                ? `Workspace ID ${currentId} ("${stateManager.currentWorkspace?.name}")`
                : 'Default (global)';

            return {
                content: `Found ${workspaces.length} workspace(s):\n${lines.join('\n')}\n\nCurrently active: ${activeLabel}`,
            };
        } catch (e: any) {
            return { content: `Error listing workspaces: ${e.message}`, isError: true };
        }
    },
};

export const switchWorkspaceTool: ITool = {
    schema: {
        name: 'switch_agent_workspace',
        description:
            'Chuyển đổi Agent Workspace đang kích hoạt theo ID, hoặc chuyển về chế độ Default (global) bằng cách truyền workspaceId là null. Việc chuyển đổi workspace sẽ reset đoạn chat hiện tại thành một đoạn chat trống mới.',
        parameters: {
            type: 'object',
            properties: {
                workspaceId: {
                    type: 'number',
                    description:
                        'ID của workspace muốn chuyển đến. Truyền null hoặc bỏ qua để chuyển về chế độ Default (global).',
                },
            },
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available.', isError: true };

            const id: number | null = args.workspaceId ?? null;
            await stateManager.switchWorkspace(id);

            if (id === null) {
                return { content: 'Switched to Default (global) mode. A new blank chat is now active.' };
            }
            return {
                content: `Switched to Workspace ID ${id} ("${stateManager.currentWorkspace?.name || 'Unknown'}"). A new blank chat is now active.`,
            };
        } catch (e: any) {
            return { content: `Error switching workspace: ${e.message}`, isError: true };
        }
    },
};

export const createWorkspaceTool: ITool = {
    schema: {
        name: 'create_agent_workspace',
        description:
            'Tạo một Agent Workspace mới với tên được cung cấp. Sau khi tạo, agent sẽ tự động chuyển vào workspace mới. Workspace mới khởi đầu sẽ không có công cụ nào được bật và không có prompt tùy chỉnh.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Tên cho workspace mới.' },
            },
            required: ['name'],
        },
    },
    execute: async (args: any, context?: any) => {
        try {
            const stateManager = context?.stateManager as StateManager;
            if (!stateManager) return { content: 'Error: StateManager not available.', isError: true };

            const name = String(args.name || '').trim();
            if (!name) return { content: 'Error: Workspace name cannot be empty.', isError: true };

            const id = await stateManager.createWorkspace(name);
            return {
                content: `Successfully created Workspace "${name}" (ID: ${id}). Now switched into it. Tools and custom prompt can be configured via the Settings icon in the sidebar.`,
            };
        } catch (e: any) {
            return { content: `Error creating workspace: ${e.message}`, isError: true };
        }
    },
};
