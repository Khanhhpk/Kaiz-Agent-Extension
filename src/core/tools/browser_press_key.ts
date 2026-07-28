import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_press_key: ITool = {
    schema: {
        name: 'browser_press_key',
        description: 'Bấm một phím (VD: Enter) trên một phần tử đang chọn. Dùng để submit form tìm kiếm sau khi đã gọi browser_type_text. Dành riêng cho Kaiz Browser.',
        parameters: {
            type: 'object',
            properties: {
                elementId: { type: 'number', description: 'ID của ô input/phần tử đang thao tác.' },
                key: { type: 'string', description: 'Tên phím cần bấm (Mặc định: Enter)' }
            },
            required: ['elementId']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        if (!args.elementId) return { content: 'Lỗi: Thiếu elementId.', isError: true };
        const key = args.key || 'Enter';
        try {
            const data = await BrowserWindowUI.executeAgentCommand('PRESS_KEY', { elementId: args.elementId, key: key });
            return { content: `Thành công: ${data.message}. Nếu phím Enter chuyển trang, hãy gọi browser_read_page để đọc trang mới.` };
        } catch (error: any) {
            return { content: `Lỗi khi bấm phím: ${error.message}`, isError: true };
        }
    }
};
