import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getTavernHelperScriptsTool: ITool = {
    schema: {
        name: 'get_tavern_helper_scripts',
        description:
            'Lấy danh sách các script của JS-Slash-Runner (Tavern Helper) đang có (Global, Preset). Bao gồm ID, tên, mô tả, và trạng thái kích hoạt (enabled). Cần thiết để kiểm tra script trước khi sửa/xoá.',
        parameters: {
            type: 'object',
            properties: {},
        },
    },
    execute: async (args: any, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const th = (window as any).TavernHelper;
            if (!th) {
                return {
                    isError: true,
                    content: 'TavernHelper API chưa được tải hoặc extension JS-Slash-Runner chưa được kích hoạt trong SillyTavern.',
                };
            }

            const results: any[] = [];

            const flattenScripts = (nodes: any[], scopeName: string, parentPath = '') => {
                if (!Array.isArray(nodes)) return;
                nodes.forEach((node: any) => {
                    // Nhận diện folder (có thể qua type, isFolder, hoặc chứa mảng children/scripts)
                    const children = Array.isArray(node.children) ? node.children : (Array.isArray(node.scripts) ? node.scripts : null);
                    const isFolder = node.isFolder === true || node.type === 'folder' || children !== null;
                    
                    if (isFolder && children) {
                        const folderName = node.name || 'Unnamed Folder';
                        const currentPath = parentPath ? `${parentPath}/${folderName}` : folderName;
                        flattenScripts(children, scopeName, currentPath);
                    } else {
                        // Nếu là script thường
                        results.push({
                            id: node.id,
                            name: parentPath ? `[${parentPath}] ${node.name || 'Unnamed Script'}` : (node.name || 'Unnamed Script'),
                            scope: scopeName,
                            enabled: node.enabled !== false,
                            info: node.info || node.authorNote || '',
                        });
                    }
                });
            };

            // Lấy Global Scripts
            let globalScripts = [];
            try {
                globalScripts = await th.getScriptTrees({ type: 'global' });
            } catch (e) {
                console.warn('[KaizAgent] Failed to fetch global scripts', e);
            }
            flattenScripts(globalScripts, 'Global');

            // Lấy Preset Scripts
            let presetScripts = [];
            try {
                presetScripts = await th.getScriptTrees({ type: 'preset' });
            } catch (e) {
                console.warn('[KaizAgent] Failed to fetch preset scripts', e);
            }
            flattenScripts(presetScripts, 'Preset');

            if (results.length === 0) {
                return {
                    content: 'Không có Script nào được tìm thấy.',
                };
            }

            return {
                content: JSON.stringify(results, null, 2),
            };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi lấy danh sách Tavern Helper Scripts: ${error.message || String(error)}`,
            };
        }
    },
};
