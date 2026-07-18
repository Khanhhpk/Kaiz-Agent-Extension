import { AgentLoop } from "./core/loop";
import { ToolRegistry } from "./core/tool_registry";
import { registerDefaultTools } from "./core/tools";
import { SillyTavernAdapter } from "./adapters/st_adapter";
import { StateManager } from "./core/state";

import { SettingsUI } from "./ui/settings";
import { ChatWindowUI } from "./ui/chat_window";
import { DebuggerUI } from "./ui/debugger";

const EXT_NAME = 'kaiz_agent';
console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);

// Tìm chính xác thư mục extension
let extPath = 'third-party/Kaiz-Agent-Extension';
try {
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
        const match = new URL((document.currentScript as HTMLScriptElement).src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
        if (match) extPath = match[1];
    } else {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('index.js') && src.toLowerCase().includes('kaiz') && src.toLowerCase().includes('agent')) {
                const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
                if (match) { extPath = match[1]; break; }
            }
        }
    }
} catch(e) {
    console.warn("[KaizAgent] Path resolution failed, using fallback:", e);
}

declare const jQuery: any;
declare const SillyTavern: any;

jQuery(async () => {
    console.log("[KaizAgent] Initializing extension core...");
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
            maxAgentLoops: 5
        };
    }

    // Nạp style.css thủ công
    const cssPath = `/scripts/extensions/${extPath}/style.css`;
    if (!$(`link[href="${cssPath}"]`).length) {
        $('<link>')
            .appendTo('head')
            .attr({ type: 'text/css', rel: 'stylesheet', href: cssPath });
    }

    // 1. Nạp giao diện Settings
    await SettingsUI.init(extPath, EXT_NAME);

    // 2. Nạp giao diện Khung Chat Độc Lập
    try {
        const kaizWindowHtml = await ctx.renderExtensionTemplateAsync(extPath, 'kaiz_window');
        if (kaizWindowHtml) {
            $('body').append(kaizWindowHtml);
            
            // Khởi tạo Core
            const adapter = new SillyTavernAdapter();
            const registry = new ToolRegistry();
            registerDefaultTools(registry);
            const loop = new AgentLoop(adapter, registry);
            
            const stateManager = new StateManager();
            await stateManager.init(); // Tải DB và danh sách chat

            // Gắn kết UI
            ChatWindowUI.init(loop, stateManager);
            DebuggerUI.init(registry, adapter);

            // Mở DB chat đầu tiên hoặc render rỗng
            const initialChats = await stateManager.loadChatList();
            if (stateManager.onChatsListUpdated) stateManager.onChatsListUpdated(initialChats);

        } else {
            console.error("[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.");
        }
    } catch (e) {
        console.error("[KaizAgent] Failed to load kaiz_window template:", e);
    }
    
    console.log("[KaizAgent] Core initialized successfully.");
});
