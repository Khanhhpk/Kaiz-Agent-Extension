import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_navigate: ITool = {
    schema: {
        name: 'browser_navigate',
        description: 'Đi tới một URL cụ thể trên Kaiz Browser. Dành riêng cho trình duyệt web tích hợp bên trong SillyTavern.',
        parameters: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Địa chỉ URL cần đi tới (VD: https://youtube.com)' }
            },
            required: ['url']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        if (!args.url) return { content: 'Lỗi: Thiếu url.', isError: true };
        try {
            const data = await BrowserWindowUI.executeAgentCommand('NAVIGATE', { url: args.url });
            return { content: `Thành công: ${data.message}. Gợi ý: Gọi browser_read_page để đọc nội dung trang web mới tải.` };
        } catch (error: any) {
            return { content: `Lỗi: ${error.message}`, isError: true };
        }
    }
};
