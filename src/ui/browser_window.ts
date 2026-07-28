declare const jQuery: any;

export class BrowserWindowUI {
    private static $modal: any;
    private static $address: any;
    
    // Hệ thống lịch sử tự quản lý
    private static historyStack: string[] = [];
    private static historyIndex: number = -1;
    private static lastHistoryPushTime: number = 0;
    
    public static init() {
        const $ = jQuery;
        
        // Cập nhật: bây giờ nó là một phần của chat window, không phải modal riêng
        this.$modal = $('#kaiz-browser-container').last();
        this.$address = this.$modal.find('.kaiz-browser-address');

        // Khởi tạo thẻ iframe động vì SillyTavern DOMPurify sẽ xóa thẻ <iframe> tĩnh trong file HTML
        const container = this.$modal.find('#kaiz-browser-iframe-container');
        if (container.length > 0 && container.find('iframe').length === 0) {
            const iframe = document.createElement('iframe');
            iframe.id = 'kaiz-browser-iframe';
            iframe.src = 'about:blank';
            iframe.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background-color: #ffffff; display: block; z-index: 5;';
            container.append(iframe);
        }

        // Nút mở trình duyệt từ header chat (toggle split-screen)
        $('#kaiz-chat-browser-btn').on('click', () => {
            const $chatWindow = $('#kaiz-chat-window');
            $chatWindow.toggleClass('kaiz-browser-mode');
            
            // Nếu vừa bật mode browser, thì load trang mặc định nếu đang trống
            if ($chatWindow.hasClass('kaiz-browser-mode')) {
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                if (iframe && iframe.src.includes('about:blank')) {
                    this.goToUrl('https://google.com');
                }
            }
        });

        // Đóng trình duyệt
        this.$modal.find('#kaiz-browser-close').on('click', () => {
            $('#kaiz-chat-window').removeClass('kaiz-browser-mode');
        });

        // Điều hướng
        const go = () => {
            let url = this.$address.val().trim();
            if (url) {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    if (url.includes(' ') || !url.includes('.')) {
                        // Tìm kiếm bằng google (Dùng tham số bí mật igu=1 để bypass X-Frame-Options)
                        url = `https://www.google.com/search?q=${encodeURIComponent(url)}&igu=1`;
                    } else {
                        url = `https://${url}`;
                    }
                }
                
                this.goToUrl(url);
            }
        };

        this.$modal.find('#kaiz-browser-go').on('click', go);
        this.$address.on('keyup', (e: any) => {
            if (e.key === 'Enter') {
                go();
            }
        });

        this.$modal.find('#kaiz-browser-reload').on('click', () => {
            const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
            if (iframe && iframe.src && !iframe.src.includes('about:blank')) {
                // Ép load lại
                const current = iframe.src;
                iframe.src = 'about:blank';
                setTimeout(() => { iframe.src = current; }, 50);
            }
        });

        // Hệ thống Back / Forward tự xây dựng
        this.$modal.find('#kaiz-browser-back').on('click', () => {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                const prevUrl = this.historyStack[this.historyIndex];
                this.navigate(prevUrl, false);
            }
        });
        
        this.$modal.find('#kaiz-browser-forward').on('click', () => {
            if (this.historyIndex < this.historyStack.length - 1) {
                this.historyIndex++;
                const nextUrl = this.historyStack[this.historyIndex];
                this.navigate(nextUrl, false);
            }
        });

        // Bấm chia sẻ trang cho AI
        this.$modal.find('#kaiz-browser-share').on('click', () => {
            const url = this.$address.val().trim();
            if (!url) return;

            // Đưa URL vào thanh chat
            const $chatInput = $('#kaiz-chat-input');
            const currentText = $chatInput.val();
            const shareText = `Hãy xem trang web này: ${url}\n`;
            
            $chatInput.val(currentText ? currentText + '\n' + shareText : shareText);
            
            // Highlight nút gửi hoặc focus vào input
            $chatInput.focus();
        });
        
        // Cập nhật lại thanh địa chỉ nếu iframe load xong (chỉ read được nếu same-origin)
        this.$modal.find('iframe').on('load', () => {
            try {
                this.$address.css('background-color', ''); // Xóa màu loading
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                const newUrl = iframe.contentWindow?.location.href;
                if (newUrl && !newUrl.includes('about:blank')) {
                    this.$address.val(newUrl);
                    // Nếu url thay đổi do click link bên trong, có thể cập nhật lại state hiện tại
                    if (this.historyIndex >= 0 && this.historyStack[this.historyIndex] !== newUrl) {
                        this.historyStack[this.historyIndex] = newUrl;
                    }
                }
            } catch (e) {
                this.$address.css('background-color', ''); // Xóa màu loading
                // Cross-origin: Không thể đọc được URL mới nếu người dùng click link bên trong trang web khác domain.
            }
        });

        // Lắng nghe message từ Tampermonkey (Content Script) để bắt sự kiện đổi URL trong Iframe
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'KAIZ_IFRAME_URL' && event.data.url) {
                const newUrl = event.data.url;
                // Nếu URL nhận được khác với URL hiện tại trên thanh địa chỉ
                if (this.$address.val() !== newUrl) {
                    this.$address.val(newUrl);
                    
                    const now = Date.now();
                    // Nếu thời gian thay đổi URL quá nhanh (dưới 1.5s), khả năng cao là link rác do redirect xen giữa
                    // Ta sẽ ghi đè lịch sử hiện tại thay vì đẩy (push) lịch sử mới
                    if (now - this.lastHistoryPushTime < 1500 && this.historyIndex >= 0) {
                        this.historyStack[this.historyIndex] = newUrl;
                        this.lastHistoryPushTime = now; // Gia hạn thêm thời gian debounce
                    } 
                    // Ngược lại, cập nhật lịch sử tạo điểm neo mới
                    else if (this.historyStack[this.historyIndex] !== newUrl) {
                        // Xóa tương lai nếu đang ở quá khứ
                        if (this.historyIndex < this.historyStack.length - 1) {
                            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
                        }
                        this.historyStack.push(newUrl);
                        this.historyIndex++;
                        this.lastHistoryPushTime = now;
                    }
                }
            }
        });
    }

    private static goToUrl(url: string) {
        // Xử lý chung các trường hợp bypass iframe block cho Google
        if (url === 'https://google.com' || url === 'https://www.google.com' || url === 'https://google.com/' || url === 'https://www.google.com/') {
            url = 'https://www.google.com/webhp?igu=1';
        } else if (url.startsWith('https://www.google.com/search?') && !url.includes('igu=1')) {
            url += '&igu=1';
        }

        // Cắt bỏ phần history tương lai nếu đang ở quá khứ mà lại nhập URL mới
        if (this.historyIndex < this.historyStack.length - 1) {
            this.historyStack = this.historyStack.slice(0, this.historyIndex + 1);
        }
        
        if (this.historyStack[this.historyIndex] !== url) {
            this.historyStack.push(url);
            this.historyIndex++;
            this.lastHistoryPushTime = Date.now();
        }
        
        this.navigate(url, true);
    }

    private static navigate(url: string, forceReload: boolean) {
        this.$address.val(url);
        // Hiệu ứng loading nhẹ ở thanh địa chỉ
        this.$address.css('background-color', '#eef2ff'); 
        
        const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
        if (iframe) {
            if (forceReload) {
                iframe.src = 'about:blank';
                setTimeout(() => { iframe.src = url; }, 50);
            } else {
                iframe.src = url;
            }
        } else {
            alert("Lỗi: Không tìm thấy Iframe để hiển thị web!");
        }
    }
}
