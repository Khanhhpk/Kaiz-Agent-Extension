import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const deleteMessageByIndexTool: ITool = {
    schema: {
        name: 'delete_message_by_index',
        description:
            'Xóa một hoặc nhiều tin nhắn cụ thể dựa trên chatIndex. LƯU Ý QUAN TRỌNG: TRƯỚC KHI GỌI CÔNG CỤ NÀY, BẠN PHẢI sử dụng công cụ get_chat_history để tìm xem nội dung tin nhắn nằm ở chatIndex số mấy. Tuyệt đối KHÔNG tự phỏng đoán chatIndex.',
        parameters: {
            type: 'object',
            properties: {
                indices: {
                    type: 'array',
                    items: { type: 'number' },
                    description: 'Mảng các chỉ số (chatIndex) của những tin nhắn cần xóa. Ví dụ: [12, 14].',
                },
            },
            required: ['indices'],
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('deleteMessagesByIndices')) {
            throw new Error('ST API deleteMessagesByIndices is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return { content: 'Error: Adapter not provided in context.', isError: true };
        }

        const indices = args.indices;
        if (!Array.isArray(indices) || !indices.every((i) => typeof i === 'number' && Number.isInteger(i))) {
            return {
                content: 'Error: indices must be an array of integers.',
                isError: true,
            };
        }

        try {
            // Sửa tên phương thức được gọi sang phương thức mới hỗ trợ mảng
            context.adapter.deleteMessagesByIndices(indices);
            return {
                content: `Messages at indices [${indices.join(', ')}] deleted successfully.`,
            };
        } catch (e: any) {
            return {
                content: `Error deleting messages: ${e.message}`,
                isError: true,
            };
        }
    },
};
