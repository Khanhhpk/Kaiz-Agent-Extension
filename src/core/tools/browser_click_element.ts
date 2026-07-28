import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_click_element: ITool = {
    schema: {
        name: 'browser_click_element',
        description: 'Click vào một phần tử trên trang web bằng ID của nó. Dành riêng cho Kaiz Browser tích hợp bên trong SillyTavern. (ID lấy từ lệnh browser_read_page).',
        parameters: {
            type: 'object',
            properties: {
                elementId: { type: 'number', description: 'ID của phần tử cần click.' }
            },
            required: ['elementId']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        if (!args.elementId) return { content: 'Lỗi: Thiếu elementId.', isError: true };
        try {
            const data = await BrowserWindowUI.executeAgentCommand('CLICK', { elementId: args.elementId });
            return { content: `Thành công: ${data.message}` };
        } catch (error: any) {
            return { content: `Lỗi khi click: ${error.message}`, isError: true };
        }
    }
};
