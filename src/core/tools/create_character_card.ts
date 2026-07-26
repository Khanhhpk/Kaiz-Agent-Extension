import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const createCharacterCardTool: ITool = {
    schema: {
        name: 'create_character_card',
        description: 'Tạo một thẻ nhân vật mới hoàn toàn. Cần truyền vào tên và các thông tin cơ bản.',
        parameters: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Tên nhân vật (bắt buộc).' },
                description: { type: 'string', description: 'Mô tả ngoại hình, bối cảnh, thông tin chung.' },
                personality: { type: 'string', description: 'Tính cách nhân vật.' },
                scenario: { type: 'string', description: 'Bối cảnh câu chuyện.' },
                first_mes: { type: 'string', description: 'Lời chào/Tin nhắn đầu tiên.' },
                mes_example: { type: 'string', description: 'Đoạn hội thoại mẫu.' },
                system_prompt: { type: 'string', description: 'System prompt riêng cho nhân vật.' },
                tags: { type: 'string', description: 'Danh sách thẻ tag, cách nhau bằng dấu phẩy.' }
            },
            required: ['name'],
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('characters')) {
            throw new Error('ST Context characters object is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return { content: 'Error: Adapter not provided in context.', isError: true };
        }
        if (!args.name) {
            return { content: 'Error: name is required.', isError: true };
        }
        try {
            const avatar = await context.adapter.createCharacterCard(args);
            return { content: `Successfully created new character "${args.name}". Avatar filename: ${avatar}` };
        } catch (e: any) {
            return { content: `Error creating character: ${e.message}`, isError: true };
        }
    },
};
