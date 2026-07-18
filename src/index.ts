import { AgentLoop } from "./core/loop";
import { ToolRegistry } from "./core/tool_registry";
import { registerDefaultTools } from "./core/tools";
import { SillyTavernAdapter } from "./adapters/st_adapter";

const EXT_NAME = 'kaiz_agent';
console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);

// 1. Tìm chính xác thư mục extension (phải đặt NGOÀI async callback để document.currentScript hoạt động)
let extPath = 'third-party/Kaiz-Agent-Extension';
try {
    if (document.currentScript && (document.currentScript as HTMLScriptElement).src) {
        const match = new URL((document.currentScript as HTMLScriptElement).src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
        if (match) extPath = match[1];
    } else {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            // Tránh nhầm lẫn với kaiz-collection, ta check chính xác tên repo hoặc ít nhất là 'agent'
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
declare const toastr: any;

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
            customModel: ''
        };
    }
    const settings = ctx.extensionSettings[EXT_NAME];

    // 2. Nạp giao diện settings.html
    const container = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (container) {
        try {
            const html = await ctx.renderExtensionTemplateAsync(extPath, 'settings');
            if (html) {
                container.insertAdjacentHTML('beforeend', html);
            } else {
                throw new Error("renderExtensionTemplateAsync returned empty html.");
            }
        } catch (e) {
            console.error("[KaizAgent] Failed to load settings template via renderExtensionTemplateAsync:", e);
            toastr.error("Kaiz Agent: Failed to load UI settings.");
            return;
        }
    } else {
        console.error("[KaizAgent] Could not find #extensions_settings container.");
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

    // Nạp style.css thủ công (phòng trường hợp ST không tự load file mới tạo sau khi Update)
    const cssPath = `/scripts/extensions/${extPath}/style.css`;
    if (!$(`link[href="${cssPath}"]`).length) {
        $('<link>')
            .appendTo('head')
            .attr({ type: 'text/css', rel: 'stylesheet', href: cssPath });
        console.log(`[KaizAgent] Injected style.css manually.`);
    }

    // 3. Nạp giao diện Khung Chat Độc Lập (Floating UI)
    try {
        const kaizWindowHtml = await ctx.renderExtensionTemplateAsync(extPath, 'kaiz_window');
        if (kaizWindowHtml) {
            $('body').append(kaizWindowHtml);
            
            const adapter = new SillyTavernAdapter();
            const registry = new ToolRegistry();
            registerDefaultTools(registry);
            const loop = new AgentLoop(adapter, registry);
            
            initKaizUI(loop);
        } else {
            console.error("[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.");
        }
    } catch (e) {
        console.error("[KaizAgent] Failed to load kaiz_window template:", e);
    }
    
    console.log("[KaizAgent] Core initialized successfully.");
});

