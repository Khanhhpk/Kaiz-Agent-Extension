(function () {
    'use strict';

    class AgentLoop {
        adapter;
        toolRegistry;
        constructor(adapter, toolRegistry) {
            this.adapter = adapter;
            this.toolRegistry = toolRegistry;
        }
        generateSystemPrompt() {
            const schemas = this.toolRegistry.getAllSchemas();
            let prompt = `You are Kaiz Agent, an AI assistant built to operate within the SillyTavern environment.
You can help the user by answering questions, chatting, or using tools to interact with SillyTavern.

AVAILABLE TOOLS:
`;
            schemas.forEach(s => {
                prompt += `<tool>
<name>${s.name}</name>
<description>${s.description}</description>
<parameters>${JSON.stringify(s.parameters)}</parameters>
</tool>
`;
            });
            prompt += `
INSTRUCTIONS FOR TOOL USAGE:
To use a tool, you MUST use the following exact XML format. You can use multiple tools at once by providing multiple <tool_call> blocks.
<tool_call name="tool_name">
{"param1": "value"}
</tool_call>

If you use a tool, do not provide the final answer yet. Wait for the user (the system) to provide the <tool_result> before answering.
If you do NOT need a tool, just answer normally.`;
            return prompt;
        }
        parseToolCalls(text) {
            const regex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
            const tools = [];
            let match;
            while ((match = regex.exec(text)) !== null) {
                const name = match[1];
                const argsStr = match[2].trim();
                try {
                    const args = JSON.parse(argsStr);
                    tools.push({ name, args, fullMatch: match[0] });
                }
                catch (e) {
                    console.error(`[AgentLoop] Failed to parse JSON for tool ${name}:`, argsStr);
                }
            }
            return tools;
        }
        async run(userPrompt, onEvent) {
            console.log(`[AgentLoop] Starting run with prompt: ${userPrompt}`);
            const messages = [
                { role: 'system', content: this.generateSystemPrompt() },
                { role: 'user', content: userPrompt }
            ];
            const MAX_STEPS = 5;
            let step = 0;
            while (step < MAX_STEPS) {
                step++;
                onEvent({ type: 'think_start' });
                try {
                    const response = await this.adapter.generateCompletion(messages, 1500, true, (text, reasoning) => {
                        onEvent({ type: 'stream_chunk', text, reasoning });
                    });
                    onEvent({ type: 'think_end', data: response.reasoning });
                    const text = response.text;
                    messages.push({ role: 'assistant', content: text });
                    const toolCalls = this.parseToolCalls(text);
                    if (toolCalls.length === 0) {
                        let cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                        if (!cleanText && response.reasoning)
                            cleanText = text;
                        onEvent({ type: 'final_answer', text: cleanText });
                        break;
                    }
                    let toolResultsText = "";
                    for (const call of toolCalls) {
                        onEvent({ type: 'tool_call', data: call });
                        const result = await this.toolRegistry.executeTool(call.name, call.args);
                        onEvent({ type: 'tool_result', data: { name: call.name, result } });
                        toolResultsText += `<tool_result name="${call.name}">\n${result.content}\n</tool_result>\n`;
                    }
                    messages.push({ role: 'user', content: toolResultsText });
                }
                catch (e) {
                    console.error("[AgentLoop] Error during completion:", e);
                    onEvent({ type: 'error', text: e.message || String(e) });
                    break;
                }
            }
            if (step >= MAX_STEPS) {
                onEvent({ type: 'error', text: 'Max steps reached without a final answer.' });
            }
        }
    }

    /**
     * Tool Registry
     * Quản lý và đăng ký các công cụ (Tools) cho Agent.
     * Lấy cảm hứng từ kiến trúc Tool của LumiAgent nhưng tối giản hoá (không dùng Zod) để phù hợp extension Client-side.
     */
    class ToolRegistry {
        tools = new Map();
        /**
         * Đăng ký một tool mới
         */
        registerTool(tool) {
            if (this.tools.has(tool.schema.name)) {
                console.warn(`[ToolRegistry] Tool ${tool.schema.name} already registered. Overwriting.`);
            }
            this.tools.set(tool.schema.name, tool);
            console.log(`[ToolRegistry] Registered tool: ${tool.schema.name}`);
        }
        /**
         * Lấy schema của tất cả tools để gửi lên LLM
         */
        getAllSchemas() {
            return Array.from(this.tools.values()).map(t => t.schema);
        }
        /**
         * Thực thi một tool dựa trên tên và tham số
         */
        async executeTool(name, args, context) {
            const tool = this.tools.get(name);
            if (!tool) {
                return {
                    content: `Error: Tool '${name}' not found.`,
                    isError: true
                };
            }
            try {
                // Validate basic required fields
                if (tool.schema.parameters.required) {
                    for (const req of tool.schema.parameters.required) {
                        if (args[req] === undefined) {
                            return {
                                content: `Error: Missing required parameter '${req}' for tool '${name}'.`,
                                isError: true
                            };
                        }
                    }
                }
                console.log(`[ToolRegistry] Executing '${name}' with args:`, args);
                return await tool.execute(args, context);
            }
            catch (e) {
                console.error(`[ToolRegistry] Error executing tool '${name}':`, e);
                return {
                    content: `Error executing tool '${name}': ${e.message || String(e)}`,
                    isError: true
                };
            }
        }
    }

    const getCharInfoTool = {
        schema: {
            name: 'get_char_info',
            description: 'Lấy thông tin chi tiết về thẻ nhân vật hiện tại đang chat (tên, tính cách, bối cảnh, v.v.). Dùng khi cần hiểu rõ về nhân vật bạn đang đóng vai hoặc nói chuyện cùng.',
            parameters: {
                type: 'object',
                properties: {} // Không yêu cầu tham số
            }
        },
        execute: async (args, context) => {
            if (!context || !context.adapter) {
                return {
                    content: 'Error: Adapter not provided in context.',
                    isError: true
                };
            }
            const charInfo = context.adapter.getCharInfo();
            if (!charInfo) {
                return {
                    content: 'Error: No active character found. Are you in a group chat without a selected character, or not in a chat at all?',
                    isError: true
                };
            }
            // Trả về dữ liệu nhân vật dưới dạng JSON string (LLM sẽ parse được)
            return {
                content: JSON.stringify(charInfo, null, 2)
            };
        }
    };

    /**
     * Đăng ký tất cả các tools mặc định vào Registry
     */
    function registerDefaultTools(registry) {
        registry.registerTool(getCharInfoTool);
        // Sau này có thể thêm registerTool(searchChatTool), v.v.
    }

    /**
     * SillyTavern Adapter
     * Lớp trung gian để bọc các API của ST, lấy cảm hứng từ ST-Copilot.
     */
    class SillyTavernAdapter {
        constructor() { }
        /**
         * Gửi request lên LLM thông qua ConnectionManager hoặc ChatCompletionService của ST
         */
        async generateCompletion(messages, maxTokens, stream = false, onUpdate) {
            console.log("[KaizAgent] Calling ST generateCompletion...");
            const ctx = SillyTavern.getContext();
            const settings = ctx.extensionSettings['kaiz_agent'] || {};
            const abort = new AbortController();
            // 1. Nếu bật tính năng Custom Endpoint, ta gọi trực tiếp (bypass ST)
            if (settings.useCustomEndpoint && settings.customUrl) {
                console.log("[KaizAgent] Using Custom Endpoint:", settings.customUrl);
                let text = '';
                let reasoning = null;
                let isMaxTokens = false;
                try {
                    let url = settings.customUrl;
                    if (!url.endsWith('/chat/completions')) {
                        url = url.replace(/\/$/, '') + '/chat/completions';
                    }
                    const headers = { 'Content-Type': 'application/json' };
                    if (settings.customKey)
                        headers['Authorization'] = `Bearer ${settings.customKey}`;
                    const payload = {
                        model: settings.customModel || 'gpt-3.5-turbo',
                        messages: messages,
                        max_tokens: maxTokens,
                        stream: stream
                    };
                    const res = await fetch(url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(payload),
                        signal: abort.signal
                    });
                    if (!res.ok) {
                        const errText = await res.text().catch(() => res.statusText);
                        throw new Error(`Custom API Error ${res.status}: ${errText}`);
                    }
                    if (stream) {
                        const reader = res.body?.getReader();
                        const decoder = new TextDecoder("utf-8");
                        let buffer = "";
                        if (reader) {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done)
                                    break;
                                buffer += decoder.decode(value, { stream: true });
                                const lines = buffer.split('\n');
                                buffer = lines.pop() || "";
                                for (const line of lines) {
                                    const l = line.trim();
                                    if (!l || l.startsWith(':') || l === 'data: [DONE]')
                                        continue;
                                    if (l.startsWith('data: ')) {
                                        try {
                                            const data = JSON.parse(l.slice(6));
                                            const finish = data.choices?.[0]?.finish_reason;
                                            if (finish === 'length' || finish === 'max_tokens')
                                                isMaxTokens = true;
                                            const delta = data.choices?.[0]?.delta || {};
                                            if (delta.content)
                                                text += delta.content;
                                            if (delta.reasoning || delta.reasoning_content) {
                                                reasoning = (reasoning || '') + (delta.reasoning || delta.reasoning_content);
                                            }
                                            if (data.thinking)
                                                reasoning = (reasoning || '') + data.thinking;
                                            if (onUpdate)
                                                onUpdate(text, reasoning);
                                        }
                                        catch (e) { }
                                    }
                                }
                            }
                        }
                    }
                    else {
                        const data = await res.json();
                        const finish = data.choices?.[0]?.finish_reason;
                        if (finish === 'length' || finish === 'max_tokens')
                            isMaxTokens = true;
                        const msg = data.choices?.[0]?.message || {};
                        text = msg.content || '';
                        if (msg.reasoning || msg.reasoning_content) {
                            reasoning = msg.reasoning || msg.reasoning_content;
                        }
                        if (data.thinking)
                            reasoning = (reasoning || '') + data.thinking;
                        if (onUpdate)
                            onUpdate(text, reasoning);
                    }
                    return { text: text.trim(), reasoning, isMaxTokens };
                }
                catch (e) {
                    console.error("[KaizAgent] Custom Endpoint error:", e);
                    throw e;
                }
            }
            // 2. Nếu không bật Custom Endpoint, sử dụng ConnectionManager mặc định của SillyTavern
            const service = ctx.ConnectionManagerRequestService;
            let asyncGeneratorFn;
            try {
                let profileId = ctx.extensionSettings?.connectionManager?.selectedProfile || document.getElementById('connection_profiles')?.value;
                if (profileId && service && typeof service.sendRequest === 'function') {
                    asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                        stream: stream,
                        signal: abort.signal,
                        extractData: false,
                        includePreset: true
                    });
                }
                else {
                    const mainApi = window.main_api || ctx.main_api;
                    if (mainApi === 'openai' && ctx.ChatCompletionService) {
                        const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                        asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                            messages: messages,
                            max_tokens: maxTokens,
                            stream: stream
                        }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
                    }
                    else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                        const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                        asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                            prompt: messages,
                            max_tokens: maxTokens,
                            stream: stream
                        }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
                    }
                    else {
                        throw new Error('No active API connection found in SillyTavern. Please configure LLM settings.');
                    }
                }
                let text = '';
                let reasoning = null;
                const isGen = typeof asyncGeneratorFn === 'function' ||
                    (asyncGeneratorFn != null && typeof asyncGeneratorFn[Symbol.asyncIterator] === 'function') ||
                    (asyncGeneratorFn != null && typeof asyncGeneratorFn.next === 'function');
                let lastValue = null;
                if (!isGen) {
                    const value = asyncGeneratorFn;
                    if (typeof value === 'string') {
                        text = value.trim();
                    }
                    else {
                        text = value?.text || value?.content || value?.message?.content || value?.choices?.[0]?.message?.content || '';
                    }
                    const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
                    const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';
                    if (onUpdate)
                        onUpdate(text, reasoning);
                    return { text: text.trim(), reasoning, isMaxTokens };
                }
                const gen = typeof asyncGeneratorFn === 'function' ? asyncGeneratorFn() : asyncGeneratorFn;
                while (true) {
                    const { value, done } = await gen.next();
                    if (done) {
                        if (value)
                            lastValue = value;
                        break;
                    }
                    lastValue = value;
                    let chunkText = value?.text || value?.content || value?.choices?.[0]?.delta?.content || '';
                    if (value?.thinking)
                        reasoning = (reasoning || '') + value.thinking;
                    if (chunkText)
                        text += chunkText;
                    if (onUpdate)
                        onUpdate(text, reasoning);
                }
                const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
                const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';
                return { text: text.trim(), reasoning, isMaxTokens };
            }
            catch (e) {
                console.error("[KaizAgent] generateCompletion error:", e);
                throw e;
            }
        }
        /**
         * Lấy lịch sử đoạn chat hiện tại (bỏ qua những tin nhắn ẩn)
         */
        getChatContext(depth = 20) {
            const ctx = SillyTavern.getContext();
            if (!ctx.chat)
                return [];
            const total = ctx.chat.length;
            const startIndex = Math.max(0, total - depth);
            return ctx.chat.slice(startIndex)
                .filter((m) => !m.is_system && !m.is_hidden && !(m.extra && m.extra.is_hidden))
                .map((m, i) => ({
                role: m.is_user ? 'user' : 'assistant',
                name: m.is_user ? (ctx.name1 || 'User') : (m.name || ctx.name2 || 'Character'),
                content: typeof m.mes === 'string' ? m.mes : '',
                chatIndex: startIndex + i
            }));
        }
        /**
         * Lấy thông tin về nhân vật đang chat
         */
        getCharInfo() {
            const ctx = SillyTavern.getContext();
            const char = ctx.characters?.[ctx.characterId];
            if (!char)
                return null;
            const d = char.data || {};
            return {
                name: char.name || 'Unknown',
                description: d.description || char.description || '',
                personality: d.personality || char.personality || '',
                scenario: d.scenario || char.scenario || '',
                system_prompt: d.system_prompt || char.system_prompt || '',
            };
        }
    }

    const EXT_NAME = 'kaiz_agent';
    console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);
    // 1. Tìm chính xác thư mục extension (phải đặt NGOÀI async callback để document.currentScript hoạt động)
    let extPath = 'third-party/Kaiz-Agent-Extension';
    try {
        if (document.currentScript && document.currentScript.src) {
            const match = new URL(document.currentScript.src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
            if (match)
                extPath = match[1];
        }
        else {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].src;
                // Tránh nhầm lẫn với kaiz-collection, ta check chính xác tên repo hoặc ít nhất là 'agent'
                if (src && src.includes('index.js') && src.toLowerCase().includes('kaiz') && src.toLowerCase().includes('agent')) {
                    const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+)\/[^\/]+\.js$/);
                    if (match) {
                        extPath = match[1];
                        break;
                    }
                }
            }
        }
    }
    catch (e) {
        console.warn("[KaizAgent] Path resolution failed, using fallback:", e);
    }
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
                }
                else {
                    throw new Error("renderExtensionTemplateAsync returned empty html.");
                }
            }
            catch (e) {
                console.error("[KaizAgent] Failed to load settings template via renderExtensionTemplateAsync:", e);
                toastr.error("Kaiz Agent: Failed to load UI settings.");
                return;
            }
        }
        else {
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
        $('#kaiz-use-custom-endpoint').on('change', function () {
            settings.useCustomEndpoint = !!this.checked;
            ctx.saveSettingsDebounced();
            if (settings.useCustomEndpoint) {
                $('#kaiz-custom-endpoint-group').slideDown();
            }
            else {
                $('#kaiz-custom-endpoint-group').slideUp();
            }
        });
        // Lắng nghe thay đổi input và lưu tự động
        $('#kaiz-custom-url, #kaiz-custom-key, #kaiz-custom-model-text').on('input', function () {
            const id = this.id;
            if (id === 'kaiz-custom-url')
                settings.customUrl = this.value;
            if (id === 'kaiz-custom-key')
                settings.customKey = this.value;
            if (id === 'kaiz-custom-model-text')
                settings.customModel = this.value;
            ctx.saveSettingsDebounced();
        });
        // Lắng nghe chọn từ Dropdown -> Cập nhật Input
        $('#kaiz-custom-model').on('change', function () {
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
            if (url.endsWith('/chat/completions'))
                url = url.replace('/chat/completions', '');
            if (!url.endsWith('/v1'))
                url = url.replace(/\/$/, '') + '/v1';
            url = url + '/models';
            try {
                $('#kaiz-fetch-models').find('i').addClass('fa-spin');
                const res = await fetch(url, {
                    headers: key ? { 'Authorization': `Bearer ${key}` } : {}
                });
                if (!res.ok)
                    throw new Error(`HTTP ${res.status}`);
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
                }
                else {
                    throw new Error('Invalid models response format.');
                }
            }
            catch (e) {
                console.error('[KaizAgent] Fetch models error:', e);
                toastr.error('Failed to fetch models: ' + e.message, 'Kaiz Agent');
            }
            finally {
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
            }
            else {
                console.error("[KaizAgent] renderExtensionTemplateAsync returned empty for kaiz_window.");
            }
        }
        catch (e) {
            console.error("[KaizAgent] Failed to load kaiz_window template:", e);
        }
        console.log("[KaizAgent] Core initialized successfully.");
    });
    // Hàm khởi tạo các sự kiện cho UI
    function initKaizUI(loop) {
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
        const addMessage = (role, htmlContent) => {
            let avatar = '';
            let extraClass = '';
            if (role === 'user') {
                avatar = '<i class="fa-solid fa-user"></i>';
                extraClass = 'kaiz-msg-user';
            }
            else if (role === 'agent') {
                avatar = '<i class="fa-solid fa-robot"></i>';
                extraClass = 'kaiz-msg-agent';
            }
            else {
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
            if (!text)
                return;
            input.val('');
            addMessage('user', text);
            let currentAgentMsgId = '';
            await loop.run(text, (event) => {
                switch (event.type) {
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
                            }
                            else if (event.reasoning) {
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
                        }
                        else {
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
        input.on('keydown', (e) => {
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
                if (!isDragging)
                    return;
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

})();
