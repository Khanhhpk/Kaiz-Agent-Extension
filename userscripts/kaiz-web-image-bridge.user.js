// ==UserScript==
// @name         Kaiz Web Image Bridge (SillyTavern <-> Gemini / ChatGPT)
// @namespace    https://github.com/Khanhhpk/Kaiz-Agent-Extension
// @version      1.2.19
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
                        const ts = parts[3] ? parseInt(parts[3], 10) : parts[2] ? parseInt(parts[2], 10) : 0;
                        // Cũ hơn 200 giây hoặc key không xác định được timestamp -> xóa sạch rác
                        if (!ts || isNaN(ts) || now - ts > 200000) {
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
                window.postMessage({ type: 'KAIZ_BRIDGE_PONG', version: '1.2.13' }, '*');
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
    // HỆ THỐNG CHỐNG SLEEP, UNFREEZE RENDER & KICKSTART LIÊN TỤC TRONG BACKGROUND TAB
    // =========================================================================

    // 1. Visibility & Focus Spoofing: Đánh lừa trình duyệt và React luôn thấy tab ở trạng thái Active & Focused
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

        try {
            document.hasFocus = () => true;
            Document.prototype.hasFocus = () => true;
        } catch (e) {}

        if (win && win.document) {
            setProp(win.document, 'hidden', false);
            setProp(win.document, 'visibilityState', 'visible');
            setProp(win.document, 'webkitVisibilityState', 'visible');
            try {
                win.document.hasFocus = () => true;
                if (win.Document && win.Document.prototype) {
                    win.Document.prototype.hasFocus = () => true;
                }
            } catch (e) {}
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

    // 2. Chống đóng băng requestAnimationFrame trong Background Tab
    // Trình duyệt Chromium tự động dừng 100% requestAnimationFrame khi tab ở chế độ nền (background tab).
    // React 18 / Next.js / animation transition mask của ChatGPT sẽ bị đứng hình chờ người dùng click tab mới chịu render ảnh!
    // Bằng cách proxy rAF kèm timeout fallback 25ms, React sẽ render mượt mà ngay cả khi tab hoàn toàn chạy ngầm!
    try {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const nativeRAF = (win.requestAnimationFrame || window.requestAnimationFrame).bind(win);
        const nativeCAF = (win.cancelAnimationFrame || window.cancelAnimationFrame).bind(win);

        const rafCallbacks = new Map();
        let nextRafId = 100000;

        win.requestAnimationFrame = function (cb) {
            const id = ++nextRafId;
            let called = false;

            const wrappedCb = (time) => {
                if (!called) {
                    called = true;
                    rafCallbacks.delete(id);
                    try {
                        cb(time);
                    } catch (err) {
                        /* ignore callback errors */
                    }
                }
            };

            let nativeId = null;
            try {
                nativeId = nativeRAF(wrappedCb);
            } catch (e) {}

            // Nếu Chromium đóng băng native rAF (tab ngầm), kích hoạt fallback sau 25ms
            const timerId = setTimeout(() => {
                if (!called) {
                    wrappedCb(performance.now());
                }
            }, 25);

            rafCallbacks.set(id, {
                nativeId,
                timerId,
                cancel: () => {
                    called = true;
                    clearTimeout(timerId);
                },
            });
            return id;
        };

        win.cancelAnimationFrame = function (id) {
            const item = rafCallbacks.get(id);
            if (item) {
                item.cancel();
                if (item.nativeId) {
                    try {
                        nativeCAF(item.nativeId);
                    } catch (e) {}
                }
                rafCallbacks.delete(id);
            } else {
                try {
                    nativeCAF(id);
                } catch (e) {}
            }
        };
    } catch (e) {
        console.warn('[Kaiz Bridge] requestAnimationFrame unfreezer error:', e);
    }

    // 3. Hàm Kickstart & Đánh thức Rendering nền (Chống lazy loading / IntersectionObserver bị treo)
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

    const wakeUpBackgroundRendering = () => {
        try {
            kickstartTab();

            // Ép tất cả ảnh lazy chuyển sang eager để không bị treo bởi IntersectionObserver của Chromium
            const lazyImages = document.querySelectorAll('img[loading="lazy"]');
            for (const img of lazyImages) {
                img.loading = 'eager';
            }

            // Tự động cuộn xuống đáy để kích hoạt trigger IntersectionObserver và mount tin nhắn mới
            window.scrollTo(0, document.body.scrollHeight);
            const scrollContainers = document.querySelectorAll(
                '[class*="react-scroll-to-bottom"], main, div[role="presentation"], div[class*="overflow-y-auto"]',
            );
            for (const el of scrollContainers) {
                if (el.scrollHeight > el.clientHeight) {
                    el.scrollTop = el.scrollHeight;
                }
            }

            // Cuộn tin nhắn cuối của assistant vào tầm nhìn
            const lastAssistantMsg = document.querySelector(
                '[data-message-author-role="assistant"]:last-of-type, article:last-of-type',
            );
            if (lastAssistantMsg && typeof lastAssistantMsg.scrollIntoView === 'function') {
                lastAssistantMsg.scrollIntoView({ behavior: 'instant', block: 'end' });
            }
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
        console.log(
            `[Kaiz Bridge][${CURRENT_TARGET}] ⚡ Nhận xung Kickstart từ SillyTavern (chạy ngầm, không nhảy tab).`,
        );
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
                    const rawLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const normLabel = rawLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const isStopOrCancel =
                        normLabel.includes('ngung') ||
                        normLabel.includes('dung') ||
                        normLabel.includes('stop') ||
                        normLabel.includes('cancel') ||
                        normLabel.includes('huy');
                    const isMicOrAttach =
                        normLabel.includes('mic') ||
                        normLabel.includes('micro') ||
                        normLabel.includes('menu') ||
                        normLabel.includes('tep') ||
                        normLabel.includes('file') ||
                        normLabel.includes('them') ||
                        normLabel.includes('add');

                    if (!isStopOrCancel && !isMicOrAttach) {
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
            console.log(
                '[Kaiz Bridge][Gemini] Nút gửi chưa kích hoạt, gửi duy nhất 1 lần qua phím Enter trên ô input...',
            );
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
        const timeoutMs = 150000;
        const startTime = Date.now();
        let promptAnchor = null;
        console.log('[Kaiz Bridge][Gemini] 🚀 Đã gửi prompt. Bắt đầu Phase 1: Chờ nút Cancel xuất hiện...');

        // Định vị phần tử prompt của người dùng để làm Cột mốc tọa độ DOM
        const findPromptAnchor = () => {
            const selectors = [
                'user-query',
                '[data-test-id="user-query"]',
                '.user-query',
                '.query-content',
                'div[class*="user-query"]',
            ];
            for (const sel of selectors) {
                const elements = Array.from(document.querySelectorAll(sel));
                if (elements.length > 0) {
                    const promptSnippet = (job.prompt || '').trim().slice(0, 30);
                    for (let i = elements.length - 1; i >= 0; i--) {
                        if (
                            promptSnippet &&
                            elements[i].textContent &&
                            elements[i].textContent.includes(promptSnippet)
                        ) {
                            return elements[i];
                        }
                    }
                    return elements[elements.length - 1];
                }
            }
            const promptSnippet = (job.prompt || '').trim().slice(0, 30);
            if (promptSnippet) {
                const candidates = Array.from(document.querySelectorAll('p, div, span')).filter((el) => {
                    return (
                        el.textContent &&
                        el.textContent.includes(promptSnippet) &&
                        !el.closest('rich-textarea') &&
                        !el.closest('.ql-editor') &&
                        !el.closest('textarea')
                    );
                });
                if (candidates.length > 0) {
                    return candidates[candidates.length - 1];
                }
            }
            return null;
        };

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

        // Hàm tìm ảnh mới hợp lệ trên trang: Quét Bottom-to-Top, kiểm tra Cột mốc DOM
        const findNewValidImage = () => {
            const currentImages = Array.from(document.querySelectorAll('img'));
            // Duyệt ngược từ dưới lên trên (Bottom-to-Top)
            for (let i = currentImages.length - 1; i >= 0; i--) {
                const img = currentImages[i];
                const src = img.currentSrc || img.src || img.getAttribute('src') || '';
                if (!src) continue;

                // 1. Kiểm tra Cột mốc tọa độ DOM (DOM Positional Anchor)
                if (promptAnchor) {
                    const pos = promptAnchor.compareDocumentPosition(img);
                    // Nếu ảnh nằm phía trước câu prompt trong DOM -> chắc chắn là ảnh cũ của lượt chat trước
                    if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
                        continue;
                    }
                } else {
                    // Fallback nếu không định vị được promptAnchor
                    if (existingImages.has(src)) continue;
                }

                // 2. Lọc host ảnh hợp lệ
                const isImageHost =
                    src.includes('googleusercontent.com') ||
                    src.includes('gstatic.com') ||
                    src.startsWith('blob:') ||
                    src.startsWith('data:image');
                if (!isImageHost) continue;

                // 3. Lọc bỏ avatar, icon, logo rõ ràng (bằng keyword chuẩn hóa)
                const alt = (img.alt || '').toLowerCase();
                const className = (typeof img.className === 'string' ? img.className : '').toLowerCase();
                const isAvatarOrLogo =
                    src.includes('avatar') ||
                    src.includes('profile') ||
                    src.includes('favicon') ||
                    src.includes('emoji') ||
                    alt.includes('avatar') ||
                    alt.includes('profile') ||
                    className.includes('avatar') ||
                    className.includes('profile');
                if (isAvatarOrLogo) continue;

                // 4. Kiểm tra kích thước: Ảnh tạo bởi AI luôn là ảnh lớn (ít nhất rộng >= 200px)
                // Lưu ý: Không dùng img.closest('button') vì thẻ ảnh của Gemini nằm trong nút để click phóng to
                const w = img.naturalWidth || img.width || img.clientWidth || 0;
                const h = img.naturalHeight || img.height || img.clientHeight || 0;
                const isBigEnough = w >= 200 && (h >= 100 || h === 0);

                if (img.complete && isBigEnough) {
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
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
            });
            console.log('[Kaiz Bridge][Gemini] Đã gửi kết quả Base64 về SillyTavern!');
        };

        // =========================================================================
        // GIAI ĐOẠN 1: CHỜ NÚT CANCEL XUẤT HIỆN (Khởi động tiến trình)
        // Tuyệt đối KHÔNG bắt ảnh sớm trong Phase 1 vì AI không thể sinh ảnh trong vài giây đầu!
        // =========================================================================
        let hasStarted = false;
        const phase1MaxWait = 40000; // Tối đa 40s cho mạng chậm
        const phase1Start = Date.now();

        while (Date.now() - phase1Start < phase1MaxWait) {
            // Định vị promptAnchor nếu chưa có
            if (!promptAnchor) {
                promptAnchor = findPromptAnchor();
                if (promptAnchor) {
                    console.log('[Kaiz Bridge][Gemini] 📍 Đã định vị Cột mốc Prompt Anchor:', promptAnchor);
                }
            }

            // Nút Cancel đã xuất hiện -> Khởi động thành công!
            if (isGeminiGenerating()) {
                hasStarted = true;
                console.log(
                    '[Kaiz Bridge][Gemini] 🟢 Nút Cancel đã xuất hiện! Chuyển sang Phase 2: Theo dõi tiến trình.',
                );
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
            throw new Error(
                'Không phát hiện Gemini bắt đầu tạo ảnh sau 40s (nút Cancel không xuất hiện, có thể do lỗi mạng hoặc prompt chưa gửi được).',
            );
        }

        // =========================================================================
        // GIAI ĐOẠN 2: THEO DÕI CHO TỚI KHI NÚT CANCEL BIẾN MẤT (Chu trình chuẩn)
        // Tuyệt đối KHÔNG bắt ảnh trong khi AI đang sinh (isGenerating === true).
        // Chỉ lấy ảnh khi AI đã hoàn tất toàn bộ chu trình và nút Cancel đã biến mất.
        // =========================================================================
        console.log('[Kaiz Bridge][Gemini] ⏳ Đang theo dõi tiến trình tạo ảnh...');
        let finishedCheckCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 800));

            // Cập nhật lại promptAnchor nếu trước đó chưa tìm thấy
            if (!promptAnchor) {
                promptAnchor = findPromptAnchor();
            }

            // Kiểm tra trạng thái nút Cancel - KHÔNG bắt ảnh khi đang generate!
            const isGen = isGeminiGenerating();
            if (isGen) {
                finishedCheckCount = 0; // Đang sinh nội dung -> reset bộ đếm, kiên nhẫn chờ
            } else {
                // Nút Cancel đã biến mất!
                // Debounce 2 nhịp liên tiếp (~1.6s) để tránh lỗi re-render / chớp tắt của UI Angular
                finishedCheckCount++;
                if (finishedCheckCount >= 2) {
                    console.log('[Kaiz Bridge][Gemini] ⚠️ Nút Cancel đã biến mất (AI hoàn tất). Quét ảnh kết quả...');
                    
                    // Quét lặp lại tối đa 15 giây phòng khi browser cần thời gian giải mã và mount ảnh
                    const scanStart = Date.now();
                    while (Date.now() - scanStart < 15000) {
                        const finalImg = findNewValidImage();
                        if (finalImg) {
                            await deliverImageResult(finalImg);
                            return;
                        }
                        await new Promise((r) => setTimeout(r, 600));
                    }

                    // Hết 15s sau khi nút Cancel biến mất mà vẫn không thấy ảnh
                    throw new Error(
                        'Gemini đã kết thúc phản hồi nhưng không tạo ảnh (bị từ chối kiểm duyệt hoặc không thực thi lệnh vẽ).',
                    );
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 150s) nhưng không phát hiện ảnh mới từ Gemini Web.');
    }

    // =========================================================================
    // 4. CHATGPT WEB AUTOMATION (HỖ TRỢ ĐẦY ĐỦ BACKGROUND TAB)
    // =========================================================================
    async function executeChatGPTJob(job) {
        // 1. Snapshot URL các ảnh hiện có
        const existingImages = new Set(
            Array.from(
                document.querySelectorAll(
                    'img, a[download], a[href*="backend-api/estuary"], a[href*="oaiusercontent"]',
                ),
            )
                .map((el) => el.currentSrc || el.src || el.href || el.getAttribute('src') || el.getAttribute('href'))
                .filter(Boolean),
        );
        console.log(`[Kaiz Bridge][ChatGPT] Đã snapshot ${existingImages.size} ảnh/tài nguyên cũ trên trang.`);

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
        await new Promise((r) => setTimeout(r, 300));

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
                if (
                    btn &&
                    !btn.disabled &&
                    btn.getAttribute('aria-disabled') !== 'true' &&
                    (btn.offsetParent !== null || btn.isConnected)
                ) {
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
        const timeoutMs = 150000;
        const startTime = Date.now();
        let promptAnchor = null;
        console.log('[Kaiz Bridge][ChatGPT] 🚀 Đã gửi prompt. Bắt đầu Phase 1: Chờ nút Stop xuất hiện...');

        const isChatGPTGenerating = () => {
            const stopSelectors = [
                'button[data-testid="stop-button"]',
                'button[aria-label*="Stop" i]',
                'button[aria-label*="Dừng" i]',
                'button[aria-label*="Cancel" i]',
                'button.stop-button',
                '.text-2xl[aria-label*="Stop" i]',
            ];
            for (const sel of stopSelectors) {
                const btn = document.querySelector(sel);
                if (btn && (btn.offsetParent !== null || btn.isConnected)) return true;
            }

            // Kiểm tra trạng thái streaming của ChatGPT (SVG spinner hoặc hiệu ứng typing)
            const streaming = document.querySelector(
                'button[data-testid="stop-button"], [data-testid="composer-speech-button"] svg.animate-spin',
            );
            if (streaming) return true;

            return false;
        };

        // Lấy container tin nhắn gần nhất của Assistant
        const getLastAssistantMsg = () => {
            const list = document.querySelectorAll(
                '[data-message-author-role="assistant"], article, div[class*="agent-turn"], div[data-testid^="conversation-turn-"]',
            );
            return list.length > 0 ? list[list.length - 1] : null;
        };

        // Định vị phần tử prompt người dùng vừa gửi để làm Cột mốc tọa độ DOM
        const findChatGPTPromptAnchor = () => {
            const userTurns = Array.from(
                document.querySelectorAll(
                    '[data-message-author-role="user"], div[data-testid^="conversation-turn-"]:has([data-message-author-role="user"])',
                ),
            );
            if (userTurns.length > 0) {
                const promptSnippet = (job.prompt || '').trim().slice(0, 30);
                for (let i = userTurns.length - 1; i >= 0; i--) {
                    if (promptSnippet && userTurns[i].textContent && userTurns[i].textContent.includes(promptSnippet)) {
                        return userTurns[i];
                    }
                }
                return userTurns[userTurns.length - 1];
            }
            return null;
        };

        // Kiểm tra xem có placeholder/skeleton của tiến trình tạo ảnh DALL-E đang chạy không
        const isImageStillLoadingOrRendering = () => {
            const lastMsg = getLastAssistantMsg() || document.body;
            const placeholder = lastMsg.querySelector(
                'div[class*="aspect-"], div[class*="skeleton"], .animate-pulse, svg[class*="spin"], div[aria-label*="image" i], div[aria-label*="ảnh" i], div[class*="loading"], [data-testid*="image-placeholder"]',
            );
            return !!placeholder;
        };

        // Hàm tìm ứng viên ảnh mới sinh từ ChatGPT (Ưu tiên quét tin nhắn cuối cùng trước để phản hồi cực nhanh)
        const findChatGPTImageCandidate = () => {
            const lastMsg = getLastAssistantMsg();
            // CHỈ tìm kiếm trong tin nhắn cuối của Assistant nếu có, không quét lan ra ngoài
            const searchScopes = lastMsg ? [lastMsg] : [document.body];

            for (const scope of searchScopes) {
                // 1. Quét thẻ img (từ dưới lên trên)
                const currentImages = Array.from(scope.querySelectorAll('img'));
                for (let i = currentImages.length - 1; i >= 0; i--) {
                    const img = currentImages[i];
                    const src = img.currentSrc || img.src || img.getAttribute('src') || '';
                    if (!src) continue;

                    // Kiểm tra Cột mốc tọa độ DOM
                    if (promptAnchor) {
                        const pos = promptAnchor.compareDocumentPosition(img);
                        if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
                            continue;
                        }
                        if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) {
                            continue;
                        }
                    } else {
                        if (existingImages.has(src)) continue;
                    }

                    // Nhận diện URL ảnh đặc trưng của ChatGPT
                    const isEstuary = src.includes('backend-api/estuary/content') || src.includes('estuary/content');
                    const isOAI =
                        src.includes('oaiusercontent.com') ||
                        src.includes('files.oaiusercontent') ||
                        src.includes('openai.com') ||
                        src.includes('oaistatic.com');
                    const isBlobOrData = src.startsWith('blob:') || src.startsWith('data:image');
                    const isChatGPTPattern = isEstuary || isOAI || isBlobOrData;

                    // Nhận diện alt text
                    const alt = (img.alt || '').toLowerCase();
                    const isGeneratedAlt =
                        alt.includes('generated image') ||
                        alt.includes('dall') ||
                        alt.includes('image') ||
                        alt.includes('ảnh');

                    // Loại trừ avatar
                    const isAvatar =
                        alt.includes('avatar') ||
                        alt === 'chatgpt' ||
                        alt === 'user' ||
                        (img.getAttribute('data-testid') || '').includes('avatar') ||
                        (img.width > 0 && img.width <= 64) ||
                        (img.naturalWidth > 0 && img.naturalWidth <= 64) ||
                        (img.clientHeight > 0 && img.clientHeight <= 64);

                    const w = img.naturalWidth || img.width || img.clientWidth || 0;
                    const h = img.naturalHeight || img.height || img.clientHeight || 0;
                    const isBigEnough = w >= 200 && (h >= 100 || h === 0);

                    if (!isAvatar && isBigEnough && (isChatGPTPattern || isGeneratedAlt || (lastMsg && scope === lastMsg))) {
                        return { el: img, src: src };
                    }
                }

                // 2. Dự phòng: Quét các thẻ a có link tải về trỏ tới estuary / oaiusercontent
                const downloadLinks = Array.from(
                    scope.querySelectorAll('a[href*="backend-api/estuary"], a[href*="oaiusercontent"], a[download]'),
                );
                for (let i = downloadLinks.length - 1; i >= 0; i--) {
                    const a = downloadLinks[i];
                    const href = a.href || a.getAttribute('href') || '';
                    if (!href || existingImages.has(href)) continue;
                    if (href.includes('estuary') || href.includes('oaiusercontent')) {
                        return { el: a, src: href };
                    }
                }
            }

            return null;
        };

        const checkChatGPTRefusal = () => {
            const lastMsg = getLastAssistantMsg();
            const textToCheck = ((lastMsg?.innerText || '') + '\n' + (document.body.innerText || '')).toLowerCase();

            const refusalKeywords = [
                'cannot generate that image',
                "can't generate that image",
                'cannot generate images',
                "can't generate images",
                'cannot create that image',
                "can't create that image",
                'cannot create images',
                "can't create images",
                'unable to generate',
                'unable to create',
                'cannot fulfill this request',
                "can't fulfill this request",
                'unable to fulfill',
                'content policy',
                'usage policy',
                'usage policies',
                'safety guidelines',
                'chính sách nội dung',
                'chính sách sử dụng',
                'không thể tạo ảnh',
                'không thể vẽ',
                'không thể tạo hình ảnh',
                'không thể thực hiện yêu cầu',
                'vi phạm chính sách',
                'sorry, i cannot',
                "sorry, i can't",
                "i'm sorry, but i cannot",
                "i'm sorry, but i can't",
                'i apologize, but i cannot',
                "i apologize, but i can't",
                'not allowed to generate',
                'not permitted to generate',
                'against our safety policies',
                'against our policy',
                'against content guidelines',
                'cannot depict',
                "can't depict",
                'cannot illustrate',
                "can't illustrate",
            ];
            for (const kw of refusalKeywords) {
                if (textToCheck.includes(kw)) {
                    return true;
                }
            }
            return false;
        };

        const deliverChatGPTImageResult = async (candidate) => {
            const src =
                candidate.src ||
                candidate.currentSrc ||
                (candidate.getAttribute && candidate.getAttribute('src')) ||
                '';
            console.log('[Kaiz Bridge][ChatGPT] 🎉 Xử lý trích xuất ảnh:', src.substring(0, 100));
            let base64 = null;

            // Kỹ thuật 1 (Tối ưu nhất cho Background Tab): Fetch trực tiếp qua network với credentials
            // Chạy ngầm 100% độc lập, không phụ thuộc vào GPU rasterization hay canvas
            if (src && !src.startsWith('data:')) {
                try {
                    console.log('[Kaiz Bridge][ChatGPT] 🚀 Đang tải blob ảnh trực tiếp qua fetch credentials...');
                    const res = await fetch(src, { credentials: 'include' });
                    if (res.ok) {
                        const blob = await res.blob();
                        if (blob && blob.size > 2000) {
                            base64 = await blobToBase64(blob);
                            console.log(
                                `[Kaiz Bridge][ChatGPT] ✅ Tải ảnh thành công qua fetch (${Math.round(blob.size / 1024)} KB)!`,
                            );
                        }
                    } else {
                        console.warn('[Kaiz Bridge][ChatGPT] Fetch status:', res.status);
                    }
                } catch (fetchErr) {
                    console.warn('[Kaiz Bridge][ChatGPT] Fetch error:', fetchErr);
                }
            }

            // Kỹ thuật 2: Fallback GM_xmlhttpRequest (Bypass CORS, CSP và tab throttling)
            if (!base64 && src && !src.startsWith('data:')) {
                try {
                    console.log('[Kaiz Bridge][ChatGPT] Đang tải ảnh qua GM_xmlhttpRequest fallback...');
                    base64 = await fetchImageAsBase64(src);
                    console.log('[Kaiz Bridge][ChatGPT] ✅ GM_xmlhttpRequest tải ảnh thành công!');
                } catch (e) {
                    console.warn('[Kaiz Bridge][ChatGPT] GM_xmlhttpRequest error:', e);
                }
            }

            // Kỹ thuật 3: Fallback Canvas (chỉ dùng nếu src là data:image hoặc fetch thất bại và element là img)
            if (!base64 && candidate.el && candidate.el.tagName && candidate.el.tagName.toLowerCase() === 'img') {
                try {
                    const img = candidate.el;
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || img.width || 1024;
                    canvas.height = img.naturalHeight || img.height || 1024;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    if (dataUrl && dataUrl.startsWith('data:image/png') && dataUrl.length > 1000) {
                        base64 = dataUrl;
                        console.log('[Kaiz Bridge][ChatGPT] ✅ Trích xuất Base64 thành công qua Canvas!');
                    }
                } catch (canvasErr) {
                    console.log('[Kaiz Bridge][ChatGPT] Canvas fallback không khả dụng:', canvasErr.message);
                }
            }

            // Kỹ thuật 4: Nếu src là data:image sẵn
            if (!base64 && src.startsWith('data:image')) {
                base64 = src;
            }

            if (!base64) {
                throw new Error('Đã tìm thấy ảnh nhưng không thể trích xuất dữ liệu Base64 từ ChatGPT.');
            }

            GM_setValue('KAIZ_JOB_RESULT', {
                id: job.id,
                status: 'success',
                provider: 'chatgpt',
                base64: base64,
                durationMs: Date.now() - startTime,
                timestamp: Date.now(),
            });
            console.log('[Kaiz Bridge][ChatGPT] 🚀 Đã gửi kết quả Base64 về SillyTavern thành công!');
        };

        // =========================================================================
        // GIAI ĐOẠN 1: CHỜ NÚT STOP XUẤT HIỆN (Khởi động tiến trình)
        // Tuyệt đối KHÔNG bắt ảnh sớm trong Phase 1!
        // =========================================================================
        let hasStarted = false;
        const phase1MaxWait = 30000; // Tối đa 30s: ChatGPT đôi khi bắt đầu gen nhưng nút Stop hiện sau vài giây
        const phase1Start = Date.now();

        while (Date.now() - phase1Start < phase1MaxWait) {
            if (!promptAnchor) {
                promptAnchor = findChatGPTPromptAnchor();
            }

            if (isChatGPTGenerating()) {
                hasStarted = true;
                console.log('[Kaiz Bridge][ChatGPT] 🟢 Nút Stop đã xuất hiện! Chuyển sang Phase 2: Theo dõi.');
                break;
            }

            if (checkChatGPTRefusal()) {
                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
            }

            await new Promise((r) => setTimeout(r, 200));
        }

        if (!hasStarted) {
            if (checkChatGPTRefusal()) {
                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
            }
            throw new Error(
                'Không phát hiện ChatGPT bắt đầu tạo ảnh sau 30s (nút Stop không xuất hiện, có thể do mạng chậm hoặc prompt chưa gửi).',
            );
        }

        // =========================================================================
        // GIAI ĐOẠN 2: THEO DÕI CHO ĐẾN KHI KẾT THÚC HOÀN TOÀN (Chu trình chuẩn)
        // Tuyệt đối KHÔNG bắt ảnh trong khi AI đang sinh (isGenerating === true).
        // =========================================================================
        console.log('[Kaiz Bridge][ChatGPT] ⏳ Đang theo dõi tiến trình tạo ảnh...');
        let finishedCheckCount = 0;

        while (Date.now() - startTime < timeoutMs) {
            await new Promise((r) => setTimeout(r, 300));

            // Đánh thức rendering liên tục trong background tab mỗi nhịp
            wakeUpBackgroundRendering();

            if (!promptAnchor) {
                promptAnchor = findChatGPTPromptAnchor();
            }

            // Bắt tức thì nếu ChatGPT gõ câu từ chối trong khi stream
            if (checkChatGPTRefusal()) {
                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
            }

            // Theo dõi vòng đời nút Stop - KHÔNG bắt ảnh khi đang generate!
            const isGen = isChatGPTGenerating();
            if (isGen) {
                finishedCheckCount = 0;
            } else {
                finishedCheckCount++;
                // Xác nhận nút Stop đã biến mất sau 3 nhịp (3 x 300ms ≈ 0.9s)
                if (finishedCheckCount >= 3) {
                    console.log('[Kaiz Bridge][ChatGPT] ⚠️ Nút Stop đã biến mất (AI hoàn tất). Phân tích kết quả...');

                    // Kiểm tra từ chối ngay sau khi stop
                    if (checkChatGPTRefusal()) {
                        throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
                    }

                    // Kiểm tra xem DALL-E có đang tải ảnh không (thẻ skeleton / placeholder loading)
                    const isStillLoading = isImageStillLoadingOrRendering();

                    if (isStillLoading) {
                        console.log(
                            '[Kaiz Bridge][ChatGPT] 🖼️ Phát hiện placeholder đang tải ảnh DALL-E. Kiên nhẫn chờ tối đa 18s...',
                        );
                        const waitStart = Date.now();
                        while (Date.now() - waitStart < 18000) {
                            wakeUpBackgroundRendering();
                            const finalCandidate = findChatGPTImageCandidate();
                            if (finalCandidate && finalCandidate.src) {
                                console.log('[Kaiz Bridge][ChatGPT] 🖼️ Đã phát hiện thẻ ảnh, trích xuất ngay...');
                                await deliverChatGPTImageResult(finalCandidate);
                                return;
                            }
                            if (checkChatGPTRefusal()) {
                                throw new Error('ChatGPT từ chối vẽ ảnh do chính sách an toàn / nội dung.');
                            }
                            await new Promise((r) => setTimeout(r, 300));
                        }
                    } else {
                        // Không có placeholder hoặc đã xong -> Chờ 1.5s để React mount hoàn tất
                        console.log('[Kaiz Bridge][ChatGPT] Chờ 1.5s xác nhận hoàn tất render...');
                        await new Promise((r) => setTimeout(r, 1500));
                        wakeUpBackgroundRendering();
                        const finalCandidate = findChatGPTImageCandidate();
                        if (finalCandidate && finalCandidate.src) {
                            await deliverChatGPTImageResult(finalCandidate);
                            return;
                        }
                    }

                    throw new Error(
                        'ChatGPT đã kết thúc phản hồi nhưng không tạo ảnh (bị từ chối kiểm duyệt nội dung hoặc chỉ trả lời văn bản).',
                    );
                }
            }
        }

        throw new Error('Hết thời gian chờ (Timeout 150s) nhưng không thấy ảnh mới từ ChatGPT Web.');
    }
})();
