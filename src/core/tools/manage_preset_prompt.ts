import { ITool, ToolResult } from '../tool_registry';
import { PresetGitManager } from './preset_helpers';

export const managePresetPromptTool: ITool = {
    schema: {
        name: 'manage_preset_prompt',
        description:
            'Công cụ toàn năng quản trị AI Prompt Preset theo kiến trúc Git Control Version và Sandbox Staging:\n' +
            'Mọi thay đổi (sửa, tạo, xóa, thay thế) đều được lưu tạm an toàn trong Staging Sandbox. ' +
            'Khi hoàn tất, gọi action "commit" để ghi mốc lịch sử (Git Commit) và lưu thật vào SillyTavern.\n\n' +
            'CÁC HÀNH ĐỘNG (action):\n' +
            '1. Nhóm Thao Tác Sandbox (Nháp an toàn):\n' +
            '  - "create": Tạo block mới (data: { name, content, role, addToLinked, position }).\n' +
            '  - "edit_content": Sửa toàn bộ văn bản của 1 block (yêu cầu identifier, data: { content }).\n' +
            '  - "replace_text": Thay thế chuỗi target_string bằng replacement_string trong 1 block hoặc toàn bộ preset nếu data.global=true (kỹ thuật kháng Safety Filter & chống cắt cụt).\n' +
            '  - "append_content": Nối thêm văn bản vào cuối block (yêu cầu identifier, data: { append_text }).\n' +
            '  - "edit_meta": Sửa thông số (role, injection_position, injection_depth, injection_order, system_prompt, marker, forbid_overrides).\n' +
            '  - "toggle": Bật/tắt block (yêu cầu identifier, data: { enabled? }).\n' +
            '  - "set_linked": Chuyển đổi trạng thái Linked/Unlinked hoặc di chuyển vị trí của 1 block (data: { linked: boolean, position?: number }).\n' +
            '  - "reorder": Sắp xếp lại thứ tự toàn bộ mảng ID Linked blocks (data: { order: string[] }).\n' +
            '  - "duplicate": Nhân bản 1 block kèm 100% nội dung và meta (yêu cầu identifier, data: { newName? }).\n' +
            '  - "delete": Đánh dấu xóa 1 block (yêu cầu identifier).\n' +
            '  - "batch_update": Cập nhật đồng thời nhiều block cùng lúc (data: { updates: Array<{ identifier: string, action?: "toggle"|"edit_meta"|"edit_content"|"replace_text"|"delete"|"set_linked", data?: object, enabled?: boolean, content?: string, ... }> }). Hỗ trợ cả định dạng phẳng lẫn action lồng nhau.\n' +
            '  - "update_var": Sửa giá trị biến macro {{setvar}} (data: { varName, newValue, promptId? }).\n' +
            '  - "rename_var": Đổi tên biến trên toàn bộ preset (data: { oldName, newName }).\n' +
            '  - "validate_syntax": Quét toàn bộ preset phát hiện lỗi ngoặc {{...}}, sai cú pháp macro, injection depth âm.\n\n' +
            '2. Nhóm Quản Trị Git Control Version:\n' +
            '  - "diff": So sánh chi tiết sự khác biệt giữa Staging nháp với commit HEAD (hoặc xem danh sách thay đổi đang chờ commit).\n' +
            '  - "commit": MỞ HỘP VÀ LƯU THẬT — Đóng gói toàn bộ Staging thành 1 commit node mới, lưu vào IndexedDB và áp dụng vào SillyTavern (bắt buộc data: { message: string }, tùy chọn data: { tag?: string }).\n' +
            '  - "log": Xem danh sách lịch sử commit của preset hiện tại (data: { limit?: number }).\n' +
            '  - "checkout": Chuyển trạng thái preset về bất kỳ commit hoặc tag nào (hỗ trợ cả revert chuỗi lẫn fast-forward tiến chuỗi tích lũy) (data: { target: string }).\n' +
            '  - "rollback": Hoàn tác quay về một commit hoặc tag chỉ định trong quá khứ, lập tức khôi phục SillyTavern (data: { target: string, hard?: boolean } - nếu hard: true, xóa sạch vĩnh viễn các commit mới hơn khỏi DB để giải phóng bộ nhớ).\n' +
            '  - "discard": Hủy toàn bộ nháp đang có trong Staging, đưa Sandbox về bằng với HEAD.\n' +
            '  - "tag": Đặt nhãn tag cho commit (data: { tag: string, target?: string }).\n' +
            '  - "prune_commits": Dọn dẹp các commit cũ, chỉ giữ lại N commit gần nhất (data: { keep_count?: number }).\n' +
            '  - "clear_history": Xóa sạch toàn bộ lịch sử commit của preset hiện tại để làm mới.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: [
                        'create',
                        'edit_content',
                        'replace_text',
                        'append_content',
                        'edit_meta',
                        'toggle',
                        'set_linked',
                        'reorder',
                        'duplicate',
                        'delete',
                        'batch_update',
                        'update_var',
                        'rename_var',
                        'validate_syntax',
                        'diff',
                        'commit',
                        'log',
                        'checkout',
                        'rollback',
                        'discard',
                        'tag',
                        'prune_commits',
                        'clear_history',
                    ],
                    description: 'Hành động cần thực hiện.',
                },
                identifier: {
                    type: 'string',
                    description:
                        'ID của prompt block mục tiêu (bắt buộc đối với các hành động can thiệp block đơn lẻ).',
                },
                data: {
                    type: 'object',
                    description: 'Dữ liệu payload đi kèm tương ứng với từng action.',
                },
            },
            required: ['action'],
        },
    },
    validate: () => {
        const manager = PresetGitManager.getInstance();
        if (!manager.getContainer()) {
            throw new Error('Chưa chọn Chat Completion Preset nào hoặc SillyTavern chưa nạp preset.');
        }
    },
    execute: async (args: Record<string, any>): Promise<ToolResult> => {
        try {
            const manager = PresetGitManager.getInstance();
            const { action, identifier, data = {} } = args;

            switch (action) {
                // ─── 1. NHÓM STAGING / SANDBOX ──────────────────────────────────────────

                case 'create': {
                    const result = manager.stageCreate({
                        name: data.name,
                        content: data.content,
                        role: data.role,
                        injection_position: data.injection_position,
                        injection_depth: data.injection_depth,
                        injection_order: data.injection_order,
                        addToLinked: data.addToLinked,
                        position: data.position,
                    });
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'create',
                                created_id: result.identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'edit_content': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "edit_content" yêu cầu truyền tham số `identifier` của block.',
                        };
                    }
                    if (data.content === undefined) {
                        return { isError: true, content: 'Action "edit_content" yêu cầu truyền `data.content`.' };
                    }
                    const result = manager.stageUpdateContent(identifier, String(data.content));
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'edit_content',
                                identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'replace_text': {
                    if (!data.target_string) {
                        return {
                            isError: true,
                            content: 'Action "replace_text" yêu cầu truyền `data.target_string` cần tìm.',
                        };
                    }
                    const replacement = data.replacement_string !== undefined ? String(data.replacement_string) : '';
                    const isGlobal = Boolean(data.global);
                    const onlyLinked = Boolean(data.only_linked);

                    const result = manager.stageReplaceText(
                        identifier || null,
                        data.target_string,
                        replacement,
                        isGlobal,
                        onlyLinked,
                    );
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'replace_text',
                                message: result.summary,
                                modified_count: result.modified_count,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'append_content': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "append_content" yêu cầu truyền tham số `identifier` của block.',
                        };
                    }
                    if (data.append_text === undefined) {
                        return { isError: true, content: 'Action "append_content" yêu cầu truyền `data.append_text`.' };
                    }
                    const result = manager.stageAppendContent(identifier, String(data.append_text));
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'append_content',
                                identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'edit_meta': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "edit_meta" yêu cầu truyền tham số `identifier` của block.',
                        };
                    }
                    const result = manager.stageUpdateMeta(identifier, data);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'edit_meta',
                                identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'toggle': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "toggle" yêu cầu truyền tham số `identifier` của block.',
                        };
                    }
                    const result = manager.stageToggle(identifier, data.enabled);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'toggle',
                                identifier,
                                enabled: result.enabled,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'set_linked': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "set_linked" yêu cầu truyền tham số `identifier` của block.',
                        };
                    }
                    if (typeof data.linked !== 'boolean') {
                        return {
                            isError: true,
                            content: 'Action "set_linked" yêu cầu truyền `data.linked` (true hoặc false).',
                        };
                    }
                    const result = manager.stageSetLinked(identifier, data.linked, data.position);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'set_linked',
                                identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'reorder': {
                    if (!Array.isArray(data.order)) {
                        return {
                            isError: true,
                            content: 'Action "reorder" yêu cầu truyền mảng `data.order` chứa danh sách ID.',
                        };
                    }
                    const result = manager.stageReorder(data.order);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'reorder',
                                new_order: data.order,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'duplicate': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "duplicate" yêu cầu truyền tham số `identifier` của block gốc.',
                        };
                    }
                    const result = manager.stageDuplicate(identifier, data.newName);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'duplicate',
                                created_id: result.identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'delete': {
                    if (!identifier) {
                        return {
                            isError: true,
                            content: 'Action "delete" yêu cầu truyền tham số `identifier` của block cần xóa.',
                        };
                    }
                    const result = manager.stageDelete(identifier);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'delete',
                                identifier,
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'batch_update': {
                    const updatesList = Array.isArray(data.updates) ? data.updates : Array.isArray(data) ? data : null;
                    if (!updatesList) {
                        return {
                            isError: true,
                            content: 'Action "batch_update" yêu cầu truyền mảng `data.updates` hoặc `data` dạng mảng.',
                        };
                    }
                    const result = manager.stageBatchUpdate(updatesList);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: result.ok,
                                action: 'batch_update',
                                message: result.summary,
                                results: result.results,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'update_var': {
                    const result = manager.stageUpdateVar({
                        varName: data.varName,
                        newValue: data.newValue,
                        promptId: data.promptId || identifier,
                        oldValueMatch: data.oldValueMatch,
                    });
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'update_var',
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'rename_var': {
                    const result = manager.stageRenameVar(data.oldName, data.newName);
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'rename_var',
                                message: result.summary,
                                staging_status: diff.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'validate_syntax': {
                    const syntax = manager.validatePresetSyntax();
                    return {
                        content: JSON.stringify(
                            {
                                ok: syntax.ok,
                                action: 'validate_syntax',
                                status: syntax.status,
                                total_blocks_checked: syntax.totalBlocksChecked,
                                error_count: syntax.errorCount,
                                warning_count: syntax.warningCount,
                                errors: syntax.errors,
                                warnings: syntax.warnings,
                            },
                            null,
                            2,
                        ),
                    };
                }

                // ─── 2. NHÓM QUẢN TRỊ GIT VERSION CONTROL ────────────────────────────────

                case 'diff': {
                    const diff = manager.calculateDiff();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'diff',
                                is_dirty: diff.isDirty,
                                summary: diff.summary,
                                stats: {
                                    added: diff.added,
                                    modified: diff.modified,
                                    deleted: diff.deleted,
                                    total_changes: diff.totalChanges,
                                },
                                changes: diff.items,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'commit': {
                    if (!data.message || typeof data.message !== 'string' || !data.message.trim()) {
                        return {
                            isError: true,
                            content:
                                'Action "commit" bắt buộc phải có `data.message` mô tả mục đích thay đổi (vd: "feat: bổ sung hướng dẫn CoT").',
                        };
                    }
                    const result = await manager.commit(data.message.trim(), 'agent', data.tag);
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'commit',
                                commit_hash: result.hash,
                                message: result.summary,
                                note: 'Thay đổi đã được mở hộp và lưu đồng bộ thành công vào SillyTavern.',
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'log': {
                    const limit = typeof data.limit === 'number' ? data.limit : 15;
                    const commits = await manager.getLog(limit);
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'log',
                                preset_name: manager.getActivePresetName(),
                                total_commits: commits.length,
                                history: commits.map((c) => ({
                                    hash: c.hash,
                                    parent: c.parentHash,
                                    message: c.message,
                                    author: c.author,
                                    tag: c.tag || undefined,
                                    timestamp: new Date(c.timestamp).toLocaleString(),
                                    stats: c.stats,
                                    summary: c.diffSummary,
                                })),
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'checkout':
                case 'rollback': {
                    const target = data.target || data.commitId || data.tag || identifier;
                    if (!target) {
                        return {
                            isError: true,
                            content: `Action "${action}" yêu cầu cung cấp mã commit hash hoặc tên tag trong \`data.target\`.`,
                        };
                    }
                    const isHard = action === 'rollback' && Boolean(data.hard || data.prune_newer);
                    const result = await manager.rollback(target, isHard);
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action,
                                restored_commit: result.hash,
                                hard: isHard,
                                pruned_count: result.pruned_count || 0,
                                message: result.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'discard': {
                    const result = manager.discard();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'discard',
                                message: result.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'tag': {
                    const tagName = data.tag || data.tagName;
                    if (!tagName) {
                        return {
                            isError: true,
                            content: 'Action "tag" yêu cầu cung cấp tên nhãn trong `data.tag` (vd: "v1.0-stable").',
                        };
                    }
                    const targetCommit = data.target || identifier || 'HEAD';
                    const result = await manager.tagCommit(targetCommit, tagName);
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'tag',
                                tag_name: tagName,
                                message: result.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'prune_commits': {
                    const keepCount = typeof data.keep_count === 'number' ? data.keep_count : 30;
                    const result = await manager.pruneCommits(keepCount);
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'prune_commits',
                                keep_count: keepCount,
                                pruned_count: result.pruned_count,
                                message: result.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                case 'clear_history': {
                    const result = await manager.clearHistory();
                    return {
                        content: JSON.stringify(
                            {
                                ok: true,
                                action: 'clear_history',
                                message: result.summary,
                            },
                            null,
                            2,
                        ),
                    };
                }

                default:
                    return {
                        isError: true,
                        content: `Hành động action="${action}" không được hỗ trợ. Vui lòng kiểm tra lại schema của manage_preset_prompt.`,
                    };
            }
        } catch (e: any) {
            console.error('[managePresetPromptTool] Error:', e);
            return {
                isError: true,
                content: `Lỗi khi thực thi lệnh manage_preset_prompt: ${e.message}`,
            };
        }
    },
};
