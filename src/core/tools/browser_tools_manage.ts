import { ITool, ToolResult } from '../tool_registry';
import { BrowserWindowUI } from '../../ui/browser_window';

export const browser_tools_manage: ITool = {
    schema: {
        name: 'browser_tools_manage',
        description: 'Quản lý và điều khiển Kaiz Browser (Trình duyệt web tích hợp trong SillyTavern). Gộp chung các chức năng duyệt web. KHÔNG dùng cho trình duyệt bên ngoài.',
        parameters: {
            type: 'object',
            properties: {
                action: { 
                    type: 'string', 
                    enum: ['read', 'click', 'type', 'scroll', 'navigate', 'go_back', 'press_key'],
                    description: 'Hành động cần thực hiện trên trình duyệt.' 
                },
                url: { type: 'string', description: '(Dành cho navigate) Địa chỉ URL cần truy cập.' },
                elementId: { type: 'number', description: '(Dành cho click, type, press_key) ID của phần tử lấy từ lệnh read.' },
                text: { type: 'string', description: '(Dành cho type) Nội dung văn bản cần gõ.' },
                direction: { type: 'string', enum: ['up', 'down'], description: '(Dành cho scroll) Hướng cuộn trang (mặc định down).' },
                key: { type: 'string', description: '(Dành cho press_key) Phím cần bấm, mặc định là Enter.' }
            },
            required: ['action']
        }
    },
    execute: async (args: Record<string, any>, context: any): Promise<ToolResult> => {
        const action = args.action;
        try {
            switch (action) {
                case 'read': {
                    const data = await BrowserWindowUI.executeAgentCommand('READ_PAGE');
                    let content = `--- URL: ${data.url} ---\n--- TITLE: ${data.title} ---\n\n`;
                    content += `[CÁC PHẦN TỬ CÓ THỂ TƯƠNG TÁC (ID)]\n`;
                    if (data.interactables && data.interactables.length > 0) {
                        content += data.interactables.join('\n');
                    } else {
                        content += '(Không tìm thấy phần tử tương tác nào trên màn hình hiện tại)';
                    }
                    content += `\n\n[NỘI DUNG VĂN BẢN TRÊN TRANG]\n${data.mainText}`;
                    return { content: content };
                }
                case 'click': {
                    if (!args.elementId) return { content: 'Lỗi: Thiếu elementId.', isError: true };
                    const data = await BrowserWindowUI.executeAgentCommand('CLICK', { elementId: args.elementId });
                    return { content: `Thành công: ${data.message}. Gợi ý: Nếu trang tải nội dung mới, hãy dùng hành động 'read' để cập nhật.` };
                }
                case 'type': {
                    if (!args.elementId || args.text === undefined) return { content: 'Lỗi: Thiếu elementId hoặc text.', isError: true };
                    const data = await BrowserWindowUI.executeAgentCommand('TYPE', { elementId: args.elementId, text: args.text });
                    return { content: `Thành công: ${data.message}.` };
                }
                case 'scroll': {
                    const dir = args.direction || 'down';
                    const data = await BrowserWindowUI.executeAgentCommand('SCROLL', { direction: dir });
                    return { content: `Thành công: ${data.message}. Gợi ý: Dùng hành động 'read' để đọc phần nội dung mới xuất hiện.` };
                }
                case 'navigate': {
                    if (!args.url) return { content: 'Lỗi: Thiếu url.', isError: true };
                    const data = await BrowserWindowUI.executeAgentCommand('NAVIGATE', { url: args.url });
                    return { content: `Thành công: ${data.message}. Gợi ý: Dùng hành động 'read' để đọc trang web mới.` };
                }
                case 'go_back': {
                    const data = await BrowserWindowUI.executeAgentCommand('GO_BACK');
                    return { content: `Thành công: ${data.message}. Gợi ý: Dùng hành động 'read' để đọc trang web trước đó.` };
                }
                case 'press_key': {
                    if (!args.elementId) return { content: 'Lỗi: Thiếu elementId.', isError: true };
                    const key = args.key || 'Enter';
                    const data = await BrowserWindowUI.executeAgentCommand('PRESS_KEY', { elementId: args.elementId, key: key });
                    return { content: `Thành công: ${data.message}.` };
                }
                default:
                    return { content: `Lỗi: Hành động '${action}' không hợp lệ.`, isError: true };
            }
        } catch (error: any) {
            return { content: `Lỗi: ${error.message}`, isError: true };
        }
    }
};
