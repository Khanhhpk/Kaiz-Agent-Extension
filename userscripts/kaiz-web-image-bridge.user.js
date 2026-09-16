// ==UserScript==
// @name         Kaiz Web Image Bridge (SillyTavern <-> Gemini / ChatGPT)
// @namespace    https://github.com/Khanhhpk/Kaiz-Agent-Extension
// @version      1.2.0
// @description  Cầu nối truyền prompt vẽ ảnh từ SillyTavern sang Gemini Web (Imagen 3) / ChatGPT Web (DALL-E 3) và chuyển ảnh về SillyTavern.
// @author       Kaiz
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @match        https://gemini.google.com/*
// @match        https://chatgpt.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_xmlhttpRequest
// @noframes
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // BẢO VỆ CỐT LÕI: Tuyệt đối chỉ chạy trong cửa sổ chính (top window), bỏ qua toàn bộ iframe con (Google Ads, auth, ...)
    if (window.self !== window.top) {
        return;
    }

    const IS_ST = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const IS_GEMINI = location.hostname === 'gemini.google.com';
    const IS_CHATGPT = location.hostname === 'chatgpt.com';

    // =========================================================================
    // 1. CONTEXT: SILLYTAVERN (CẦU NỐI CỤC BỘ)
    // =========================================================================
    if (IS_ST) {
        console.log('[Kaiz Bridge] Userscript loaded on SillyTavern (Top-level window).');

        // Lắng nghe yêu cầu vẽ ảnh từ SillyTavern Extension qua postMessage
        // Lưu ý: Không kiểm tra event.source !== window vì sandbox của Tampermonkey
        window.addEventListener('message', (event) => {
            if (!event.data) return;

            if (event.data.type === 'KAIZ_BRIDGE_IMAGE_REQUEST') {
                const job = event.data.payload;
                console.log('[Kaiz Bridge][ST] 🚀 Nhận yêu cầu vẽ từ ST:', job);
                GM_setValue('KAIZ_PENDING_JOB', {
                    id: job.id,
                    target: job.target || 'gemini',
                    prompt: job.prompt,
                    timestamp: Date.now(),
                });
            } else if (event.data.type === 'KAIZ_BRIDGE_PING') {
                window.postMessage({ type: 'KAIZ_BRIDGE_PONG', version: '1.2.0' }, '*');
            }
        });

        // Lắng nghe kết quả từ Web trả về qua GM_addValueChangeListener
        GM_addValueChangeListener('KAIZ_JOB_RESULT', (name, oldValue, newValue) => {
            if (!newValue || !newValue.id) return;
            console.log('[Kaiz Bridge][ST] 📦 Nhận kết quả từ Web:', newValue.id, newValue.status);
            window.postMessage(
                {
                    type: 'KAIZ_BRIDGE_IMAGE_RESPONSE',
                    payload: newValue,
                },
                '*',
            );
        });

        // Lắng nghe nhịp tim (Heartbeat) từ các tab Web
        GM_addValueChangeListener('KAIZ_HEARTBEAT', (name, oldValue, newValue) => {
            if (!newValue) return;
            window.postMessage(
                {
                    type: 'KAIZ_BRIDGE_HEARTBEAT_UPDATE',
                    payload: newValue,
                },
                '*',
            );
        });

        return;
    }

    // =========================================================================
    // 2. CONTEXT: WEB (GEMINI / CHATGPT)
    // =========================================================================
    const CURRENT_TARGET = IS_GEMINI ? 'gemini' : IS_CHATGPT ? 'chatgpt' : 'unknown';
    if (CURRENT_TARGET === 'unknown') return;

    const TAB_ID = 'tab_' + Math.random().toString(36).substring(2, 9);
    console.log(`[Kaiz Bridge] 🌐 Web Adapter active for: ${CURRENT_TARGET} (Tab ID: ${TAB_ID})`);

    // Phát nhịp tim mỗi 3 giây để SillyTavern nhận diện tab đang mở
    setInterval(() => {
        GM_setValue('KAIZ_HEARTBEAT', {
            target: CURRENT_TARGET,
            title: document.title,
            timestamp: Date.now(),
        });
    }, 3000);

    // Chuyển đổi Blob ảnh sang Base64
    const blobToBase64 = (blob) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };

    // Tải ảnh xuyên miền bypass CORS bằng GM_xmlhttpRequest
    const fetchImageAsBase64 = (url) => {
        return new Promise((resolve, reject) => {
            console.log('[Kaiz Bridge] Đang tải blob ảnh:', url.substring(0, 100));
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: async (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try {
                            const base64 = await blobToBase64(res.response);
                            resolve(base64);
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`Failed to load image: HTTP ${res.status}`));
                    }
                },
                onerror: (err) => reject(err),
            });
        });
    };

    let lastHandledJobId = null;

    // Bộ điều phối thực thi job (Tránh xung đột đa tab & Chạy mượt trong Background Tab)
    async function handleIncomingJob(job) {
        if (!job || !job.id || !job.prompt) return;
        if (job.id === lastHandledJobId) return;

        // Chỉ xử lý nếu target chỉ định đúng nền tảng hiện tại (hoặc 'auto')
        if (job.target !== 'auto' && job.target !== CURRENT_TARGET) {
            return;
        }

        // Bỏ qua job đã cũ (>60s)
        if (Date.now() - job.timestamp > 60000) {
            return;
        }

        // Chống xung đột đa tab: Tab nào gán TAB_ID vào claimKey trước sẽ xử lý
        const claimKey = `KAIZ_CLAIM_${job.id}`;
        const existingClaim = GM_getValue(claimKey);
        if (existingClaim && existingClaim !== TAB_ID) {
            return;
        }

        GM_setValue(claimKey, TAB_ID);
        // Chờ 60ms để giải quyết race condition giữa các tab
        await new Promise((r) => setTimeout(r, 60));
        if (GM_getValue(claimKey) !== TAB_ID) {
            return;
        }

        lastHandledJobId = job.id;
        console.log(`[Kaiz Bridge][${CURRENT_TARGET}] 🚀 Bắt đầu thực thi job:`, job.id, job.prompt);

        try {
            if (CURRENT_TARGET === 'gemini') {
                await executeGeminiJob(job);
            } else if (CURRENT_TARGET === 'chatgpt') {
                await executeChatGPTJob(job);
            }
        } catch (err) {
            console.error(`[Kaiz Bridge][${CURRENT_TARGET}] ❌ Lỗi khi vẽ ảnh:`, err);
            GM_setValue('KAIZ_JOB_RESULT', {
                id: job.id,
                status: 'error',
                error: err.message || 'Lỗi không xác định khi tự động hóa giao diện web.',
                timestamp: Date.now(),
            });
        }
    }

    // 1. Lắng nghe qua GM_addValueChangeListener
    GM_addValueChangeListener('KAIZ_PENDING_JOB', (name, oldValue, job) => {
        handleIncomingJob(job);
    });

    // 2. Định kỳ 1 giây chủ động quét Storage (Chạy bền bỉ trong nền, 100% tương thích CSP của Google)
    setInterval(() => {
        const pendingJob = GM_getValue('KAIZ_PENDING_JOB');
        if (pendingJob && pendingJob.id !== lastHandledJobId) {
            handleIncomingJob(pendingJob);
        }
    }, 1000);

    // =========================================================================
    // 3. GEMINI WEB AUTOMATION (HỖ TRỢ ĐẦY ĐỦ BACKGROUND TAB)
    // =========================================================================
    async function executeGeminiJob(job) {
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // 1. Snapshot URL các ảnh hiện có
        const existingImages = new Set(
            Array.from(document.querySelectorAll('img'))
                .map((img) => img.src)
                .filter(Boolean),
        );
        console.log(`[Kaiz Bridge][Gemini] Đã snapshot ${existingImages.size} ảnh cũ trên trang.`);

        // 2. Chờ tìm ô input (Tối đa 5s phòng khi Angular render trễ trong background tab)
        let inputEl = null;
        for (let i = 0; i < 25; i++) {
            const richTextarea = document.querySelector('rich-textarea');
            inputEl =
                richTextarea?.querySelector('div[contenteditable="true"]') ||
                richTextarea?.querySelector('.ql-editor') ||
                richTextarea?.querySelector('p') ||
                document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                document.querySelector('div[contenteditable="true"]') ||
                document.querySelector('.ql-editor') ||
                document.querySelector('textarea[aria-label*="prompt" i]') ||
                document.querySelector('textarea');
            if (inputEl) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        if (!inputEl) {
            throw new Error('Không tìm thấy ô nhập prompt trên Gemini Web. Hãy chắc chắn tab đang ở trang chat.');
        }

        console.log('[Kaiz Bridge][Gemini] Tìm thấy inputEl:', inputEl);

        // 3. Điền prompt với đa tầng kỹ thuật (Đảm bảo Quill & Angular nhận text kể cả khi tab không có focus)
        inputEl.focus();
        inputEl.dispatchEvent(new Event('focusin', { bubbles: true }));

        // Kỹ thuật 1: Điền qua Quill API trực tiếp nếu có
        const quill =
            inputEl.__quill ||
            inputEl.parentElement?.__quill ||
            (inputEl.closest && inputEl.closest('.ql-container')?.__quill) ||
            (window.Quill && window.Quill.find ? window.Quill.find(inputEl) : null);

        let filledViaQuill = false;
        if (quill && typeof quill.setText === 'function') {
            try {
                quill.setText('');
                quill.insertText(0, job.prompt);
                filledViaQuill = true;
                console.log('[Kaiz Bridge][Gemini] Đã điền prompt trực tiếp qua Quill instance.');
            } catch (qe) {
                console.warn('[Kaiz Bridge][Gemini] Quill setText lỗi:', qe);
            }
        }

        // Kỹ thuật 2: Giả lập Clipboard Paste Event (Quill lắng nghe paste và cập nhật Delta kể cả khi không focus)
        if (!filledViaQuill) {
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', job.prompt);
                const pasteEvt = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt,
                });
                inputEl.dispatchEvent(pasteEvt);
            } catch (pe) {
                console.warn('[Kaiz Bridge][Gemini] Paste event fallback error:', pe);
            }
        }

        // Kỹ thuật 3: execCommand insertText
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('insertText', false, job.prompt);
        } catch (e) {
            /* ignore */
        }

        // Kỹ thuật 4: DOM innerHTML nếu text vẫn trống
        if (!filledViaQuill && (!inputEl.innerText || !inputEl.innerText.trim())) {
            inputEl.innerHTML = `<p>${escapeHtml(job.prompt)}</p>`;
        }

        // Bắn chuỗi event tổng hợp
        inputEl.dispatchEvent(new Event('beforeinput', { bubbles: true, composed: true }));
        inputEl.dispatchEvent(
            new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: job.prompt }),
        );
        inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        console.log('[Kaiz Bridge][Gemini] Đã hoàn tất nhập prompt vào ô input.');

        // 4. Bấm nút gửi (Vòng lặp chờ Angular kích hoạt nút trong background tab)
        const sendSelectors = [
            'button.send-button',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Gửi" i]',
            'button[aria-label*="Submit" i]',
            'button[data-test-id="send-button"]',
            'div[role="button"][aria-label*="Send" i]',
            'div[role="button"][aria-label*="Gửi" i]',
            '.send-button-container button',
            'button[mat-icon-button]',
        ];

        let sendBtn = null;
        for (let i = 0; i < 30; i++) {
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                    sendBtn = btn;
                    break;
                }
            }
            if (sendBtn) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        // Nếu sau 3s Angular vẫn chưa gỡ aria-disabled (do tab ở nền), cưỡng chế mở khóa nút
        if (!sendBtn) {
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn) {
                    btn.removeAttribute('aria-disabled');
                    btn.removeAttribute('disabled');
                    sendBtn = btn;
                    break;
                }
            }
        }

        if (sendBtn) {
            console.log('[Kaiz Bridge][Gemini] Tìm thấy nút gửi hợp lệ, đang click:', sendBtn);
            sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            sendBtn.click();
        }

        // Bổ sung phím Enter mô phỏng
        inputEl.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
            }),
        );
        inputEl.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
            }),
        );

        // 5. Chờ phản hồi và bắt ảnh mới
        const timeoutMs = 85000;
        const startTime = Date.now();
        console.log('[Kaiz Bridge][Gemini] Đang lắng nghe ảnh Imagen 3 mới...');

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 1200));

            // Kiểm tra thông báo từ chối kiểm duyệt (Safety Refusal)
            const bodyText = document.body.innerText;
            if (
                bodyText.includes("I can't create that image") ||
                bodyText.includes("I can't generate that image") ||
                bodyText.includes('safety guidelines') ||
                bodyText.includes('chính sách an toàn')
            ) {
                throw new Error('Gemini từ chối vẽ ảnh do chính sách an toàn/kiểm duyệt.');
            }

            // Quét các thẻ img trên trang
            const currentImages = Array.from(document.querySelectorAll('img'));
            for (const img of currentImages) {
                const src = img.src || '';
                const isNew = !existingImages.has(src);
                const isImageHost =
                    src.includes('googleusercontent.com') ||
                    src.includes('gstatic.com') ||
                    src.includes('blob:') ||
                    src.includes('data:image');
                const isNotAvatar = !src.includes('avatar') && !src.includes('profile') && !src.includes('logo');
                const isLoaded = img.complete && img.naturalWidth >= 200;

                if (src && isNew && isImageHost && isNotAvatar && isLoaded) {
                    console.log('[Kaiz Bridge][Gemini] 🎉 TÌM THẤY ẢNH MỚI HỢP LỆ:', src.substring(0, 100));
                    const base64 = await fetchImageAsBase64(src);
                    GM_setValue('KAIZ_JOB_RESULT', {
                        id: job.id,
                        status: 'success',
                        provider: 'gemini',
                        base64: base64,
                        timestamp: Date.now(),
                    });
                    console.log('[Kaiz Bridge][Gemini] Đã gửi kết quả Base64 về SillyTavern!');
                    return;
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 85s) nhưng không phát hiện ảnh mới từ Gemini Web.');
    }

    // =========================================================================
    // 4. CHATGPT WEB AUTOMATION (HỖ TRỢ ĐẦY ĐỦ BACKGROUND TAB)
    // =========================================================================
    async function executeChatGPTJob(job) {
        // 1. Snapshot URL các ảnh hiện có
        const existingImages = new Set(
            Array.from(document.querySelectorAll('img'))
                .map((img) => img.src)
                .filter(Boolean),
        );
        console.log(`[Kaiz Bridge][ChatGPT] Đã snapshot ${existingImages.size} ảnh cũ trên trang.`);

        // 2. Chờ tìm ô input nhập prompt
        let inputEl = null;
        for (let i = 0; i < 25; i++) {
            inputEl =
                document.querySelector('#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"]#prompt-textarea') ||
                document.querySelector('textarea');
            if (inputEl) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        if (!inputEl) {
            throw new Error('Không tìm thấy ô nhập prompt trên ChatGPT Web.');
        }

        // 3. Điền prompt
        inputEl.focus();
        inputEl.dispatchEvent(new Event('focusin', { bubbles: true }));

        if (inputEl.tagName.toLowerCase() === 'textarea') {
            inputEl.value = job.prompt;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // Thử Clipboard paste event
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', job.prompt);
                const pasteEvt = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt,
                });
                inputEl.dispatchEvent(pasteEvt);
            } catch (pe) {
                /* ignore */
            }

            try {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(inputEl);
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('insertText', false, job.prompt);
            } catch (e) {
                /* ignore */
            }

            if (!inputEl.innerText || !inputEl.innerText.trim()) {
                inputEl.innerText = job.prompt;
            }
            inputEl.dispatchEvent(
                new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: job.prompt }),
            );
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await new Promise((r) => setTimeout(r, 600));

        // 4. Bấm nút gửi (Chờ nút kích hoạt trong background tab)
        const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Gửi" i]',
        ];

        let sendBtn = null;
        for (let i = 0; i < 30; i++) {
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                    sendBtn = btn;
                    break;
                }
            }
            if (sendBtn) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        if (sendBtn) {
            console.log('[Kaiz Bridge][ChatGPT] Click nút gửi send-button...');
            sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
            sendBtn.click();
        }

        // Bổ sung Enter
        inputEl.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
            }),
        );
        inputEl.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
            }),
        );

        // 5. Chờ phản hồi và bắt ảnh mới
        const timeoutMs = 85000;
        const startTime = Date.now();
        console.log('[Kaiz Bridge][ChatGPT] Đang lắng nghe ảnh DALL-E mới...');

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 1200));

            // Kiểm tra lỗi kiểm duyệt
            const bodyText = document.body.innerText;
            if (
                bodyText.includes('I cannot generate that image') ||
                bodyText.includes('content policy') ||
                bodyText.includes('chính sách nội dung')
            ) {
                throw new Error('ChatGPT từ chối vẽ ảnh do vi phạm chính sách nội dung.');
            }

            // Quét các thẻ img trên trang
            const currentImages = Array.from(document.querySelectorAll('img'));
            for (const img of currentImages) {
                const src = img.src || '';
                const isNew = !existingImages.has(src);
                const isOAI = src.includes('oaiusercontent.com') || src.includes('files.oaiusercontent');
                const isLoaded = img.complete && img.naturalWidth >= 200;

                if (src && isNew && isOAI && isLoaded) {
                    console.log('[Kaiz Bridge][ChatGPT] 🎉 TÌM THẤY ẢNH MỚI:', src.substring(0, 100));
                    const base64 = await fetchImageAsBase64(src);
                    GM_setValue('KAIZ_JOB_RESULT', {
                        id: job.id,
                        status: 'success',
                        provider: 'chatgpt',
                        base64: base64,
                        timestamp: Date.now(),
                    });
                    console.log('[Kaiz Bridge][ChatGPT] Đã gửi kết quả Base64 về SillyTavern!');
                    return;
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 85s) nhưng không thấy ảnh mới từ ChatGPT.');
    }
})();
