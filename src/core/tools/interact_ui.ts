import { ITool } from '../tool_registry';

export const interactUITool: ITool = {
    schema: {
        name: 'interact_with_ui',
        description:
            'Tương tác vật lý với giao diện SillyTavern. Cho phép Agent di chuyển con trỏ chuột ảo và click vào các nút bấm.',
        parameters: {
            type: 'object',
            properties: {
                targetDescription: {
                    type: 'string',
                    description: 'Tên hoặc mô tả của nút bấm cần click. Ví dụ: "Send", "Extensions", "Menu"',
                },
            },
            required: ['targetDescription'],
        },
    },
    execute: async (args: any) => {
        try {
            const target = args.targetDescription?.toLowerCase();
            if (!target) return { content: 'Lỗi: Không có targetDescription.', isError: true };

            // 1. Tìm kiếm element
            let foundElement: HTMLElement | null = null;

            // Xử lý target để trích xuất kX (nếu có)
            let cleanTarget: string;
            const kIdMatch = target.match(/\[(k\d+)\]/i) || target.match(/^(k\d+)$/i);
            if (kIdMatch) {
                cleanTarget = kIdMatch[1].toLowerCase(); // "k95"
            } else {
                // Loại bỏ ngoặc vuông nếu agent truyền vào dạng "[Extensions]"
                cleanTarget = target.replace(/\[|\]/g, '').trim();
            }
            const kaizIdMatch = cleanTarget.match(/^k\d+$/);
            if (kaizIdMatch) {
                foundElement = document.querySelector(`[data-kaiz-id="${cleanTarget}"]`);
            }

            if (!foundElement) {
                // Từ khoá hard-code cho các nút quan trọng
                const keywordMap: Record<string, string> = {
                    send: '#send_but',
                    gửi: '#send_but',
                    extensions: '#extensions_button',
                    'tiện ích': '#extensions_button',
                    settings: '#rm_button_panel',
                    'cài đặt': '#rm_button_panel',
                    characters: '#rm_button_characters',
                    'nhân vật': '#rm_button_characters',
                    menu: '#nav-drawer-toggle',
                };

                if (keywordMap[cleanTarget]) {
                    foundElement = document.querySelector(keywordMap[cleanTarget]);
                }
            }

            if (foundElement) {
                const rect = foundElement.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) {
                    return { content: 'Element found but is not visible/rendered.', isError: true };
                }
            }

            if (!foundElement) {
                // Tìm theo nội dung text hoặc title (tooltip)
                const interactables = document.querySelectorAll(
                    'button, a, .interactable, [title], .menu_button, .drawer-toggle',
                );
                for (let i = 0; i < interactables.length; i++) {
                    const el = interactables[i] as HTMLElement;
                    const text = el.innerText?.toLowerCase() || '';
                    const title = el.getAttribute('title')?.toLowerCase() || '';
                    if (text.includes(cleanTarget) || title.includes(cleanTarget)) {
                        // Check xem element có đang hiển thị không bằng getBoundingClientRect
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            foundElement = el;
                            break;
                        }
                    }
                }
            }

            if (!foundElement) {
                return {
                    content: `Không tìm thấy nút hoặc phần tử nào trên màn hình khớp với "${target}".`,
                    isError: true,
                };
            }

            // 2. Tính toán vị trí trung tâm của element
            const rect = foundElement.getBoundingClientRect();
            const targetX = rect.left + rect.width / 2;
            const targetY = rect.top + rect.height / 2;

            // 3. Khởi tạo / Tìm con trỏ
            let cursor = document.getElementById('kaiz-virtual-cursor');
            if (!cursor) {
                let extPath = 'third-party/Kaiz-Agent-Extension';
                try {
                    const scripts = document.getElementsByTagName('script');
                    for (let i = 0; i < scripts.length; i++) {
                        const src = scripts[i].src;
                        if (
                            src &&
                            src.includes('index.js') &&
                            src.toLowerCase().includes('kaiz') &&
                            src.toLowerCase().includes('agent')
                        ) {
                            const parts = new URL(src).pathname.split('/');
                            const extIndex = parts.indexOf('extensions');
                            if (extIndex !== -1 && parts.length > extIndex + 1) {
                                extPath = parts[extIndex + 1];
                                if (extPath === 'third-party' && parts.length > extIndex + 2) {
                                    extPath = parts[extIndex + 1] + '/' + parts[extIndex + 2];
                                }
                                break;
                            }
                        }
                    }
                } catch (e) {}

                cursor = document.createElement('div');
                cursor.id = 'kaiz-virtual-cursor';
                cursor.innerHTML = `<img src="/scripts/extensions/${extPath}/assets/gura_cursor.gif" style="width: 32px; height: 32px; pointer-events: none;" />`;
                cursor.style.position = 'fixed';
                cursor.style.top = '50%';
                cursor.style.left = '50%';
                cursor.style.transform = 'translate(-20%, -20%)';
                cursor.style.zIndex = '999999';
                cursor.style.pointerEvents = 'none';
                document.body.appendChild(cursor);

                // Đợi browser render xong
                await new Promise((r) => requestAnimationFrame(r));
            }

            // 4. Tính toán khoảng cách để xác định duration cho animation
            let startX = window.innerWidth / 2;
            let startY = window.innerHeight / 2;

            if (cursor.style.left && cursor.style.left.endsWith('px')) {
                startX = parseFloat(cursor.style.left);
                startY = parseFloat(cursor.style.top);
            }

            const distance = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));

            // Vận tốc cơ bản: 800 pixel mỗi giây
            let duration = distance / 800;
            // Giới hạn thời gian tối thiểu và tối đa
            if (duration < 0.3) duration = 0.3;
            if (duration > 1.5) duration = 1.5;

            // Bật transition trước khi set vị trí mới
            cursor.style.transition = `top ${duration}s ease-in-out, left ${duration}s ease-in-out`;

            // Kích hoạt bay
            cursor.style.top = `${targetY}px`;
            cursor.style.left = `${targetX}px`;

            // 5. Chờ bay tới nơi
            await new Promise((r) => setTimeout(r, duration * 1000 + 50));

            // 6. Thực thi Click (Tạo hiệu ứng nhấp nháy chút cho đẹp)
            cursor.style.transform = 'translate(-20%, -20%) scale(0.8)';
            setTimeout(() => {
                if (cursor) cursor.style.transform = 'translate(-20%, -20%) scale(1)';
            }, 150);

            foundElement.click();

            return {
                content: `Đã di chuyển con trỏ chuột và bấm vào nút "${target}" thành công.`,
            };
        } catch (e: any) {
            return {
                isError: true,
                content: `Lỗi khi interact_with_ui: ${e.message}`,
            };
        }
    },
};
