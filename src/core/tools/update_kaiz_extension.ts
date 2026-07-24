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
            // Cách 1: Sử dụng API như cũ để backup
            let apiSuccess = false;
            let successName = '';
            
            // Cách 2 (Ưu tiên): Quét trực tiếp trên DOM của Extension Manager
            let domSuccess = false;
            
            // Tìm nút mở Extension Manager và click tạm để render DOM nếu chưa render
            const extManageBtn = document.getElementById('extensions_manage_button') || document.querySelector('[title="Extensions"]') as HTMLElement;
            let didOpenModal = false;
            
            if (extManageBtn) {
                // Kiểm tra xem modal có đang mở không
                const extModal = document.getElementById('extensions_manage_modal') || document.querySelector('.extensions_manage_modal');
                const isModalHidden = !extModal || (extModal.style.display === 'none') || !extModal.classList.contains('active');
                
                if (isModalHidden) {
                    extManageBtn.click();
                    didOpenModal = true;
                    // Đợi render
                    await new Promise(r => setTimeout(r, 500));
                }
                
                // Quét tìm row của Kaiz Agent
                const extRows = document.querySelectorAll('.extension_row, .extension-item');
                for (const row of Array.from(extRows)) {
                    if (row.textContent?.toLowerCase().includes('kaiz agent') || row.textContent?.toLowerCase().includes('kaiz-agent-extension')) {
                        // Tìm nút update (thường có icon fa-download hoặc title Update)
                        const updateBtn = row.querySelector('.menu_button[title*="Update"], .menu_button[title*="update"], .fa-download') as HTMLElement;
                        if (updateBtn) {
                            const btnToClick = updateBtn.closest('button, .menu_button') as HTMLElement || updateBtn;
                            btnToClick.click();
                            domSuccess = true;
                            break;
                        }
                    }
                }
                
                // Đóng modal nếu chúng ta đã tự mở nó
                if (didOpenModal) {
                    const closeBtn = document.querySelector('#extensions_manage_modal .fa-xmark, .extensions_manage_modal .fa-xmark') as HTMLElement;
                    if (closeBtn) closeBtn.click();
                    else extManageBtn.click(); // Toggle again
                }
            }

            if (domSuccess) {
                return {
                    content: '✅ Đã tìm thấy bản cập nhật trong Extension Manager và tự động click cập nhật thành công! Vui lòng chờ ST tải xuống...',
                };
            }

            // Fallback sang API
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
            namesToTry = [...new Set(namesToTry)];

            for (const extName of namesToTry) {
                const isSystem = extTypes && extTypes[extName] === 'system';
                if (isSystem) continue;

                let isGlobalList = [false, true];
                if (extTypes && extTypes[extName] === 'global') isGlobalList = [true];
                if (extTypes && extTypes[extName] === 'local') isGlobalList = [false];

                for (const isGlobal of isGlobalList) {
                    try {
                        const payload = { extensionName: extName, global: isGlobal };
                        let res = await fetch('/api/extensions/update', {
                            method: 'POST',
                            headers: reqHeaders,
                            body: JSON.stringify(payload),
                        });

                        if (res.ok) {
                            apiSuccess = true;
                            successName = extName;
                            break;
                        }
                    } catch (e) {}
                }
                if (apiSuccess) break;
            }

            if (apiSuccess) {
                return {
                    content: `✅ Đã gọi API cập nhật thành công (Target: ${successName}). Vui lòng chờ ST tải về!`,
                };
            }

            return {
                content: 'ℹ️ Đã quét Extension Manager và gọi API nhưng không tìm thấy bản cập nhật mới nào (Hoặc đang ở bản mới nhất).',
            };
        } catch (e: any) {
            return {
                content: `Lỗi khi chạy công cụ update_kaiz_extension: ${e.message}`,
                isError: true,
            };
        }
    },
};
