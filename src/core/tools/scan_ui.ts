import { ITool } from '../tool_registry';

export const scanUITool: ITool = {
    schema: {
        name: 'scan_ui',
        description: 'Quét toàn bộ giao diện hiện tại để tìm các phần tử có thể tương tác. Trả về danh sách được phân nhóm theo bố cục (trái, phải, trên, dưới) kèm mã định danh [kX]. Agent có thể dùng tham số captureScreenshot để yêu cầu chụp lại ảnh màn hình đính kèm (giúp AI nhìn được web).',
        parameters: {
            type: 'object',
            properties: {
                captureScreenshot: {
                    type: 'boolean',
                    description: 'Nếu đặt là true, tool sẽ tự động chụp ảnh màn hình hiện tại và đính kèm vào cuối kết quả trả về. Rất hữu ích khi bạn muốn thực sự "nhìn" thấy giao diện để đưa ra quyết định.'
                }
            },
            required: []
        }
    },
    execute: async (args: any) => {
        const interactables = document.querySelectorAll('button, a, input, select, textarea, .interactable, [title], .menu_button, .drawer-toggle, .fa-solid, .fa-regular');
        
        const groups: Record<string, string[]> = {
            'Top Bar (Thanh Công Cụ Trên)': [],
            'Left Menu (Menu Quản Lý Trái)': [],
            'Right Panel (Menu Cài Đặt/Nhân Vật Phải)': [],
            'Chat Area (Khung Chat Chính)': [],
            'Input Area (Khu Vực Nhập Tin Nhắn)': [],
            'Floating / Modal (Hộp thoại nổi)': []
        };
        
        let counter = 1;

        // Xoá các tag cũ
        const oldTagged = document.querySelectorAll('[data-kaiz-id]');
        oldTagged.forEach(el => el.removeAttribute('data-kaiz-id'));

        for (let i = 0; i < interactables.length; i++) {
            const el = interactables[i] as HTMLElement;
            
            // Bỏ qua giao diện của chính Kaiz Agent để tránh tự quét mình
            if (el.closest('#kaiz-floating-btn, #kaiz-chat-window, #kaiz-log-modal, #kaiz-virtual-cursor, [id^="kaiz-"]')) {
                continue;
            }

            // Bỏ qua các phần tử bị ẩn
            if (el.offsetParent === null) continue;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

            // Bỏ qua các phần tử nằm trong các element đang ẩn
            let isHidden = false;
            let parent = el.parentElement;
            while (parent) {
                const pStyle = window.getComputedStyle(parent);
                if (pStyle.display === 'none' || pStyle.visibility === 'hidden') {
                    isHidden = true;
                    break;
                }
                parent = parent.parentElement;
            }
            if (isHidden) continue;

            // Trích xuất nội dung
            let text = el.innerText?.trim() || '';
            const title = el.getAttribute('title')?.trim() || '';
            const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
            const value = (el as HTMLInputElement).value?.trim() || '';
            
            // Xử lý icon
            let isIconOnly = false;
            if (!text && (el.classList.contains('fa-solid') || el.classList.contains('fa-regular'))) {
                isIconOnly = true;
                if (el.parentElement && el.parentElement.tagName === 'BUTTON' && el.parentElement.offsetParent !== null) {
                    continue; // Thuộc về 1 button khác
                }
            }

            // Gộp nội dung
            let description = text;
            if (!description) description = title;
            if (!description) description = ariaLabel;
            if (!description && el.tagName === 'INPUT') description = value || el.getAttribute('placeholder') || 'Input field';

            if (!description && !isIconOnly) continue;
            if (!description && isIconOnly) {
                description = Array.from(el.classList).filter(c => c.startsWith('fa-')).join(' ');
            }

            if (description.length > 50) {
                description = description.substring(0, 47) + '...';
            }
            description = description.replace(/\s+/g, ' ');

            // Gắn ID
            const tagId = `k${counter++}`;
            el.setAttribute('data-kaiz-id', tagId);

            let tagName = el.tagName.toLowerCase();
            if (tagName === 'i' || tagName === 'span') tagName = 'icon';

            const itemStr = `[${tagId}] ${tagName.toUpperCase()}: ${description}`;

            // Phân loại nhóm
            if (el.closest('#top-bar')) {
                groups['Top Bar (Thanh Công Cụ Trên)'].push(itemStr);
            } else if (el.closest('#nav-drawer')) {
                groups['Left Menu (Menu Quản Lý Trái)'].push(itemStr);
            } else if (el.closest('#right-nav-panel')) {
                groups['Right Panel (Menu Cài Đặt/Nhân Vật Phải)'].push(itemStr);
            } else if (el.closest('#chat')) {
                groups['Chat Area (Khung Chat Chính)'].push(itemStr);
            } else if (el.closest('#sheld')) {
                groups['Input Area (Khu Vực Nhập Tin Nhắn)'].push(itemStr);
            } else {
                groups['Floating / Modal (Hộp thoại nổi)'].push(itemStr);
            }
        }

        let outputContent = '--- BỐ CỤC GIAO DIỆN HIỆN TẠI ---\n';
        let totalItems = 0;
        
        for (const [groupName, items] of Object.entries(groups)) {
            if (items.length > 0) {
                outputContent += `\n>> ${groupName}:\n`;
                outputContent += items.join('\n') + '\n';
                totalItems += items.length;
            }
        }

        if (totalItems === 0) {
            outputContent = 'Không tìm thấy phần tử nào có thể tương tác trên màn hình hiện tại.';
        } else {
            outputContent = `Đã tìm thấy ${totalItems} phần tử.\n\n` + outputContent;
        }

        // Chụp ảnh nếu được yêu cầu
        if (args.captureScreenshot && (window as any).html2canvas) {
            try {
                // Tạm ẩn Kaiz Agent UI để chụp ảnh cho sạch
                const floatBtn = document.getElementById('kaiz-floating-btn');
                const chatWin = document.getElementById('kaiz-chat-window');
                const vCursor = document.getElementById('kaiz-virtual-cursor');
                if (floatBtn) floatBtn.style.visibility = 'hidden';
                if (chatWin) chatWin.style.visibility = 'hidden';
                if (vCursor) vCursor.style.visibility = 'hidden';

                const canvas = await (window as any).html2canvas(document.body, {
                    useCORS: true,
                    ignoreElements: (e: HTMLElement) => {
                        if (e.id && e.id.startsWith('kaiz-')) return true;
                        return false;
                    }
                });
                
                // Khôi phục lại
                if (floatBtn) floatBtn.style.visibility = 'visible';
                if (chatWin) chatWin.style.visibility = 'visible';
                if (vCursor) vCursor.style.visibility = 'visible';

                const base64 = canvas.toDataURL('image/jpeg', 0.6); // 0.6 để tiết kiệm dung lượng
                outputContent += `\n\n![Screenshot](${base64})`;
            } catch (e) {
                console.error('[KaizAgent] html2canvas error:', e);
                outputContent += `\n\n(Lỗi: Không thể chụp ảnh màn hình: ${e})`;
            }
        } else if (args.captureScreenshot && !(window as any).html2canvas) {
            outputContent += `\n\n(Lỗi: Không tìm thấy thư viện html2canvas trong hệ thống SillyTavern để chụp ảnh).`;
        }

        return {
            content: outputContent
        };
    }
};
