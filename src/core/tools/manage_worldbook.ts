import { ITool, ToolResult } from "../tool_registry";
import { SillyTavernAdapter } from "../../adapters/st_adapter";

export const manageWorldbookTool: ITool = {
    schema: {
        name: "manage_worldbook",
        description: "Quản lý các cuốn Sổ tay thế giới (Worldbook/Lorebook) ở mức toàn cục. Cho phép lấy danh sách toàn bộ worldbook đang có trong hệ thống, bật/tắt (kích hoạt) worldbook, và tạo mới một worldbook trống.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["list_all", "toggle", "create"],
                    description: "Hành động: list_all (Liệt kê tất cả book hiện có và trạng thái), toggle (Bật/tắt book), create (Tạo book mới)."
                },
                book_name: {
                    type: "string",
                    description: "Tên của cuốn Worldbook. BẮT BUỘC nếu action là 'toggle' hoặc 'create'."
                },
                state: {
                    type: "string",
                    enum: ["enable", "disable"],
                    description: "Trạng thái muốn thiết lập (Bật hoặc Tắt). BẮT BUỘC nếu action là 'toggle'."
                }
            },
            required: ["action"]
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        if (!args.action || !['list_all', 'toggle', 'create'].includes(args.action)) {
            return { content: "[LỖI] Tham số 'action' không hợp lệ. Chỉ chấp nhận: 'list_all', 'toggle', 'create'.", isError: true };
        }

        if ((args.action === 'toggle' || args.action === 'create') && !args.book_name) {
            return { content: "[LỖI] Thiếu tham số 'book_name'. Bạn bắt buộc phải cung cấp tên Worldbook cho hành động này.", isError: true };
        }

        if (args.action === 'toggle' && !args.state) {
            return { content: "[LỖI] Thiếu tham số 'state'. Phải truyền 'enable' hoặc 'disable'.", isError: true };
        }

        try {
            const result = await context.adapter.manageWorldbook(args as any);
            return { content: result };
        } catch (e: any) {
            return {
                content: `[LỖI] Khi thực thi manageWorldbookTool: ${e.message}`,
                isError: true
            };
        }
    }
};
