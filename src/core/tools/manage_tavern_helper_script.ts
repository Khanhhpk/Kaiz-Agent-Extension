import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const manageTavernHelperScriptTool: ITool = {
    schema: {
        name: 'manage_tavern_helper_script',
        description:
            'Công cụ tạo, sửa, xoá, hoặc bật/tắt JS-Slash-Runner (Tavern Helper) Scripts.\n' +
            '- action: "create", "edit", "delete", "toggle".\n' +
            '- id: UUID của Script (bắt buộc cho edit/delete/toggle).\n' +
            '- scope: "global", "preset", "character" (chỉ dùng cho create, mặc định global). Nếu là action khác create, tool sẽ tự động tìm đúng scope.\n' +
            '- data: Object cấu hình script (truyền những trường cần sửa). Ví dụ: { name, content, info, enabled, data: {}, button: { enabled: true, buttons: [] } }.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'edit', 'delete', 'toggle'],
                    description: 'Hành động cần thực hiện.',
                },
                id: {
                    type: 'string',
                    description: 'ID của Script (yêu cầu với edit, delete, toggle).',
                },
                scope: {
                    type: 'string',
                    enum: ['global', 'preset', 'character'],
                    description: 'Phạm vi lưu trữ (dùng khi create). Mặc định là global.',
                },
                data: {
                    type: 'object',
                    description: 'Dữ liệu cập nhật hoặc tạo mới (JSON).',
                },
            },
            required: ['action'],
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

            const { action, id, data } = args;
            let { scope } = args;

            // Hàm đệ quy xoá
            const deleteFromTree = (nodes: any[]): boolean => {
                if (!Array.isArray(nodes)) return false;
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i].id === id) {
                        nodes.splice(i, 1);
                        return true;
                    }
                    const children = Array.isArray(nodes[i].children) ? nodes[i].children : (Array.isArray(nodes[i].scripts) ? nodes[i].scripts : null);
                    if (children) {
                        if (deleteFromTree(children)) return true;
                    }
                }
                return false;
            };

            // Hàm đệ quy sửa
            const editInTree = (nodes: any[], mutator: (node: any) => void): boolean => {
                if (!Array.isArray(nodes)) return false;
                for (const node of nodes) {
                    if (node.id === id) {
                        mutator(node);
                        return true;
                    }
                    const children = Array.isArray(node.children) ? node.children : (Array.isArray(node.scripts) ? node.scripts : null);
                    if (children) {
                        if (editInTree(children, mutator)) return true;
                    }
                }
                return false;
            };

            // Helpers tìm script để biết scope hiện tại
            const findScope = async (): Promise<string | null> => {
                const scopes = ['global', 'preset', 'character'];
                for (const s of scopes) {
                    try {
                        const trees = await th.getScriptTrees({ type: s });
                        let found = false;
                        const search = (nodes: any[]) => {
                            if (!Array.isArray(nodes)) return;
                            for (const node of nodes) {
                                if (node.id === id) { found = true; return; }
                                const children = Array.isArray(node.children) ? node.children : (Array.isArray(node.scripts) ? node.scripts : null);
                                if (children) search(children);
                            }
                        };
                        search(trees);
                        if (found) return s;
                    } catch (e) {}
                }
                return null;
            };

            if (action === 'create') {
                const targetScope = scope || 'global';
                const newId =
                    typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `script-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                const baseScript = {
                    type: 'script',
                    enabled: true,
                    name: 'New Script',
                    id: newId,
                    content: '',
                    info: '',
                    button: { enabled: true, buttons: [] },
                    data: {},
                    export_with: { data: true, button: true },
                };

                const newScript = { ...baseScript, ...(data || {}) };
                newScript.id = newId; 

                await th.updateScriptTreesWith((trees: any[]) => {
                    trees.push(newScript);
                    return trees;
                }, { type: targetScope });

                return { content: `Tạo mới thành công Script: ${newScript.name} (ID: ${newId}, Scope: ${targetScope})` };
            }

            if (!id) return { isError: true, content: 'Bắt buộc phải cung cấp id cho hành động này.' };

            const foundScope = await findScope();
            if (!foundScope) {
                return { isError: true, content: `Không tìm thấy Script nào với ID: ${id}` };
            }

            if (action === 'delete') {
                await th.updateScriptTreesWith((trees: any[]) => {
                    deleteFromTree(trees);
                    return trees;
                }, { type: foundScope });
                return { content: `Đã xóa thành công Script (ID: ${id})` };
            }

            if (action === 'toggle') {
                let currentStatus = false;
                let currentName = '';
                await th.updateScriptTreesWith((trees: any[]) => {
                    editInTree(trees, (node) => {
                        node.enabled = !node.enabled;
                        currentStatus = node.enabled;
                        currentName = node.name || 'Unnamed';
                    });
                    return trees;
                }, { type: foundScope });
                return { content: `Đã thay đổi trạng thái enabled thành ${currentStatus} cho Script: ${currentName}` };
            }

            if (action === 'edit') {
                if (!data || typeof data !== 'object') {
                    return { isError: true, content: 'Phải cung cấp field "data" dưới dạng JSON object để cập nhật.' };
                }

                let currentName = '';
                await th.updateScriptTreesWith((trees: any[]) => {
                    editInTree(trees, (node) => {
                        // Không cho phép ghi đè id
                        const originalId = node.id;
                        Object.assign(node, data);
                        node.id = originalId;
                        currentName = node.name || 'Unnamed';
                        
                        // Đồng bộ info và authorNote vì ST/JS-Slash-Runner dùng chung mục đích
                        if ('authorNote' in data) {
                            node.info = data.authorNote;
                        } else if ('info' in data) {
                            node.authorNote = data.info;
                        }
                    });
                    return trees;
                }, { type: foundScope });

                return { content: `Đã chỉnh sửa thành công Script: ${currentName}` };
            }

            return { isError: true, content: `Hành động không hợp lệ: ${action}` };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi quản lý Tavern Helper Script: ${error.message || String(error)}`,
            };
        }
    },
};
