import { AgentLoop } from './core/loop';
import { ToolRegistry } from './core/tool_registry';
import { registerDefaultTools } from './core/tools';
import { SillyTavernAdapter } from './adapters/st_adapter';
import { StateManager } from './core/state';

import { SettingsUI } from './ui/settings';
import { ChatWindowUI } from './ui/chat_window';
import { ToolCheckerUI } from './ui/tool_checker';

const EXT_NAME = 'kaiz_agent';
console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);

// Tìm chính xác thư mục extension
let extPath = 'third-party/Kaiz-Agent-Extension';
try {
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
        const match = new URL((document.currentScript as HTMLScriptElement).src).pathname.match(
            /\/scripts\/extensions\/(.+)\/[^\/]+\.js$/,
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
                const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
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

jQuery(async () => {
    console.log('[KaizAgent] Initializing extension core...');
    console.log(`[KaizAgent] Resolved extension path: ${extPath}`);
    const $ = jQuery;
    const ctx = SillyTavern.getContext();

    // Khởi tạo Settings mặc định
    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = {
            useCustomEndpoint: false,
            customUrl: 'http://localhost:5000/v1',
            customKey: '',
            customModel: '',
            maxAgentLoops: 5,
            retryKeywords: '',
            maxRetries: 3,
            retryDelay: 3000,
            disabledTools: {},
            safeMode: false,
            safeModeBlacklist: {},
            quickPrompts: [],
        };
    } else {
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
    }

    // Nạp style.css thủ công
    const cssPath = `/scripts/extensions/${extPath}/style.css`;
    if (!$(`link[href="${cssPath}"]`).length) {
        $('<link>').appendTo('head').attr({ type: 'text/css', rel: 'stylesheet', href: cssPath });
    }

    // Nạp thư viện Lucide Icon
    if (!$('script[src="https://unpkg.com/lucide@latest"]').length && !window.hasOwnProperty('lucide')) {
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

            // Gắn kết UI trước để đăng ký callback
            ChatWindowUI.init(loop, stateManager);
            ToolCheckerUI.init(registry, adapter);

            // Tải DB và danh sách chat (callbacks sẽ tự động được gọi)
            await stateManager.init();
        } else {
            console.error('[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.');
        }
    } catch (e) {
        console.error('[KaizAgent] Failed to load kaiz_window template:', e);
    }

    console.log('[KaizAgent] Core initialized successfully.');
});
