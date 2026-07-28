// ==UserScript==
// @name         Kaiz Browser Companion
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Hỗ trợ và tối ưu hóa Kaiz Browser trong SillyTavern. Hỗ trợ SPA, bắt URL, chống đá văng và trị Google.
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

})();
