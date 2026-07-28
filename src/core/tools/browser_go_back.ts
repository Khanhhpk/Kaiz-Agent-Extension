import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_go_back: ITool = {
    schema: {
        name: 'browser_go_back',
        description: 'Nhấn nút Quay lại (Back) trên Kaiz Browser để trở về trang web trước đó. Dành riêng cho trình duyệt tích hợp.',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        try {
            const data = await BrowserWindowUI.executeAgentCommand('GO_BACK');
            return { content: `Thành công: ${data.message}. Gợi ý: Gọi browser_read_page để đọc nội dung.` };
        } catch (error: any) {
            return { content: `Lỗi: ${error.message}`, isError: true };
        }
    }
};
