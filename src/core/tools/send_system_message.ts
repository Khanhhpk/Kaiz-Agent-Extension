import { ITool, ToolResult } from '../tool_registry';
import { SillyTavernAdapter } from '../../adapters/st_adapter';

declare const jQuery: any;
declare const window: any;

export const sendSystemMessageTool: ITool = {
    schema: {
        name: 'send_system_message',
        description:
            'Gửi một thông báo hệ thống (popup notification) lên màn hình để thông báo cho người dùng. Dùng để báo cáo kết quả, trạng thái hoặc cảnh báo cho người dùng mà không làm gián đoạn luồng chat. Tin nhắn này sẽ tự động biến mất sau một lúc.',
        parameters: {
            type: 'object',
            properties: {
                message: {
                    type: 'string',
                    description: 'Nội dung thông báo cần hiển thị cho người dùng',
                },
            },
            required: ['message'],
        },
    },
    validate: () => {
        // Không cần check ST API nữa vì ta tự dựng UI
    },
    execute: async (args: Record<string, any>): Promise<ToolResult> => {
        const message = args.message;
        if (!message) {
            return {
                content: 'Error: message is required.',
                isError: true,
            };
        }

        const $ = jQuery;
        if (!$) {
            return { content: 'Error: jQuery not found in environment.', isError: true };
        }

        // Tính thời gian biến mất (từ 3 đến 12 giây dựa trên độ dài)
        const timeout = Math.max(3000, Math.min(12000, message.length * 60));
        
        // Kiểm tra xem Kaiz Window có đang mở không
        const chatWindow = $('#kaiz-chat-window');
        const floatBtn = $('#kaiz-floating-btn');
        const isWindowOpen = chatWindow.length > 0 && chatWindow.css('display') !== 'none';
        
        const popupId = 'kaiz-sys-popup-' + Date.now();
        const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        
        const popup = $(`
            <div id="${popupId}" class="kaiz-sys-notification" style="opacity: 0; pointer-events: none; transition: opacity 0.3s ease, transform 0.3s ease;">
                <div style="position: absolute; top: 5px; right: 8px; font-size: 12px; color: #aaa; cursor: pointer;" class="kaiz-sys-close"><i class="fa-solid fa-xmark"></i></div>
                <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <div style="color: #7289da; font-size: 20px; margin-top: 2px;"><i class="fa-solid fa-circle-info"></i></div>
                    <div style="font-size: 14px; line-height: 1.4; color: #fff; word-break: break-word; flex-grow: 1;">${safeMessage}</div>
                </div>
            </div>
        `);

        // Common styles
        popup.css({
            position: 'fixed',
            zIndex: 999999, // Đảm bảo nằm trên mọi thứ
            background: 'rgba(25, 25, 35, 0.95)',
            border: '1px solid #7289da',
            borderRadius: '8px',
            padding: '15px 25px 15px 15px',
            boxShadow: '0 5px 20px rgba(0,0,0,0.6)',
            maxWidth: '320px',
            minWidth: '200px',
            backdropFilter: 'blur(5px)'
        });

        $('body').append(popup);

        // Sau khi append, tính toán kích thước thực tế
        const popupWidth = popup.outerWidth() || 250;
        const popupHeight = popup.outerHeight() || 80;

        let transformStart = '';
        let transformEnd = '';

        if (isWindowOpen) {
            // Nổi lên dạng Toast ở giữa cạnh trên màn hình (hoặc ngay trên chat window)
            popup.css({
                top: '20px',
                left: '50%',
                marginLeft: `-${popupWidth / 2}px` // căn giữa
            });
            transformStart = 'translateY(-20px)';
            transformEnd = 'translateY(0)';
        } else if (floatBtn.length > 0) {
            // Nổi ra từ nút bong bóng
            const btnRect = floatBtn[0].getBoundingClientRect();
            const screenWidth = $(window).width() || 1920;
            const screenHeight = $(window).height() || 1080;
            
            let top = btnRect.top - (popupHeight / 2) + (btnRect.height / 2);
            let left = 0;
            
            // Mũi tên (Speech bubble tail)
            const arrow = $('<div class="kaiz-sys-arrow"></div>');
            arrow.css({
                position: 'absolute',
                width: '0',
                height: '0',
                borderStyle: 'solid',
                top: '50%',
                marginTop: '-8px'
            });

            // Kiểm tra nút bong bóng ở nửa trái hay phải màn hình
            if (btnRect.left > screenWidth / 2) {
                // Nút ở bên phải màn hình -> Popup nằm bên trái nút, mũi tên chỉ sang phải
                left = btnRect.left - popupWidth - 15;
                arrow.css({
                    right: '-9px',
                    borderWidth: '8px 0 8px 9px',
                    borderColor: 'transparent transparent transparent #7289da'
                });
                transformStart = 'translateX(15px)';
            } else {
                // Nút ở bên trái màn hình -> Popup nằm bên phải nút, mũi tên chỉ sang trái
                left = btnRect.right + 15;
                arrow.css({
                    left: '-9px',
                    borderWidth: '8px 9px 8px 0',
                    borderColor: 'transparent #7289da transparent transparent'
                });
                transformStart = 'translateX(-15px)';
            }
            transformEnd = 'translateX(0)';
            
            // Chống tràn màn hình dọc
            if (top < 10) top = 10;
            if (top + popupHeight > screenHeight - 10) {
                top = screenHeight - popupHeight - 10;
            }
            
            popup.css({ top: top + 'px', left: left + 'px' });
            popup.append(arrow);
        } else {
            // Fallback nếu không có cửa sổ và không có nút
            popup.css({ top: '20px', right: '20px' });
            transformStart = 'translateY(-20px)';
            transformEnd = 'translateY(0)';
        }

        // Apply starting transform
        popup.css('transform', transformStart);

        // Animate in
        setTimeout(() => {
            popup.css({
                opacity: 1,
                transform: transformEnd,
                pointerEvents: 'auto'
            });
        }, 10);

        // Remove logic
        let isRemoved = false;
        const removePopup = () => {
            if (isRemoved) return;
            isRemoved = true;
            popup.css({
                opacity: 0,
                transform: transformStart,
                pointerEvents: 'none'
            });
            setTimeout(() => popup.remove(), 300);
        };

        // Click to dismiss
        popup.on('click', removePopup);

        // Auto dismiss
        setTimeout(removePopup, timeout);

        return {
            content: 'Đã hiển thị thông báo Popup (Notification) thành công cho người dùng.',
        };
    },
};
