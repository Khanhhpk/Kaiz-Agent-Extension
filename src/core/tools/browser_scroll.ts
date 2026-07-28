import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_scroll: ITool = {
    schema: {
        name: 'browser_scroll',
        description: 'Cuộn trang web lên hoặc xuống để xem thêm nội dung. Dành riêng cho Kaiz Browser tích hợp bên trong SillyTavern.',
        parameters: {
            type: 'object',
            properties: {
                direction: { type: 'string', description: 'Hướng cuộn: "up" hoặc "down".' }
            },
            required: ['direction']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        if (args.direction !== 'up' && args.direction !== 'down') return { content: 'Lỗi: direction phải là "up" hoặc "down".', isError: true };
        try {
            const data = await BrowserWindowUI.executeAgentCommand('SCROLL', { direction: args.direction });
            return { content: `Thành công: ${data.message}. Gợi ý: Hãy gọi browser_read_page để xem nội dung mới.` };
        } catch (error: any) {
            return { content: `Lỗi khi cuộn trang: ${error.message}`, isError: true };
        }
    }
};
