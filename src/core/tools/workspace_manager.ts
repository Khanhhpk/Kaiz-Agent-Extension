import { ITool } from '../tool_registry';
import { StateManager } from '../state';

export const listWorkspacesTool: ITool = {
    schema: {
        name: 'list_agent_workspaces',
        description:
            'List all existing Agent Workspaces (ID, Name, enabled tools count, has custom prompt). Also shows which workspace is currently active. Use this to understand the workspace structure before switching or managing.',
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
            'Switch the current active Agent Workspace by ID, or switch to Default (global) mode by passing workspaceId as null. Switching workspace resets the active chat to a new blank chat.',
        parameters: {
            type: 'object',
            properties: {
                workspaceId: {
                    type: 'number',
                    description:
                        'The ID of the workspace to switch to. Pass null or omit to switch back to Default (global) mode.',
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
            'Create a new Agent Workspace with a given name. After creation, the agent automatically switches into the new workspace. The workspace starts with no tools and no custom prompt.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'The name for the new workspace.' },
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
