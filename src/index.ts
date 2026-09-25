import { AgentLoop } from './core/loop';
import { ToolRegistry } from './core/tool_registry';
import { registerDefaultTools } from './core/tools';
import { SillyTavernAdapter, Message } from './adapters/st_adapter';
import { StateManager } from './core/state';

import { SettingsUI } from './ui/settings';
import { ChatWindowUI } from './ui/chat_window';
import { ToolCheckerUI } from './ui/tool_checker';
import { BrowserWindowUI } from './ui/browser_window';
import { AutoTaskScheduler } from './core/auto_task_scheduler';
import { AutoTaskModal } from './ui/auto_task_modal';
import { UICustomizationEngine } from './core/ui_customization_engine';
import { initThemeManagerTool } from './core/tools/st_theme_manager';
import { initCSSManagerTool } from './core/tools/st_css_manager';
import { initInjectElementTool } from './core/tools/st_inject_element';
import { UICustomizationModal } from './ui/ui_customization_modal';
import { WebImageBridge } from './core/web_image_bridge';
import { ImageGalleryModal } from './ui/image_gallery_modal';
import { DEFAULT_VIEW_SYSTEM_PROMPT } from './core/defaults';

const EXT_NAME = 'kaiz_agent';
console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);

// Tìm chính xác thư mục extension
let extPath = 'third-party/Kaiz-Agent-Extension';
try {
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
        const match = new URL((document.currentScript as HTMLScriptElement).src).pathname.match(
            /\/scripts\/extensions\/(.+)\/[^/]+\.js$/,
        );
        if (match) extPath = match[1];
    } else {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (
                src &&
                src.includes('index.js') &&
                src.toLowerCase().includes('kaiz') &&
                src.toLowerCase().includes('agent')
            ) {
                const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+)\/[^/]+\.js$/);
                if (match) {
                    extPath = match[1];
                    break;
                }
            }
        }
    }
} catch (e) {
    console.warn('[KaizAgent] Path resolution failed, using fallback:', e);
}

declare const jQuery: any;
declare const SillyTavern: any;
declare const toastr: any;

