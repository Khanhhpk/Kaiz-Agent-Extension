import { getCharInfoTool } from './get_char_info';
import { sendSystemMessageTool } from './send_system_message';
import { manageWorldbookTool } from './manage_worldbook';
import { deleteLastMessageTool } from './delete_message';
import { deleteMessageByIndexTool } from './delete_message_by_index';
import { getChatHistoryTool } from './get_chat_history';
import { getUserPersonaTool } from './get_user_persona';
import { editUserPersonaTool } from './edit_user_persona';
import { getLorebookInfoTool } from './get_lorebook_info';
import { manageLorebookEntryTool } from './manage_lorebook_entry';
import { manageChatTextTool } from './chat_text_editor';
import { quickChatPreviewTool } from './quick_chat_preview';
import { renameAgentChatTool, openNewAgentChatTool, listAgentChatsTool, deleteAgentChatTool } from './agent_chat_manager';
import { scrapeWebpageTool } from './scrape_webpage';
import { searchGoogleTool } from './search_google';
import { toggleVirtualCursorTool } from './virtual_cursor';
import { interactUITool } from './interact_ui';
import { ToolRegistry } from '../tool_registry';

/**
 * Đăng ký tất cả các tools mặc định vào Registry
 */
export function registerDefaultTools(registry: ToolRegistry) {
    registry.registerTool(getCharInfoTool);
    registry.registerTool(sendSystemMessageTool);
    registry.registerTool(deleteLastMessageTool);
    registry.registerTool(deleteMessageByIndexTool);
    registry.registerTool(getChatHistoryTool);
    registry.registerTool(getUserPersonaTool);
    registry.registerTool(editUserPersonaTool);
    registry.registerTool(getLorebookInfoTool);
    registry.registerTool(manageLorebookEntryTool);
    registry.registerTool(manageWorldbookTool);
    registry.registerTool(quickChatPreviewTool);
    registry.registerTool(renameAgentChatTool);
    registry.registerTool(openNewAgentChatTool);
    registry.registerTool(listAgentChatsTool);
    registry.registerTool(deleteAgentChatTool);
    registry.registerTool(manageChatTextTool);
    registry.registerTool(scrapeWebpageTool);
    registry.registerTool(searchGoogleTool);
    registry.registerTool(toggleVirtualCursorTool);
    registry.registerTool(interactUITool);
}
