import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const getLorebookInfoTool: ITool = {
    schema: {
        name: 'get_lorebook_info',
        description: 'Lấy thông tin từ Sổ tay thế giới (Lorebook / World Info) đang được kích hoạt trong phòng chat. Sổ tay thế giới chứa các quy tắc ngầm, bối cảnh, thuật ngữ và thiết lập của vũ trụ hiện tại. Dùng khi bạn cần hiểu rõ thế giới quan xung quanh.',
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
            const lorebookText = await context.adapter.getLorebookInfo();
            return { content: lorebookText || 'Không có Lorebook nào đang được kích hoạt hoặc Lorebook trống.' };
        } catch (error: any) {
            return {
                content: `Error getting Lorebook info: ${error.message || String(error)}`,
                isError: true
            };
        }
    }
};
