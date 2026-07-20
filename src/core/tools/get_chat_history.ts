import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getChatHistoryTool: ITool = {
    schema: {
        name: 'get_chat_history',
        description: 'Lấy lịch sử đoạn chat gần nhất giữa người dùng và nhân vật. Rất cần thiết khi bạn cần phân tích bối cảnh trước khi ra quyết định hoặc phản hồi.',
        parameters: {
            type: 'object',
            properties: {
                depth: {
                    type: 'number',
                    description: 'Số lượng tin nhắn gần nhất cần lấy (Mặc định: 10)'
                }
            }
        }
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
                isError: true
            };
        }

        const depth = args.depth || 10;
        const history = context.adapter.getChatContext(depth);
        
        return {
            content: JSON.stringify(history, null, 2)
        };
    }
};
