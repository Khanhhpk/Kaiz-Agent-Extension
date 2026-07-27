declare const jQuery: any;

export class BrowserWindowUI {
    private static $modal: any;
    private static $iframe: any;
    private static $address: any;
    
    public static init() {
        const $ = jQuery;
        
        this.$modal = $('#kaiz-browser-modal');
        this.$iframe = $('#kaiz-browser-iframe');
        this.$address = $('#kaiz-browser-address');

        // Nút mở trình duyệt từ header chat
        $('#kaiz-chat-browser-btn').on('click', () => {
            const dialog = this.$modal[0] as HTMLDialogElement;
            if (dialog && !dialog.open) {
                dialog.showModal();
                if (this.$iframe.attr('src') === 'about:blank') {
                    this.navigate('https://google.com');
                }
            }
        });

        // Đóng trình duyệt
        $('#kaiz-browser-close').on('click', () => {
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

        $('#kaiz-browser-go').on('click', go);
        this.$address.on('keyup', (e: any) => {
            if (e.key === 'Enter') {
                go();
            }
        });

        $('#kaiz-browser-reload').on('click', () => {
            const currentSrc = this.$iframe.attr('src');
            if (currentSrc && currentSrc !== 'about:blank') {
                this.$iframe.attr('src', currentSrc);
            }
        });

        // Back / Forward (Chỉ hoạt động ở cùng origin, nhưng vẫn thử)
        $('#kaiz-browser-back').on('click', () => {
            try {
                this.$iframe[0].contentWindow.history.back();
            } catch (e) {
                console.warn('[KaizAgent] Cannot use back() due to cross-origin.');
            }
        });
        
        $('#kaiz-browser-forward').on('click', () => {
            try {
                this.$iframe[0].contentWindow.history.forward();
            } catch (e) {
                console.warn('[KaizAgent] Cannot use forward() due to cross-origin.');
            }
        });

        // Bấm chia sẻ trang cho AI
        $('#kaiz-browser-share').on('click', () => {
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
        this.$iframe.on('load', () => {
            try {
                const newUrl = this.$iframe[0].contentWindow.location.href;
                if (newUrl && newUrl !== 'about:blank') {
                    this.$address.val(newUrl);
                }
            } catch (e) {
                // Cross-origin, ignore
            }
        });
    }

    private static navigate(url: string) {
        this.$address.val(url);
        this.$iframe.attr('src', url);
    }
}
