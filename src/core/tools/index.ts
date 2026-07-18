import { getCharInfoTool } from './get_char_info';
import { ToolRegistry } from '../tool_registry';

/**
 * Đăng ký tất cả các tools mặc định vào Registry
 */
export function registerDefaultTools(registry: ToolRegistry) {
    registry.registerTool(getCharInfoTool);
    // Sau này có thể thêm registerTool(searchChatTool), v.v.
}