jQuery(async () => {
    console.log('[KaizAgent] Initializing extension core...');
    console.log(`[KaizAgent] Resolved extension path: ${extPath}`);
    const $ = jQuery;
    const ctx = SillyTavern.getContext();

    // Khởi tạo Settings mặc định
    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = {
            customUrl: 'http://localhost:5000/v1',
            customKey: '',
            customModel: '',
            maxTokens: 65000,
            temperature: 1,
            topP: 0.95,
            topK: 64,
            maxAgentLoops: 5,
            retryKeywords: '',
            maxRetries: 3,
            retryDelay: 3000,
            disabledTools: {},
            safeMode: false,
            safeModeBlacklist: {},
            quickPrompts: [],
            enableBrowser: false,
            webImageBridgeEnabled: true,
            webImageProvider: 'auto',
            customImagePrefix: '',
            customImageSuffix: '',
            viewContextDepth: 5,
            viewSystemPrompt: DEFAULT_VIEW_SYSTEM_PROMPT,
            cotDisplayMode: 'collapse_streaming',
        };
    } else {
        if (ctx.extensionSettings[EXT_NAME].cotDisplayMode === undefined) {
            ctx.extensionSettings[EXT_NAME].cotDisplayMode = 'collapse_streaming';
        }
        if (ctx.extensionSettings[EXT_NAME].maxTokens === undefined) {
            ctx.extensionSettings[EXT_NAME].maxTokens = 65000;
        }
        if (ctx.extensionSettings[EXT_NAME].temperature === undefined) {
            ctx.extensionSettings[EXT_NAME].temperature = 1;
        }
        if (ctx.extensionSettings[EXT_NAME].topP === undefined) {
            ctx.extensionSettings[EXT_NAME].topP = 0.95;
        }
        if (ctx.extensionSettings[EXT_NAME].topK === undefined) {
            ctx.extensionSettings[EXT_NAME].topK = 64;
        }
        if (!ctx.extensionSettings[EXT_NAME].disabledTools) {
            ctx.extensionSettings[EXT_NAME].disabledTools = {};
        }
        if (ctx.extensionSettings[EXT_NAME].safeMode === undefined) {
            ctx.extensionSettings[EXT_NAME].safeMode = false;
        }
        if (ctx.extensionSettings[EXT_NAME].safeModeBlacklist === undefined) {
            ctx.extensionSettings[EXT_NAME].safeModeBlacklist = {};
        }
        if (ctx.extensionSettings[EXT_NAME].quickPrompts === undefined) {
            ctx.extensionSettings[EXT_NAME].quickPrompts = [];
        }
        if (ctx.extensionSettings[EXT_NAME].retryKeywords === undefined) {
            ctx.extensionSettings[EXT_NAME].retryKeywords = '';
        }
        if (ctx.extensionSettings[EXT_NAME].maxRetries === undefined) {
            ctx.extensionSettings[EXT_NAME].maxRetries = 3;
        }
        if (ctx.extensionSettings[EXT_NAME].retryDelay === undefined) {
            ctx.extensionSettings[EXT_NAME].retryDelay = 3000;
        }
        if (ctx.extensionSettings[EXT_NAME].enableBrowser === undefined) {
            ctx.extensionSettings[EXT_NAME].enableBrowser = false;
        }
        if (ctx.extensionSettings[EXT_NAME].webImageBridgeEnabled === undefined) {
            ctx.extensionSettings[EXT_NAME].webImageBridgeEnabled = true;
        }
        if (ctx.extensionSettings[EXT_NAME].webImageProvider === undefined) {
            ctx.extensionSettings[EXT_NAME].webImageProvider = 'auto';
        }
        if (ctx.extensionSettings[EXT_NAME].customImagePrefix === undefined) {
            if (
                ctx.extensionSettings[EXT_NAME].customImagePromptPosition === 'prefix' &&
                ctx.extensionSettings[EXT_NAME].customImagePrompt
            ) {
                ctx.extensionSettings[EXT_NAME].customImagePrefix = ctx.extensionSettings[EXT_NAME].customImagePrompt;
            } else {
                ctx.extensionSettings[EXT_NAME].customImagePrefix = '';
            }
        }
        if (ctx.extensionSettings[EXT_NAME].customImageSuffix === undefined) {
            if (
                ctx.extensionSettings[EXT_NAME].customImagePromptPosition !== 'prefix' &&
                ctx.extensionSettings[EXT_NAME].customImagePrompt
            ) {
                ctx.extensionSettings[EXT_NAME].customImageSuffix = ctx.extensionSettings[EXT_NAME].customImagePrompt;
            } else {
                ctx.extensionSettings[EXT_NAME].customImageSuffix = '';
            }
        }
        // Dọn dẹp dứt điểm key cũ để không gây hiểu nhầm hoặc phục hồi cấu hình cũ
        if (
            ctx.extensionSettings[EXT_NAME].customImagePrompt !== undefined ||
            ctx.extensionSettings[EXT_NAME].customImagePromptPosition !== undefined
        ) {
            delete ctx.extensionSettings[EXT_NAME].customImagePrompt;
            delete ctx.extensionSettings[EXT_NAME].customImagePromptPosition;
            try {
                ctx.saveSettingsDebounced();
            } catch (_e) {}
        }
        if (ctx.extensionSettings[EXT_NAME].viewContextDepth === undefined) {
            ctx.extensionSettings[EXT_NAME].viewContextDepth = 5;
        }
        if (ctx.extensionSettings[EXT_NAME].viewSystemPrompt === undefined) {
            ctx.extensionSettings[EXT_NAME].viewSystemPrompt = DEFAULT_VIEW_SYSTEM_PROMPT;
        }
    }

    // Nạp style.css thủ công (Thêm cache buster để tránh trình duyệt lưu CSS cũ)
    const cssPath = `/scripts/extensions/${extPath}/style.css?v=${Date.now()}`;
    const existingCss = $(`link[href*="/scripts/extensions/${extPath}/style.css"]`);
    if (existingCss.length) {
        existingCss.attr('href', cssPath);
    } else {
        $('<link>').appendTo('head').attr({ type: 'text/css', rel: 'stylesheet', href: cssPath });
    }

    // Nạp thư viện Lucide Icon
    if (!$('script[src="https://unpkg.com/lucide@latest"]').length && !('lucide' in window)) {
        $('<script>').appendTo('head').attr({ src: 'https://unpkg.com/lucide@latest' });
    }

    // Khởi tạo Core
    const adapter = new SillyTavernAdapter();
    const registry = new ToolRegistry();
    registerDefaultTools(registry);
    if (typeof window !== 'undefined') {
        (window as any).KaizRegistry = registry;
    }

    // 1. Nạp giao diện Khung Chat Độc Lập
    try {
        const kaizWindowHtml = await ctx.renderExtensionTemplateAsync(extPath, 'kaiz_window');
        if (kaizWindowHtml) {
            $('body').append(kaizWindowHtml);

            // 2. Nạp giao diện Settings (Cần DOM của kaiz_window có sẵn cho các Modal)
            await SettingsUI.init(extPath, EXT_NAME, registry);

            const stateManager = new StateManager();
            const loop = new AgentLoop(adapter, registry, stateManager);
            const autoTaskScheduler = new AutoTaskScheduler(loop, stateManager);

            // Gắn kết UI trước để đăng ký callback
            ChatWindowUI.init(loop, stateManager, registry);
            ToolCheckerUI.init(registry, adapter);
            BrowserWindowUI.init();
            new AutoTaskModal(stateManager, autoTaskScheduler, registry);

            // Tải DB và danh sách chat (callbacks sẽ tự động được gọi)
            await stateManager.init();

            // Khởi tạo UI Customization Engine
            const uiEngine = new UICustomizationEngine(stateManager.db);
            initThemeManagerTool(uiEngine, stateManager.db);
            initCSSManagerTool(uiEngine);
            initInjectElementTool(uiEngine);
            new UICustomizationModal(stateManager.db, uiEngine);
            new ImageGalleryModal(stateManager.db);
            console.log('[KaizAgent] UI Customization Engine & Image Gallery initialized.');

            // Bắt đầu Auto Tasks sau khi DB đã init
            const allTasks = await stateManager.db.getAllAutoTasks();
            await autoTaskScheduler.start(allTasks);

            // Khởi tạo Web Image Bridge & Slash Command /draw
            WebImageBridge.init();
            if (typeof ctx.registerSlashCommand === 'function') {
                ctx.registerSlashCommand(
                    'draw',
                    async (args: any, value: string) => {
                        console.log('[Kaiz Slash /draw] raw args:', args, 'raw value:', value);
                        let prompt = '';
                        if (typeof value === 'string' && value.trim()) {
                            prompt = value.trim();
                        } else if (typeof args === 'string' && args.trim()) {
                            prompt = args.trim();
                        } else if (args && typeof args === 'object') {
                            if (typeof args.text === 'string') prompt = args.text.trim();
                            else if (typeof args.prompt === 'string') prompt = args.prompt.trim();
                            else if (typeof args.unnamed === 'string') prompt = args.unnamed.trim();
                            else if (Array.isArray(args._)) prompt = args._.join(' ').trim();
                        }

                        if (!prompt) {
                            if (typeof toastr !== 'undefined') {
                                toastr.warning(
                                    'Vui lòng nhập mô tả ảnh sau lệnh /draw (VD: /draw một chú mèo đáng yêu)',
                                );
                            }
                            return;
                        }
                        const finalPrompt = WebImageBridge.mergeCustomPrompt(prompt);
                        if (typeof toastr !== 'undefined') {
                            toastr.info('Đang gửi prompt vẽ ảnh sang Web (Gemini/ChatGPT)...');
                        }
                        try {
                            const target = WebImageBridge.getConfiguredProvider();
                            const startDraw = Date.now();
                            const base64 = await WebImageBridge.requestImage({ prompt: finalPrompt, target });
                            const durationMs = Date.now() - startDraw;
                            const actualProvider = WebImageBridge.getLastDeliveredProvider();

                            await WebImageBridge.saveImageToGallery({
                                prompt: finalPrompt,
                                base64,
                                provider: actualProvider,
                                durationMs,
                            });

                            const { imageHtml } = WebImageBridge.postImageToChat({
                                base64,
                                prompt: finalPrompt,
                                durationMs,
                                provider: actualProvider,
                            });

                            if (typeof toastr !== 'undefined') {
                                toastr.success('Đã vẽ ảnh thành công!');
                            }
                            return imageHtml;
                        } catch (e: any) {
                            if (typeof toastr !== 'undefined') {
                                toastr.error(`Vẽ ảnh thất bại: ${e.message}`);
                            }
                            return `[Error] ${e.message}`;
                        }
                    },
                    [],
                    '<mô_tả_ảnh>',
                    'Tạo ảnh minh họa thông qua Web Image Bridge (Gemini Web / ChatGPT Web)',
                    true,
                );

                // Slash Command /view: Tự động phân tích tin nhắn mới nhất qua Agent LLM để tạo prompt và vẽ ảnh
                ctx.registerSlashCommand(
                    'view',
                    async (args: any, value: string) => {
                        console.log('[Kaiz Slash /view] raw args:', args, 'raw value:', value);
                        let extraInstructions = '';
                        if (typeof value === 'string' && value.trim()) {
                            extraInstructions = value.trim();
                        } else if (typeof args === 'string' && args.trim()) {
                            extraInstructions = args.trim();
                        } else if (args && typeof args === 'object') {
                            if (typeof args.text === 'string') extraInstructions = args.text.trim();
                            else if (typeof args.prompt === 'string') extraInstructions = args.prompt.trim();
                            else if (typeof args.unnamed === 'string') extraInstructions = args.unnamed.trim();
                            else if (Array.isArray(args._)) extraInstructions = args._.join(' ').trim();
                        }

                        // 1. Lấy context và settings thời gian thực
                        const liveCtx =
                            typeof (globalThis as any).SillyTavern !== 'undefined'
                                ? (globalThis as any).SillyTavern.getContext()
                                : (globalThis as any).window?.SillyTavern?.getContext?.() || ctx;
                        const extSettings =
                            liveCtx?.extensionSettings?.[EXT_NAME] || ctx.extensionSettings?.[EXT_NAME] || {};
                        const depth =
                            typeof extSettings.viewContextDepth === 'number' && extSettings.viewContextDepth > 0
                                ? extSettings.viewContextDepth
                                : 5;

                        console.log('[Kaiz Slash /view] Configured depth:', depth);
                        const chatHistory = adapter.getChatContext(depth);
                        console.log(
                            '[Kaiz Slash /view] Retrieved chat history:',
                            chatHistory?.length,
                            'messages',
                            chatHistory,
                        );

                        if (!chatHistory || chatHistory.length === 0) {
                            if (typeof toastr !== 'undefined') {
                                toastr.warning('Không tìm thấy tin nhắn hội thoại nào trong phòng chat để minh họa.');
                            }
                            return;
                        }

                        const latestMsg = chatHistory[chatHistory.length - 1];
                        const cleanContent = (latestMsg?.content || '').trim();

                        if (!cleanContent) {
                            if (typeof toastr !== 'undefined') {
                                toastr.warning('Tin nhắn gần nhất không có nội dung văn bản để vẽ ảnh.');
                            }
                            return;
                        }

                        if (typeof toastr !== 'undefined') {
                            toastr.info('Đang dùng Agent phân tích tin nhắn mới nhất để tạo prompt vẽ ảnh...');
                        }

                        try {
                            const contextSnippet = chatHistory
                                .map(
                                    (m: any) => `${m.name || (m.role === 'user' ? 'User' : 'Character')}: ${m.content}`,
                                )
                                .join('\n\n');

                            const systemPrompt =
                                (extSettings.viewSystemPrompt && extSettings.viewSystemPrompt.trim()) ||
                                DEFAULT_VIEW_SYSTEM_PROMPT;

                            let userMessage = `NGỮ CẢNH ĐOẠN CHAT:\n${contextSnippet}\n\n[TIN NHẮN TRỌNG TÂM CẦN MINH HỌA]:\n${latestMsg.name}: ${cleanContent}`;
                            if (extraInstructions) {
                                userMessage += `\n\n[YÊU CẦU / PHONG CÁCH BỔ SUNG TỪ NGƯỜI DÙNG]:\n${extraInstructions}`;
                            }
                            userMessage += `\n\nHãy tạo ra câu prompt chi tiết nhất để vẽ ảnh minh họa cho phân cảnh trên:`;

                            console.log('[Kaiz Slash /view] Full User Message payload sent to LLM:\n', userMessage);

                            const messages: Message[] = [
                                { role: 'system', content: systemPrompt },
                                { role: 'user', content: userMessage },
                            ];

                            const effMaxTokens =
                                typeof extSettings.maxTokens === 'number' && extSettings.maxTokens > 0
                                    ? extSettings.maxTokens
                                    : 65000;
                            const result = await adapter.generateCompletion(messages, effMaxTokens, false);
                            let generatedPrompt = (result?.text || '').trim();

                            // Loại bỏ CoT / thinking nếu có
                            generatedPrompt = generatedPrompt
                                .replace(
                                    /<(?:think|thinking|thought|agent_cot)>[\s\S]*?(?:<\/(?:think|thinking|thought|agent_cot)>|$)/gi,
                                    '',
                                )
                                .trim();

                            // Bỏ dấu ngoặc kép bọc ngoài nếu model sinh ra
                            if (
                                (generatedPrompt.startsWith('"') && generatedPrompt.endsWith('"')) ||
                                (generatedPrompt.startsWith('`') && generatedPrompt.endsWith('`'))
                            ) {
                                generatedPrompt = generatedPrompt.slice(1, -1).trim();
                            }

                            if (!generatedPrompt) {
                                throw new Error('Agent không trả về nội dung prompt hợp lệ.');
                            }

                            console.log('[Kaiz Slash /view] Generated Prompt từ Agent:', generatedPrompt);
                            if (typeof toastr !== 'undefined') {
                                const preview =
                                    generatedPrompt.length > 80
                                        ? generatedPrompt.slice(0, 80) + '...'
                                        : generatedPrompt;
                                toastr.info(`Đã tạo prompt: "${preview}". Đang gửi yêu cầu vẽ ảnh sang Web Bridge...`);
                            }

                            // 2. Ghép Prefix/Suffix cấu hình và gửi vẽ ảnh
                            const finalPrompt = WebImageBridge.mergeCustomPrompt(generatedPrompt);
                            const target = WebImageBridge.getConfiguredProvider();
                            const startDraw = Date.now();
                            const base64 = await WebImageBridge.requestImage({ prompt: finalPrompt, target });
                            const durationMs = Date.now() - startDraw;
                            const actualProvider = WebImageBridge.getLastDeliveredProvider();

                            // Lưu vào gallery
                            await WebImageBridge.saveImageToGallery({
                                prompt: finalPrompt,
                                base64,
                                provider: actualProvider,
                                durationMs,
                            });

                            // Dán ảnh vào chat
                            const { imageHtml } = WebImageBridge.postImageToChat({
                                base64,
                                prompt: finalPrompt,
                                durationMs,
                                provider: actualProvider,
                            });

                            if (typeof toastr !== 'undefined') {
                                toastr.success(`Đã vẽ ảnh thành công (${(durationMs / 1000).toFixed(1)}s)!`);
                            }
                            return imageHtml;
                        } catch (e: any) {
                            console.error('[Kaiz Slash /view] Thất bại:', e);
                            if (typeof toastr !== 'undefined') {
                                toastr.error(`Lỗi tạo ảnh /view: ${e.message || 'Không xác định'}`);
                            }
                            return `[Error] ${e.message}`;
                        }
                    },
                    [],
                    '<ghi_chú_tùy_chọn>',
                    'Tự động đọc tin nhắn mới nhất, dùng API của Agent tạo prompt chi tiết và vẽ ảnh minh họa',
                    true,
                );
            }
        } else {
            console.error('[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.');
        }
    } catch (e) {
        console.error('[KaizAgent] Failed to load kaiz_window template:', e);
    }

    console.log('[KaizAgent] Core initialized successfully.');
});
