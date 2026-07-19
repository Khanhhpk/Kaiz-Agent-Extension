declare const jQuery: any;
declare const SillyTavern: any;
declare const toastr: any;

import { ToolRegistry } from "../core/tool_registry";

export class SettingsUI {
    public static async init(extPath: string, EXT_NAME: string, registry: ToolRegistry) {
        const $ = jQuery;
        const ctx = SillyTavern.getContext();

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

        const settings = ctx.extensionSettings[EXT_NAME];

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

        $('#kaiz-max-loops').val(settings.maxAgentLoops || 5);
        $('#kaiz-max-loops').on('input', function(this: HTMLInputElement) {
            settings.maxAgentLoops = parseInt(this.value, 10) || 5;
            ctx.saveSettingsDebounced();
        });

        // --- SAFE MODE LOGIC ---
        $('#kaiz-safe-mode').prop('checked', settings.safeMode);
        if (settings.safeMode) {
            $('#kaiz-safe-mode-group').show();
        }
        $('#kaiz-safe-mode').on('change', function(this: HTMLInputElement) {
            settings.safeMode = !!this.checked;
            ctx.saveSettingsDebounced();
            if (settings.safeMode) {
                $('#kaiz-safe-mode-group').slideDown();
            } else {
                $('#kaiz-safe-mode-group').slideUp();
            }
        });

        const $safeToolsList = $('#kaiz-safe-tools-list');
        const tools = registry.getAllTools();

        function renderSafeTools(filterText = '') {
            $safeToolsList.empty();
            const lowerFilter = filterText.toLowerCase();
            
            tools.forEach(tool => {
                const name = tool.schema.name;
                const desc = tool.schema.description;
                
                if (lowerFilter && !name.toLowerCase().includes(lowerFilter) && !desc.toLowerCase().includes(lowerFilter)) {
                    return;
                }
                
                const isBlacklisted = !!settings.safeModeBlacklist[name];
                
                const $toolItem = $(`
                    <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 5px;">
                        <input type="checkbox" id="kaiz-safe-tool-${name}" class="kaiz-safe-tool-toggle" data-tool="${name}" ${isBlacklisted ? 'checked' : ''} style="margin-top: 3px;" />
                        <div style="flex: 1;">
                            <label for="kaiz-safe-tool-${name}" style="font-weight: bold; cursor: pointer; color: ${isBlacklisted ? '#e74c3c' : '#888'}; display: block;">${name}</label>
                            <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${desc}</div>
                        </div>
                    </div>
                `);
                
                $safeToolsList.append($toolItem);
            });
            
            $('.kaiz-safe-tool-toggle').on('change', function(this: HTMLInputElement) {
                const toolName = $(this).data('tool');
                const isChecked = this.checked;
                
                if (isChecked) {
                    settings.safeModeBlacklist[toolName] = true;
                } else {
                    delete settings.safeModeBlacklist[toolName];
                }
                ctx.saveSettingsDebounced();
                
                const $label = $(`label[for="kaiz-safe-tool-${toolName}"]`);
                $label.css('color', isChecked ? '#e74c3c' : '#888');
            });
        }
        renderSafeTools();
        $('#kaiz-safe-tools-search').on('input', function(this: HTMLInputElement) {
            renderSafeTools(this.value);
        });
        // --- END SAFE MODE LOGIC ---

        // --- TOOLS MANAGER LOGIC ---
        const $toolsList = $('#kaiz-tools-list');
        
        function renderTools(filterText = '') {
            $toolsList.empty();
            const lowerFilter = filterText.toLowerCase();
            
            tools.forEach(tool => {
                const name = tool.schema.name;
                const desc = tool.schema.description;
                
                if (lowerFilter && !name.toLowerCase().includes(lowerFilter) && !desc.toLowerCase().includes(lowerFilter)) {
                    return; // Bỏ qua nếu không khớp filter
                }
                
                const isEnabled = !settings.disabledTools[name];
                
                const $toolItem = $(`
                    <div style="display: flex; align-items: flex-start; gap: 10px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 5px;">
                        <input type="checkbox" id="kaiz-tool-toggle-${name}" class="kaiz-tool-toggle" data-tool="${name}" ${isEnabled ? 'checked' : ''} style="margin-top: 3px;" />
                        <div style="flex: 1;">
                            <label for="kaiz-tool-toggle-${name}" style="font-weight: bold; cursor: pointer; color: ${isEnabled ? '#fff' : '#888'}; display: block;">${name}</label>
                            <div style="font-size: 11px; color: #aaa; margin-top: 2px;">${desc}</div>
                        </div>
                    </div>
                `);
                
                $toolsList.append($toolItem);
            });
            
            // Gắn sự kiện toggle
            $('.kaiz-tool-toggle').on('change', function(this: HTMLInputElement) {
                const toolName = $(this).data('tool');
                const isChecked = this.checked;
                
                if (isChecked) {
                    delete settings.disabledTools[toolName];
                } else {
                    settings.disabledTools[toolName] = true;
                }
                ctx.saveSettingsDebounced();
                
                // Đổi màu nhãn
                const $label = $(`label[for="kaiz-tool-toggle-${toolName}"]`);
                $label.css('color', isChecked ? '#fff' : '#888');
            });
        }
        
        // Render lần đầu
        renderTools();
        
        // Bắt sự kiện Search
        $('#kaiz-tools-search').on('input', function(this: HTMLInputElement) {
            renderTools(this.value);
        });
        // --- END TOOLS MANAGER LOGIC ---

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
    }
}
