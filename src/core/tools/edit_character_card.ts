import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const editCharacterCardTool: ITool = {
    schema: {
        name: 'edit_character_card',
        description: 'Chỉnh sửa thông tin của thẻ nhân vật hiện tại (description, personality, scenario, first_mes, mes_example, system_prompt, v.v.). Cập nhật trực tiếp vào thẻ nhân vật.',
        parameters: {
            type: 'object',
            properties: {
                field: {
                    type: 'string',
                    enum: ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt', 'post_history_instructions', 'tags', 'alternate_greetings', 'creator_notes', 'character_version', 'character_book', 'creator', 'talkativeness', 'fav'],
                    description: 'Trường thông tin cần chỉnh sửa. Ví dụ: "description", "personality", "character_book" (để gắn Lorebook), "talkativeness", "fav".',
                },
                value: {
                    type: 'string',
                    description: 'Giá trị mới cần cập nhật cho trường này. Có thể truyền chuỗi, mảng, số (như talkativeness), hoặc boolean (như fav).',
                },
            },
            required: ['field', 'value'],
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
        if (!args.field || args.value === undefined) {
            return { content: 'Error: field and value are required.', isError: true };
        }
        try {
            await context.adapter.editCharacterAttribute(args.field, args.value);
            return { content: `Successfully updated field "${args.field}" for the current character.` };
        } catch (e: any) {
            return { content: `Error updating character field: ${e.message}`, isError: true };
        }
    },
};
