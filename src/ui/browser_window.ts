declare const jQuery: any;

interface BrowserTab {
    id: string;
    iframe: HTMLIFrameElement;
    historyStack: string[];
    historyIndex: number;
    lastHistoryPushTime: number;
    title: string;
}

interface WebHistoryItem {
    url: string;
    title: string;
    timestamp: number;
}

export class BrowserWindowUI {
    private static $modal: any;
    private static $address: any;

    private static tabs: BrowserTab[] = [];
    private static activeTabId: string | null = null;
    private static agentCommandCallbacks = new Map<string, { resolve: Function; reject: Function; timer: any }>();

    public static destroyAll() {
        this.tabs.forEach((tab) => {
            tab.iframe.src = 'about:blank';
            tab.iframe.remove();
        });
        this.tabs = [];
        this.activeTabId = null;
        this.updateTabUI();
    }

    public static init() {
        const $ = jQuery;

        this.$modal = $('#kaiz-browser-container').last();
        this.$address = this.$modal.find('.kaiz-browser-address');

        // Khởi tạo tab đầu tiên nếu chưa có
        if (this.tabs.length === 0) {
            this.createNewTab('https://www.google.com/webhp?igu=1');
        }

        // Nút mở trình duyệt từ header chat (toggle split-screen)
        $('#kaiz-chat-browser-btn').on('click', () => {
            const $chatWindow = $('#kaiz-chat-window');
            $chatWindow.toggleClass('kaiz-browser-mode');
            // Tự động tạo tab mới nếu đang trống (do clear hoặc bị tắt hết)
            if ($chatWindow.hasClass('kaiz-browser-mode') && this.tabs.length === 0) {
                this.createNewTab('https://www.google.com/webhp?igu=1');
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
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.iframe.src && !activeTab.iframe.src.includes('about:blank')) {
                const current = activeTab.iframe.src;
                activeTab.iframe.src = 'about:blank';
                setTimeout(() => {
                    activeTab.iframe.src = current;
                }, 50);
            }
        });

        // Nút trang chủ
        this.$modal.find('#kaiz-browser-home').on('click', () => {
            this.goToUrl('https://www.google.com/webhp?igu=1');
        });

        // Hệ thống Tabs UI
        $('#kaiz-browser-new-tab').on('click', () => {
            this.createNewTab('https://www.google.com/webhp?igu=1');
        });

        // Bấm chia sẻ trang
        this.$modal.find('#kaiz-browser-share').on('click', () => {
            const url = this.$address.val().trim();
            if (!url) return;
            const $chatInput = $('#kaiz-chat-input');
            const currentText = $chatInput.val();
            const shareText = `Hãy xem trang web này: ${url}\n`;
            $chatInput.val(currentText ? currentText + '\n' + shareText : shareText);
            $chatInput.focus();
        });

        // Modal Lịch sử
        $('#kaiz-browser-history-btn').on('click', () => {
            this.renderHistoryModal();
            (document.getElementById('kaiz-web-history-modal') as any).showModal();
        });
        $('#kaiz-web-history-close').on('click', () => {
            (document.getElementById('kaiz-web-history-modal') as any).close();
        });
        $('#kaiz-web-history-clear-all').on('click', () => {
            if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử?')) {
                localStorage.removeItem('kaiz_web_history');
                this.renderHistoryModal();
            }
        });

        // Thuật toán Back / Forward thông minh
        this.$modal.find('#kaiz-browser-back').on('click', () => {
            const tab = this.getActiveTab();
            if (tab && tab.historyIndex > 0) {
                tab.historyIndex--;
                const prevUrl = tab.historyStack[tab.historyIndex];
                this.navigate(tab, prevUrl, false);
            }
        });

