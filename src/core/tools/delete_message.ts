import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const deleteLastMessageTool: ITool = {
    schema: {
        name: 'delete_last_message',
        description: 'Xóa tin nhắn cuối cùng trong đoạn chat hiện tại. Rất hữu ích khi tin nhắn cuối cùng bị lỗi hoặc người dùng yêu cầu xóa.',
        parameters: {
            type: 'object',
            properties: {} // Không yêu cầu tham số
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        context.adapter.deleteLastMessage();
        
        return {
            content: 'Last message deleted successfully.'
        };
    }
};
