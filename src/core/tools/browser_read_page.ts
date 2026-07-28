import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_read_page: ITool = {
    schema: {
        name: 'browser_read_page',
        description: 'Đọc nội dung và quét các phần tử tương tác (như nút bấm, liên kết) trên trang web hiện tại đang mở trong Kaiz Browser. Dành riêng cho Kaiz Browser tích hợp bên trong SillyTavern, KHÔNG dùng cho trình duyệt ngoài.',
        parameters: {
            type: 'object',
            properties: {}
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        try {
            const data = await BrowserWindowUI.executeAgentCommand('READ_PAGE');
            
            let result = `=== KAIZ BROWSER STATE ===\n`;
            result += `URL: ${data.url}\n`;
            result += `Title: ${data.title}\n\n`;
            
            result += `--- PHẦN TỬ CÓ THỂ TƯƠNG TÁC (Dùng ID để click/type) ---\n`;
            if (data.interactables && data.interactables.length > 0) {
                result += data.interactables.join('\n') + '\n';
            } else {
                result += `(Không tìm thấy phần tử tương tác nào trên màn hình hiện tại)\n`;
            }
            
            result += `\n--- NỘI DUNG VĂN BẢN CHÍNH ---\n`;
            result += data.mainText;
            
            return { content: result };
        } catch (error: any) {
            return { content: `Lỗi khi đọc trang: ${error.message}`, isError: true };
        }
    }
};
