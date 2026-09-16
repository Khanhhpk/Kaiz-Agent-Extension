// ==UserScript==
// @name         Kaiz Web Image Bridge (SillyTavern <-> Gemini / ChatGPT)
// @namespace    https://github.com/Khanhhpk/Kaiz-Agent-Extension
// @version      1.0.0
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
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const IS_ST = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const IS_GEMINI = location.hostname === 'gemini.google.com';
    const IS_CHATGPT = location.hostname === 'chatgpt.com';

    // =========================================================================
    // 1. CONTEXT: SILLYTAVERN (CẦU NỐI CỤC BỘ)
    // =========================================================================
    if (IS_ST) {
        console.log('[Kaiz Bridge] Userscript loaded on SillyTavern.');

        // Lắng nghe yêu cầu vẽ ảnh từ SillyTavern Extension qua postMessage
        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            if (event.data.type === 'KAIZ_BRIDGE_IMAGE_REQUEST') {
                const job = event.data.payload;
                console.log('[Kaiz Bridge] Nhận yêu cầu vẽ từ ST:', job);
                GM_setValue('KAIZ_PENDING_JOB', {
                    id: job.id,
                    target: job.target || 'gemini',
                    prompt: job.prompt,
                    timestamp: Date.now(),
                });
            } else if (event.data.type === 'KAIZ_BRIDGE_PING') {
                // Phản hồi kiểm tra xem Userscript có đang cài đặt hay không
                window.postMessage({ type: 'KAIZ_BRIDGE_PONG', version: '1.0.0' }, '*');
            }
        });

        // Lắng nghe kết quả từ Web trả về qua GM_addValueChangeListener
        GM_addValueChangeListener('KAIZ_JOB_RESULT', (name, oldValue, newValue) => {
            if (!newValue || !newValue.id) return;
            console.log('[Kaiz Bridge] Nhận kết quả từ Web:', newValue.id, newValue.status);
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

    console.log(`[Kaiz Bridge] Web Adapter active for: ${CURRENT_TARGET}`);

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

    // Lắng nghe công việc cần vẽ
    GM_addValueChangeListener('KAIZ_PENDING_JOB', async (name, oldValue, job) => {
        if (!job || !job.id || !job.prompt) return;

        // Chỉ xử lý nếu target chỉ định đúng nền tảng hiện tại (hoặc 'auto')
        if (job.target !== 'auto' && job.target !== CURRENT_TARGET) {
            return;
        }

        // Kiểm tra tránh thực thi lại job cũ quá 30 giây
        if (Date.now() - job.timestamp > 30000) return;

        console.log(`[Kaiz Bridge][${CURRENT_TARGET}] Bắt đầu thực thi job:`, job.id, job.prompt);

        try {
            if (CURRENT_TARGET === 'gemini') {
                await executeGeminiJob(job);
            } else if (CURRENT_TARGET === 'chatgpt') {
                await executeChatGPTJob(job);
            }
        } catch (err) {
            console.error(`[Kaiz Bridge][${CURRENT_TARGET}] Lỗi khi vẽ ảnh:`, err);
            GM_setValue('KAIZ_JOB_RESULT', {
                id: job.id,
                status: 'error',
                error: err.message || 'Lỗi không xác định khi tự động hóa giao diện web.',
                timestamp: Date.now(),
            });
        }
    });

    // =========================================================================
    // 3. GEMINI WEB AUTOMATION
    // =========================================================================
    async function executeGeminiJob(job) {
        // 1. Snapshot URL các ảnh hiện có
        const existingImages = new Set(
            Array.from(document.querySelectorAll('img'))
                .map((img) => img.src)
                .filter(Boolean),
        );

        // 2. Tìm ô input nhập prompt
        const inputEl =
            document.querySelector('rich-textarea .ql-editor') || document.querySelector('div[contenteditable="true"]');
        if (!inputEl) {
            throw new Error('Không tìm thấy ô nhập prompt trên Gemini Web.');
        }

        // 3. Điền prompt
        inputEl.focus();
        inputEl.innerHTML = `<p>${job.prompt}</p>`;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        await new Promise((r) => setTimeout(r, 400));

        // 4. Bấm nút gửi
        const sendBtn =
            document.querySelector('button.send-button') ||
            document.querySelector('button[aria-label*="Send" i]') ||
            document.querySelector('button[aria-label*="Gửi" i]');
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
        } else {
            // Giả lập Enter
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        }

        // 5. Chờ phản hồi và bắt ảnh mới
        const timeoutMs = 75000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 1200));

            // Kiểm tra thông báo từ chối kiểm duyệt (Safety Refusal)
            const bodyText = document.body.innerText;
            if (
                bodyText.includes("I can't create that image") ||
                bodyText.includes('safety guidelines') ||
                bodyText.includes('chính sách an toàn')
            ) {
                throw new Error('Gemini từ chối vẽ ảnh do chính sách an toàn/kiểm duyệt.');
            }

            // Quét các thẻ img trên trang
            const currentImages = Array.from(document.querySelectorAll('img'));
            for (const img of currentImages) {
                const src = img.src || '';
                // Thẻ ảnh Imagen 3 thường từ googleusercontent hoặc gstatic
                if (
                    src &&
                    !existingImages.has(src) &&
                    (src.includes('googleusercontent.com') || src.includes('data:image')) &&
                    img.complete &&
                    img.naturalWidth > 150
                ) {
                    console.log('[Kaiz Bridge][Gemini] Tìm thấy ảnh mới hợp lệ:', src.substring(0, 80));
                    const base64 = await fetchImageAsBase64(src);
                    GM_setValue('KAIZ_JOB_RESULT', {
                        id: job.id,
                        status: 'success',
                        provider: 'gemini',
                        base64: base64,
                        timestamp: Date.now(),
                    });
                    return;
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 75s) nhưng không thấy ảnh mới từ Gemini.');
    }

    // =========================================================================
    // 4. CHATGPT WEB AUTOMATION
    // =========================================================================
    async function executeChatGPTJob(job) {
        // 1. Snapshot URL các ảnh hiện có
        const existingImages = new Set(
            Array.from(document.querySelectorAll('img'))
                .map((img) => img.src)
                .filter(Boolean),
        );

        // 2. Tìm ô input nhập prompt
        const inputEl =
            document.querySelector('#prompt-textarea') ||
            document.querySelector('div[contenteditable="true"]#prompt-textarea');
        if (!inputEl) {
            throw new Error('Không tìm thấy ô nhập prompt trên ChatGPT Web.');
        }

        // 3. Điền prompt
        inputEl.focus();
        if (inputEl.tagName.toLowerCase() === 'textarea') {
            inputEl.value = job.prompt;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            inputEl.innerHTML = `<p>${job.prompt}</p>`;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        await new Promise((r) => setTimeout(r, 400));

        // 4. Bấm nút gửi
        const sendBtn =
            document.querySelector('button[data-testid="send-button"]') ||
            document.querySelector('button[aria-label*="Send" i]') ||
            document.querySelector('button[aria-label*="Gửi" i]');
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
        } else {
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
        }

        // 5. Chờ phản hồi và bắt ảnh mới
        const timeoutMs = 75000;
        const startTime = Date.now();

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
                // Thẻ ảnh DALL-E / GPT-4o thường từ oaiusercontent.com hoặc blob/files
                if (
                    src &&
                    !existingImages.has(src) &&
                    (src.includes('oaiusercontent.com') || src.includes('files.oaiusercontent')) &&
                    img.complete &&
                    img.naturalWidth > 150
                ) {
                    console.log('[Kaiz Bridge][ChatGPT] Tìm thấy ảnh mới hợp lệ:', src.substring(0, 80));
                    const base64 = await fetchImageAsBase64(src);
                    GM_setValue('KAIZ_JOB_RESULT', {
                        id: job.id,
                        status: 'success',
                        provider: 'chatgpt',
                        base64: base64,
                        timestamp: Date.now(),
                    });
                    return;
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 75s) nhưng không thấy ảnh mới từ ChatGPT.');
    }
})();
