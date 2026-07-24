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
            let reqHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            try {
                const win = window as any;
                if (win.SillyTavern && typeof win.SillyTavern.getContext === 'function') {
                    const ctx = win.SillyTavern.getContext();
                    if (ctx && typeof ctx.getRequestHeaders === 'function') {
                        Object.assign(reqHeaders, ctx.getRequestHeaders());
                    }
                } else if (typeof win.getRequestHeaders === 'function') {
                    Object.assign(reqHeaders, win.getRequestHeaders());
                } else {
                    let token = win.token || win.SillyTavern?.token;
                    if (!token) {
                        const meta = document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement;
                        if (meta) token = meta.content;
                    }
                    if (token) reqHeaders['X-CSRF-Token'] = token;
                }
            } catch (e) {};

            let namesToTry = [
                'Kaiz-Agent-Extension',
                'Kaiz-Agent',
                'kaiz-agent-extension',
                '/Kaiz-Agent-Extension',
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
            let wasActuallyUpdated = false;

            for (const extName of namesToTry) {
                const isSystem = extTypes && extTypes[extName] === 'system';
                if (isSystem) continue;

                let isGlobalList = [false, true];
                if (extTypes && extTypes[extName] === 'global') isGlobalList = [true];
                if (extTypes && extTypes[extName] === 'local') isGlobalList = [false];

                // Nếu extName có chứa "third-party", thử bỏ nó đi vì sanitize của ST sẽ làm hỏng đường dẫn
                const cleanExtName = extName.replace(/^third-party\//, '').replace(/^\//, '');

                for (const isGlobal of isGlobalList) {
                    try {
                        const payload = { extensionName: cleanExtName, global: isGlobal };
                        
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
                                    successName = cleanExtName;
                                    newCommitHash = updateData.shortCommitHash || '';
                                    wasActuallyUpdated = true;
                                    break;
                                }
                            } else if (versionData && versionData.isUpToDate === true) {
                                // Ghi nhận là tìm thấy thư mục extension hợp lệ nhưng đã mới nhất
                                updateFound = true;
                                successName = cleanExtName;
                                newCommitHash = versionData.currentCommitHash || '';
                                wasActuallyUpdated = false;
                                break;
                            }
                        }
                    } catch (e) {}
                }
                if (updateFound) break;
            }

            if (updateFound) {
                if (wasActuallyUpdated) {
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                    return {
                        content: `✅ Đã quét bằng API nội bộ và kích hoạt cập nhật thành công (Target: ${successName}, Hash: ${newCommitHash}). Đang khởi động lại trang...`,
                        isTerminal: true,
                    };
                } else {
                    return {
                        content: `ℹ️ Đã sử dụng API của ST để quét nhưng không tìm thấy bản cập nhật mới nào cho ${successName} (Đang ở bản mới nhất: ${newCommitHash}).`,
                    };
                }
            }

            return {
                content: 'ℹ️ Không tìm thấy thư mục Extension hợp lệ để cập nhật. Vui lòng kiểm tra lại tên thư mục.',
            };
        } catch (e: any) {
            return {
                content: `Lỗi khi chạy công cụ update_kaiz_extension: ${e.message}`,
                isError: true,
            };
        }
    },
};
