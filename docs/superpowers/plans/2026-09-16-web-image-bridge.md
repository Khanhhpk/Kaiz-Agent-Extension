# Web Image Bridge (Gemini Imagen 3 & ChatGPT DALL-E 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng hệ thống cầu nối sinh ảnh trực tiếp từ SillyTavern sang Gemini Web (Google Imagen 3) và ChatGPT Web (DALL-E 3), thu thập ảnh Base64 và nhúng tự động vào chat SillyTavern thông qua Userscript Tampermonkey + Kaiz Agent Tool + Slash Command `/draw`.

**Architecture:** Sử dụng kiến trúc Event Bus xuyên miền thông qua Tampermonkey Storage API (`GM_setValue`, `GM_addValueChangeListener`, `GM_xmlhttpRequest`) làm cầu nối giữa tab SillyTavern (`localhost`) và tab Gemini / ChatGPT Web. Phía SillyTavern có module `WebImageBridge` giao tiếp qua `window.postMessage`, cung cấp Tool `generate_web_image` cho Agent và Slash Command `/draw` cho người dùng.

**Tech Stack:** TypeScript, Rollup, SillyTavern Extension API, Tampermonkey Userscript API (GM_*), Vanilla DOM Manipulation & MutationObserver.

## Global Constraints

- Không tự động can thiệp hay spam "New Chat" trên giao diện Web; người dùng tự quản lý phiên chat (Temporary Chat hoặc Single Thread).
- Sử dụng cơ chế khóa kép (Pre-send image URL snapshot + Scoping to latest response turn + complete image check) để đảm bảo 100% không bắt nhầm ảnh cũ.
- Tải ảnh qua `GM_xmlhttpRequest` (responseType: blob) để vượt qua mọi rào cản CORS của CDN Google/OpenAI, mã hóa sang Base64 Data URL.
- Tuyệt đối tuân thủ ESLint và TypeScript strict typing trong toàn bộ codebase `Kaiz-Agent-Extension`.
- Tuân thủ quy tắc chống lười biếng: viết đầy đủ code, không dùng placeholder `TODO`.

---

### Task 1: Tampermonkey Userscript Bridge (`userscripts/kaiz-web-image-bridge.user.js`)

**Files:**

- Create: `userscripts/kaiz-web-image-bridge.user.js`

**Interfaces:**

- Consumes: `window.postMessage` từ SillyTavern tab (`KAIZ_BRIDGE_IMAGE_REQUEST`).
- Produces: `GM_setValue('KAIZ_PENDING_JOB', job)`, `GM_setValue('KAIZ_JOB_RESULT', result)`, `GM_setValue('KAIZ_HEARTBEAT', heartbeat)`.
- Dispatches: `window.postMessage` về SillyTavern tab (`KAIZ_BRIDGE_IMAGE_RESPONSE`, `KAIZ_BRIDGE_HEARTBEAT_UPDATE`).

- [x] **Step 1: Viết Userscript hoàn chỉnh `userscripts/kaiz-web-image-bridge.user.js`**

```javascript
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
                error: err.message || 'Unknown automation error',
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
```

- [x] **Step 2: Commit Userscript**

```bash
git add userscripts/kaiz-web-image-bridge.user.js
git commit -m "feat(bridge): create Tampermonkey userscript for Gemini and ChatGPT"
```

---

### Task 2: Core Web Image Bridge Client (`src/core/web_image_bridge.ts`)

**Files:**

- Create: `src/core/web_image_bridge.ts`

**Interfaces:**

- Consumes: `window.postMessage` (`KAIZ_BRIDGE_IMAGE_RESPONSE`, `KAIZ_BRIDGE_HEARTBEAT_UPDATE`, `KAIZ_BRIDGE_PONG`).
- Produces: `WebImageBridge.requestImage(options)`, `WebImageBridge.getStatus()`, `WebImageBridge.init()`.

- [ ] **Step 1: Tạo file `src/core/web_image_bridge.ts`**

