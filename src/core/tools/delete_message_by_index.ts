import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const deleteMessageByIndexTool: ITool = {
    schema: {
        name: 'delete_message_by_index',
        description: 'Xóa một tin nhắn cụ thể trong đoạn chat dựa trên chatIndex. Dùng khi bạn cần xóa chính xác một tin nhắn (không phải tin cuối cùng) mà người dùng chỉ định.',
        parameters: {
            type: 'object',
            properties: {
                index: {
                    type: 'number',
                    description: 'Chỉ số (chatIndex) của tin nhắn cần xóa. Bạn có thể tìm thấy index này bằng công cụ get_chat_history.'
                }
            },
            required: ['index']
        }
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('deleteMessage')) {
            throw new Error('ST API deleteMessage is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        const index = args.index;
        if (typeof index !== 'number') {
            return {
                content: 'Error: index must be a number.',
                isError: true
            };
        }

        try {
            context.adapter.deleteMessageByIndex(index);
            return {
                content: `Message at index ${index} deleted successfully.`
            };
        } catch (e: any) {
             return {
                 content: `Error deleting message: ${e.message}`,
                 isError: true
             }
        }
    }
};
