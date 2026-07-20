import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const editUserPersonaTool: ITool = {
    schema: {
        name: 'edit_user_persona',
        description: 'Chỉnh sửa thông tin hồ sơ (Persona) của người dùng hiện tại.',
        parameters: {
            type: 'object',
            properties: {
                persona_name: { type: 'string', description: 'Tên mới của người dùng (tùy chọn, nếu không có thì giữ nguyên tên cũ).' },
                persona_description: { type: 'string', description: 'Đoạn mô tả ngoại hình, tính cách của người dùng. Viết tự do theo ngôi thứ 3 hoặc thứ 1 đều được.' }
            },
            required: ['persona_description']
        }
    },
    validate: (context: { adapter: SillyTavernAdapter }) => {
        if (!context.adapter.hasFeature('substituteParams')) {
            throw new Error('ST API substituteParams is missing');
        }
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        // C1: Null-guard
        if (!context || !context.adapter) {
            return { content: 'Error: Adapter not provided in context.', isError: true };
        }

        // C2: Validate persona_description không rỗng/chỉ toàn khoảng trắng
        const description = typeof args.persona_description === 'string' ? args.persona_description.trim() : '';
        if (!description) {
            return {
                content: '[LỖI] Tham số persona_description không được để trống. Hãy cung cấp mô tả persona đầy đủ.',
                isError: true
            };
        }

        try {
            const success = await context.adapter.editUserPersona(description, args.persona_name);
            if (success) {
                return { content: `Successfully updated user persona.\nName: ${args.persona_name || '(unchanged)'}\nDescription: ${args.persona_description}` };
            } else {
                return { 
                    content: `Failed to update User Persona. (Maybe UI/Backend issues)`, 
                    isError: true 
                };
            }
        } catch (error: any) {
            return {
                content: `Error updating User Persona: ${error.message || String(error)}`,
                isError: true
            };
        }
    }
};
