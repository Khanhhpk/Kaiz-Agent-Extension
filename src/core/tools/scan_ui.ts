import { ITool } from '../tool_registry';

export const scanUITool: ITool = {
    schema: {
        name: 'scan_ui',
        description: 'Quét toàn bộ giao diện hiện tại để tìm các phần tử có thể tương tác (nút bấm, thẻ liên kết, ô nhập liệu). Trả về danh sách kèm mã định danh [kX] để dùng cho lệnh interact_with_ui.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    execute: async () => {
        const interactables = document.querySelectorAll('button, a, input, select, textarea, .interactable, [title], .menu_button, .drawer-toggle, .fa-solid, .fa-regular');
        const elementsList: string[] = [];
        let counter = 1;

        // Xoá các tag cũ
        const oldTagged = document.querySelectorAll('[data-kaiz-id]');
        oldTagged.forEach(el => el.removeAttribute('data-kaiz-id'));

        for (let i = 0; i < interactables.length; i++) {
            const el = interactables[i] as HTMLElement;
            
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
                // Nếu icon nằm trong một button đã có nội dung, skip icon để lấy button
                if (el.parentElement && el.parentElement.tagName === 'BUTTON' && el.parentElement.offsetParent !== null) {
                    continue;
                }
            }

            // Gộp nội dung để hiển thị
            let description = text;
            if (!description) description = title;
            if (!description) description = ariaLabel;
            if (!description && el.tagName === 'INPUT') description = value || el.getAttribute('placeholder') || 'Input field';

            // Nếu không có bất kỳ mô tả nào, khó mà ấn được, bỏ qua để tránh rác
            if (!description && !isIconOnly) continue;
            if (!description && isIconOnly) {
                // Lấy class icon làm mô tả
                description = Array.from(el.classList).filter(c => c.startsWith('fa-')).join(' ');
            }

            // Giới hạn chiều dài mô tả
            if (description.length > 50) {
                description = description.substring(0, 47) + '...';
            }

            // Xoá khoảng trắng thừa
            description = description.replace(/\s+/g, ' ');

            // Nếu phần tử cha đã được đánh tag và nội dung tương tự, có thể bỏ qua để chống trùng lặp
            if (el.parentElement && el.parentElement.hasAttribute('data-kaiz-id')) {
                 // Đơn giản hoá: cứ lấy, người dùng chọn k nào cũng được
            }

            // Gắn ID
            const tagId = `k${counter++}`;
            el.setAttribute('data-kaiz-id', tagId);

            let tagName = el.tagName.toLowerCase();
            if (tagName === 'i' || tagName === 'span') tagName = 'icon';

            elementsList.push(`[${tagId}] ${tagName.toUpperCase()}: ${description}`);
        }

        if (elementsList.length === 0) {
            return { content: 'Không tìm thấy phần tử nào có thể tương tác trên màn hình hiện tại.' };
        }

        return {
            content: `Đã tìm thấy ${elementsList.length} phần tử. Sử dụng ID [kX] để tương tác:\n\n` + elementsList.join('\n')
        };
    }
};
