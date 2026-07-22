import { ITool } from '../tool_registry';

export const scanUITool: ITool = {
    schema: {
        name: 'scan_ui',
        description: 'Quét toàn bộ giao diện hiện tại để tìm các phần tử có thể tương tác. Trả về cây DOM thu gọn chứa các id/class của cấu trúc trang và các nút bấm được đánh dấu [kX].',
        parameters: {
            type: 'object',
            properties: {},
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

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

            // Kiểm tra bị che giấu bởi container (chiều cao hoặc chiều rộng = 0)
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            // Bỏ qua các element nằm ngoài viewport? Không, đôi khi ST cho phép scroll.
            
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
                // SillyTavern hoặc jQuery UI tooltip có thể gỡ bỏ title và đưa vào data-original-title / jq-title...
                const title = el.getAttribute('title')?.trim() || el.getAttribute('data-original-title')?.trim() || el.getAttribute('data-title')?.trim() || '';
                const ariaLabel = el.getAttribute('aria-label')?.trim() || '';
                const value = (el as HTMLInputElement).value?.trim() || '';
                let description = text || title || ariaLabel;
                
                if (!description && el.tagName === 'INPUT') {
                    description = value || el.getAttribute('placeholder') || 'Input field';
                }
                
                let isIconOnly = false;
                if (!description) {
                    if (el.classList.contains('fa-solid') || el.classList.contains('fa-regular')) {
                        isIconOnly = true;
                        description = Array.from(el.classList).filter(c => c.startsWith('fa-')).join(' ');
                    } else {
                        // Kiểm tra nếu nó bọc một icon bên trong (vd: <div class="menu_button"><i class="fa-solid fa-gear"></i></div>)
                        const childIcon = el.querySelector('.fa-solid, .fa-regular');
                        if (childIcon) {
                            isIconOnly = true;
                            description = Array.from(childIcon.classList).filter(c => c.startsWith('fa-')).join(' ');
                        }
                    }
                }

                if (!description && !isIconOnly && el.tagName !== 'SELECT' && el.tagName !== 'IMG') {
                    // Nếu là một element đặc biệt nhưng vẫn không có text (ví dụ menu_button), lấy class/id làm tên
                    if (el.classList.contains('menu_button') || el.classList.contains('drawer-toggle')) {
                        description = el.id || el.className;
                    } else {
                        return ''; // Rác, bỏ qua
                    }
                }

                if (description.length > 60) description = description.substring(0, 57) + '...';
                description = description.replace(/\n/g, ' ').replace(/\s+/g, ' ');

                let tagName = el.tagName.toLowerCase();
                if (tagName === 'i' || tagName === 'span') tagName = 'icon';

                // Bóc tách trạng thái (States & Values)
                let states = '';
                if ((el as any).disabled) states += '[Disabled] ';
                
                if (tagName === 'input') {
                    const type = el.getAttribute('type') || 'text';
                    states += `(type:${type}) `;
                    if ((el as HTMLInputElement).checked) states += '[Checked] ';
                }
                
                if (tagName === 'select') {
                    const select = el as HTMLSelectElement;
                    if (select.selectedIndex >= 0) {
                        const opt = select.options[select.selectedIndex];
                        if (opt) states += `(Selected: ${opt.text.trim()}) `;
                    }
                }

                if (tagName === 'img') {
                    const alt = el.getAttribute('alt');
                    if (alt) description += ` (Image: ${alt})`;
                }

                const stateStr = states.trim() ? ` ${states.trim()}` : '';
                return `${indentStr}[${kaizId}] ${tagName.toUpperCase()}${stateStr}: ${description}\n`;
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

        return {
            content: outputContent
        };
    }
};
