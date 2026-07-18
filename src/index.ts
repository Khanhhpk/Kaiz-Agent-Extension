import { AgentLoop } from "./core/loop";
import { ToolRegistry } from "./core/tool_registry";
import { registerDefaultTools } from "./core/tools";
import { SillyTavernAdapter } from "./adapters/st_adapter";

const EXT_NAME = 'kaiz_agent';
console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);

declare const jQuery: any;
declare const SillyTavern: any;
declare const toastr: any;

jQuery(async () => {
    console.log("[KaizAgent] Initializing extension core...");
    const $ = jQuery;
    const ctx = SillyTavern.getContext();
    
    // Khởi tạo Settings mặc định
    if (!ctx.extensionSettings[EXT_NAME]) {
        ctx.extensionSettings[EXT_NAME] = {
            useCustomEndpoint: false,
            customUrl: 'http://localhost:5000/v1',
            customKey: '',
            customModel: ''
        };
    }
    const settings = ctx.extensionSettings[EXT_NAME];

    // 1. Tìm chính xác thư mục extension (để load settings.html)
    let extPath = 'third-party/Kaiz-Agent-Extension';
    try {
        if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
            const match = new URL((document.currentScript as HTMLScriptElement).src).pathname.match(/\/scripts\/extensions\/(.+?)\//);
            if (match) extPath = match[1];
        } else {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].src;
                if (src && src.toLowerCase().includes('kaiz')) {
                    const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+?)\//);
                    if (match) { extPath = match[1]; break; }
                }
            }
        }
    } catch(e) {
        console.warn("[KaizAgent] Path resolution failed, using fallback:", e);
    }

    console.log(`[KaizAgent] Resolved extension path: ${extPath}`);

    // 2. Nạp giao diện settings.html
    try {
        const html = await $.get(`/scripts/extensions/${extPath}/settings.html`);
        $('#extensions_settings').append(html);
    } catch (e) {
        console.error("[KaizAgent] Failed to load settings.html from", `/scripts/extensions/${extPath}/settings.html`, e);
        return;
    }

    // Gán giá trị mặc định lên UI
    $('#kaiz-use-custom-endpoint').prop('checked', settings.useCustomEndpoint);
    $('#kaiz-custom-url').val(settings.customUrl);
    $('#kaiz-custom-key').val(settings.customKey);
    $('#kaiz-custom-model-text').val(settings.customModel);
    
    if (settings.useCustomEndpoint) {
        $('#kaiz-custom-endpoint-group').show();
    }

    // Lắng nghe sự kiện đổi Checkbox
    $('#kaiz-use-custom-endpoint').on('change', function(this: HTMLInputElement) {
        settings.useCustomEndpoint = !!this.checked;
        ctx.saveSettingsDebounced();
        if (settings.useCustomEndpoint) {
            $('#kaiz-custom-endpoint-group').slideDown();
        } else {
            $('#kaiz-custom-endpoint-group').slideUp();
        }
    });

    // Lắng nghe thay đổi input và lưu tự động
    $('#kaiz-custom-url, #kaiz-custom-key, #kaiz-custom-model-text').on('input', function(this: HTMLInputElement) {
        const id = this.id;
        if (id === 'kaiz-custom-url') settings.customUrl = this.value;
        if (id === 'kaiz-custom-key') settings.customKey = this.value;
        if (id === 'kaiz-custom-model-text') settings.customModel = this.value;
        ctx.saveSettingsDebounced();
    });

    // Lắng nghe chọn từ Dropdown -> Cập nhật Input
    $('#kaiz-custom-model').on('change', function(this: HTMLSelectElement) {
        if (this.value) {
            $('#kaiz-custom-model-text').val(this.value).trigger('input');
        }
    });

    // Logic nút Fetch Models
    $('#kaiz-fetch-models').on('click', async () => {
        let url = String($('#kaiz-custom-url').val()).trim();
        const key = String($('#kaiz-custom-key').val()).trim();
        
        if (!url) {
            toastr.error('Please enter an API URL first.', 'Kaiz Agent');
            return;
        }

        // Đảm bảo URL kết thúc đúng format để fetch /models
        if (url.endsWith('/chat/completions')) url = url.replace('/chat/completions', '');
        if (!url.endsWith('/v1')) url = url.replace(/\/$/, '') + '/v1';
        url = url + '/models';

        try {
            $('#kaiz-fetch-models').find('i').addClass('fa-spin');
            const res = await fetch(url, {
                headers: key ? { 'Authorization': `Bearer ${key}` } : {}
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const data = await res.json();
            const models = data.data || data; // Hỗ trợ OpenAI format ({ data: [...] }) hoặc mảng trực tiếp
            
            if (Array.isArray(models)) {
                const select = $('#kaiz-custom-model');
                select.empty().append('<option value="">-- Select Model --</option>');
                models.forEach(m => {
                    const id = m.id || m.name || m;
                    select.append(`<option value="${id}">${id}</option>`);
                });
                toastr.success(`Found ${models.length} models.`, 'Kaiz Agent');
            } else {
                throw new Error('Invalid models response format.');
            }
        } catch (e: any) {
            console.error('[KaizAgent] Fetch models error:', e);
            toastr.error('Failed to fetch models: ' + e.message, 'Kaiz Agent');
        } finally {
            $('#kaiz-fetch-models').find('i').removeClass('fa-spin');
        }
    });

    
    const adapter = new SillyTavernAdapter();
    const registry = new ToolRegistry();
    
    // Đăng ký các công cụ
    registerDefaultTools(registry);
    
    const loop = new AgentLoop(adapter, registry);

    console.log("[KaizAgent] Core initialized successfully.");
});



