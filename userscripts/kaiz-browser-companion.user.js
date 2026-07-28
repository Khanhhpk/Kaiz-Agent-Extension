// ==UserScript==
// @name         Kaiz Browser Companion
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Hỗ trợ Kaiz Browser. Computer Use Bridge cho Agent, SPA, bắt URL, chống đá văng và trị Google.
// @author       Kaiz
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Chỉ chạy nếu trang đang nằm trong iframe (bên trong Kaiz Browser)
    if (window.self === window.top) return;

    // ==========================================
    // TÍNH NĂNG 1: BẮT URL GỬI VỀ KAIZ BROWSER
    // ==========================================
    const sendUrlToKaiz = () => {
        window.top.postMessage({
            type: 'KAIZ_IFRAME_URL',
            url: location.href,
            title: document.title
        }, '*');
    };

    // Gửi URL ngay khi trang bắt đầu tải và khi load xong (để lấy chính xác title)
    sendUrlToKaiz();
    window.addEventListener('DOMContentLoaded', sendUrlToKaiz);
    window.addEventListener('load', sendUrlToKaiz);

    // ==========================================
    // TÍNH NĂNG 2: HỖ TRỢ CÁC TRANG SPA (YouTube, Twitter, Facebook)
    // Các trang này không load lại toàn bộ trang mà chỉ đổi URL bằng History API
    // ==========================================
    
    // Bắt sự kiện khi trang dùng hàm pushState
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        sendUrlToKaiz();
    };

    // Bắt sự kiện khi trang dùng hàm replaceState
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        sendUrlToKaiz();
    };

    // Lắng nghe sự kiện popstate
    window.addEventListener('popstate', sendUrlToKaiz);

    // ==========================================
    // TÍNH NĂNG 3: LẮNG NGHE THAY ĐỔI TITLE
    // ==========================================
    let lastTitle = document.title;
    const titleObserver = new MutationObserver(() => {
        if (document.title !== lastTitle) {
            lastTitle = document.title;
            sendUrlToKaiz();
        }
    });
    
    window.addEventListener('DOMContentLoaded', () => {
        const titleEl = document.querySelector('title');
        if (titleEl) {
            titleObserver.observe(titleEl, { childList: true });
        }
    });

    // Fix đặc biệt cho YouTube
    if (location.hostname.includes('youtube.com')) {
        document.addEventListener('yt-navigate-finish', sendUrlToKaiz);
    }

    // ==========================================
    // TÍNH NĂNG 4: CHỐNG ĐÁ VĂNG (FRAME-BUSTING) & TRỊ GOOGLE
    // ==========================================
    document.addEventListener('click', function(e) {
        let a = e.target.closest('a');
        if (a) {
            // Ép target về _self để không bị bật tab mới hoặc nhảy ra khỏi iframe
            let target = a.getAttribute('target');
            if (target === '_top' || target === '_parent' || target === '_blank') {
                a.setAttribute('target', '_self');
            }

            // Trị đặc biệt cho Google Search (Google dùng JS để đá văng người dùng)
            if (location.hostname.includes('google.com') || location.hostname.includes('google.com.vn')) {
                e.stopPropagation(); // Phế võ công JS của Google

                // Trích xuất link thật sự (bỏ qua url tracking rườm rà của Google)
                let href = a.getAttribute('href');
                if (href && href.startsWith('/url?')) {
                    let urlParams = new URLSearchParams(href.split('?')[1]);
                    let realUrl = urlParams.get('url') || urlParams.get('q');
                    if (realUrl) {
                        a.setAttribute('href', realUrl);
                    }
                }
            }
        }
    }, true); // Dùng capture phase để chặn trước khi JS của web kịp chạy

    // ==========================================
    // TÍNH NĂNG 5: KAIZ AGENT COMPUTER USE BRIDGE
    // ==========================================
    window.kaizElementMap = new Map();
    let nextElementId = 1;

    const isElementVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && 
               style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
               rect.top >= 0 && rect.left >= 0 &&
               rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
               rect.right <= (window.innerWidth || document.documentElement.clientWidth);
    };

    window.addEventListener('message', (event) => {
        if (event.source !== window.top) return;
        if (!event.data || event.data.type !== 'KAIZ_AGENT_COMMAND') return;

        const cmd = event.data.command;
        const msgId = event.data.msgId;

        const respond = (success, data, error) => {
            window.top.postMessage({
                type: 'KAIZ_AGENT_RESPONSE',
                msgId: msgId,
                success: success,
                data: data,
                error: error
            }, '*');
        };

        try {
            if (cmd === 'READ_PAGE') {
                window.kaizElementMap.clear();
                nextElementId = 1;
                
                const interactables = [];
                // Chọn các phần tử tương tác
                const elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [onclick]');
                
                elements.forEach(el => {
                    if (isElementVisible(el)) {
                        const id = nextElementId++;
                        window.kaizElementMap.set(id, el);
                        
                        let text = el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('title') || '';
                        text = text.trim().substring(0, 100).replace(/\n/g, ' '); // Giới hạn độ dài, xóa xuống dòng
                        
                        let type = el.tagName.toLowerCase();
                        if (type === 'input') type += `:${el.type}`;
                        
                        if (text || type === 'input:text' || type === 'input:password' || type === 'input:search' || type === 'textarea') {
                            interactables.push(`[ID: ${id}] ${type} - ${text}`);
                        }
                    }
                });

                // Lấy nội dung text chính
                let mainText = document.body.innerText;
                // Giới hạn độ dài để không tràn token
                if (mainText.length > 8000) {
                    mainText = mainText.substring(0, 8000) + '... (trang quá dài, hãy cuộn xuống để xem thêm)';
                }

                respond(true, {
                    url: location.href,
                    title: document.title,
                    interactables: interactables,
                    mainText: mainText
                });
            }
            else if (cmd === 'CLICK') {
                const id = event.data.elementId;
                const el = window.kaizElementMap.get(id);
                if (el) {
                    el.click();
                    // Fallback focus nếu click không kích hoạt input
                    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
                        el.focus();
                    }
                    respond(true, { message: `Clicked element [ID: ${id}]` });
                } else {
                    respond(false, null, `Element [ID: ${id}] not found or not in viewport.`);
                }
            }
            else if (cmd === 'TYPE') {
                const id = event.data.elementId;
                const text = event.data.text;
                const el = window.kaizElementMap.get(id);
                if (el && ('value' in el)) {
                    el.focus();
                    el.value = text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    respond(true, { message: `Typed text into [ID: ${id}]` });
                } else {
                    respond(false, null, `Input element [ID: ${id}] not found or not editable.`);
                }
            }
            else if (cmd === 'PRESS_KEY') {
                const id = event.data.elementId;
                const key = event.data.key || 'Enter';
                const el = window.kaizElementMap.get(id);
                if (el) {
                    el.focus();
                    // Giả lập sự kiện bấm phím Enter
                    const keyEvent = new KeyboardEvent('keydown', {
                        bubbles: true, cancelable: true, key: key, code: key === 'Enter' ? 'Enter' : key
                    });
                    el.dispatchEvent(keyEvent);
                    const keyUpEvent = new KeyboardEvent('keyup', {
                        bubbles: true, cancelable: true, key: key, code: key === 'Enter' ? 'Enter' : key
                    });
                    el.dispatchEvent(keyUpEvent);
                    
                    // Thử trigger form submit nếu có
                    if (key === 'Enter' && el.form) {
                        el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                    respond(true, { message: `Pressed ${key} on element [ID: ${id}]` });
                } else {
                    respond(false, null, `Element [ID: ${id}] not found.`);
                }
            }
            else if (cmd === 'SCROLL') {
                const dir = event.data.direction; // 'up' or 'down'
                const amount = window.innerHeight * 0.8;
                if (dir === 'up') {
                    window.scrollBy(0, -amount);
                } else {
                    window.scrollBy(0, amount);
                }
                setTimeout(() => {
                    respond(true, { message: `Scrolled ${dir}` });
                }, 200); // Đợi scroll một chút để giao diện cập nhật
            }
        } catch (err) {
            respond(false, null, err.message);
        }
    });

})();
