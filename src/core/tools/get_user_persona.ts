import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getUserPersonaTool: ITool = {
    schema: {
        name: 'get_user_persona',
        description: 'Lấy thông tin hồ sơ (Persona) của người dùng hiện tại, bao gồm Tên và Mô tả tính cách/ngoại hình. Dùng khi cần biết bạn đang giao tiếp với ai để xưng hô và cư xử cho đúng mực.',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        if (!context || !context.adapter) {
            return {
                content: 'Error: Adapter not provided in context.',
                isError: true
            };
        }

        try {
            const personaText = await context.adapter.getUserPersona();
            return { content: personaText };
        } catch (error: any) {
            return {
                content: `Error getting User Persona: ${error.message || String(error)}`,
                isError: true
            };
        }
    }
};
