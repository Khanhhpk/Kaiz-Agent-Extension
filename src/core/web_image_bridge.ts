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
     * Tự động ghép Custom Prompt (Prefix hoặc Suffix) từ cấu hình người dùng
     */
    public static mergeCustomPrompt(basePrompt: string): string {
        try {
            const ctx =
                typeof (globalThis as any).SillyTavern !== 'undefined'
                    ? (globalThis as any).SillyTavern.getContext()
                    : (globalThis as any).window?.SillyTavern?.getContext?.() || null;
            const settings = ctx?.extensionSettings?.['kaiz_agent'];
            const customPrompt = (settings?.customImagePrompt || '').trim();
            const position = settings?.customImagePromptPosition || 'suffix';

            const rawBase = (basePrompt || '').trim();
            if (!customPrompt) return rawBase;
            if (!rawBase) return customPrompt;

            let combined = '';
            if (position === 'prefix') {
                combined = `${customPrompt}\n\n${rawBase}`;
            } else {
                combined = `${rawBase}\n\n${customPrompt}`;
            }
            return combined.trim();
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
}
