import { AgentLoop } from './core/loop';
import { ToolRegistry } from './core/tool_registry';
import { registerDefaultTools } from './core/tools';
import { SillyTavernAdapter } from './adapters/st_adapter';
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
            customImagePrompt: '',
            customImagePromptPosition: 'suffix',
        };
    } else {
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
        if (ctx.extensionSettings[EXT_NAME].customImagePrompt === undefined) {
            ctx.extensionSettings[EXT_NAME].customImagePrompt = '';
        }
        if (ctx.extensionSettings[EXT_NAME].customImagePromptPosition === undefined) {
            ctx.extensionSettings[EXT_NAME].customImagePromptPosition = 'suffix';
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
                                toastr.warning('Vui lòng nhập mô tả ảnh sau lệnh /draw (VD: /draw a cute cat)');
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
                            const safePrompt = finalPrompt
                                .replace(/&/g, '&amp;')
                                .replace(/"/g, '&quot;')
                                .replace(/</g, '&lt;')
                                .replace(/>/g, '&gt;');
                            const durationText = `${(durationMs / 1000).toFixed(1)}s`;
                            const imageHtml = `<div class="kaiz-draw-result" style="margin: 10px 0; text-align: center;"><img src="${base64}" alt="${safePrompt.replace(/\n+/g, ' ')}" style="max-width: 100%; max-height: 520px; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); object-fit: contain; cursor: pointer; display: inline-block;" onclick="window.open(this.src)" /><div style="margin-top: 6px; font-size: 12px; opacity: 0.85; font-style: italic; white-space: pre-wrap; line-height: 1.4; text-align: left; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); max-width: 520px; margin-left: auto; margin-right: auto;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; opacity: 0.85;"><span>🎨 <b>PROMPT</b></span><span><i class="fa-solid fa-stopwatch"></i> ${durationText} • ${actualProvider.toUpperCase()}</span></div>${safePrompt}</div></div>`;

                            let messageSent = false;
                            if (typeof ctx.sendSystemMessage === 'function') {
                                try {
                                    ctx.sendSystemMessage('generic', imageHtml);
                                    messageSent = true;
                                } catch (err) {
                                    console.warn('[Kaiz /draw] sendSystemMessage(generic) error:', err);
                                    try {
                                        ctx.sendSystemMessage(imageHtml);
                                        messageSent = true;
                                    } catch (e2) {
                                        console.warn('[Kaiz /draw] sendSystemMessage(imageHtml) error:', e2);
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
            }
        } else {
            console.error('[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.');
        }
    } catch (e) {
        console.error('[KaizAgent] Failed to load kaiz_window template:', e);
    }

    console.log('[KaizAgent] Core initialized successfully.');
});
