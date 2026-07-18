import { getCharInfoTool } from './get_char_info';
import { sendSystemMessageTool } from './send_system_message';
import { deleteLastMessageTool } from './delete_message';
import { getChatHistoryTool } from './get_chat_history';
import { ToolRegistry } from '../tool_registry';

/**
 * Đăng ký tất cả các tools mặc định vào Registry
 */
export function registerDefaultTools(registry: ToolRegistry) {
    registry.registerTool(getCharInfoTool);
    registry.registerTool(sendSystemMessageTool);
    registry.registerTool(deleteLastMessageTool);
    registry.registerTool(getChatHistoryTool);
}
