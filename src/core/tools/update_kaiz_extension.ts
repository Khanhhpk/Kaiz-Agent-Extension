import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

export const updateKaizExtensionTool: ITool = {
    schema: {
        name: 'update_kaiz_extension',
        description:
            'Kiểm tra thông báo update của Kaiz-Agent-Extension từ Extension Manager. Nếu có bản cập nhật mới, tự động click để update.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    validate: () => {
        return; // Luôn dùng được trên trình duyệt có jQuery
    },
    execute: async (args: Record<string, any>, context: { adapter: SillyTavernAdapter }): Promise<ToolResult> => {
        try {
            const reqHeaders = {
                'Content-Type': 'application/json',
                'X-CSRF-Token': (window as any).csrf_token || '',
            };

            let namesToTry = [
                'Kaiz-Agent-Extension',
                'Kaiz-Agent',
                'kaiz-agent-extension',
                'https://github.com/Khanhhpk/Kaiz-Agent-Extension',
                'https://github.com/Khanhhpk/Kaiz-Agent-Extension.git'
            ];

            const extTypes = (window as any).extensionTypes || (window as any).SillyTavern?.getContext?.()?.extensionTypes;
            if (extTypes) {
                const foundKeys = Object.keys(extTypes).filter((k) => k.toLowerCase().includes('kaiz'));
                namesToTry = [...foundKeys, ...namesToTry];
            }
            // Loại bỏ trùng lặp
            namesToTry = [...new Set(namesToTry)];

            let updatedOk = false;
            let successName = '';

            for (const extName of namesToTry) {
                // Determine if it is global or local if possible
                const isSystem = extTypes && extTypes[extName] === 'system';
                if (isSystem) continue;

                let isGlobalList = [false, true];
                if (extTypes && extTypes[extName] === 'global') isGlobalList = [true];
                if (extTypes && extTypes[extName] === 'local') isGlobalList = [false];

                // Thử update
                for (const isGlobal of isGlobalList) {
                    try {
                        const payload = { extensionName: extName, global: isGlobal };
                        let res = await fetch('/api/extensions/update', {
                            method: 'POST',
                            headers: reqHeaders,
                            body: JSON.stringify(payload),
                        });

                        // Nếu fetch thành công và trả về mã OK, ST backend đã xử lý update
                        if (res.ok) {
                            updatedOk = true;
                            successName = extName;
                            break;
                        }
                    } catch (e) {
                        // Bỏ qua lỗi fetch và thử tên khác
                    }
                }
                if (updatedOk) break;
            }

            if (updatedOk) {
                return {
                    content: `✅ Đã gọi API cập nhật thành công (Target: ${successName}). Vui lòng chờ ST tải về và tự động restart nếu cần!`,
                };
            } else {
                return {
                    content: 'ℹ️ Không thể cập nhật hoặc đã ở phiên bản mới nhất. API không trả về thành công.',
                };
            }
        } catch (e: any) {
            return {
                content: `Lỗi khi chạy công cụ update_kaiz_extension: ${e.message}`,
                isError: true,
            };
        }
    },
};
