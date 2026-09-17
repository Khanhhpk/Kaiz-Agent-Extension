// ==UserScript==
// @name         Kaiz Web Image Bridge (SillyTavern <-> Gemini / ChatGPT)
// @namespace    https://github.com/Khanhhpk/Kaiz-Agent-Extension
// @version      1.2.9
// @description  Cầu nối truyền prompt vẽ ảnh từ SillyTavern sang Gemini Web / ChatGPT Web và chuyển ảnh về SillyTavern.
// @author       Kaiz
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @match        https://gemini.google.com/*
// @match        https://chatgpt.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
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

        const sendHeartbeatUpdate = (hb) => {
            if (!hb || !hb.target) return;
            window.postMessage(
                {
                    type: 'KAIZ_BRIDGE_HEARTBEAT_UPDATE',
                    payload: hb,
                },
                '*',
            );
        };

        const checkAllHeartbeats = () => {
            try {
                const geminiHb = GM_getValue('KAIZ_HEARTBEAT_gemini') || GM_getValue('KAIZ_HEARTBEAT');
                if (geminiHb && geminiHb.target === 'gemini') {
                    sendHeartbeatUpdate(geminiHb);
                }
                const chatgptHb = GM_getValue('KAIZ_HEARTBEAT_chatgpt');
                if (chatgptHb && chatgptHb.target === 'chatgpt') {
                    sendHeartbeatUpdate(chatgptHb);
                }
            } catch (e) {
                /* ignore */
            }
        };

        // Quét dọn các key KAIZ_CLAIM_ cũ trong Storage để giải phóng rác tích tụ
        const cleanupOldStorage = () => {
            try {
                if (typeof GM_listValues !== 'function' || typeof GM_deleteValue !== 'function') return;
                const keys = GM_listValues();
                const now = Date.now();
                for (const key of keys) {
                    if (typeof key === 'string' && key.startsWith('KAIZ_CLAIM_')) {
                        // Key dạng KAIZ_CLAIM_job_1789571611961_p8exd
                        const parts = key.split('_');
                        const ts = parts[3] ? parseInt(parts[3], 10) : (parts[2] ? parseInt(parts[2], 10) : 0);
                        // Cũ hơn 90 giây hoặc key không xác định được timestamp -> xóa sạch rác
                        if (!ts || isNaN(ts) || now - ts > 90000) {
                            GM_deleteValue(key);
                        }
                    }
                }
            } catch (e) {
                /* ignore */
            }
        };

        // Quét ngay heartbeat và dọn rác trong Storage khi vừa tải SillyTavern
        checkAllHeartbeats();
        cleanupOldStorage();

        // Lắng nghe yêu cầu vẽ ảnh từ SillyTavern Extension qua postMessage
        window.addEventListener('message', (event) => {
            if (!event.data) return;

            if (event.data.type === 'KAIZ_BRIDGE_IMAGE_REQUEST') {
                const job = event.data.payload;
                console.log('[Kaiz Bridge][ST] 🚀 Nhận yêu cầu vẽ từ ST:', job);
                GM_setValue('KAIZ_PENDING_JOB', {
                    id: job.id,
                    target: job.target || 'auto',
                    prompt: job.prompt,
                    timestamp: Date.now(),
                });
                // Phát xung Kickstart tức thì để kích hoạt xử lý trong tab Web chạy ngầm (không đổi tab)
                GM_setValue('KAIZ_KICKSTART_PULSE', Date.now());
            } else if (event.data.type === 'KAIZ_BRIDGE_PING') {
                window.postMessage({ type: 'KAIZ_BRIDGE_PONG', version: '1.2.9' }, '*');
                checkAllHeartbeats();
                cleanupOldStorage();
                // Gửi xung Ping Pulse qua GM Storage để tab Web lập tức phản hồi ngay cả khi đang chạy ngầm
                GM_setValue('KAIZ_PING_PULSE', Date.now());
            }
        });

        // Lắng nghe kết quả từ Web trả về qua GM_addValueChangeListener
        GM_addValueChangeListener('KAIZ_JOB_RESULT', (name, oldValue, newValue) => {
            if (!newValue || !newValue.id) return;
            if (newValue.cleared) return; // Bỏ qua sự kiện đã dọn dẹp bộ nhớ
            console.log('[Kaiz Bridge][ST] 📦 Nhận kết quả từ Web:', newValue.id, newValue.status);
            window.postMessage(
                {
                    type: 'KAIZ_BRIDGE_IMAGE_RESPONSE',
                    payload: newValue,
                },
                '*',
            );

            // Dọn dẹp job đang chờ và claimKey trong Storage để tránh các tab khác xử lý lại job cũ và chống rác bộ nhớ
            try {
                const curPending = GM_getValue('KAIZ_PENDING_JOB');
                if (curPending && curPending.id === newValue.id) {
                    GM_setValue('KAIZ_PENDING_JOB', null);
                }
                if (typeof GM_deleteValue === 'function') {
                    GM_deleteValue(`KAIZ_CLAIM_${newValue.id}`);
                }
            } catch (e) {
                /* ignore */
            }

            cleanupOldStorage();

            // Sau 10s dọn bớt chuỗi Base64 ảnh nặng (~1.7MB) trong Storage sau khi SillyTavern đã tiếp nhận hoàn chỉnh
            setTimeout(() => {
                try {
                    const curRes = GM_getValue('KAIZ_JOB_RESULT');
                    if (curRes && curRes.id === newValue.id && !curRes.cleared) {
                        GM_setValue('KAIZ_JOB_RESULT', {
                            id: curRes.id,
                            status: curRes.status,
                            provider: curRes.provider,
                            timestamp: curRes.timestamp,
                            cleared: true,
                        });
                    }
                } catch (e) {
                    /* ignore */
                }
            }, 10000);
        });

        // Lắng nghe nhịp tim (Heartbeat) từ các tab Web
        GM_addValueChangeListener('KAIZ_HEARTBEAT_gemini', (name, oldValue, newValue) => {
            if (newValue) sendHeartbeatUpdate(newValue);
        });
        GM_addValueChangeListener('KAIZ_HEARTBEAT_chatgpt', (name, oldValue, newValue) => {
            if (newValue) sendHeartbeatUpdate(newValue);
        });
        GM_addValueChangeListener('KAIZ_HEARTBEAT', (name, oldValue, newValue) => {
            if (newValue) sendHeartbeatUpdate(newValue);
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

    // =========================================================================
    // HỆ THỐNG CHỐNG SLEEP & KICKSTART LIÊN TỤC TRONG BACKGROUND TAB
    // =========================================================================

    // 1. Visibility Spoofing: Đánh lừa trình duyệt và Angular luôn thấy tab ở trạng thái Visible & Focused
    try {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const setProp = (target, prop, val) => {
            try {
                Object.defineProperty(target, prop, { get: () => val, configurable: true });
            } catch (e) {}
        };

        setProp(document, 'hidden', false);
        setProp(document, 'visibilityState', 'visible');
        setProp(document, 'webkitVisibilityState', 'visible');

        if (win && win.document) {
            setProp(win.document, 'hidden', false);
            setProp(win.document, 'visibilityState', 'visible');
            setProp(win.document, 'webkitVisibilityState', 'visible');
        }

        // Chặn sự kiện visibilitychange khi nó cố báo hiệu tab đã bị ẩn
        const preventHide = (e) => {
            if (document.visibilityState === 'hidden' || (e && e.target && e.target.hidden)) {
                e.stopImmediatePropagation();
            }
        };
        window.addEventListener('visibilitychange', preventHide, true);
        if (win) win.addEventListener('visibilitychange', preventHide, true);
    } catch (e) {
        console.warn('[Kaiz Bridge] Visibility spoofing error:', e);
    }

    // 2. Hàm Kickstart: Đánh thức nội bộ DOM và kích hoạt lại các vòng lặp sự kiện
    // TUYỆT ĐỐI KHÔNG gọi window.focus() hay win.focus() để tránh nhảy tab trình duyệt từ SillyTavern sang Web!
    const kickstartTab = () => {
        try {
            window.dispatchEvent(new Event('focus'));
            document.dispatchEvent(new Event('focus'));
            window.dispatchEvent(new Event('visibilitychange'));
            document.dispatchEvent(new Event('visibilitychange'));
        } catch (e) {
            /* ignore */
        }
    };

    // 3. Hàm gửi Heartbeat (lưu theo từng nền tảng riêng biệt để không ghi đè lẫn nhau)
    const sendHeartbeat = () => {
        try {
            const hbData = {
                target: CURRENT_TARGET,
                title: document.title,
                timestamp: Date.now(),
            };
            GM_setValue(`KAIZ_HEARTBEAT_${CURRENT_TARGET}`, hbData);
            GM_setValue('KAIZ_HEARTBEAT', hbData); // backward compatibility
        } catch (e) {
            /* ignore */
        }
    };

    // Phát nhịp tim ngay khi tab mở
    sendHeartbeat();

    // Phát nhịp tim định kỳ
    setInterval(sendHeartbeat, 3000);

    // Lắng nghe xung Ping Pulse từ SillyTavern (phản hồi tức thì ngay cả khi tab chạy ngầm qua extension event)
    GM_addValueChangeListener('KAIZ_PING_PULSE', () => {
        sendHeartbeat();
    });

    // Lắng nghe xung Kickstart từ SillyTavern để đánh thức tab ngầm khi có yêu cầu vẽ ảnh mới (chạy ngầm, không nhảy tab)
    GM_addValueChangeListener('KAIZ_KICKSTART_PULSE', () => {
        console.log(`[Kaiz Bridge][${CURRENT_TARGET}] ⚡ Nhận xung Kickstart từ SillyTavern (chạy ngầm, không nhảy tab).`);
        kickstartTab();
        sendHeartbeat();
    });

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

    // Khóa chống trùng lặp và race condition đa tab / đa trigger
    const handledJobIds = new Set();
    let isJobExecuting = false;

    // Bộ điều phối thực thi job (Tránh xung đột đa tab & Chạy mượt trong Background Tab)
    async function handleIncomingJob(job) {
        if (!job || !job.id || !job.prompt) return;

        // Kickstart đánh thức tab ngay khi có job tới
        kickstartTab();

        // Đã từng xử lý job này rồi -> Bỏ qua tuyệt đối
        if (handledJobIds.has(job.id)) return;

        // Nếu tab đang bận thực thi 1 job khác -> Bỏ qua để tránh xung đột UI
        if (isJobExecuting) {
            console.warn(`[Kaiz Bridge][${CURRENT_TARGET}] Tab đang bận xử lý job khác, bỏ qua:`, job.id);
            return;
        }

        // Chỉ xử lý nếu target chỉ định đúng nền tảng hiện tại (hoặc 'auto')
        if (job.target !== 'auto' && job.target !== CURRENT_TARGET) {
            return;
        }

        // Bỏ qua job đã cũ (>60s)
        if (Date.now() - job.timestamp > 60000) {
            return;
        }

        // Chống xung đột đa tab: Kiểm tra xem đã có tab nào claim job này chưa
        const claimKey = `KAIZ_CLAIM_${job.id}`;
        const existingClaim = GM_getValue(claimKey);
        if (existingClaim) {
            // Đã có tab khác (hoặc chính tab này) claim job này trước đó
            handledJobIds.add(job.id);
            return;
        }

        // Đánh dấu ngay lập tức trong memory để chặn các trigger đồng thời (từ setInterval và GM_addValueChangeListener)
        handledJobIds.add(job.id);
        GM_setValue(claimKey, TAB_ID);

        // Chờ 80ms để giải quyết race condition phân xử giữa nhiều tab
        await new Promise((r) => setTimeout(r, 80));
        if (GM_getValue(claimKey) !== TAB_ID) {
            console.log(`[Kaiz Bridge][${CURRENT_TARGET}] Job ${job.id} đã được tab khác nhận.`);
            return;
        }

        isJobExecuting = true;
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
        } finally {
            isJobExecuting = false;
            // Dọn dẹp claimKey sau 30 giây để tránh tích tụ rác Storage trên trình duyệt
            setTimeout(() => {
                try {
                    if (typeof GM_deleteValue === 'function') {
                        GM_deleteValue(claimKey);
                    }
                } catch (e) {
                    /* ignore */
                }
            }, 30000);
        }
    }

    // 1. Lắng nghe qua GM_addValueChangeListener
    GM_addValueChangeListener('KAIZ_PENDING_JOB', (name, oldValue, job) => {
        if (job && !handledJobIds.has(job.id)) {
            handleIncomingJob(job);
        }
    });

    // 2. Định kỳ 1 giây chủ động quét Storage (Chạy bền bỉ trong nền, 100% tương thích CSP của Google)
    setInterval(() => {
        if (isJobExecuting) return;
        const pendingJob = GM_getValue('KAIZ_PENDING_JOB');
        if (pendingJob && !handledJobIds.has(pendingJob.id)) {
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

        // 3. Điền prompt an toàn (Đảm bảo Quill & Angular nhận diện text và chuyển Mic -> Gửi)
        try {
            inputEl.focus({ preventScroll: true });
        } catch (e) {
            inputEl.focus();
        }
        inputEl.dispatchEvent(new Event('focusin', { bubbles: true }));

        // Xác định node <p> bên trong editor của Quill để bảo toàn cấu trúc DOM
        let pEl = inputEl.querySelector('p');
        if (!pEl && inputEl.tagName.toLowerCase() !== 'textarea') {
            pEl = document.createElement('p');
            inputEl.appendChild(pEl);
        }

        let textSet = false;

        // Kỹ thuật 1: Truy cập trực tiếp Quill qua unsafeWindow hoặc DOM property (nếu có)
        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const q =
                inputEl.__quill ||
                inputEl.parentElement?.__quill ||
                (inputEl.closest && inputEl.closest('.ql-container')?.__quill) ||
                (win.Quill && win.Quill.find ? win.Quill.find(inputEl) : null);
            if (q && typeof q.setText === 'function') {
                q.setText('', 'user');
                q.insertText(0, job.prompt, 'user');
                textSet = true;
                console.log('[Kaiz Bridge][Gemini] Đã nạp text trực tiếp qua Quill instance.');
            }
        } catch (qe) {
            console.warn('[Kaiz Bridge][Gemini] Quill direct API error:', qe);
        }

        // Kỹ thuật 2: Clipboard Paste Event (nếu Quill API không có)
        if (!textSet) {
            try {
                const dt = new DataTransfer();
                dt.setData('text/plain', job.prompt);
                const pasteEvt = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    clipboardData: dt,
                });
                inputEl.dispatchEvent(pasteEvt);
                textSet = true;
                console.log('[Kaiz Bridge][Gemini] Đã nạp text qua ClipboardEvent paste.');
            } catch (pe) {
                console.warn('[Kaiz Bridge][Gemini] Paste event fallback error:', pe);
            }
        }

        // Kỹ thuật 3: Native Selection & execCommand (nếu text vẫn chưa được điền)
        if (!inputEl.textContent || !inputEl.textContent.trim()) {
            try {
                const targetNode = pEl || inputEl;
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(targetNode);
                selection.removeAllRanges();
                selection.addRange(range);
                document.execCommand('insertText', false, job.prompt);
                console.log('[Kaiz Bridge][Gemini] Đã nạp text qua execCommand insertText.');
            } catch (e) {
                console.warn('[Kaiz Bridge][Gemini] execCommand insertText failed:', e);
            }
        }

        // Kỹ thuật 4: DOM Fallback
        if (!inputEl.textContent || !inputEl.textContent.trim()) {
            if (pEl) {
                pEl.textContent = job.prompt;
            } else {
                inputEl.innerText = job.prompt;
            }
        }

        // Kỹ thuật 5: Bắn chuỗi InputEvent và ChangeEvent để Angular digest cycle nhận diện
        const inputEventProps = {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: 'insertText',
            data: job.prompt,
        };

        try {
            inputEl.dispatchEvent(new InputEvent('input', inputEventProps));
        } catch (ie) {
            inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        }

        inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        console.log('[Kaiz Bridge][Gemini] Đã hoàn tất nhập prompt vào ô input.');
        // Chờ Angular digest cycle cập nhật trạng thái ô nhập và đổi nút Mic sang nút Gửi
        await new Promise((r) => setTimeout(r, 600));

        // 4. Tìm và bấm nút gửi DUY NHẤT 1 LẦN (Chống spam request)
        const sendSelectors = [
            'button[aria-label*="Gửi" i]',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Submit" i]',
            'button.send-button',
            'button[data-test-id="send-button"]',
            'div[role="button"][aria-label*="Gửi" i]',
            'div[role="button"][aria-label*="Send" i]',
            '.send-button-container button',
        ];

        let sendBtn = null;
        for (let i = 0; i < 30; i++) {
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && btn.offsetParent !== null) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const isExcluded =
                        label.includes('mic') ||
                        label.includes('micro') ||
                        label.includes('menu') ||
                        label.includes('tệp') ||
                        label.includes('file') ||
                        label.includes('thêm') ||
                        label.includes('add') ||
                        label.includes('ngừng') ||
                        label.includes('dừng') ||
                        label.includes('stop') ||
                        label.includes('cancel') ||
                        label.includes('hủy');
                    if (!isExcluded) {
                        sendBtn = btn;
                        break;
                    }
                }
            }
            if (sendBtn) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        if (sendBtn) {
            console.log('[Kaiz Bridge][Gemini] Tìm thấy nút gửi hợp lệ, click nút gửi duy nhất 1 lần:', sendBtn);
            sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
            sendBtn.click();
        } else {
            console.log('[Kaiz Bridge][Gemini] Nút gửi chưa kích hoạt, gửi duy nhất 1 lần qua phím Enter trên ô input...');
            const enterDown = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
            });
            const enterUp = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true,
                composed: true,
            });

            inputEl.dispatchEvent(enterDown);
            inputEl.dispatchEvent(enterUp);
        }

        // 5. CƠ CHẾ 2 GIAI ĐOẠN DỰA TRÊN VÒNG ĐỜI NÚT CANCEL (LIFECYCLE STATE MACHINE)
        const timeoutMs = 85000;
        const startTime = Date.now();
        console.log('[Kaiz Bridge][Gemini] 🚀 Đã gửi prompt. Bắt đầu Phase 1: Chờ nút Cancel xuất hiện...');

        // Hàm nhận diện Gemini đang trong trạng thái sinh phản hồi / tạo ảnh
        const isGeminiGenerating = () => {
            const stopSelectors = [
                'button[aria-label*="Ngừng" i]',
                'button[aria-label*="Stop" i]',
                'button[aria-label*="Dừng" i]',
                'button[aria-label*="Cancel" i]',
                'button[aria-label*="Hủy" i]',
                'button.stop-button',
                'button[data-test-id="stop-button"]',
                '.send-button-container button[aria-label*="ngừng" i]',
                '.send-button-container button[aria-label*="stop" i]',
                '.send-button-container button[aria-label*="dừng" i]',
            ];
            for (const sel of stopSelectors) {
                const btn = document.querySelector(sel);
                if (btn && btn.offsetParent !== null) return true;
            }

            // Kiểm tra icon Stop trong nút bấm
            const stopIcon = document.querySelector(
                'mat-icon[fonticon="stop"], mat-icon[data-mat-icon-name="stop"], mat-icon[data-mat-icon-name="stop_circle"], svg.stop-icon',
            );
            if (stopIcon && stopIcon.offsetParent !== null) return true;

            // Kiểm tra hiệu ứng loading / progress bar
            const loader = document.querySelector('mat-progress-bar, .loading-indicator, bard-loading-indicator');
            if (loader && loader.offsetParent !== null) return true;

            return false;
        };

        // Hàm tìm ảnh mới hợp lệ trên trang
        const findNewValidImage = () => {
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
                const isLoaded = img.complete && (img.naturalWidth >= 200 || img.width >= 200);

                if (src && isNew && isImageHost && isNotAvatar && isLoaded) {
                    return img;
                }
            }
            return null;
        };

        // Hàm trích xuất ảnh và gửi Base64 về SillyTavern
        const deliverImageResult = async (img) => {
            console.log('[Kaiz Bridge][Gemini] 🎉 Xử lý trích xuất ảnh:', (img.src || '').substring(0, 100));
            let base64 = null;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl && dataUrl.startsWith('data:image')) {
                    base64 = dataUrl;
                }
            } catch (canvasErr) {
                // CORS tainted, tiếp tục với fetch/GM_xmlhttpRequest
            }

            if (!base64 && img.src.startsWith('blob:')) {
                try {
                    const blob = await fetch(img.src).then((r) => r.blob());
                    base64 = await blobToBase64(blob);
                } catch (e) {
                    console.warn('[Kaiz Bridge][Gemini] fetch blob error:', e);
                }
            }

            if (!base64) {
                base64 = await fetchImageAsBase64(img.src);
            }

            GM_setValue('KAIZ_JOB_RESULT', {
                id: job.id,
                status: 'success',
                provider: 'gemini',
                base64: base64,
                timestamp: Date.now(),
            });
            console.log('[Kaiz Bridge][Gemini] Đã gửi kết quả Base64 về SillyTavern!');
        };

        // =========================================================================
        // GIAI ĐOẠN 1: CHỜ NÚT CANCEL XUẤT HIỆN (Khởi động tiến trình)
        // Không dùng buffer thời gian cứng; kiên nhẫn chờ nút cancel hiện ra dù mạng lag
        // =========================================================================
        let hasStarted = false;
        const phase1MaxWait = 25000; // Tối đa 25s cho mạng chậm
        const phase1Start = Date.now();

        while (Date.now() - phase1Start < phase1MaxWait) {
            // Trường hợp cực nhanh: ảnh mới đã có sẵn
            const earlyImg = findNewValidImage();
            if (earlyImg) {
                console.log('[Kaiz Bridge][Gemini] 🎉 Bắt được ảnh ngay trong Phase 1!');
                await deliverImageResult(earlyImg);
                return;
            }

            // Nút Cancel đã xuất hiện -> Khởi động thành công!
            if (isGeminiGenerating()) {
                hasStarted = true;
                console.log('[Kaiz Bridge][Gemini] 🟢 Nút Cancel đã xuất hiện! Chuyển sang Phase 2: Theo dõi tiến trình.');
                break;
            }

            // Bắt nhanh Safety keywords nếu Gemini từ chối tức thì
            const bodyText = document.body.innerText;
            if (
                bodyText.includes("I can't create that image") ||
                bodyText.includes("I can't generate that image") ||
                bodyText.includes('safety guidelines') ||
                bodyText.includes('chính sách an toàn')
            ) {
                throw new Error('Gemini từ chối vẽ ảnh do chính sách an toàn/kiểm duyệt.');
            }

            await new Promise((r) => setTimeout(r, 400));
        }

        if (!hasStarted) {
            const lastCheckImg = findNewValidImage();
            if (lastCheckImg) {
                await deliverImageResult(lastCheckImg);
                return;
            }
            throw new Error('Không phát hiện Gemini bắt đầu tạo ảnh sau 25s (nút Cancel không xuất hiện, có thể do lỗi mạng hoặc prompt chưa gửi được).');
        }

        // =========================================================================
        // GIAI ĐOẠN 2: THEO DÕI NÚT CANCEL CHO TỚI KHI BIẾN MẤT (Hoàn tất hoặc từ chối)
        // =========================================================================
        console.log('[Kaiz Bridge][Gemini] ⏳ Đang theo dõi tiến trình tạo ảnh...');
        let finishedCheckCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 800));

            // ƯU TIÊN 1: Bắt ngay ảnh mới ngay khi vừa tải xong
            const newImg = findNewValidImage();
            if (newImg) {
                await deliverImageResult(newImg);
                return;
            }

            // ƯU TIÊN 2: Kiểm tra trạng thái nút Cancel
            const isGen = isGeminiGenerating();
            if (isGen) {
                finishedCheckCount = 0; // Nút vẫn còn -> reset bộ đếm
            } else {
                // Nút Cancel đã biến mất!
                // Debounce 2 nhịp liên tiếp (~1.6s) để tránh lỗi re-render / chớp tắt của UI Angular
                finishedCheckCount++;
                if (finishedCheckCount >= 2) {
                    console.log('[Kaiz Bridge][Gemini] ⚠️ Nút Cancel đã biến mất. Quét ảnh lần cuối...');
                    await new Promise((r) => setTimeout(r, 1200));

                    const finalImg = findNewValidImage();
                    if (finalImg) {
                        await deliverImageResult(finalImg);
                        return;
                    }

                    // Nút cancel biến mất mà không hề có ảnh mới -> Gemini kết thúc nhưng từ chối / lỗi!
                    throw new Error('Gemini đã kết thúc phản hồi nhưng không tạo ảnh (bị từ chối kiểm duyệt hoặc không thực thi lệnh vẽ).');
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

        // 2. Chờ tìm ô input nhập prompt (ProseMirror #prompt-textarea hoặc textarea)
        let inputEl = null;
        for (let i = 0; i < 25; i++) {
            inputEl =
                document.querySelector('#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"]#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"][data-placeholder]') ||
                document.querySelector('textarea#prompt-textarea') ||
                document.querySelector('textarea');
            if (inputEl) break;
            await new Promise((r) => setTimeout(r, 200));
        }

        if (!inputEl) {
            throw new Error('Không tìm thấy ô nhập prompt trên ChatGPT Web. Hãy chắc chắn tab đang ở trang chat.');
        }

        console.log('[Kaiz Bridge][ChatGPT] Tìm thấy ô nhập:', inputEl);

        // 3. Điền prompt an toàn theo chuẩn ProseMirror / React
        try {
            inputEl.focus({ preventScroll: true });
        } catch (e) {
            inputEl.focus();
        }
        inputEl.dispatchEvent(new Event('focusin', { bubbles: true }));

        if (inputEl.tagName.toLowerCase() === 'textarea') {
            inputEl.value = job.prompt;
            inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        } else {
            // ProseMirror contenteditable container
            let textInserted = false;

            // Kỹ thuật 1: Selection & execCommand ('insertText') - Chuẩn nhất cho ProseMirror
            try {
                let pEl = inputEl.querySelector('p');
                if (!pEl) {
                    pEl = document.createElement('p');
                    inputEl.appendChild(pEl);
                }
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(pEl);
                selection.removeAllRanges();
                selection.addRange(range);
                textInserted = document.execCommand('insertText', false, job.prompt);
                if (textInserted && inputEl.textContent?.trim()) {
                    console.log('[Kaiz Bridge][ChatGPT] Đã nạp prompt qua ProseMirror execCommand insertText.');
                }
            } catch (e) {
                console.warn('[Kaiz Bridge][ChatGPT] execCommand failed:', e);
            }

            // Kỹ thuật 2: ClipboardEvent paste fallback (chỉ chạy nếu Kỹ thuật 1 chưa đưa được text vào)
            if (!textInserted || !inputEl.textContent?.trim()) {
                try {
                    const dt = new DataTransfer();
                    dt.setData('text/plain', job.prompt);
                    const pasteEvt = new ClipboardEvent('paste', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        clipboardData: dt,
                    });
                    inputEl.dispatchEvent(pasteEvt);
                    console.log('[Kaiz Bridge][ChatGPT] Đã nạp prompt qua ClipboardEvent paste fallback.');
                } catch (pe) {
                    console.warn('[Kaiz Bridge][ChatGPT] Paste event fallback error:', pe);
                }
            }

            // Kỹ thuật 3: DOM Fallback bảo toàn thẻ <p> nếu vẫn chưa có text
            if (!inputEl.textContent || !inputEl.textContent.trim()) {
                let pEl = inputEl.querySelector('p');
                if (pEl) {
                    pEl.textContent = job.prompt;
                } else {
                    inputEl.innerText = job.prompt;
                }
            }

            // Bắn InputEvent và ChangeEvent để React state cập nhật và bật sáng nút gửi
            try {
                inputEl.dispatchEvent(
                    new InputEvent('input', {
                        bubbles: true,
                        cancelable: true,
                        composed: true,
                        inputType: 'insertText',
                        data: job.prompt,
                    }),
                );
            } catch (ie) {
                inputEl.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            }
            inputEl.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        }

        console.log('[Kaiz Bridge][ChatGPT] Đã hoàn tất nhập prompt vào ô input.');
        await new Promise((r) => setTimeout(r, 600));

        // 4. Bấm nút gửi (Chờ nút kích hoạt trong background tab)
        const sendSelectors = [
            'button[data-testid="send-button"]',
            'button[aria-label*="Send prompt" i]',
            'button[aria-label*="Send message" i]',
            'button[aria-label*="Send" i]',
            'button[aria-label*="Gửi lời nhắc" i]',
            'button[aria-label*="Gửi tin nhắn" i]',
            'button[aria-label*="Gửi" i]',
        ];

        let sendBtn = null;
        for (let i = 0; i < 30; i++) {
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' && btn.offsetParent !== null) {
                    const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
                    const isExcluded =
                        testId.includes('speech') ||
                        testId.includes('stop') ||
                        label.includes('mic') ||
                        label.includes('voice') ||
                        label.includes('nói') ||
                        label.includes('dictate') ||
                        label.includes('ngừng') ||
                        label.includes('dừng') ||
                        label.includes('stop') ||
                        label.includes('cancel');
                    if (!isExcluded) {
                        sendBtn = btn;
                        break;
                    }
                }
            }
            if (sendBtn) break;
            await new Promise((r) => setTimeout(r, 100));
        }

        if (sendBtn) {
            console.log('[Kaiz Bridge][ChatGPT] Tìm thấy send-button hợp lệ, click nút gửi duy nhất 1 lần:', sendBtn);
            sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true }));
            sendBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true }));
            sendBtn.click();
        } else {
            console.log('[Kaiz Bridge][ChatGPT] Nút gửi chưa kích hoạt, gửi duy nhất 1 lần qua phím Enter...');
            inputEl.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                    composed: true,
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
                    composed: true,
                }),
            );
        }

        // 5. CƠ CHẾ 2 GIAI ĐOẠN DỰA TRÊN VÒNG ĐỜI NÚT STOP (LIFECYCLE STATE MACHINE)
        const timeoutMs = 85000;
        const startTime = Date.now();
        console.log('[Kaiz Bridge][ChatGPT] 🚀 Đã gửi prompt. Bắt đầu Phase 1: Chờ nút Stop xuất hiện...');

        const isChatGPTGenerating = () => {
            const stopSelectors = [
                'button[data-testid="stop-button"]',
                'button[aria-label*="Stop" i]',
                'button[aria-label*="Dừng" i]',
                'button[aria-label*="Ngừng" i]',
                'button.stop-button',
            ];
            for (const sel of stopSelectors) {
                const btn = document.querySelector(sel);
                if (btn && btn.offsetParent !== null) return true;
            }
            // Kiểm tra trạng thái streaming / đang sinh phản hồi của ChatGPT
            const streaming = document.querySelector('.result-streaming, div[class*="streaming"]');
            if (streaming && streaming.offsetParent !== null) return true;
            return false;
        };

        const findNewValidChatGPTImage = () => {
            const currentImages = Array.from(document.querySelectorAll('img'));
            for (const img of currentImages) {
                const src = img.src || '';
                const isNew = !existingImages.has(src);
                const isImageHost =
                    src.includes('oaiusercontent.com') ||
                    src.includes('files.oaiusercontent') ||
                    src.includes('openai.com') ||
                    src.startsWith('blob:') ||
                    src.startsWith('data:image');
                const isNotAvatar =
                    !src.includes('avatar') &&
                    !src.includes('profile') &&
                    !src.includes('logo') &&
                    !src.includes('icon') &&
                    !img.closest('[data-testid*="avatar"]') &&
                    !img.closest('.avatar');
                const isLoaded = img.complete && (img.naturalWidth >= 200 || img.width >= 200);

                if (src && isNew && isImageHost && isNotAvatar && isLoaded) {
                    return img;
                }
            }
            return null;
        };

        const checkChatGPTRefusal = () => {
            const bodyText = document.body.innerText || '';
            const lower = bodyText.toLowerCase();
            const refusalKeywords = [
                'cannot generate that image',
                "can't generate that image",
                'unable to generate',
                'unable to create',
                'cannot fulfill this request',
                "can't fulfill this request",
                'content policy',
                'usage policies',
                'chính sách nội dung',
                'chính sách sử dụng',
                'không thể tạo ảnh',
                'không thể vẽ',
                'không thể tạo hình ảnh',
                'vi phạm chính sách',
            ];
            for (const kw of refusalKeywords) {
                if (lower.includes(kw)) {
                    return true;
                }
            }
            return false;
        };

        const deliverChatGPTImageResult = async (img) => {
            console.log('[Kaiz Bridge][ChatGPT] 🎉 Xử lý trích xuất ảnh:', (img.src || '').substring(0, 100));
            let base64 = null;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl && dataUrl.startsWith('data:image')) {
                    base64 = dataUrl;
                }
            } catch (canvasErr) {
                // CORS tainted
            }

            if (!base64 && img.src.startsWith('blob:')) {
                try {
                    const blob = await fetch(img.src).then((r) => r.blob());
                    base64 = await blobToBase64(blob);
                } catch (e) {
                    console.warn('[Kaiz Bridge][ChatGPT] fetch blob error:', e);
                }
            }

            if (!base64) {
                base64 = await fetchImageAsBase64(img.src);
            }

            GM_setValue('KAIZ_JOB_RESULT', {
                id: job.id,
                status: 'success',
                provider: 'chatgpt',
                base64: base64,
                timestamp: Date.now(),
            });
            console.log('[Kaiz Bridge][ChatGPT] Đã gửi kết quả Base64 về SillyTavern!');
        };

        // GIAI ĐOẠN 1: CHỜ NÚT STOP XUẤT HIỆN
        let hasStarted = false;
        const phase1MaxWait = 25000;
        const phase1Start = Date.now();

        while (Date.now() - phase1Start < phase1MaxWait) {
            const earlyImg = findNewValidChatGPTImage();
            if (earlyImg) {
                await deliverChatGPTImageResult(earlyImg);
                return;
            }

            if (isChatGPTGenerating()) {
                hasStarted = true;
                console.log('[Kaiz Bridge][ChatGPT] 🟢 Nút Stop đã xuất hiện! Chuyển sang Phase 2: Theo dõi.');
                break;
            }

            if (checkChatGPTRefusal()) {
                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
            }

            await new Promise((r) => setTimeout(r, 400));
        }

        if (!hasStarted) {
            const lastCheckImg = findNewValidChatGPTImage();
            if (lastCheckImg) {
                await deliverChatGPTImageResult(lastCheckImg);
                return;
            }
            throw new Error('Không phát hiện ChatGPT bắt đầu tạo ảnh sau 25s (nút Stop không xuất hiện, có thể do mạng chậm hoặc prompt chưa gửi).');
        }

        // GIAI ĐOẠN 2: THEO DÕI CHO ĐẾN KHI NÚT STOP BIẾN MẤT
        console.log('[Kaiz Bridge][ChatGPT] ⏳ Đang theo dõi tiến trình tạo ảnh...');
        let finishedCheckCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 800));

            const newImg = findNewValidChatGPTImage();
            if (newImg) {
                await deliverChatGPTImageResult(newImg);
                return;
            }

            // Kiểm tra nếu ChatGPT trả lời từ chối giữa chừng
            if (checkChatGPTRefusal()) {
                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
            }

            const isGen = isChatGPTGenerating();
            if (isGen) {
                finishedCheckCount = 0;
            } else {
                finishedCheckCount++;
                if (finishedCheckCount >= 2) {
                    console.log('[Kaiz Bridge][ChatGPT] ⚠️ Nút Stop đã biến mất. Quét ảnh lần cuối...');
                    await new Promise((r) => setTimeout(r, 1200));

                    const finalImg = findNewValidChatGPTImage();
                    if (finalImg) {
                        await deliverChatGPTImageResult(finalImg);
                        return;
                    }

                    throw new Error('ChatGPT đã kết thúc phản hồi nhưng không tạo ảnh (bị từ chối kiểm duyệt nội dung hoặc chỉ trả lời văn bản).');
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 85s) nhưng không thấy ảnh mới từ ChatGPT Web.');
    }
})();
