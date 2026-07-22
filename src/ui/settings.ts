declare const jQuery: any;
declare const SillyTavern: any;
declare const toastr: any;

import { ToolRegistry } from '../core/tool_registry';

export class SettingsUI {
    public static async init(extPath: string, EXT_NAME: string, registry: ToolRegistry) {
        const $ = jQuery;
        const ctx = SillyTavern.getContext();

        // 2. Nạp giao diện settings.html
        const container =
            document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
        if (container) {
            try {
                const html = await ctx.renderExtensionTemplateAsync(extPath, 'settings');
                if (html) {
                    container.insertAdjacentHTML('beforeend', html);
                } else {
                    throw new Error('renderExtensionTemplateAsync returned empty html.');
                }
            } catch (e) {
                console.error('[KaizAgent] Failed to load settings template via renderExtensionTemplateAsync:', e);
                toastr.error('Kaiz Agent: Failed to load UI settings.');
                return;
            }
        } else {
            console.error('[KaizAgent] Could not find #extensions_settings container.');
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
        $('#kaiz-use-custom-endpoint').on('change', function (this: HTMLInputElement) {
            settings.useCustomEndpoint = !!this.checked;
            ctx.saveSettingsDebounced();
            if (settings.useCustomEndpoint) {
                $('#kaiz-custom-endpoint-group').slideDown();
            } else {
                $('#kaiz-custom-endpoint-group').slideUp();
            }
        });

        // Lắng nghe thay đổi input và lưu tự động
        $('#kaiz-custom-url, #kaiz-custom-key, #kaiz-custom-model-text').on('input', function (this: HTMLInputElement) {
            const id = this.id;
            if (id === 'kaiz-custom-url') settings.customUrl = this.value;
            if (id === 'kaiz-custom-key') settings.customKey = this.value;
            if (id === 'kaiz-custom-model-text') settings.customModel = this.value;
            ctx.saveSettingsDebounced();
        });

        $('#kaiz-max-loops').val(settings.maxAgentLoops || 5);
        $('#kaiz-max-loops').on('input', function (this: HTMLInputElement) {
            settings.maxAgentLoops = parseInt(this.value, 10) || 5;
            ctx.saveSettingsDebounced();
        });

        // --- UI SETTINGS LOGIC ---
        $('#kaiz-phone-mode').prop('checked', !!settings.phoneMode);
        $('#kaiz-phone-mode').on('change', function (this: HTMLInputElement) {
            settings.phoneMode = !!this.checked;
            ctx.saveSettingsDebounced();

            const win = $('#kaiz-chat-window');
            const dialogEl = win[0] as HTMLDialogElement;
            const isOpen = dialogEl && dialogEl.open;

            if (settings.phoneMode) {
                win.addClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('disable');
                }
                if (isOpen) {
                    dialogEl.close();
                    dialogEl.showModal();
                }
            } else {
                win.removeClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('enable');
                }
                if (isOpen) {
                    dialogEl.close();
                    dialogEl.show();
                }
            }
        });

