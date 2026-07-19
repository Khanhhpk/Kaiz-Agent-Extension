import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const editUserPersonaTool: ITool = {
    schema: {
        name: 'edit_user_persona',
        description: 'Chỉnh sửa và cập nhật hồ sơ (Persona) của người dùng hiện tại, bao gồm Tên và Mô tả tính cách/ngoại hình.',
        parameters: {
            type: 'object',
            properties: {
                persona_description: {
                    type: 'string',
                    description: 'Nội dung mô tả tính cách, ngoại hình, bối cảnh mới của người dùng.'
                },
                persona_name: {
                    type: 'string',
                    description: 'Tên hiển thị mới của người dùng (Tùy chọn. Nếu không muốn đổi tên thì bỏ qua trường này).'
                }
            },
            required: ['persona_description']
        }
    },

    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const success = await context.adapter.editUserPersona(args.persona_description, args.persona_name);
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
