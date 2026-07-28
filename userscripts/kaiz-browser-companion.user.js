// ==UserScript==
// @name         Kaiz Browser Companion
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Hỗ trợ và tối ưu hóa Kaiz Browser trong SillyTavern. Hỗ trợ bắt URL cho các trang SPA (YouTube, Twitter, Facebook).
// @author       Kaiz
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Chỉ chạy nếu trang đang nằm trong iframe (bên trong Kaiz Browser)
    if (window.self === window.top) return;

    // Hàm gửi URL về Kaiz Browser
    const sendUrlToKaiz = () => {
        window.top.postMessage({
            type: 'KAIZ_IFRAME_URL',
            url: location.href,
            title: document.title
        }, '*');
    };

    // 2. Gửi URL ngay khi trang bắt đầu tải và khi load xong (để lấy chính xác title)
    sendUrlToKaiz();
    window.addEventListener('DOMContentLoaded', sendUrlToKaiz);
    window.addEventListener('load', sendUrlToKaiz);

    // ==========================================
    // 3. HỖ TRỢ CÁC TRANG SPA (YouTube, Twitter, Facebook, Web Truyện mới...)
    // Các trang này không load lại toàn bộ trang mà chỉ đổi URL bằng History API
    // ==========================================
    
    // Bắt sự kiện khi trang dùng hàm pushState (click vào link mới)
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

    // Lắng nghe sự kiện popstate (khi user bấm back/forward trong iframe nhưng web không load lại)
    window.addEventListener('popstate', sendUrlToKaiz);

    // ==========================================
    // 4. LẮNG NGHE THAY ĐỔI TITLE
    // Rất quan trọng cho YouTube vì title thay đổi sau khi đổi video
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

    // ==========================================
    // 5. FIX ĐẶC BIỆT CHO YOUTUBE (Tùy chọn)
    // ==========================================
    if (location.hostname.includes('youtube.com')) {
        // Fix lỗi click link trong youtube không cập nhật URL ngay lập tức
        document.addEventListener('yt-navigate-finish', sendUrlToKaiz);
    }
})();
