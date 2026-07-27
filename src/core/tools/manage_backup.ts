import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';
import { StateManager } from '../state';

export const manageBackupTool: ITool = {
    schema: {
        name: 'manage_backup',
        description:
            'Tạo bản sao lưu (backup) an toàn cho thẻ nhân vật, chat, hoặc worldbook hiện tại vào cơ sở dữ liệu IndexedDB của Kaiz Agent. LUÔN LUÔN gọi công cụ này trước khi sử dụng các công cụ thay đổi dữ liệu nguy hiểm như edit_character_card hoặc xoá tin nhắn.',
        parameters: {
            type: 'object',
            properties: {
                target_type: {
                    type: 'string',
                    enum: ['character', 'chat', 'worldbook'],
                    description: 'Loại dữ liệu cần sao lưu.',
                },
                target_name: {
                    type: 'string',
                    description:
                        'Tên đối tượng cần sao lưu (bắt buộc nếu target_type là worldbook, đối với character và chat sẽ tự động lấy đối tượng hiện tại).',
                },
            },
            required: ['target_type'],
        },
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('characters')) {
            throw new Error('ST Context missing');
        }
    },
    execute: async (
        args: Record<string, any>,
        context: { adapter: SillyTavernAdapter; stateManager: StateManager },
    ): Promise<ToolResult> => {
        try {
            const type = args.target_type as 'character' | 'chat' | 'worldbook';
            const name = args.target_name;

            const exportResult = await context.adapter.exportBackupData(type, name);
            if (!exportResult) {
                return {
                    isError: true,
                    content: `Không thể tạo backup cho ${type}. Đối tượng không tồn tại hoặc lỗi trích xuất dữ liệu.`,
                };
            }

            // Lưu vào IDB
            const backupId = await context.stateManager.db.addBackup(type, exportResult.name, exportResult.data);

            return {
                content: `✅ Đã tạo backup thành công cho [${type}: ${exportResult.name}] với ID=${backupId}. Người dùng có thể tải về từ Backup Manager.`,
            };
        } catch (e: any) {
            return {
                isError: true,
                content: `Lỗi khi sao lưu dữ liệu: ${e.message}`,
            };
        }
    },
};
