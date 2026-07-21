import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const quickChatPreviewTool: ITool = {
    schema: {
        name: 'quick_chat_preview',
        description: 'Mở bảng modal Quick Chat Preview trên giao diện người dùng. Bảng này liệt kê toàn bộ tin nhắn hiện tại ở dạng thu gọn để người dùng có thể xem nhanh tổng thể độ dài chat và vị trí các tin nhắn. LƯU Ý: Tool này KHÔNG trả về dữ liệu chat cho bạn, nó chỉ dùng để trigger giao diện cho người dùng xem.',
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
            // Gọi hàm mở Modal (đã định nghĩa trong Adapter)
            context.adapter.showChatPreviewModal();
            return {
                content: 'Quick Chat Preview modal đã được mở thành công trên màn hình người dùng.'
            };
        } catch (e: any) {
            return {
                content: `Error showing quick chat preview: ${e.message}`,
                isError: true
            };
        }
    }
};