// Hàm khởi tạo các sự kiện cho UI
function initKaizUI(loop: AgentLoop) {
    const $ = jQuery;
    const btn = $('#kaiz-floating-btn');
    const win = $('#kaiz-chat-window');
    const closeBtn = $('#kaiz-chat-close');
    const input = $('#kaiz-chat-input');
    const sendBtn = $('#kaiz-chat-send');
    const history = $('#kaiz-chat-history');

    // Toggle cửa sổ
    btn.on('click', () => {
        win.removeClass('kaiz-hidden');
    });

    closeBtn.on('click', () => {
        win.addClass('kaiz-hidden');
    });

    // Hàm tiện ích thêm tin nhắn, trả về ID của block content để dễ update sau này
    const addMessage = (role: 'user' | 'agent' | 'system', htmlContent: string): string => {
        let avatar = '';
        let extraClass = '';
        if (role === 'user') {
            avatar = '<i class="fa-solid fa-user"></i>';
            extraClass = 'kaiz-msg-user';
        } else if (role === 'agent') {
            avatar = '<i class="fa-solid fa-robot"></i>';
            extraClass = 'kaiz-msg-agent';
        } else {
            avatar = '<i class="fa-solid fa-gear"></i>';
            extraClass = 'kaiz-msg-agent'; 
        }

        const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);
        history.append(`
            <div class="kaiz-msg ${extraClass}" id="container-${msgId}">
                <div class="kaiz-msg-avatar">${avatar}</div>
                <div class="kaiz-msg-content" id="${msgId}">${htmlContent}</div>
            </div>
        `);
        history.scrollTop(history[0].scrollHeight);
        return msgId;
    };

    // Xử lý gửi tin nhắn UI
    const sendMessage = async () => {
        const text = String(input.val()).trim();
        if (!text) return;

        input.val('');
        addMessage('user', text);
        
        let currentAgentMsgId = '';
        
        await loop.run(text, (event) => {
            switch(event.type) {
                case 'think_start':
                    currentAgentMsgId = addMessage('agent', `<span class="kaiz-spinner"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang suy nghĩ...</span>`);
                    break;
                case 'stream_chunk':
                    if (currentAgentMsgId) {
                        let content = event.text || '';
                        // Lọc thẻ tool_call để không hiện mã XML rác trên UI
                        content = content.replace(/<tool_call[\s\S]*?<\/tool_call>/g, '');
                        // Nếu đang có text
                        if (content.trim()) {
                            // Dùng marked.parse nếu SillyTavern đã load, nếu không thì dùng thô
                            // Nhưng tạm thời render thô kèm <br>
                            $(`#${currentAgentMsgId}`).html(content.replace(/\n/g, '<br>'));
                        } else if (event.reasoning) {
                            $(`#${currentAgentMsgId}`).html(`<span style="color:#aaa"><i>Đang suy nghĩ...</i></span>`);
                        }
                        history.scrollTop(history[0].scrollHeight);
                    }
                    break;
                case 'think_end':
                    // Nếu sau khi nghĩ xong mà không có chữ nào (chỉ có tool call), ta có thể xoá luôn cái bong bóng này để dọn dẹp
                    const finalHtml = $(`#${currentAgentMsgId}`).html();
                    if (!finalHtml || finalHtml.includes('fa-circle-notch')) {
                        $(`#container-${currentAgentMsgId}`).remove();
                    }
                    break;
                case 'tool_call':
                    addMessage('system', `<i>Đang gọi công cụ: <b>${event.data.name}</b>...</i>`);
                    break;
                case 'tool_result':
                    if (event.data.result.isError) {
                        addMessage('system', `<i style="color:#ff5e5e">Lỗi công cụ ${event.data.name}: ${event.data.result.content}</i>`);
                    } else {
                        addMessage('system', `<i style="color:#92FE9D">Công cụ ${event.data.name} thực thi thành công.</i>`);
                    }
                    break;
                case 'final_answer':
                    // Final answer thực chất đã được stream_chunk render. 
                    // Nhưng nếu chưa có (vì lý do nào đó), render lại chốt sổ
                    if (currentAgentMsgId && event.text && !$(`#${currentAgentMsgId}`).text().trim()) {
                        $(`#${currentAgentMsgId}`).html((event.text || '').replace(/\n/g, '<br>'));
                    }
                    break;
                case 'error':
                    addMessage('system', `<span style="color:#ff5e5e"><b>Lỗi:</b> ${event.text}</span>`);
                    break;
            }
        });
    };

    sendBtn.on('click', sendMessage);
    input.on('keydown', (e: any) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Kéo thả cửa sổ cơ bản (Draggable)
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const header = document.getElementById('kaiz-chat-header');
    const windowEl = document.getElementById('kaiz-chat-window');

    if (header && windowEl) {
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - windowEl.getBoundingClientRect().left;
            offsetY = e.clientY - windowEl.getBoundingClientRect().top;
            windowEl.style.transition = 'none'; // Tắt animation khi drag
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            
            // Giữ trong màn hình
            const maxX = window.innerWidth - windowEl.offsetWidth;
            const maxY = window.innerHeight - windowEl.offsetHeight;
            
            windowEl.style.right = 'auto';
            windowEl.style.bottom = 'auto';
            windowEl.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            windowEl.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                windowEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease, visibility 0.3s';
            }
        });
    }
}
