import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const manageRegexTool: ITool = {
    schema: {
        name: 'manage_regex',
        description:
            'Công cụ tạo, sửa, xoá, hoặc bật/tắt Regex Scripts.\n' +
            '- action: "create", "edit", "delete", "toggle".\n' +
            '- id: UUID của Regex (bắt buộc cho edit/delete/toggle).\n' +
            '- scope: "Global", "Scoped", "Preset" (chỉ dùng cho create, mặc định Global).\n' +
            '- data: Object chứa cấu hình regex. Lưu ý cấu hình ST:\n' +
            '  + placement: [1]=User Input, [2]=AI Output, [3]=Slash Commands, [4]=World Info, [5]=Reasoning.\n' +
            '  + Ephemerality (RẤT QUAN TRỌNG):\n' +
            '    * markdownOnly: true = Alter Chat Display (Chỉ bọc "mặt nạ" đổi hiển thị UI cho user xem, không gửi đi, an toàn nhất).\n' +
            '    * promptOnly: true = Alter Outgoing Prompt (Chỉ sửa data ngầm gửi cho LLM, không lưu vào lịch sử DB).\n' +
            '    * NGUY HIỂM: Nếu CẢ 2 đều false, Regex sẽ sửa và LƯU CHẾT vĩnh viễn vào Database hội thoại. Tránh dùng trừ khi user yêu cầu!\n' +
            "  + substituteRegex: 0 = Don't substitute, 1 = Sub before regex, 2 = Sub after regex.\n" +
            '  + runOnEdit: true = Tự động chạy lại Regex này khi tin nhắn (của các role được cấu hình trong placement) bị chỉnh sửa.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['create', 'edit', 'delete', 'toggle'],
                    description: 'Hành động cần thực hiện.',
                },
                id: {
                    type: 'string',
                    description: 'ID của Regex (yêu cầu với edit, delete, toggle).',
                },
                scope: {
                    type: 'string',
                    enum: ['Global', 'Scoped', 'Preset'],
                    description: 'Phạm vi lưu trữ (dùng khi create). Mặc định là Global.',
                },
                data: {
                    type: 'object',
                    description: 'Dữ liệu cập nhật hoặc tạo mới (JSON).',
                },
            },
            required: ['action'],
        },
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const { action, id, scope, data } = args;

            // Bypass TypeScript
            const regexEngine = await new Function('return import("/scripts/extensions/regex/engine.js")')();

            if (
                !regexEngine ||
                !regexEngine.SCRIPT_TYPES ||
                !regexEngine.getScriptsByType ||
                !regexEngine.saveScriptsByType
            ) {
                return {
                    isError: true,
                    content: 'Không thể tải Regex Engine của SillyTavern.',
                };
            }

            const { SCRIPT_TYPES, getScriptsByType, saveScriptsByType } = regexEngine;

            // Hàm tiện ích map scope string thành SCRIPT_TYPES enum
            const getScopeValue = (scopeStr: string) => {
                if (scopeStr === 'Scoped') return SCRIPT_TYPES.SCOPED;
                if (scopeStr === 'Preset') return SCRIPT_TYPES.PRESET;
                return SCRIPT_TYPES.GLOBAL;
            };

            // Helpers tìm script
            const findScript = () => {
                for (const type of [SCRIPT_TYPES.GLOBAL, SCRIPT_TYPES.SCOPED, SCRIPT_TYPES.PRESET]) {
                    const scripts = getScriptsByType(type) || [];
                    const index = scripts.findIndex((s: any) => s.id === id);
                    if (index !== -1) {
                        return { type, scripts, index, script: scripts[index] };
                    }
                }
                return null;
            };

            if (action === 'create') {
                const targetType = getScopeValue(scope || 'Global');
                const scripts = getScriptsByType(targetType) || [];

                const newId =
                    typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `regex-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                const newScript = {
                    id: newId,
                    scriptName: 'New Regex Script',
                    findRegex: '',
                    replaceString: '',
                    trimStrings: [],
                    placement: [2], // 2 = OUTGOING
                    disabled: false,
                    markdownOnly: false,
                    promptOnly: false,
                    runOnEdit: false,
                    substituteRegex: 0,
                    minDepth: null,
                    maxDepth: null,
                    ...(data || {}), // Ghi đè bằng dữ liệu người dùng
                };

                scripts.push(newScript);
                await saveScriptsByType(scripts, targetType);
                return { content: `Tạo mới thành công Regex: ${newScript.scriptName} (ID: ${newId})` };
            }

            if (!id) {
                return { isError: true, content: 'Bắt buộc phải cung cấp id cho hành động này.' };
            }

            const found = findScript();
            if (!found) {
                return { isError: true, content: `Không tìm thấy Regex nào với ID: ${id}` };
            }

            if (action === 'delete') {
                found.scripts.splice(found.index, 1);
                await saveScriptsByType(found.scripts, found.type);
                return { content: `Đã xóa thành công Regex: ${found.script.scriptName}` };
            }

            if (action === 'toggle') {
                found.script.disabled = !found.script.disabled;
                await saveScriptsByType(found.scripts, found.type);
                return {
                    content: `Đã thay đổi trạng thái disabled thành ${found.script.disabled} cho Regex: ${found.script.scriptName}`,
                };
            }

            if (action === 'edit') {
                if (!data || typeof data !== 'object') {
                    return { isError: true, content: 'Phải cung cấp field "data" dưới dạng JSON object để cập nhật.' };
                }
                // Hợp nhất dữ liệu mới vào
                found.scripts[found.index] = { ...found.script, ...data };
                // Giữ nguyên ID gốc để an toàn
                found.scripts[found.index].id = found.script.id;

                await saveScriptsByType(found.scripts, found.type);
                return { content: `Đã cập nhật thành công Regex: ${found.script.scriptName}` };
            }

            return { isError: true, content: `Hành động không hợp lệ: ${action}` };
        } catch (error: any) {
            return {
                isError: true,
                content: `Lỗi khi quản lý Regex: ${error.message || String(error)}`,
            };
        }
    },
};
