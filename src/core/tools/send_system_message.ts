import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const sendSystemMessageTool: ITool = {
    schema: {
        name: 'send_system_message',
        description: 'Gửi một tin nhắn hệ thống vô danh, không thêm vào lịch sử nhân vật.',
        parameters: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Nội dung tin nhắn.' }
            },
            required: ['message']
        }
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('sendSystemMessage')) {
            throw new Error('ST API sendSystemMessage is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        const message = args.message;
        if (!message) {
            return {
                content: 'Error: message is required.',
                isError: true
            };
        }

        context.adapter.sendSystemMessage(`[Kaiz Agent]: ${message}`);
        
        return {
            content: 'System message sent successfully.'
        };
    }
};