        this.$modal.find('#kaiz-browser-forward').on('click', () => {
            const tab = this.getActiveTab();
            if (tab && tab.historyIndex < tab.historyStack.length - 1) {
                tab.historyIndex++;
                const nextUrl = tab.historyStack[tab.historyIndex];
                this.navigate(tab, nextUrl, false);
            }
        });

        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'KAIZ_IFRAME_URL' && event.data.url) {
                const activeTab = this.getActiveTab();
                if (!activeTab) return;

                if (event.source !== activeTab.iframe.contentWindow) {
                    return;
                }

                const newUrl = event.data.url;

                // Cập nhật title nếu có
                if (event.data.title && event.data.title !== activeTab.title) {
                    activeTab.title = event.data.title;
                } else if (activeTab.title === 'New Tab') {
                    activeTab.title = newUrl.replace('https://', '').replace('http://', '').replace('www.', '');
                }
                this.updateTabUI();

                // Lưu vào Global History
                this.saveToGlobalHistory(newUrl, activeTab.title);

                if (this.$address.val() !== newUrl) {
                    this.$address.val(newUrl);

                    const now = Date.now();

                    // Thuật toán nhận dạng Back / Forward từ web bên trong iframe
                    if (activeTab.historyIndex > 0 && activeTab.historyStack[activeTab.historyIndex - 1] === newUrl) {
                        activeTab.historyIndex--;
                        activeTab.lastHistoryPushTime = now;
                    } else if (
                        activeTab.historyIndex < activeTab.historyStack.length - 1 &&
                        activeTab.historyStack[activeTab.historyIndex + 1] === newUrl
                    ) {
                        activeTab.historyIndex++;
                        activeTab.lastHistoryPushTime = now;
                    } else if (now - activeTab.lastHistoryPushTime < 1500 && activeTab.historyIndex >= 0) {
                        activeTab.historyStack[activeTab.historyIndex] = newUrl;
                        activeTab.lastHistoryPushTime = now;
                    } else if (activeTab.historyStack[activeTab.historyIndex] !== newUrl) {
                        if (activeTab.historyIndex < activeTab.historyStack.length - 1) {
                            activeTab.historyStack = activeTab.historyStack.slice(0, activeTab.historyIndex + 1);
                        }
                        activeTab.historyStack.push(newUrl);
                        activeTab.historyIndex++;
                        activeTab.lastHistoryPushTime = now;
                    }
                }
            } else if (event.data && event.data.type === 'KAIZ_AGENT_RESPONSE') {
                const cb = this.agentCommandCallbacks.get(event.data.msgId);
                if (cb) {
                    clearTimeout(cb.timer);
                    this.agentCommandCallbacks.delete(event.data.msgId);
                    if (event.data.success) {
                        cb.resolve(event.data.data);
                    } else {
                        cb.reject(new Error(event.data.error || 'Unknown execution error'));
                    }
                }
            }
        });

        this.initResizer();
    }

    private static createNewTab(url: string) {
        const id = 'tab_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

        const iframe = document.createElement('iframe');
        iframe.id = 'iframe_' + id;
        iframe.src = url;
        iframe.setAttribute(
            'sandbox',
            'allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
        );
        iframe.style.cssText =
            'position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; background-color: #ffffff; display: none; z-index: 5;';

        this.$modal.find('#kaiz-browser-iframe-container').append(iframe);

        const newTab: BrowserTab = {
            id,
            iframe,
            historyStack: [url],
            historyIndex: 0,
            lastHistoryPushTime: Date.now(),
            title: 'New Tab',
        };

        this.tabs.push(newTab);
        this.switchTab(id);
        this.updateTabUI();
    }

    private static switchTab(id: string) {
        this.activeTabId = id;
        this.tabs.forEach((tab) => {
            if (tab.id === id) {
                tab.iframe.style.display = 'block';
                this.$address.val(tab.historyStack[tab.historyIndex]);
            } else {
                tab.iframe.style.display = 'none';
            }
        });
        this.updateTabUI();
    }

    private static closeTab(id: string, e: any) {
        e.stopPropagation();

        const index = this.tabs.findIndex((t) => t.id === id);
        if (index > -1) {
            const tab = this.tabs[index];
            tab.iframe.remove();
            this.tabs.splice(index, 1);

            if (this.tabs.length === 0) {
                this.createNewTab('https://www.google.com/webhp?igu=1');
            } else if (this.activeTabId === id) {
                // Chuyển sang tab bên trái nó
                const nextIndex = Math.max(0, index - 1);
                this.switchTab(this.tabs[nextIndex].id);
            } else {
                this.updateTabUI();
            }
        }
    }

    private static updateTabUI() {
        const $ = jQuery;
        const $list = $('#kaiz-browser-tabs-list');
        $list.empty();

        this.tabs.forEach((tab) => {
            const titleDisplay = tab.title.length > 20 ? tab.title.substring(0, 20) + '...' : tab.title;
            const $tab = $(`
                <div class="kaiz-browser-tab ${this.activeTabId === tab.id ? 'active-tab' : ''}" title="${tab.title}">
                    <div class="kaiz-browser-tab-title">${titleDisplay}</div>
                    <div class="kaiz-browser-tab-close"><i class="fa-solid fa-xmark"></i></div>
                </div>
            `);

            $tab.on('click', () => this.switchTab(tab.id));
            $tab.find('.kaiz-browser-tab-close').on('click', (e: any) => this.closeTab(tab.id, e));

            $list.append($tab);
        });
    }

    private static getActiveTab(): BrowserTab | null {
        return this.tabs.find((t) => t.id === this.activeTabId) || null;
    }

    private static goToUrl(url: string) {
        if (
            url === 'https://google.com' ||
            url === 'https://www.google.com' ||
            url === 'https://google.com/' ||
            url === 'https://www.google.com/'
        ) {
            url = 'https://www.google.com/webhp?igu=1';
        } else if (url.startsWith('https://www.google.com/search?') && !url.includes('igu=1')) {
            url += '&igu=1';
        }

        const tab = this.getActiveTab();
        if (!tab) return;

        if (tab.historyIndex < tab.historyStack.length - 1) {
            tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
        }

        if (tab.historyStack[tab.historyIndex] !== url) {
            tab.historyStack.push(url);
            tab.historyIndex++;
            tab.lastHistoryPushTime = Date.now();
        }

        this.navigate(tab, url, true);
    }

    private static navigate(tab: BrowserTab, url: string, forceReload: boolean) {
        this.$address.val(url);

        if (forceReload) {
            tab.iframe.src = 'about:blank';
            setTimeout(() => {
                tab.iframe.src = url;
            }, 50);
        } else {
            tab.iframe.src = url;
        }

        this.saveToGlobalHistory(url, url);
    }

    /**
     * Executes a command on the active tab's iframe via Tampermonkey
     */
    public static executeAgentCommand(command: string, args: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.activeTabId) {
                return reject(new Error('No active browser tab.'));
            }
            const activeTab = this.getActiveTab();
            if (!activeTab || !activeTab.iframe.contentWindow) {
                return reject(new Error('Iframe is not ready.'));
            }

            // Xử lý các lệnh đặc biệt không cần gọi xuống Tampermonkey
            if (command === 'NAVIGATE') {
                if (args.url) {
                    this.goToUrl(args.url);
                    return resolve({ message: `Đang điều hướng đến ${args.url}...` });
                }
                return reject(new Error('Missing URL for NAVIGATE'));
            }
            if (command === 'GO_BACK') {
                this.$modal.find('#kaiz-browser-back').click();
                return resolve({ message: `Đã nhấn nút Quay lại (Back).` });
            }

            const msgId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            const payload = {
                type: 'KAIZ_AGENT_COMMAND',
                command: command,
                msgId: msgId,
                ...args,
            };

            const timer = setTimeout(() => {
                if (this.agentCommandCallbacks.has(msgId)) {
                    this.agentCommandCallbacks.delete(msgId);
                    reject(
                        new Error(
                            `Command ${command} timed out after 10s. Vui lòng cài đặt script Tampermonkey v4.0 mới nhất.`,
                        ),
                    );
                }
            }, 10000);

            this.agentCommandCallbacks.set(msgId, { resolve, reject, timer });

            // Gửi lệnh xuống iframe
            activeTab.iframe.contentWindow.postMessage(payload, '*');
        });
    }

    private static saveToGlobalHistory(url: string, title: string) {
        if (url.includes('about:blank')) return;

        try {
            const raw = localStorage.getItem('kaiz_web_history');
            let history: WebHistoryItem[] = raw ? JSON.parse(raw) : [];

            history = history.filter((h) => h.url !== url);

            history.unshift({
                url,
                title,
                timestamp: Date.now(),
            });

            if (history.length > 200) {
                history = history.slice(0, 200);
            }

            localStorage.setItem('kaiz_web_history', JSON.stringify(history));
        } catch (e) {}
    }

    private static renderHistoryModal() {
        const $ = jQuery;
        const $list = $('#kaiz-web-history-list');
        $list.empty();

        try {
            const raw = localStorage.getItem('kaiz_web_history');
            if (!raw) return;
            const history: WebHistoryItem[] = JSON.parse(raw);

            history.forEach((item) => {
                const date = new Date(item.timestamp);
                const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} ${date.getDate()}/${date.getMonth() + 1}`;

                const $el = $(`
                    <div class="kaiz-history-item" title="${item.url}">
                        <div class="kaiz-history-title">${item.title}</div>
                        <div class="kaiz-history-url">${item.url}</div>
                        <div class="kaiz-history-time">${timeStr}</div>
                    </div>
                `);

                $el.on('click', () => {
                    this.goToUrl(item.url);
                    (document.getElementById('kaiz-web-history-modal') as any).close();
                });

                $list.append($el);
            });
        } catch (e) {}
    }

    private static initResizer() {
        const $ = jQuery;
        const $resizer = $('#kaiz-split-resizer');
        const $chatWindow = $('#kaiz-chat-window');
        const chatWindowEl = $chatWindow[0] as HTMLElement;

        if (!chatWindowEl) return;

        const savedWidth = localStorage.getItem('kaiz_chat_split_width');
        const savedHeight = localStorage.getItem('kaiz_chat_split_height');

        if (savedWidth) chatWindowEl.style.setProperty('--kaiz-chat-width', savedWidth + 'px');
        if (savedHeight) chatWindowEl.style.setProperty('--kaiz-chat-height', savedHeight + 'px');

        let isDragging = false;
        let isVertical = false;

        $resizer.on('mousedown', (e: any) => {
            if (!$chatWindow.hasClass('kaiz-browser-mode')) return;
            isDragging = true;
            isVertical = window.innerWidth <= 900;
            $resizer.addClass('active');
            $('#kaiz-browser-container').css('pointer-events', 'none');
            $('body').css('user-select', 'none');
            e.preventDefault();
        });

        $(document).on('mousemove', (e: any) => {
            if (!isDragging) return;
            if (isVertical) {
                const totalHeight = window.innerHeight;
                let newHeight = totalHeight - e.clientY;
                if (newHeight < 100) newHeight = 100;
                if (newHeight > totalHeight - 100) newHeight = totalHeight - 100;
                chatWindowEl.style.setProperty('--kaiz-chat-height', newHeight + 'px');
                localStorage.setItem('kaiz_chat_split_height', newHeight.toString());
            } else {
                const totalWidth = window.innerWidth;
                let newWidth = totalWidth - e.clientX;
                if (newWidth < 250) newWidth = 250;
                if (newWidth > totalWidth - 300) newWidth = totalWidth - 300;
                chatWindowEl.style.setProperty('--kaiz-chat-width', newWidth + 'px');
                localStorage.setItem('kaiz_chat_split_width', newWidth.toString());
            }
        });

        $(document).on('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                $resizer.removeClass('active');
                $('#kaiz-browser-container').css('pointer-events', 'auto');
                $('body').css('user-select', '');
            }
        });
    }
}
