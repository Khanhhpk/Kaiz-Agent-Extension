import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getTavernHelperScriptInfoTool: ITool = {
    schema: {
        name: 'get_tavern_helper_script_info',
        description: 'Đọc chi tiết (full info) của một Tavern Helper Script dựa vào ID. Trả về cấu trúc JSON đầy đủ gồm cả code content.',
        parameters: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: 'ID của Script cần lấy thông tin',
                },
            },
            required: ['id'],
        },
    },
    execute: async (args: any, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const th = (window as any).TavernHelper;
            if (!th) {
                return {
                    isError: true,
                    content: 'TavernHelper API chưa được tải hoặc extension JS-Slash-Runner chưa được kích hoạt.',
                };
            }

            const { id } = args;
            if (!id) return { isError: true, content: 'Thiếu tham số id' };

            let foundScript: any = null;
            let foundScope = '';

            const searchTree = (nodes: any[]) => {
                if (!Array.isArray(nodes)) return;
                for (const node of nodes) {
                    if (node.id === id) {
                        foundScript = node;
                        return true; // Found
                    }
                    const children = Array.isArray(node.children) ? node.children : (Array.isArray(node.scripts) ? node.scripts : null);
                    if (children) {
                        if (searchTree(children)) return true;
                    }
                }
                return false;
            };

            const scopes = ['global', 'preset', 'character'];
            for (const scope of scopes) {
                try {
                    const trees = await th.getScriptTrees({ type: scope });
                    if (searchTree(trees)) {
                        foundScope = scope;
                        break;
                    }
                } catch (e) {}
            }

            if (!foundScript) {
                return { isError: true, content: `Không tìm thấy Script nào với ID: ${id}` };
            }

            // Remove circular references if any, though usually scripts don't have them
            return {
                content: `Scope: ${foundScope}\nData: ${JSON.stringify(foundScript, null, 2)}`,
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi lấy thông tin script: ${error.message || String(error)}`,
            };
        }
    },
};
