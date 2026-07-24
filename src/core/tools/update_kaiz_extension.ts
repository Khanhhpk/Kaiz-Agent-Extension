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
                'kaiz-agent-extension'
            ];

            const extTypes = (window as any).extensionTypes || (window as any).SillyTavern?.getContext?.()?.extensionTypes;
            if (extTypes) {
                const foundKeys = Object.keys(extTypes).filter((k) => k.toLowerCase().includes('kaiz'));
                namesToTry = [...foundKeys, ...namesToTry];
            }
            namesToTry = [...new Set(namesToTry)];

            let updateFound = false;
            let successName = '';
            let newCommitHash = '';

            for (const extName of namesToTry) {
                const isSystem = extTypes && extTypes[extName] === 'system';
                if (isSystem) continue;

                let isGlobalList = [false, true];
                if (extTypes && extTypes[extName] === 'global') isGlobalList = [true];
                if (extTypes && extTypes[extName] === 'local') isGlobalList = [false];

                for (const isGlobal of isGlobalList) {
                    try {
                        const payload = { extensionName: extName, global: isGlobal };
                        
                        // 1. Dùng API nội bộ của ST để check xem có update thật hay không
                        let versionRes = await fetch('/api/extensions/version', {
                            method: 'POST',
                            headers: reqHeaders,
                            body: JSON.stringify(payload),
                        });

                        if (versionRes.ok) {
                            const versionData = await versionRes.json();
                            
                            // Nếu có bản cập nhật mới (isUpToDate = false)
                            if (versionData && versionData.isUpToDate === false) {
                                // 2. Kích hoạt logic update của ST
                                let updateRes = await fetch('/api/extensions/update', {
                                    method: 'POST',
                                    headers: reqHeaders,
                                    body: JSON.stringify(payload),
                                });
                                
                                if (updateRes.ok) {
                                    const updateData = await updateRes.json();
                                    updateFound = true;
                                    successName = extName;
                                    newCommitHash = updateData.shortCommitHash || '';
                                    break;
                                }
                            }
                        }
                    } catch (e) {}
                }
                if (updateFound) break;
            }

            if (updateFound) {
                return {
                    content: `✅ Đã quét bằng API nội bộ và kích hoạt cập nhật thành công (Target: ${successName}, Hash: ${newCommitHash}). ST sẽ tải ngầm về!`,
                };
            }

            return {
                content: 'ℹ️ Đã sử dụng API của ST để quét nhưng không tìm thấy bản cập nhật mới nào (Hoặc đang ở bản mới nhất).',
            };
        } catch (e: any) {
            return {
                content: `Lỗi khi chạy công cụ update_kaiz_extension: ${e.message}`,
                isError: true,
            };
        }
    },
};
