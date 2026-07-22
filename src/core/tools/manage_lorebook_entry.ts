import { ITool, ToolResult } from "../tool_registry";
import { SillyTavernAdapter } from "../../adapters/st_adapter";

export const manageLorebookEntryTool: ITool = {
    schema: {
        name: "manage_lorebook_entry",
        description: "Quản lý cấp độ CHI TIẾT (Tạo mới, Sửa, hoặc Xóa) các mục lục nhỏ (Entry) nằm bên trong một cuốn Sổ tay thế giới (Lorebook) đã có. Bạn có thể cập nhật nội dung (content), từ khóa kích hoạt (keys), hoặc dùng tham số 'disable' để Bật/Tắt riêng lẻ một entry mà không cần tắt cả cuốn sách.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["create", "edit", "delete"],
                    description: "Hành động muốn thực hiện: create (Tạo mới), edit (Chỉnh sửa), delete (Xoá)."
                },
                book_name: {
                    type: "string",
                    description: "Tên của cuốn Lorebook chứa entry cần thao tác."
                },
                uid: {
                    type: "string",
                    description: "UID của Entry cần chỉnh sửa hoặc xoá. BẮT BUỘC nếu action là 'edit' hoặc 'delete'."
                },
                keys: {
                    type: "array",
                    items: { type: "string" },
                    description: "(Tuỳ chọn) Danh sách các từ khóa kích hoạt entry này. Ví dụ: [\"apple\", \"banana\"]. (Dùng cho create/edit)"
                },
                content: {
                    type: "string",
                    description: "(Tuỳ chọn) Nội dung chính của entry. (Dùng cho create/edit)"
                },
                constant: {
                    type: "boolean",
                    description: "(Tuỳ chọn) Đặt thành true nếu muốn entry luôn luôn được kích hoạt bất chấp từ khóa. (Dùng cho create/edit)"
                },
                disable: {
                    type: "boolean",
                    description: "(Tuỳ chọn) Đặt thành true nếu muốn vô hiệu hoá entry. (Dùng cho create/edit)"
                },
                comment: {
                    type: "string",
                    description: "(Tuỳ chọn) Tên hoặc ghi chú nhỏ cho entry để dễ nhận biết. (Dùng cho create/edit)"
                }
            },
            required: ["action", "book_name"]
        }
    },
    validate: async () => {
        try {
            const ST_WorldInfo = await new Function('return import("/scripts/world-info.js")')();
            if (!ST_WorldInfo) throw new Error('Module loaded but empty');
        } catch (e: any) {
            throw new Error('Failed to load /scripts/world-info.js - ' + e.message);
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        if (!args.action || !['create', 'edit', 'delete'].includes(args.action)) {
            return { content: "[LỖI] Tham số 'action' không hợp lệ. Chỉ chấp nhận: 'create', 'edit', 'delete'.", isError: true };
        }
        if (!args.book_name) {
            return { content: "[LỖI] Thiếu tham số 'book_name'. Bạn bắt buộc phải cung cấp tên cuốn Lorebook.", isError: true };
        }
        if ((args.action === 'edit' || args.action === 'delete') && (args.uid === undefined || args.uid === null)) {
            return { content: "[LỖI] Thiếu tham số 'uid'. Bạn bắt buộc phải cung cấp UID của entry nếu muốn edit hoặc delete.", isError: true };
        }

        try {
            const result = await context.adapter.manageLorebookEntry(args as any);
            return { content: result };
        } catch (e: any) {
            return {
                content: `[LỖI] Khi thực thi manageLorebookEntry: ${e.message}`,
                isError: true
            };
        }
    }
};
