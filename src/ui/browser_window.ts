declare const jQuery: any;

export class BrowserWindowUI {
    private static $modal: any;
    private static $address: any;
    
    public static init() {
        const $ = jQuery;
        
        // Tìm element chính xác để tránh dính cache DOM cũ nếu bị reload
        this.$modal = $('.kaiz-browser-modal').last();
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

        // Nút mở trình duyệt từ header chat
        $('#kaiz-chat-browser-btn').on('click', () => {
            const dialog = this.$modal[0] as HTMLDialogElement;
            if (dialog && !dialog.open) {
                dialog.showModal();
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                if (iframe && iframe.src.includes('about:blank')) {
                    this.navigate('https://google.com');
                }
            }
        });

        // Đóng trình duyệt
        this.$modal.find('#kaiz-browser-close').on('click', () => {
            const dialog = this.$modal[0] as HTMLDialogElement;
            if (dialog && dialog.open) {
                dialog.close();
            }
        });

        // Điều hướng
        const go = () => {
            let url = this.$address.val().trim();
            if (url) {
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    if (url.includes(' ') || !url.includes('.')) {
                        // Tìm kiếm bằng google
                        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                    } else {
                        url = `https://${url}`;
                    }
                }
                this.navigate(url);
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
                iframe.src = iframe.src;
            }
        });

        // Back / Forward (Chỉ hoạt động ở cùng origin, nhưng vẫn thử)
        this.$modal.find('#kaiz-browser-back').on('click', () => {
            try {
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                if(iframe.contentWindow) iframe.contentWindow.history.back();
            } catch (e) {
                console.warn('[KaizAgent] Cannot use back() due to cross-origin.');
            }
        });
        
        this.$modal.find('#kaiz-browser-forward').on('click', () => {
            try {
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                if(iframe.contentWindow) iframe.contentWindow.history.forward();
            } catch (e) {
                console.warn('[KaizAgent] Cannot use forward() due to cross-origin.');
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
        
        // Thử cập nhật URL bar nếu iframe chuyển hướng (chỉ được nếu same-origin)
        this.$modal.find('iframe').on('load', () => {
            try {
                const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
                this.$address.css('background-color', ''); // Xóa màu loading
                const newUrl = iframe.contentWindow?.location.href;
                if (newUrl && !newUrl.includes('about:blank')) {
                    this.$address.val(newUrl);
                }
            } catch (e) {
                this.$address.css('background-color', ''); // Xóa màu loading
                // Cross-origin, ignore
            }
        });
    }

    private static navigate(url: string) {
        this.$address.val(url);
        // Hiệu ứng loading nhẹ ở thanh địa chỉ
        this.$address.css('background-color', '#eef2ff'); 
        
        const iframe = this.$modal.find('iframe')[0] as HTMLIFrameElement;
        if (iframe) {
            // Ép buộc load URL bằng mọi cách
            iframe.src = url;
        } else {
            alert("Lỗi: Không tìm thấy Iframe để hiển thị web!");
        }
    }
}
