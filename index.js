(function () {
    'use strict';

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

    const EXT_NAME = 'kaiz_agent';
    console.log(`[KaizAgent] Extension ${EXT_NAME} loaded into browser.`);
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
        // Nạp giao diện settings.html
        let extPath = 'third-party/Kaiz-Agent-Extension';
        try {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].src;
                if (src && src.includes('Kaiz-Agent-Extension/index.js')) {
                    const match = new URL(src).pathname.match(/\/scripts\/extensions\/(.+?)\//);
                    if (match)
                        extPath = match[1];
                    break;
                }
            }
        }
        catch (e) {
            console.warn("[KaizAgent] Failed to resolve extension path automatically, using fallback.");
        }
        try {
            const html = await $.get(`/scripts/extensions/${extPath}/settings.html`);
            $('#extensions_settings').append(html);
        }
        catch (e) {
            console.error("[KaizAgent] Failed to load settings.html:", e);
            toastr.error("Kaiz Agent: Failed to load UI settings.");
            return; // Dừng lại nếu không load được UI
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
        const registry = new ToolRegistry();
        // Đăng ký các công cụ
        registerDefaultTools(registry);
        console.log("[KaizAgent] Core initialized successfully.");
    });

})();
