import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getChatHistoryTool: ITool = {
    schema: {
        name: 'get_chat_history',
        description:
            'Lấy lịch sử đoạn chat gần nhất giữa người dùng và nhân vật. TRICKS: Bạn có thể gọi công cụ này với depth = 0 để kiểm tra tổng số lượng tin nhắn (total_messages) hiện có trong chat mà không cần lấy nội dung chi tiết. Giúp bạn nắm được độ dài chat một cách tiết kiệm nhất.',
        parameters: {
            type: 'object',
            properties: {
                depth: {
                    type: 'number',
                    description:
                        'Số lượng tin nhắn gần nhất cần lấy (Mặc định: 10). Nếu truyền 0, chỉ trả về số lượng tin nhắn tổng cộng.',
                },
            },
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('chat')) {
            throw new Error('ST Context chat array is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true,
            };
        }

        const depth = typeof args.depth === 'number' ? args.depth : 10;

        // Luôn đính kèm tổng số tin nhắn
        const totalMessages = context.adapter.getChatLength();

        // Nếu depth > 0 thì mới lấy dữ liệu chi tiết
        const history = depth > 0 ? context.adapter.getChatContext(depth) : [];

        return {
            content: JSON.stringify(
                {
                    total_messages: totalMessages,
                    history: history,
                },
                null,
                2,
            ),
        };
    },
};
