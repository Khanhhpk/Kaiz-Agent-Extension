import { KaizDB } from './db';

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
            timer: ReturnType<typeof setTimeout>;
            startTime: number;
        }
    >();

    private static status: IBridgeStatus = {
        userscriptInstalled: false,
        geminiOnline: false,
        chatgptOnline: false,
    };

    private static lastDeliveredProvider: 'gemini' | 'chatgpt' = 'gemini';
    private static lastDeliveredDuration: number = 0;

    private static isInitialized = false;

    public static init(): void {
        if (this.isInitialized) return;
        this.isInitialized = true;

        window.addEventListener('message', (event) => {
            if (!event.data || !event.data.type) return;

            const { type, payload } = event.data;

            // 1. Nhận PONG từ Userscript
            if (type === 'KAIZ_BRIDGE_PONG') {
                this.status.userscriptInstalled = true;
            }

            // 2. Nhận Heartbeat từ tab Web
            if (type === 'KAIZ_BRIDGE_HEARTBEAT_UPDATE' && payload) {
                this.status.userscriptInstalled = true;
                const now = Date.now();
                const hbTime = typeof payload.timestamp === 'number' ? payload.timestamp : now;
                // Nếu heartbeat còn mới trong vòng 75s thì công nhận online
                if (now - hbTime < 75000) {
                    if (payload.target === 'gemini') {
                        this.status.geminiOnline = true;
                        this.status.lastGeminiSeen = hbTime;
                    } else if (payload.target === 'chatgpt') {
                        this.status.chatgptOnline = true;
                        this.status.lastChatgptSeen = hbTime;
                    }
                }
            }

            // 3. Nhận kết quả vẽ ảnh từ Web
            if (type === 'KAIZ_BRIDGE_IMAGE_RESPONSE' && payload) {
                console.log(
                    '[WebImageBridge] Nhận kết quả ảnh từ Userscript:',
                    payload.id,
                    payload.status,
                    payload.provider,
                );
                if (payload.provider === 'chatgpt' || payload.provider === 'gemini') {
                    this.lastDeliveredProvider = payload.provider;
                }
                const job = this.pendingJobs.get(payload.id);
                if (job) {
                    clearTimeout(job.timer);
                    this.pendingJobs.delete(payload.id);

                    const durationMs =
                        typeof payload.durationMs === 'number' && payload.durationMs > 0
                            ? payload.durationMs
                            : Date.now() - job.startTime;
                    this.lastDeliveredDuration = durationMs;

                    if (payload.status === 'success' && payload.base64) {
                        job.resolve(payload.base64);
                    } else {
                        job.reject(new Error(payload.error || 'Lỗi không xác định khi sinh ảnh từ Web.'));
                    }
                }
            }
        });

        // Ping kiểm tra Userscript mỗi 5s và kiểm tra offline
        // Lưu ý: Đặt ngưỡng 75s vì Chromium có cơ chế Intensive Wake Up Throttling giảm chu kỳ timer của tab chạy ngầm xuống 60s
        setInterval(() => {
            window.postMessage({ type: 'KAIZ_BRIDGE_PING' }, '*');
            const now = Date.now();
            if (this.status.lastGeminiSeen && now - this.status.lastGeminiSeen > 75000) {
                this.status.geminiOnline = false;
            }
            if (this.status.lastChatgptSeen && now - this.status.lastChatgptSeen > 75000) {
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

    public static getLastDeliveredProvider(): 'gemini' | 'chatgpt' {
        return this.lastDeliveredProvider;
    }

    public static getLastDeliveredDuration(): number {
        return this.lastDeliveredDuration;
    }

    public static async requestImage(req: IWebImageJobRequest): Promise<string> {
        this.init();

        const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const timeoutMs = req.timeoutMs || 150000;
        const target = req.target || 'auto';
        const startTime = Date.now();

        // Cảnh báo sớm nếu tab tương ứng chưa mở
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

            this.pendingJobs.set(jobId, { resolve, reject, timer, startTime });

            console.log('[WebImageBridge] 🚀 Gửi job sang Userscript:', jobId, target, req.prompt);
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

    /**
     * Lấy Provider được người dùng cài đặt trong Settings ('gemini' | 'chatgpt' | 'auto')
     */
    public static getConfiguredProvider(): 'gemini' | 'chatgpt' | 'auto' {
        try {
            const ctx =
                typeof (globalThis as any).SillyTavern !== 'undefined'
                    ? (globalThis as any).SillyTavern.getContext()
                    : (globalThis as any).window?.SillyTavern?.getContext?.() || null;
            const prov = ctx?.extensionSettings?.['kaiz_agent']?.webImageProvider;
            if (prov === 'gemini' || prov === 'chatgpt') return prov;
        } catch (_e) {
            /* ignore */
        }
        return 'auto';
    }

    /**
     * Tự động ghép Custom Prompt (Prefix và Suffix) từ cấu hình người dùng
     */
    public static mergeCustomPrompt(basePrompt: string): string {
        try {
            const ctx =
                typeof (globalThis as any).SillyTavern !== 'undefined'
                    ? (globalThis as any).SillyTavern.getContext()
                    : (globalThis as any).window?.SillyTavern?.getContext?.() || null;
            const settings = ctx?.extensionSettings?.['kaiz_agent'];

            let prefix = (settings?.customImagePrefix ?? '').trim();
            let suffix = (settings?.customImageSuffix ?? '').trim();

            // Migration / fallback nếu người dùng còn cấu hình cũ
            if (!prefix && !suffix && settings?.customImagePrompt) {
                const legacy = (settings.customImagePrompt || '').trim();
                if (settings?.customImagePromptPosition === 'prefix') {
                    prefix = legacy;
                } else {
                    suffix = legacy;
                }
            }

            const rawBase = (basePrompt || '').trim();
            const parts: string[] = [];
            if (prefix) parts.push(prefix);
            if (rawBase) parts.push(rawBase);
            if (suffix) parts.push(suffix);

            return parts.join('\n\n').trim();
        } catch (_e) {
            return basePrompt;
        }
    }

    /**
     * Tự động lưu ảnh sinh ra vào IndexedDB Image Gallery
     */
    public static async saveImageToGallery(data: {
        prompt: string;
        base64: string;
        provider: string;
        durationMs?: number;
    }): Promise<void> {
        try {
            const providerName = data.provider && data.provider !== 'auto' ? data.provider : this.lastDeliveredProvider;
            const duration = data.durationMs || this.lastDeliveredDuration || 0;
            await KaizDB.getInstance().addGalleryImage({
                prompt: data.prompt,
                base64: data.base64,
                timestamp: Date.now(),
                provider: providerName,
                durationMs: duration > 0 ? duration : undefined,
            });
            const durationLabel = duration > 0 ? ` (${(duration / 1000).toFixed(1)}s)` : '';
            console.log(`[WebImageBridge] Đã lưu ảnh (${providerName}${durationLabel}) vào Image Gallery thành công.`);
            // Bắn custom event để Gallery UI nếu đang mở thì tự động cập nhật
            window.dispatchEvent(new CustomEvent('kaiz_gallery_updated'));
        } catch (err) {
            console.warn('[WebImageBridge] Không thể lưu ảnh vào Gallery:', err);
        }
    }

    /**
     * Dán ảnh và thông tin prompt trực tiếp vào khung chat SillyTavern
     */
    public static postImageToChat(data: { base64: string; prompt: string; durationMs?: number; provider?: string }): {
        messageSent: boolean;
        imageHtml: string;
    } {
        const { base64, prompt, durationMs = 0 } = data;
        const provider =
            data.provider && data.provider !== 'auto' ? data.provider : this.lastDeliveredProvider || 'WEB';
        const safePrompt = (prompt || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const durationText = `${(durationMs / 1000).toFixed(1)}s`;
        const imageHtml = `<div class="kaiz-draw-result" style="margin: 10px 0; text-align: center;"><img src="${base64}" alt="${safePrompt.replace(/\n+/g, ' ')}" style="max-width: 100%; max-height: 520px; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); object-fit: contain; cursor: pointer; display: inline-block;" onclick="window.open(this.src)" /><div style="margin-top: 6px; font-size: 12px; opacity: 0.85; font-style: italic; white-space: pre-wrap; line-height: 1.4; text-align: left; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); max-width: 520px; margin-left: auto; margin-right: auto;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; opacity: 0.85;"><span>🎨 <b>PROMPT</b></span><span><i class="fa-solid fa-stopwatch"></i> ${durationText} • ${provider.toUpperCase()}</span></div>${safePrompt}</div></div>`;

        let messageSent = false;
        try {
            const ctx =
                typeof (globalThis as any).SillyTavern !== 'undefined'
                    ? (globalThis as any).SillyTavern.getContext()
                    : (globalThis as any).window?.SillyTavern?.getContext?.() || null;

            if (ctx) {
                if (typeof ctx.sendSystemMessage === 'function') {
                    try {
                        ctx.sendSystemMessage('generic', imageHtml);
                        messageSent = true;
                    } catch (_err) {
                        try {
                            ctx.sendSystemMessage(imageHtml);
                            messageSent = true;
                        } catch (_e2) {
                            /* ignore */
                        }
                    }
                }

                if (!messageSent && typeof ctx.addOneMessage === 'function') {
                    ctx.addOneMessage({
                        is_user: false,
                        is_system: true,
                        name: 'Web Image Bridge',
                        mes: imageHtml,
                        send_date: Date.now(),
                    });
                    if (typeof ctx.saveChat === 'function') {
                        ctx.saveChat();
                    }
                    if (typeof ctx.scrollChatToBottom === 'function') {
                        ctx.scrollChatToBottom();
                    }
                    messageSent = true;
                }
            }
        } catch (postErr) {
            console.warn('[WebImageBridge] Lỗi khi dán ảnh vào chính văn chat:', postErr);
        }

        return { messageSent, imageHtml };
    }
}