```typescript
export interface IWebImageJobRequest {
    prompt: string;
    target?: 'gemini' | 'chatgpt' | 'auto';
    timeoutMs?: number;
}

export interface IBridgeStatus {
    userscriptInstalled: boolean;
    geminiOnline: boolean;
    chatgptOnline: boolean;
    lastGeminiSeen?: number;
    lastChatgptSeen?: number;
}

export class WebImageBridge {
    private static pendingJobs = new Map<
        string,
        {
            resolve: (base64: string) => void;
            reject: (err: Error) => void;
            timer: any;
        }
    >();

    private static status: IBridgeStatus = {
        userscriptInstalled: false,
        geminiOnline: false,
        chatgptOnline: false,
    };

    private static isInitialized = false;

    public static init(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        window.addEventListener('message', (event) => {
            if (event.source !== window || !event.data) return;

            const { type, payload } = event.data;

            // 1. Nhận PONG từ Userscript
            if (type === 'KAIZ_BRIDGE_PONG') {
                this.status.userscriptInstalled = true;
            }

            // 2. Nhận Heartbeat từ tab Web
            if (type === 'KAIZ_BRIDGE_HEARTBEAT_UPDATE' && payload) {
                this.status.userscriptInstalled = true;
                const now = Date.now();
                if (payload.target === 'gemini') {
                    this.status.geminiOnline = true;
                    this.status.lastGeminiSeen = now;
                } else if (payload.target === 'chatgpt') {
                    this.status.chatgptOnline = true;
                    this.status.lastChatgptSeen = now;
                }
            }

            // 3. Nhận kết quả vẽ ảnh
            if (type === 'KAIZ_BRIDGE_IMAGE_RESPONSE' && payload) {
                const job = this.pendingJobs.get(payload.id);
                if (job) {
                    clearTimeout(job.timer);
                    this.pendingJobs.delete(payload.id);

                    if (payload.status === 'success' && payload.base64) {
                        job.resolve(payload.base64);
                    } else {
                        job.reject(new Error(payload.error || 'Lỗi không xác định khi sinh ảnh từ Web.'));
                    }
                }
            }
        });

        // Ping kiểm tra Userscript mỗi 5s
        setInterval(() => {
            window.postMessage({ type: 'KAIZ_BRIDGE_PING' }, '*');
            const now = Date.now();
            // Nếu quá 10s không thấy heartbeat thì đánh dấu offline
            if (this.status.lastGeminiSeen && now - this.status.lastGeminiSeen > 10000) {
                this.status.geminiOnline = false;
            }
            if (this.status.lastChatgptSeen && now - this.status.lastChatgptSeen > 10000) {
                this.status.chatgptOnline = false;
            }
        }, 5000);

        // Ping ngay lần đầu
        window.postMessage({ type: 'KAIZ_BRIDGE_PING' }, '*');
        console.log('[WebImageBridge] Initialized.');
    }

    public static getStatus(): IBridgeStatus {
        return { ...this.status };
    }

    public static async requestImage(req: IWebImageJobRequest): Promise<string> {
        this.init();

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timeoutMs = req.timeoutMs || 75000;
        const target = req.target || 'auto';

        // Kiểm tra nhanh xem tab web có mở không
        if (target === 'gemini' && !this.status.geminiOnline) {
            console.warn('[WebImageBridge] Cảnh báo: Tab Gemini Web có thể chưa mở.');
        } else if (target === 'chatgpt' && !this.status.chatgptOnline) {
            console.warn('[WebImageBridge] Cảnh báo: Tab ChatGPT Web có thể chưa mở.');
        }

        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingJobs.delete(jobId);
                reject(
                    new Error(
                        `Hết thời gian chờ (${Math.round(timeoutMs / 1000)}s). Vui lòng đảm bảo bạn đã mở 1 tab Gemini Web (gemini.google.com) hoặc ChatGPT Web (chatgpt.com) và đã cài đặt Userscript Kaiz Bridge.`,
                    ),
                );
            }, timeoutMs);

            this.pendingJobs.set(jobId, { resolve, reject, timer });

            window.postMessage(
                {
                    type: 'KAIZ_BRIDGE_IMAGE_REQUEST',
                    payload: {
                        id: jobId,
                        target: target,
                        prompt: req.prompt,
                    },
                },
                '*',
            );
        });
    }
}
```

- [x] **Step 2: Commit `src/core/web_image_bridge.ts`**

