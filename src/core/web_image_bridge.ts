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

            // 3. Nhận kết quả vẽ ảnh từ Web
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

        // Ping kiểm tra Userscript mỗi 5s và kiểm tra offline
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
