import { getCharInfoTool } from './get_char_info';
import { sendSystemMessageTool } from './send_system_message';
import { manageWorldbookTool } from './manage_worldbook';
import { deleteLastMessageTool } from './delete_message';
import { getChatHistoryTool } from './get_chat_history';
import { getUserPersonaTool } from './get_user_persona';
import { getLorebookInfoTool } from './get_lorebook_info';
import { manageLorebookEntryTool } from './manage_lorebook_entry';
import { ToolRegistry } from '../tool_registry';

/**
 * Đăng ký tất cả các tools mặc định vào Registry
 */
export function registerDefaultTools(registry: ToolRegistry) {
    registry.registerTool(getCharInfoTool);
    registry.registerTool(sendSystemMessageTool);
    registry.registerTool(deleteLastMessageTool);
    registry.registerTool(getChatHistoryTool);
    registry.registerTool(getUserPersonaTool);
    registry.registerTool(getLorebookInfoTool);
    registry.registerTool(manageLorebookEntryTool);
    registry.registerTool(manageWorldbookTool);
}
