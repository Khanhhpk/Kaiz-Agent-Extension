import { ITool } from '../tool_registry';

export const scanUITool: ITool = {
    schema: {
        name: 'scan_ui',
        description: 'Quét toàn bộ giao diện hiện tại để tìm các phần tử có thể tương tác. Trả về cây DOM thu gọn chứa các id/class của cấu trúc trang và các nút bấm được đánh dấu [kX]. Agent có thể dùng captureScreenshot để yêu cầu chụp lại ảnh màn hình đính kèm.',
        parameters: {
            type: 'object',
            properties: {
                captureScreenshot: {
                    type: 'boolean',
                    description: 'Nếu đặt là true, chụp ảnh màn hình hiện tại và đính kèm vào cuối kết quả (hữu ích để nhìn giao diện).'
                }
            },
            required: []
        }
    },
    execute: async (args: any) => {
        const interactables = document.querySelectorAll('button, a, input, select, textarea, .interactable, [title], .menu_button, .drawer-toggle, .fa-solid, .fa-regular');
        
        let counter = 1;

        // Xoá các tag cũ
        const oldTagged = document.querySelectorAll('[data-kaiz-id]');
        oldTagged.forEach(el => el.removeAttribute('data-kaiz-id'));

        // Bước 1: Gắn nhãn cho các element hợp lệ
        for (let i = 0; i < interactables.length; i++) {
            const el = interactables[i] as HTMLElement;
            
            // Bỏ qua giao diện của chính Kaiz Agent
            if (el.closest('#kaiz-floating-btn, #kaiz-chat-window, #kaiz-log-modal, #kaiz-virtual-cursor, [id^="kaiz-"]')) {
                continue;
            }

            // Bỏ qua các phần tử bị ẩn (offsetParent === null thường đúng trừ các phần tử fixed)
            if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') continue;
            
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

            // Kiểm tra bị che giấu bởi container (chiều cao hoặc chiều rộng = 0)
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            // Gắn ID
            el.setAttribute('data-kaiz-id', `k${counter++}`);
        }

        let totalItems = counter - 1;

        // Bước 2: Hàm đệ quy xây dựng cây DOM thu gọn
        function buildTree(el: HTMLElement, indent: number): string {
            if (!el) return '';
            
            // Tránh quét Agent UI
            if (el.id === 'kaiz-floating-btn' || el.id === 'kaiz-chat-window' || el.id === 'kaiz-log-modal' || el.id === 'kaiz-virtual-cursor' || el.id.startsWith('kaiz-')) {
                return '';
            }

            const kaizId = el.getAttribute('data-kaiz-id');
            const hasChildrenWithId = el.querySelectorAll('[data-kaiz-id]').length > 0;

            if (!kaizId && !hasChildrenWithId) {
                return ''; // Bỏ qua nhánh không có gì tương tác
            }

            const indentStr = '  '.repeat(indent);
            
            // Nếu là phần tử có thể click
            if (kaizId) {
                let text = el.innerText?.trim() || '';
                const title = el.getAttribute('title')?.trim() || '';
                const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
                const value = (el as HTMLInputElement).value?.trim() || '';
                let description = text || title || ariaLabel;
                
                if (!description && el.tagName === 'INPUT') {
                    description = value || el.getAttribute('placeholder') || 'Input field';
                }
                
                let isIconOnly = false;
                if (!description && (el.classList.contains('fa-solid') || el.classList.contains('fa-regular'))) {
                    isIconOnly = true;
                    description = Array.from(el.classList).filter(c => c.startsWith('fa-')).join(' ');
                }

                if (!description && !isIconOnly) return ''; // Rác, bỏ qua

                if (description.length > 60) description = description.substring(0, 57) + '...';
                description = description.replace(/\n/g, ' ').replace(/\s+/g, ' ');

                let tagName = el.tagName.toLowerCase();
                if (tagName === 'i' || tagName === 'span') tagName = 'icon';

                return `${indentStr}[${kaizId}] ${tagName.toUpperCase()}: ${description}\n`;
            }

            // Nếu chứa phần tử con có kX
            let childrenContent = '';
            for (let i = 0; i < el.children.length; i++) {
                childrenContent += buildTree(el.children[i] as HTMLElement, indent + 1);
            }

            if (childrenContent) {
                const isSignificant = el.id || (el.className && typeof el.className === 'string' && el.className.trim() !== '');
                
                if (isSignificant) {
                    let attrs = '';
                    if (el.id) attrs += ` id="${el.id}"`;
                    if (el.className && typeof el.className === 'string') {
                        const classes = el.className.split(' ').filter(c => !c.startsWith('fa-') && c.length > 0).join(' ');
                        if (classes) attrs += ` class="${classes}"`;
                    }
                    const tagName = el.tagName.toLowerCase();
                    return `${indentStr}<${tagName}${attrs}>\n${childrenContent}${indentStr}</${tagName}>\n`;
                } else {
                    // Flatten (Xoá khoảng trắng thụt lề thêm 1 bậc do không wrap)
                    let flatContent = '';
                    for (let i = 0; i < el.children.length; i++) {
                        flatContent += buildTree(el.children[i] as HTMLElement, indent); 
                    }
                    return flatContent;
                }
            }
            
            return '';
        }

        let outputContent = '--- CẤU TRÚC DOM (TÓM TẮT) ---\n\n';
        
        if (totalItems === 0) {
            outputContent = 'Không tìm thấy phần tử nào có thể tương tác trên màn hình hiện tại.';
        } else {
            const treeData = buildTree(document.body, 0);
            outputContent += '```html\n' + treeData + '\n```';
            outputContent = `Đã tìm thấy ${totalItems} phần tử tương tác. Sử dụng các thẻ ID [kX] để chọn.\n\n` + outputContent;
        }

        // Chụp ảnh nếu được yêu cầu
        if (args.captureScreenshot) {
            outputContent += `\n\n(Lỗi: Tính năng chụp ảnh màn hình hiện đã bị vô hiệu hoá. Việc sử dụng các thư viện screenshot bằng Javascript để quét toàn bộ DOM của SillyTavern gây ra hiện tượng tràn bộ nhớ và treo trình duyệt. Agent chỉ nên sử dụng cấu trúc DOM dạng văn bản ở trên để định vị.)`;
        }

        return {
            content: outputContent
        };
    }
};
