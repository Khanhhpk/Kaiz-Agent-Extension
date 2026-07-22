import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getCharInfoTool: ITool = {
    schema: {
        name: 'get_char_info',
        description:
            'Lấy thông tin chi tiết về thẻ nhân vật hiện tại đang chat (tên, tính cách, bối cảnh, v.v.). Dùng khi cần hiểu rõ về nhân vật bạn đang đóng vai hoặc nói chuyện cùng.',
        parameters: {
            type: 'object',
            properties: {}, // Không yêu cầu tham số
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('characters')) {
            throw new Error('ST Context characters object is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true,
            };
        }

        const charInfo = context.adapter.getCharInfo();

        if (!charInfo) {
            return {
                content:
                    'Error: No active character found. Are you in a group chat without a selected character, or not in a chat at all?',
                isError: true,
            };
        }

        // Trả về dữ liệu nhân vật dưới dạng JSON string (LLM sẽ parse được)
        return {
            content: JSON.stringify(charInfo, null, 2),
        };
    },
};