```bash
git add src/core/web_image_bridge.ts
git commit -m "feat(core): add WebImageBridge client module"
```

---

### Task 3: Kaiz Agent Tool `generate_web_image` (`src/core/tools/generate_web_image.ts`)

**Files:**

- Create: `src/core/tools/generate_web_image.ts`
- Modify: `src/core/tools/index.ts`

**Interfaces:**

- Consumes: `WebImageBridge.requestImage`.
- Produces: `generateWebImageTool` (`ITool`).

- [x] **Step 1: Tạo `src/core/tools/generate_web_image.ts`**

```typescript
import { ITool } from '../tool_registry';
import { WebImageBridge } from '../web_image_bridge';

export const generateWebImageTool: ITool = {
    schema: {
        name: 'generate_web_image',
        description:
            'CÔNG CỤ SINH ẢNH MINH HỌA WEB (Gemini Imagen 3 / ChatGPT DALL-E 3). Sử dụng công cụ này khi bạn muốn vẽ một bức ảnh minh họa sống động cho bối cảnh câu chuyện, chân dung nhân vật, hoặc cảnh hành động. Hãy viết prompt bằng tiếng Anh thật chi tiết, giàu tính mô tả (ánh sáng, phong cách nghệ thuật, góc máy, chi tiết nhân vật). Ảnh sau khi tạo sẽ được nhúng trực tiếp vào hội thoại.',
        parameters: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description:
                        'Câu lệnh prompt mô tả bức ảnh chi tiết bằng tiếng Anh (ví dụ: "cinematic anime illustration of a silver-haired knight resting under a blooming cherry blossom tree at sunset, soft volumetric lighting, highly detailed, 8k resolution").',
                },
                target: {
                    type: 'string',
                    enum: ['gemini', 'chatgpt', 'auto'],
                    description:
                        'Nền tảng sinh ảnh mong muốn: "gemini" (Imagen 3 - nhanh, miễn phí) hoặc "chatgpt" (DALL-E 3 / GPT-4o). Mặc định là "auto".',
                },
            },
            required: ['prompt'],
        },
    },
    execute: async (args: any) => {
        try {
            const prompt = args.prompt;
            if (!prompt || typeof prompt !== 'string') {
                return {
                    content: JSON.stringify({ error: "Tham số 'prompt' là bắt buộc." }),
                    isError: true,
                };
            }

            const target = args.target || 'auto';
            console.log(`[Tool: generate_web_image] Đang gửi yêu cầu vẽ sang ${target}:`, prompt);

            const base64 = await WebImageBridge.requestImage({
                prompt,
                target,
                timeoutMs: 80000,
            });

            const markdownImage = `\n\n![Generated Image](${base64})\n\n`;

            return {
                content: JSON.stringify({
                    success: true,
                    message: 'Đã sinh ảnh thành công từ Web.',
                    markdown: markdownImage,
                    preview_length: base64.length,
                }),
                isError: false,
            };
        } catch (err: any) {
            console.error('[Tool: generate_web_image] Thất bại:', err);
            return {
                content: JSON.stringify({
                    error: err.message || 'Lỗi không xác định khi sinh ảnh từ Web.',
                }),
                isError: true,
            };
        }
    },
};
```

- [x] **Step 2: Đăng ký tool trong `src/core/tools/index.ts`**

Import `generateWebImageTool` và gọi `registry.registerTool(generateWebImageTool)` trong `registerDefaultTools`.

- [x] **Step 3: Commit Tool `generate_web_image`**

```bash
git add src/core/tools/generate_web_image.ts src/core/tools/index.ts
git commit -m "feat(tools): add generate_web_image tool"
```

---

### Task 4: Slash Command `/draw` và Core Hook (`src/index.ts`)

**Files:**

- Modify: `src/index.ts`

**Interfaces:**

- Consumes: `SillyTavern.getContext().registerSlashCommand`, `WebImageBridge`.
- Produces: Command `/draw <prompt>` trong SillyTavern chat box.

- [x] **Step 1: Đăng ký slash command `/draw` trong `src/index.ts`**

Trong `src/index.ts`, khởi tạo `WebImageBridge.init()` và đăng ký lệnh:

