import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const switchCharacterChatTool: ITool = {
    schema: {
        name: 'switch_character_chat',
        description: 'Chuyển sang màn hình chat của một nhân vật khác. Cần cung cấp chính xác tên nhân vật (lấy từ kết quả list_characters).',
        parameters: {
            type: 'object',
            properties: {
                character_name: { type: 'string', description: 'Tên nhân vật muốn chuyển chat tới (bắt buộc).' }
            },
            required: ['character_name']
        }
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('characters')) {
            throw new Error('ST Context characters object is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) return { content: 'Error: Adapter not provided.', isError: true };
        if (!args.character_name) return { content: 'Error: character_name is required.', isError: true };
        try {
            const result = await context.adapter.switchCharacterChat(args.character_name);
            return { content: result };
        } catch (e: any) {
            return { content: `Error switching character: ${e.message}`, isError: true };
        }
    }
};
