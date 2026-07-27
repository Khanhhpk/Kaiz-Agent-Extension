import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const listCharactersTool: ITool = {
    schema: {
        name: 'list_characters',
        description:
            'Lấy danh sách các thẻ nhân vật hiện có trong kho của SillyTavern. Trả về tên, avatar, creator, và mô tả ngắn.',
        parameters: {
            type: 'object',
            properties: {
                search_query: {
                    type: 'string',
                    description: 'Từ khóa tìm kiếm (tuỳ chọn) để lọc danh sách theo tên nhân vật.',
                },
            },
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('characters')) {
            throw new Error('ST Context characters object is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) return { content: 'Error: Adapter not provided.', isError: true };
        try {
            const list = await context.adapter.listCharacters(args.search_query);
            if (!list || list.length === 0) {
                return { content: 'Không tìm thấy thẻ nhân vật nào khớp.' };
            }
            return { content: JSON.stringify(list, null, 2) };
        } catch (e: any) {
            return { content: `Error listing characters: ${e.message}`, isError: true };
        }
    },
};
