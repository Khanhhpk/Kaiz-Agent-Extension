import { ITool, ToolResult } from '../tool_registry';
import { PresetGitManager, PromptBlock } from './preset_helpers';
import { KaizDB } from '../db';

export const getPromptBlockTool: ITool = {
    schema: {
        name: 'get_prompt_block',
        description:
            'Đọc nội dung chi tiết đầy đủ (văn bản content và cấu hình injection) của một hoặc nhiều prompt blocks trong Preset.\n' +
            '- identifier: ID của block cụ thể cần đọc nội dung.\n' +
            '- all_linked: Nếu true, lấy toàn bộ chi tiết tất cả các block đang liên kết (linked) theo đúng thứ tự chuỗi prompt gửi lên LLM. Cực kỳ hữu dụng khi Agent cần thẩm định, audit hoặc tối ưu toàn diện preset.\n' +
            '- include_unlinked: Kết hợp với all_linked để lấy thêm cả các block chưa liên kết.\n' +
            '- query: Tìm kiếm từ khóa bên trong các block, trả về danh sách các block khớp kèm trích đoạn dòng văn bản.\n' +
            '- commit_hash: Tùy chọn đọc dữ liệu từ một mốc commit trong quá khứ (Git version) thay vì trạng thái hiện tại.',
        parameters: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description:
                        'ID của prompt block cần đọc (bắt đầu bằng "block_..." hoặc id chuẩn như "main", "jailbreak").',
                },
                all_linked: {
                    type: 'boolean',
                    description:
                        'Nếu true, trả về toàn bộ nội dung của tất cả các block đang linked theo đúng thứ tự thực thi.',
                },
                include_unlinked: {
                    type: 'boolean',
                    description: 'Kết hợp cùng all_linked để lấy cả các block unlinked (chưa liên kết).',
                },
                query: {
                    type: 'string',
                    description: 'Từ khóa tìm kiếm bên trong tên hoặc nội dung các block.',
                },
                commit_hash: {
                    type: 'string',
                    description: 'Mã hash của một commit trong quá khứ để đọc nội dung tại thời điểm đó.',
                },
            },
        },
    },
    execute: async (args: Record<string, any>): Promise<ToolResult> => {
        try {
            const manager = PresetGitManager.getInstance();
            const { identifier, all_linked, include_unlinked, query, commit_hash } = args;

            let prompts: PromptBlock[] = [];
            let order: string[] = [];
            let sourceNote = 'Trạng thái hiện tại (bao gồm Staging Sandbox nếu có)';

            // 1. Kiểm tra nếu yêu cầu đọc từ commit cũ
            if (commit_hash) {
                const db = KaizDB.getInstance();
                const commit = await db.getPresetCommitByHash(commit_hash);
                if (!commit) {
                    return {
                        isError: true,
                        content: `Không tìm thấy commit nào với mã hash: "${commit_hash}"`,
                    };
                }
                prompts = (commit.tree?.prompts || []).map((p) => ({ ...p }));
                prompts.forEach((p) => {
                    if (!p.identifier && (p as any).id) p.identifier = (p as any).id;
                });
                order = commit.tree?.prompt_order || [];
                sourceNote = `Commit [${commit.hash}]: "${commit.message}" (${new Date(commit.timestamp).toLocaleString()})`;
            } else {
                prompts = manager.getPrompts();
                order = manager.getPromptOrder();
            }

            // 2. Chế độ tìm kiếm (Search Query)
            if (query && typeof query === 'string' && query.trim()) {
                const q = query.trim().toLowerCase();
                const searchResults: any[] = [];

                for (const p of prompts) {
                    const matches: Array<{ line: number; excerpt: string }> = [];
                    const lines = (p.content || '').split('\n');

                    lines.forEach((line, idx) => {
                        if (line.toLowerCase().includes(q)) {
                            matches.push({
                                line: idx + 1,
                                excerpt: line.trim().substring(0, 150),
                            });
                        }
                    });

                    if (p.name.toLowerCase().includes(q)) {
                        matches.unshift({
                            line: 0,
                            excerpt: `[Khớp tên block]: ${p.name}`,
                        });
                    }

                    if (matches.length > 0) {
                        searchResults.push({
                            identifier: p.identifier,
                            name: p.name,
                            role: p.role,
                            enabled: p.enabled,
                            matched_lines: matches,
                        });
                    }
                }

                return {
                    content: JSON.stringify(
                        {
                            ok: true,
                            source: sourceNote,
                            query,
                            total_matching_blocks: searchResults.length,
                            results: searchResults,
                        },
                        null,
                        2,
                    ),
                };
            }

            // 3. Chế độ lấy toàn bộ linked prompts (all_linked)
            if (all_linked) {
                const promptMap = new Map(prompts.map((p) => [p.identifier, p]));
                const linkedFull: any[] = [];

                order.forEach((id, index) => {
                    const p = promptMap.get(id);
                    if (p) {
                        linkedFull.push({
                            order_index: index + 1,
                            identifier: p.identifier,
                            name: p.name,
                            role: p.role || 'system',
                            enabled: p.enabled !== false,
                            injection_position: p.injection_position ?? 0,
                            injection_depth: p.injection_depth ?? 4,
                            injection_order: p.injection_order ?? 100,
                            system_prompt: p.system_prompt ?? false,
                            marker: p.marker ?? false,
                            content: p.content || '',
                        });
                    }
                });

                let unlinkedFull: any[] | undefined = undefined;
                if (include_unlinked) {
                    const linkedSet = new Set(order);
                    unlinkedFull = prompts
                        .filter((p) => !linkedSet.has(p.identifier))
                        .map((p) => ({
                            identifier: p.identifier,
                            name: p.name,
                            role: p.role || 'system',
                            enabled: p.enabled !== false,
                            injection_position: p.injection_position ?? 0,
                            injection_depth: p.injection_depth ?? 4,
                            injection_order: p.injection_order ?? 100,
                            content: p.content || '',
                        }));
                }

                return {
                    content: JSON.stringify(
                        {
                            ok: true,
                            source: sourceNote,
                            total_linked: linkedFull.length,
                            total_unlinked: unlinkedFull ? unlinkedFull.length : undefined,
                            linked_prompts: linkedFull,
                            unlinked_prompts: unlinkedFull,
                        },
                        null,
                        2,
                    ),
                };
            }

            // 4. Chế độ lấy 1 block cụ thể theo identifier
            if (identifier && typeof identifier === 'string') {
                const target = prompts.find((p) => p.identifier === identifier || (p as any).id === identifier);
                if (!target) {
                    return {
                        isError: true,
                        content: `Không tìm thấy prompt block nào có ID: "${identifier}". Vui lòng dùng 'get_preset_info' để kiểm tra danh sách ID hợp lệ.`,
                    };
                }

                const isLinked = order.includes(target.identifier);
                const orderIndex = isLinked ? order.indexOf(target.identifier) + 1 : null;

                return {
                    content: JSON.stringify(
                        {
                            ok: true,
                            source: sourceNote,
                            block: {
                                identifier: target.identifier,
                                name: target.name,
                                role: target.role || 'system',
                                enabled: target.enabled !== false,
                                linked: isLinked,
                                linked_order: orderIndex,
                                injection_position: target.injection_position ?? 0,
                                injection_depth: target.injection_depth ?? 4,
                                injection_order: target.injection_order ?? 100,
                                system_prompt: target.system_prompt ?? false,
                                marker: target.marker ?? false,
                                forbid_overrides: target.forbid_overrides ?? false,
                                content: target.content || '',
                            },
                        },
                        null,
                        2,
                    ),
                };
            }

            return {
                isError: true,
                content:
                    'Cần cung cấp ít nhất một tham số: `identifier` (ID block cụ thể), `all_linked: true` (lấy toàn bộ), hoặc `query` (tìm kiếm từ khóa).',
            };
        } catch (e: any) {
            console.error('[getPromptBlockTool] Error:', e);
            return {
                isError: true,
                content: `Lỗi khi đọc nội dung Prompt Block: ${e.message}`,
            };
        }
    },
};