```typescript
// Khởi tạo WebImageBridge
WebImageBridge.init();

// Đăng ký Slash Command /draw
if (typeof ctx.registerSlashCommand === 'function') {
    ctx.registerSlashCommand(
        'draw',
        async (args: any, value: string) => {
            const prompt = (value || '').trim();
            if (!prompt) {
                toastr.warning('Vui lòng nhập mô tả ảnh sau lệnh /draw (VD: /draw a cute cat)');
                return;
            }
            toastr.info('Đang gửi prompt vẽ ảnh sang Web...');
            try {
                const target = ctx.extensionSettings[EXT_NAME]?.webImageProvider || 'auto';
                const base64 = await WebImageBridge.requestImage({ prompt, target });
                // Gắn ảnh vào chat SillyTavern
                const markdown = `\n\n![Draw: ${prompt}](${base64})\n\n`;
                if (typeof ctx.sendSystemMessage === 'function') {
                    ctx.sendSystemMessage(markdown);
                } else if (typeof ctx.addOneMessage === 'function') {
                    ctx.addOneMessage({
                        is_user: false,
                        name: 'Web Image Bridge',
                        mes: markdown,
                        send_date: Date.now(),
                    });
                }
                toastr.success('Đã vẽ ảnh thành công!');
            } catch (e: any) {
                toastr.error(`Vẽ ảnh thất bại: ${e.message}`);
            }
        },
        [],
        '<mô_tả_ảnh>',
        'Tạo ảnh minh họa thông qua Web Image Bridge (Gemini / ChatGPT)',
        true,
    );
}
```

- [x] **Step 2: Commit thay đổi trong `src/index.ts`**

```bash
git add src/index.ts
git commit -m "feat(slash-commands): register /draw command and init WebImageBridge"
```

---

### Task 5: Giao Diện Cài Đặt Settings Panel (`settings.html` & `src/ui/settings.ts`)

**Files:**

- Modify: `settings.html`
- Modify: `src/ui/settings.ts`

**Interfaces:**

- Consumes: `WebImageBridge.getStatus()`, `ctx.extensionSettings[EXT_NAME]`.
- Produces: Card "Web Image Bridge" trong tab Browser của Settings.

- [x] **Step 1: Thêm giao diện Card vào `settings.html` (trong `kaiz-pane-browser`)**

Thêm card "Web Image Bridge (Gemini / ChatGPT)":

- Toggle kích hoạt
- Select chọn Provider: Tự động (Auto) / Gemini Web (Imagen 3) / ChatGPT Web (DALL-E 3)
- Trạng thái kết nối thời gian thực:
    - Gemini: `🟢 Sẵn sàng` hoặc `🔴 Chưa mở tab`
    - ChatGPT: `🟢 Sẵn sàng` hoặc `🔴 Chưa mở tab`
    - Userscript: `🟢 Đã cài đặt` hoặc `⚠️ Chưa cài Userscript`
- Nút bấm tải/cài đặt Userscript `kaiz-web-image-bridge.user.js`.

- [x] **Step 2: Thêm logic điều khiển trong `src/ui/settings.ts`**

- Lưu các thiết lập `webImageBridgeEnabled`, `webImageProvider`.
- Cập nhật trạng thái badge mỗi 2 giây dựa trên `WebImageBridge.getStatus()`.

- [x] **Step 3: Commit giao diện Settings**

```bash
git add settings.html src/ui/settings.ts
git commit -m "feat(ui): add Web Image Bridge settings panel and real-time status monitor"
```

---

### Task 6: Kiểm Thử Build & Xác Minh Hoàn Tất (Verification)

**Files:**

- Build output: `index.js`, `index.js.map`

- [x] **Step 1: Chạy `npm run build`**

Chạy lệnh: `npm run build`
Yêu cầu: Rollup biên dịch thành công 0 lỗi syntax, tạo ra `index.js`.

- [x] **Step 2: Chạy `npm run lint`**

Chạy lệnh: `npm run lint`
Yêu cầu: Không có lỗi vi phạm ESLint.

- [x] **Step 3: Commit kết quả build và hoàn tất**

```bash
git add index.js index.js.map
git commit -m "build: compile bundle with Web Image Bridge support"
```