        // --- SAFE MODE LOGIC ---
        $('#kaiz-safe-mode').prop('checked', settings.safeMode);
        if (settings.safeMode) {
            $('#kaiz-safe-mode-group').show();
        }
        $('#kaiz-safe-mode').on('change', function (this: HTMLInputElement) {
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

            tools.forEach((tool) => {
                const name = tool.schema.name;
                const desc = tool.schema.description;

                if (
                    lowerFilter &&
                    !name.toLowerCase().includes(lowerFilter) &&
                    !desc.toLowerCase().includes(lowerFilter)
                ) {
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

            $('.kaiz-safe-tool-toggle').on('change', function (this: HTMLInputElement) {
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
        $('#kaiz-safe-tools-search').on('input', function (this: HTMLInputElement) {
            renderSafeTools(this.value);
        });

        $('#kaiz-safe-tools-blacklist-all').on('click', () => {
            tools.forEach((tool) => {
                settings.safeModeBlacklist[tool.schema.name] = true;
            });
            ctx.saveSettingsDebounced();
            renderSafeTools(String($('#kaiz-safe-tools-search').val() || ''));
        });

        $('#kaiz-safe-tools-unblacklist-all').on('click', () => {
            settings.safeModeBlacklist = {};
            ctx.saveSettingsDebounced();
            renderSafeTools(String($('#kaiz-safe-tools-search').val() || ''));
        });
        // --- END SAFE MODE LOGIC ---

        // --- QUICK PROMPTS LOGIC ---
        const $quickPromptsList = $('#kaiz-quick-prompts-list');
        const $addQuickPromptBtn = $('#kaiz-add-quick-prompt-btn');

        const lucideIconsList = [
            'zap',
            'sparkles',
            'wand-2',
            'message-square',
            'message-circle',
            'book-open',
            'scroll-text',
            'flame',
            'moon',
            'sun',
            'star',
            'sword',
            'shield',
            'feather',
            'wind',
            'droplets',
            'leaf',
            'gem',
            'crown',
            'ghost',
            'skull',
            'heart',
            'coffee',
            'compass',
            'map',
            'eye',
            'camera',
            'music',
            'play',
            'terminal',
            'code',
            'cpu',
            'fingerprint',
            'palette',
            'cloud',
            'dice-5',
            'puzzle',
            'library',
            'mountain',
            'award',
            'bell',
            'cherry',
        ];

        let currentPickerIndex: number | null = null;

        // Tạo bảng chọn Icon
        if ($('#kaiz-icon-picker').length === 0) {
            let iconsHtml = '';
            lucideIconsList.forEach((iconName) => {
                iconsHtml += `<div class="kaiz-icon-picker-item interactable" data-icon="${iconName}" title="${iconName}"><i data-lucide="${iconName}"></i></div>`;
            });
            $('#kaiz-quick-prompts-list').parent().append(`
                <dialog id="kaiz-icon-picker" style="background:#1e1e1e; border:1px solid #333; border-radius:8px; padding:10px; width:300px; box-sizing:border-box; box-shadow:0 10px 25px rgba(0,0,0,0.5); color:#fff; margin:0;">
                    <div style="font-weight:bold; margin-bottom:10px; font-size:12px; color:#888; display:flex; justify-content:space-between;">
                        <span>Select Icon</span>
                        <i class="fa-solid fa-xmark interactable" id="kaiz-close-icon-picker" style="cursor:pointer;"></i>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:6px; max-height:200px; overflow-y:auto; overflow-x:hidden;" class="kaiz-icon-grid">
                        ${iconsHtml}
                    </div>
                </dialog>
            `);

            const pickerDialog = document.getElementById('kaiz-icon-picker') as HTMLDialogElement;

            // Đóng dialog khi click ra ngoài backdrop (tuỳ chọn)
            pickerDialog.addEventListener('click', (e) => {
                if (e.target === pickerDialog) {
                    pickerDialog.close();
                    currentPickerIndex = null;
                }
            });

            // Sự kiện đóng picker
            $('#kaiz-close-icon-picker').on('click', (e: any) => {
                e.stopPropagation();
                pickerDialog.close();
                currentPickerIndex = null;
            });

            // Sự kiện chọn icon trong picker
            $('.kaiz-icon-picker-item').on('click', function (this: HTMLElement, e: any) {
                e.stopPropagation();
                const iconName = $(this).data('icon');
                if (currentPickerIndex !== null && settings.quickPrompts[currentPickerIndex]) {
                    settings.quickPrompts[currentPickerIndex].icon = iconName;
                    ctx.saveSettingsDebounced();
                    renderQuickPrompts();
                }
                pickerDialog.close();
                currentPickerIndex = null;
            });
        }

        function renderQuickPrompts() {
            $quickPromptsList.empty();
            const quickPrompts = settings.quickPrompts || [];

            if (quickPrompts.length === 0) {
                $quickPromptsList.append(
                    '<div style="text-align:center; color:#888; font-size:12px; padding:10px;">No quick prompts added yet.</div>',
                );
                return;
            }

            quickPrompts.forEach((qp: any, index: number) => {
                const currentIcon = qp.icon || 'zap';

                // Tránh lỗi khi render lần đầu nếu chưa có icon cũ trong list
                if (currentIcon === '⚡') {
                    qp.icon = 'zap';
                }

                const $item = $(`
                    <div class="kaiz-qp-item" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; gap: 10px; align-items: center;">
                            <button class="menu_button interactable kaiz-qp-icon-btn" data-index="${index}" style="width: 32px; height: 32px; padding: 0; display: flex; justify-content: center; align-items: center;" title="Choose Icon">
                                <i data-lucide="${qp.icon}"></i>
                            </button>
                            <input type="text" class="text_pole kaiz-qp-name" data-index="${index}" value="${qp.name || ''}" placeholder="Name (e.g. Analyze)" style="flex: 1;">
                            <div style="display: flex; gap: 5px;">
                                <button class="menu_button interactable kaiz-qp-up" data-index="${index}" style="padding: 5px 10px;" title="Move Up"><i class="fa-solid fa-arrow-up"></i></button>
                                <button class="menu_button interactable kaiz-qp-down" data-index="${index}" style="padding: 5px 10px;" title="Move Down"><i class="fa-solid fa-arrow-down"></i></button>
                                <button class="menu_button interactable kaiz-qp-del" data-index="${index}" style="padding: 5px 10px; color: #e74c3c;" title="Delete"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                        <div>
                            <textarea class="text_pole kaiz-qp-text" data-index="${index}" rows="2" placeholder="Enter prompt text here..." style="resize: vertical; width: 100%; box-sizing: border-box;">${qp.prompt || ''}</textarea>
                        </div>
                    </div>
                `);
                $quickPromptsList.append($item);
            });

            // Yêu cầu thư viện Lucide vẽ lại icon SVG
            if ((window as any).lucide) {
                (window as any).lucide.createIcons();
            } else {
                // Nếu thư viện chưa tải xong, thử lại sau 500ms
                setTimeout(() => {
                    if ((window as any).lucide) (window as any).lucide.createIcons();
                }, 500);
            }

            // Gắn sự kiện thay đổi
            $('.kaiz-qp-name, .kaiz-qp-text').on('input', function (this: HTMLInputElement | HTMLTextAreaElement) {
                const index = parseInt($(this).data('index'), 10);
                if (settings.quickPrompts[index]) {
                    if ($(this).hasClass('kaiz-qp-name')) settings.quickPrompts[index].name = $(this).val();
                    if ($(this).hasClass('kaiz-qp-text')) settings.quickPrompts[index].prompt = $(this).val();
                    ctx.saveSettingsDebounced();
                }
            });

            // Mở Picker
            $('.kaiz-qp-icon-btn').on('click', function (this: HTMLButtonElement, e: any) {
                e.stopPropagation();
                const index = parseInt($(this).data('index'), 10);
                currentPickerIndex = index;
                const offset = $(this).offset();
                const pickerDialog = document.getElementById('kaiz-icon-picker') as HTMLDialogElement;
                if (offset && pickerDialog) {
                    $('#kaiz-icon-picker').css({
                        top: offset.top + 40 + 'px',
                        left: offset.left + 'px',
                    });
                    pickerDialog.showModal();
                }
            });

            $('.kaiz-qp-up').on('click', function (this: HTMLButtonElement) {
                const index = parseInt($(this).data('index'), 10);
                if (index > 0) {
                    const temp = settings.quickPrompts[index - 1];
                    settings.quickPrompts[index - 1] = settings.quickPrompts[index];
                    settings.quickPrompts[index] = temp;
                    ctx.saveSettingsDebounced();
                    renderQuickPrompts();
                }
            });

            $('.kaiz-qp-down').on('click', function (this: HTMLButtonElement) {
                const index = parseInt($(this).data('index'), 10);
                if (index < settings.quickPrompts.length - 1) {
                    const temp = settings.quickPrompts[index + 1];
                    settings.quickPrompts[index + 1] = settings.quickPrompts[index];
                    settings.quickPrompts[index] = temp;
                    ctx.saveSettingsDebounced();
                    renderQuickPrompts();
                }
            });

            $('.kaiz-qp-del').on('click', function (this: HTMLButtonElement) {
                const index = parseInt($(this).data('index'), 10);
                if (confirm('Delete this quick prompt?')) {
                    settings.quickPrompts.splice(index, 1);
                    ctx.saveSettingsDebounced();
                    renderQuickPrompts();
                }
            });
        }

        renderQuickPrompts();

        $addQuickPromptBtn.on('click', () => {
            if (!settings.quickPrompts) settings.quickPrompts = [];
            settings.quickPrompts.push({ icon: 'zap', name: 'New Prompt', prompt: '' });
            ctx.saveSettingsDebounced();
            renderQuickPrompts();
            // Scroll to bottom
            const container = $quickPromptsList.parent();
            container.scrollTop(container[0].scrollHeight);
        });
        // --- END QUICK PROMPTS LOGIC ---

        // --- TOOLS MANAGER LOGIC ---
        const $toolsList = $('#kaiz-tools-list');

        function renderTools(filterText = '') {
            $toolsList.empty();
            const lowerFilter = filterText.toLowerCase();

            tools.forEach((tool) => {
                const name = tool.schema.name;
                const desc = tool.schema.description;

                if (
                    lowerFilter &&
                    !name.toLowerCase().includes(lowerFilter) &&
                    !desc.toLowerCase().includes(lowerFilter)
                ) {
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
            $('.kaiz-tool-toggle').on('change', function (this: HTMLInputElement) {
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
        $('#kaiz-tools-search').on('input', function (this: HTMLInputElement) {
            renderTools(this.value);
        });
        // --- END TOOLS MANAGER LOGIC ---

        // Lắng nghe chọn từ Dropdown -> Cập nhật Input
        $('#kaiz-custom-model').on('change', function (this: HTMLSelectElement) {
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
                    headers: key ? { Authorization: `Bearer ${key}` } : {},
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const data = await res.json();
                const models = data.data || data; // Hỗ trợ OpenAI format ({ data: [...] }) hoặc mảng trực tiếp

                if (Array.isArray(models)) {
                    const select = $('#kaiz-custom-model');
                    select.empty().append('<option value="">-- Select Model --</option>');
                    models.forEach((m) => {
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
