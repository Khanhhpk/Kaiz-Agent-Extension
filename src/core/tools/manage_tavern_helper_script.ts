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
            '- data: Đối tượng JSON chứa các trường CẦN THAY ĐỔI. Tool dùng Object.assign, nên bạn CHỈ CẦN truyền những gì muốn sửa (VD: { info: "Sửa info thôi" }). KHÔNG CẦN truyền lại toàn bộ code (content) hay name nếu không muốn đổi chúng.\n' +
            '  + ĐẶC BIỆT MẠNH MẼ: Nếu chỉ muốn sửa 1 đoạn code trong `content` cực dài, KHÔNG CẦN chép lại cả content. Hãy dùng cú pháp patch: truyền vào data mảng `content_replacements: [{ target: "code cũ", replacement: "code mới" }]`. Tool sẽ tự động tìm `target` trong mã nguồn và thay bằng `replacement`.',
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
                    const children = Array.isArray(nodes[i].children)
                        ? nodes[i].children
                        : Array.isArray(nodes[i].scripts)
                          ? nodes[i].scripts
                          : null;
                    if (children) {
                        if (deleteFromTree(children)) return true;
                    }
                }
                return false;
            };

            // Hàm đệ quy sửa
            const editInTree = (nodes: any[], searchId: string, mutator: (node: any) => void): boolean => {
                if (!Array.isArray(nodes)) return false;
                for (const node of nodes) {
                    if (node.id === searchId) {
                        mutator(node);
                        return true;
                    }
                    const children = Array.isArray(node.children)
                        ? node.children
                        : Array.isArray(node.scripts)
                          ? node.scripts
                          : null;
                    if (children) {
                        if (editInTree(children, searchId, mutator)) return true;
                    }
                }
                return false;
            };

            const forceSyncUI = async (targetScope: string, targetId: string) => {
                try {
                    const tempId = targetId + '_temp_sync';

                    // Đổi ID tạm thời để Vue unmount component
                    await th.updateScriptTreesWith(
                        (trees: any[]) => {
                            editInTree(trees, targetId, (node) => {
                                node.id = tempId;
                            });
                            return trees;
                        },
                        { type: targetScope },
                    );

                    await new Promise((resolve) => setTimeout(resolve, 100));

                    // Trả lại ID gốc để Vue mount lại component với dữ liệu mới
                    await th.updateScriptTreesWith(
                        (trees: any[]) => {
                            editInTree(trees, tempId, (node) => {
                                node.id = targetId;
                            });
                            return trees;
                        },
                        { type: targetScope },
                    );
                } catch (e) {
                    console.error('Lỗi khi force sync UI JS-Slash-Runner:', e);
                }
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
                                if (node.id === id) {
                                    found = true;
                                    return;
                                }
                                const children = Array.isArray(node.children)
                                    ? node.children
                                    : Array.isArray(node.scripts)
                                      ? node.scripts
                                      : null;
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

                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        trees.push(newScript);
                        return trees;
                    },
                    { type: targetScope },
                );

                return {
                    content: `Tạo mới thành công Script: ${newScript.name} (ID: ${newId}, Scope: ${targetScope})`,
                };
            }

            if (!id) return { isError: true, content: 'Bắt buộc phải cung cấp id cho hành động này.' };

            const foundScope = await findScope();
            if (!foundScope) {
                return { isError: true, content: `Không tìm thấy Script nào với ID: ${id}` };
            }

            if (action === 'delete') {
                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        deleteFromTree(trees);
                        return trees;
                    },
                    { type: foundScope },
                );
                return { content: `Đã xóa thành công Script (ID: ${id})` };
            }

            if (action === 'toggle') {
                let currentStatus = false;
                let currentName = '';
                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        editInTree(trees, id, (node) => {
                            node.enabled = !node.enabled;
                            currentStatus = node.enabled;
                            currentName = node.name || 'Unnamed';
                        });
                        return trees;
                    },
                    { type: foundScope },
                );
                return { content: `Đã thay đổi trạng thái enabled thành ${currentStatus} cho Script: ${currentName}` };
            }

            if (action === 'edit') {
                if (!data || typeof data !== 'object') {
                    return { isError: true, content: 'Phải cung cấp field "data" dưới dạng JSON object để cập nhật.' };
                }

                let currentName = '';
                await th.updateScriptTreesWith(
                    (trees: any[]) => {
                        editInTree(trees, id, (node) => {
                            // Không cho phép ghi đè id
                            const originalId = node.id;

                            // Chuẩn hoá: Dùng info, loại bỏ authorNote
                            if (data.authorNote !== undefined) {
                                if (data.info === undefined) data.info = data.authorNote;
                                delete data.authorNote;
                            }

                            // Tính năng siêu việt: Patch mã nguồn thay vì ghi đè toàn bộ content
                            if (data.content_replacements && Array.isArray(data.content_replacements)) {
                                let patchError = '';
                                for (const rep of data.content_replacements) {
                                    if (typeof rep.target === 'string' && typeof rep.replacement === 'string') {
                                        if (node.content && node.content.includes(rep.target)) {
                                            node.content = node.content.split(rep.target).join(rep.replacement);
                                        } else {
                                            patchError = `Không tìm thấy đoạn mã target: ${rep.target.substring(0, 30)}...`;
                                            break;
                                        }
                                    }
                                }
                                delete data.content_replacements;
                                if (patchError) throw new Error(patchError);
                            }

                            Object.assign(node, data);
                            node.id = originalId;
                            currentName = node.name || 'Unnamed';

                            if (node.authorNote !== undefined) {
                                delete node.authorNote;
                            }
                        });
                        return trees;
                    },
                    { type: foundScope },
                );
                await forceSyncUI(foundScope, id);
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
