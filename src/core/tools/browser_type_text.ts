import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_type_text: ITool = {
    schema: {
        name: 'browser_type_text',
        description: 'Gõ văn bản vào một ô input trên trang web bằng ID của nó. (ID lấy từ lệnh browser_read_page).',
        parameters: {
            type: 'object',
            properties: {
                elementId: { type: 'number', description: 'ID của ô input.' },
                text: { type: 'string', description: 'Văn bản cần gõ.' }
            },
            required: ['elementId', 'text']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        if (!args.elementId) return { content: 'Lỗi: Thiếu elementId.', isError: true };
        if (args.text === undefined) return { content: 'Lỗi: Thiếu text.', isError: true };
        try {
            const data = await BrowserWindowUI.executeAgentCommand('TYPE', { elementId: args.elementId, text: args.text });
            return { content: `Thành công: ${data.message}` };
        } catch (error: any) {
            return { content: `Lỗi khi gõ văn bản: ${error.message}`, isError: true };
        }
    }
};
