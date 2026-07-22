/**
 * SillyTavern Adapter
 * Lớp trung gian để bọc các API của ST, lấy cảm hứng từ ST-Copilot.
 */

declare const SillyTavern: any;
declare const window: any;
declare const document: any;

export interface Message {
    role: 'system' | 'user' | 'assistant';
    name?: string;
    content: string;
}

export class SillyTavernAdapter {
    constructor() {}

    /**
     * Kiểm tra xem ST có hỗ trợ tính năng này không (dùng cho dryRun)
     */
    public hasFeature(featureName: string): boolean {
        const ctx = SillyTavern.getContext();
        return typeof ctx[featureName] === 'function' || ctx[featureName] !== undefined;
    }

    /**
     * Gửi request lên LLM thông qua ConnectionManager hoặc ChatCompletionService của ST
     */
    public async generateCompletion(
        messages: Message[],
        maxTokens: number,
        stream: boolean = false,
        onUpdate?: (text: string, reasoning: string | null) => void,
        signal?: AbortSignal,
    ): Promise<{ text: string; reasoning: string | null; isMaxTokens: boolean }> {
        console.log('[KaizAgent] Calling ST generateCompletion...');
        const ctx = SillyTavern.getContext();
        const settings = ctx.extensionSettings['kaiz_agent'] || {};
        const abort = new AbortController();
        const effectiveSignal = signal || abort.signal;

        // 1. Nếu bật tính năng Custom Endpoint, ta gọi trực tiếp (bypass ST)
        if (settings.useCustomEndpoint && settings.customUrl) {
            console.log('[KaizAgent] Using Custom Endpoint:', settings.customUrl);
            let text = '';
            let reasoning: string | null = null;
            let isMaxTokens = false;

            try {
                let url = settings.customUrl;
                if (!url.endsWith('/chat/completions')) {
                    url = url.replace(/\/$/, '') + '/chat/completions';
                }

                const headers: any = { 'Content-Type': 'application/json' };
                if (settings.customKey) headers['Authorization'] = `Bearer ${settings.customKey}`;

                const payload = {
                    model: settings.customModel || 'gpt-3.5-turbo',
                    messages: messages,
                    max_tokens: maxTokens,
                    stream: stream,
                };

                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: effectiveSignal,
                });

                if (!res.ok) {
                    const errText = await res.text().catch(() => res.statusText);
                    throw new Error(`Custom API Error ${res.status}: ${errText}`);
                }

                if (stream) {
                    const reader = res.body?.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let buffer = '';

                    if (reader) {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';

                            for (const line of lines) {
                                const l = line.trim();
                                if (!l || l.startsWith(':') || l === 'data: [DONE]') continue;
                                if (l.startsWith('data: ')) {
                                    try {
                                        const data = JSON.parse(l.slice(6));

                                        const finish = data.choices?.[0]?.finish_reason;
                                        if (finish === 'length' || finish === 'max_tokens') isMaxTokens = true;

                                        const delta = data.choices?.[0]?.delta || {};
                                        if (delta.content) text += delta.content;
                                        if (delta.reasoning || delta.reasoning_content) {
                                            reasoning =
                                                (reasoning || '') + (delta.reasoning || delta.reasoning_content);
                                        }
                                        if (data.thinking) reasoning = (reasoning || '') + data.thinking;

                                        if (onUpdate) onUpdate(text, reasoning);
                                    } catch (e) {}
                                }
                            }
                        }
                    }
                } else {
                    const data = await res.json();
                    const finish = data.choices?.[0]?.finish_reason;
                    if (finish === 'length' || finish === 'max_tokens') isMaxTokens = true;

                    const msg = data.choices?.[0]?.message || {};
                    text = msg.content || '';
                    if (msg.reasoning || msg.reasoning_content) {
                        reasoning = msg.reasoning || msg.reasoning_content;
                    }
                    if (data.thinking) reasoning = (reasoning || '') + data.thinking;
                    if (onUpdate) onUpdate(text, reasoning);
                }

                return { text: text.trim(), reasoning, isMaxTokens };
            } catch (e) {
                console.error('[KaizAgent] Custom Endpoint error:', e);
                throw e;
            }
        }

        // 2. Nếu không bật Custom Endpoint, sử dụng ConnectionManager mặc định của SillyTavern
        const service = ctx.ConnectionManagerRequestService;
        let asyncGeneratorFn: any;

        try {
            const profileId =
                ctx.extensionSettings?.connectionManager?.selectedProfile ||
                document.getElementById('connection_profiles')?.value;

            if (profileId && service && typeof service.sendRequest === 'function') {
                asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                    stream: stream,
                    signal: effectiveSignal,
                    extractData: false,
                    includePreset: true,
                });
            } else {
                const mainApi = window.main_api || ctx.main_api;
                if (mainApi === 'openai' && ctx.ChatCompletionService) {
                    const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                    asyncGeneratorFn = await ctx.ChatCompletionService.processRequest(
                        {
                            messages: messages,
                            max_tokens: maxTokens,
                            stream: stream,
                        },
                        { presetName: oaiSettings.preset_settings_openai },
                        false,
                        abort.signal,
                    );
                } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                    const textGenSettings =
                        window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                    asyncGeneratorFn = await ctx.TextCompletionService.processRequest(
                        {
                            prompt: messages,
                            max_tokens: maxTokens,
                            stream: stream,
                        },
                        { presetName: textGenSettings.preset_settings_textgenerationwebui },
                        false,
                        abort.signal,
                    );
                } else {
                    throw new Error('No active API connection found in SillyTavern. Please configure LLM settings.');
                }
            }

            let text = '';
            let reasoning = null;

            const isGen =
                typeof asyncGeneratorFn === 'function' ||
                (asyncGeneratorFn != null && typeof asyncGeneratorFn[Symbol.asyncIterator] === 'function') ||
                (asyncGeneratorFn != null && typeof asyncGeneratorFn.next === 'function');

            let lastValue: any = null;

            if (!isGen) {
                const value = asyncGeneratorFn;
                if (typeof value === 'string') {
                    text = value.trim();
                } else {
                    text =
                        value?.text ||
                        value?.content ||
                        value?.message?.content ||
                        value?.choices?.[0]?.message?.content ||
                        '';
                }
                const finishReason =
                    lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
                const isMaxTokens =
                    finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';
                if (onUpdate) onUpdate(text, reasoning);
                return { text: text.trim(), reasoning, isMaxTokens };
            }

            const gen = typeof asyncGeneratorFn === 'function' ? asyncGeneratorFn() : asyncGeneratorFn;
            while (true) {
                const { value, done } = await gen.next();
                if (done) {
                    if (value) lastValue = value;
                    break;
                }
                lastValue = value;

                const chunkText = value?.text || value?.content || value?.choices?.[0]?.delta?.content || '';
                if (value?.thinking) reasoning = (reasoning || '') + value.thinking;

                if (chunkText) text += chunkText;

                if (onUpdate) onUpdate(text, reasoning);
            }

            const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
            const isMaxTokens =
                finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';

            return { text: text.trim(), reasoning, isMaxTokens };
        } catch (e) {
            console.error('[KaizAgent] generateCompletion error:', e);
            throw e;
        }
    }

    /**
     * Lấy tổng số tin nhắn hiện tại trong chat
     */
    public getChatLength(): number {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat || !Array.isArray(ctx.chat)) return 0;
        return ctx.chat.length;
    }

    /**
     * Hiển thị bảng Preview thu gọn cho toàn bộ chat
     */
    public showChatPreviewModal() {
        const $ = (window as any).$;
        if (!$ || !$.fn) {
            console.error('[KaizAgent] jQuery not found, cannot show preview modal.');
            return;
        }

        const ctx = SillyTavern.getContext();
        const chat = ctx.chat || [];

        $('#kaiz-chat-preview-modal').remove();

        let html = `
        <style>#kaiz-chat-preview-modal::backdrop { background: rgba(0,0,0,0.8); }</style>
        <dialog id="kaiz-chat-preview-modal" style="padding:0; border:none; border-radius:10px; background:transparent; width:90vw; max-width:800px; height:80vh; max-height:800px; overflow:hidden;">
            <div style="width:100%; height:100%; background:#222; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5); border:1px solid #444; border-radius:10px;">
                <div style="height:55px; padding:0 15px; border-bottom:1px solid #444; display:flex; justify-content:space-between; align-items:center; background:#333; box-sizing:border-box;">
                    <h3 style="margin:0; color:#fff; font-size:18px;"><i class="fa-solid fa-list-ol"></i> Quick Chat Preview (Total: ${chat.length})</h3>
                    <i id="kaiz-chat-preview-close" class="fa-solid fa-xmark interactable" style="cursor:pointer; color:#ccc; font-size:20px;"></i>
                </div>
                <div style="height:calc(100% - 55px); padding:15px; overflow-y:auto; background:#1e1e1e; box-sizing:border-box;">`;

        for (let i = 0; i < chat.length; i++) {
            const msg = chat[i];
            const name = msg.name || 'System';

            // Lấy safe_preview
            let preview = msg.mes || '';
            if (preview.length > 50) preview = preview.substring(0, 50) + '...';
            // Thoát HTML
            preview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const fullText = (msg.mes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

            let headerColor = msg.is_user ? '#4dabf7' : '#a9e34b';
            if (name === 'System' || msg.is_system) headerColor = '#ffd43b';

            html += `
                <details style="margin-bottom:10px; background:#2a2a2a; border-radius:6px; border:1px solid #444; overflow:hidden;">
                    <summary style="padding:10px; cursor:pointer; background:#333; display:flex; align-items:center; user-select:none; outline:none; color:#eee;">
                        <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <b style="color:${headerColor}; font-size:14px;"><i class="fa-solid fa-user"></i> ${name}</b>
                                <span style="font-size:12px; color:#888;">#${i} ${msg.is_system ? ' <span style="background:#444; padding:2px 6px; border-radius:4px; color:#ddd; font-size:11px;">Hidden</span>' : ''}</span>
                            </div>
                            <div style="font-size:13px; color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${preview}</div>
                        </div>
                    </summary>
                    <div style="padding:12px; font-size:14px; line-height:1.5; color:#ddd; border-top:1px solid #444;">
                        ${fullText}
                    </div>
                </details>
            `;
        }

        if (chat.length === 0) {
            html += `<div style="text-align:center; padding:20px; color:#888; font-style:italic;">No messages in chat history.</div>`;
        }

        html += `
                </div>
            </div>
        </dialog>`;

        $('body').append(html);

        const dialog = document.getElementById('kaiz-chat-preview-modal') as any;
        if (!dialog.open) dialog.showModal();

        $('#kaiz-chat-preview-close').on('click', () => {
            dialog.close();
            $('#kaiz-chat-preview-modal').remove();
        });
    }

    /**
     * Lấy lịch sử đoạn chat hiện tại (bỏ qua những tin nhắn ẩn)
     */
    public getChatContext(depth: number = 20) {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat) return [];

        const total = ctx.chat.length;
        const startIndex = Math.max(0, total - depth);
        const slice = ctx.chat.slice(startIndex);

        // H3: Track raw index trong slice (không phải filtered index) để chatIndex chính xác
        const result: any[] = [];
        for (let i = 0; i < slice.length; i++) {
            const m = slice[i];
            if (m.is_system || m.is_hidden || (m.extra && m.extra.is_hidden)) continue;
            result.push({
                role: m.is_user ? 'user' : 'assistant',
                name: m.is_user ? ctx.name1 || 'User' : m.name || ctx.name2 || 'Character',
                content: typeof m.mes === 'string' ? m.mes : '',
                chatIndex: startIndex + i, // index thật trong ctx.chat, không bị lệch bởi filter
            });
        }
        return result;
    }

    /**
     * Lấy thông tin về nhân vật đang chat
     */
    public getCharInfo() {
        const ctx = SillyTavern.getContext();
        const char = ctx.characters?.[ctx.characterId];
        if (!char) return null;

        const d = char.data || {};
        return {
            name: char.name || 'Unknown',
            description: d.description || char.description || '',
            personality: d.personality || char.personality || '',
            scenario: d.scenario || char.scenario || '',
            system_prompt: d.system_prompt || char.system_prompt || '',
        };
    }

    /**
     * Gửi tin nhắn hệ thống (không lưu vào lịch sử nhân vật)
     */
    public sendSystemMessage(message: string) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.sendSystemMessage === 'function') {
            ctx.sendSystemMessage('generic', message);
        } else {
            console.error('[KaizAgent] sendSystemMessage not available in ST Context.');
        }
    }

    /**
     * Xóa tin nhắn cuối cùng
     */
    public deleteLastMessage() {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.deleteLastMessage === 'function') {
            ctx.deleteLastMessage();
        } else {
            console.error('[KaizAgent] deleteLastMessage not available in ST Context.');
        }
    }

    /**
     * Xóa một hoặc nhiều tin nhắn cụ thể dựa vào index
     * @param indices Mảng các vị trí tin nhắn trong mảng chat (chatIndex)
     */
    public deleteMessagesByIndices(indices: number[]) {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.deleteMessage !== 'function') {
            console.error('[KaizAgent] deleteMessage not available in ST Context.');
            throw new Error('API deleteMessage của ST không tồn tại.');
        }

        if (!ctx.chat || !Array.isArray(ctx.chat)) {
            throw new Error('Không thể đọc mảng chat hiện tại.');
        }

        // Lọc và validate (loại bỏ index lỗi, giới hạn trong mảng chat)
        const validIndices = indices.filter((i) => Number.isInteger(i) && i >= 0 && i < ctx.chat.length);
        if (validIndices.length === 0) {
            throw new Error('Không có index nào hợp lệ nằm trong giới hạn chat.');
        }

        // Loại bỏ trùng lặp và sắp xếp giảm dần (descending) để tránh index shifting
        const uniqueSortedIndices = Array.from(new Set(validIndices)).sort((a, b) => b - a);

        // Gọi xoá từng tin một (do ST không có hàm xoá mảng)
        for (const index of uniqueSortedIndices) {
            // ST_API: deleteMessage(id, swipeDeletionIndex = undefined, askConfirmation = false)
            ctx.deleteMessage(index, undefined, false);
        }
    }

    /**
     * Lấy thông tin Persona của người dùng
     */
    public async getUserPersona(): Promise<string> {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.substituteParams === 'function') {
            const name = ctx.substituteParams('{{user}}');
            const personaText = ctx.substituteParams('{{persona}}');

            // M1: Nếu macro chưa được resolve (không có persona active), trả về thông báo rõ ràng
            const hasUnresolvedPersona = personaText === '{{persona}}' || !personaText.trim();
            if (hasUnresolvedPersona) {
                return `Name: ${name}\nPersona Description: (Chưa thiết lập — không có Persona nào đang được kích hoạt. Hãy chọn một Persona trong SillyTavern trước.)`;
            }
            return `Name: ${name}\nPersona Description:\n${personaText}`;
        }
        return 'No persona available or unsupported ST version.';
    }

    /**
     * Chỉnh sửa Persona của người dùng
     */
    public async editUserPersona(newDescription: string, newName?: string): Promise<boolean> {
        try {
            const ctx = SillyTavern.getContext();

            // Import module personas.js để lấy user_avatar (là ES module variable, không expose ra window)
            let personasModule: any = null;
            try {
                personasModule = await new Function("return import('/scripts/personas.js')")();
            } catch (e) {
                console.warn('[KaizAgent] Could not import personas.js:', e);
            }

            // Lấy avatarId từ module hoặc fallback sang power_user settings
            let avatarId: string = '';
            if (personasModule && personasModule.user_avatar) {
                avatarId = personasModule.user_avatar;
            } else {
                // Fallback: tìm avatarId bằng cách so sánh persona_description hiện tại trong settings
                const powerUser = (ctx as any).powerUserSettings;
                if (powerUser && powerUser.user_avatar) {
                    avatarId = powerUser.user_avatar;
                }
            }

            if (!avatarId) {
                console.error('[KaizAgent] No active user_avatar found.');
                return false;
            }

            const powerUser = (ctx as any).powerUserSettings;
            if (!powerUser || !powerUser.personas) {
                console.error('[KaizAgent] power_user.personas not accessible via context.');
                return false;
            }

            if (!powerUser.personas[avatarId]) {
                console.warn(`[KaizAgent] No persona entry found for avatarId=${avatarId}. Will attempt to create.`);
                powerUser.personas[avatarId] = newName || 'User';
            }

            let hasUpdates = false;

            // Cập nhật tên
            if (newName && newName.trim() !== '') {
                const oldName = powerUser.personas[avatarId];
                if (oldName !== newName.trim()) {
                    powerUser.personas[avatarId] = newName.trim();
                    // Sync name1 (display name in chat)
                    const w = window as any;
                    if (typeof w.setUserName === 'function') {
                        w.setUserName(newName.trim());
                    }
                    if (ctx.eventSource && ctx.eventTypes) {
                        ctx.eventSource.emit(ctx.eventTypes.PERSONA_RENAMED, {
                            avatarId,
                            oldName,
                            newName: newName.trim(),
                        });
                    }
                    hasUpdates = true;
                }
            }

            // Cập nhật mô tả
            if (newDescription !== undefined) {
                if (powerUser.persona_descriptions && powerUser.persona_descriptions[avatarId]) {
                    powerUser.persona_descriptions[avatarId].description = newDescription;
                } else if (powerUser.persona_descriptions) {
                    // Tạo entry mới nếu chưa có
                    powerUser.persona_descriptions[avatarId] = {
                        description: newDescription,
                        position: 0,
                        depth: 0,
                        role: 0,
                    };
                }
                // Cập nhật shorthand được dùng ở nhiều nơi
                powerUser.persona_description = newDescription;
                hasUpdates = true;
            }

            // Lưu và kích hoạt thay đổi UI
            if (hasUpdates) {
                const saveSettings = ctx.saveSettingsDebounced || (window as any).saveSettingsDebounced;
                if (typeof saveSettings === 'function') {
                    saveSettings();
                }

                // === SYNC DOM TRỰC TIẾP (giống ST gốc) ===
                // 1. Update textarea #persona_description (cái ô mô tả lớn)
                if (newDescription !== undefined) {
                    const $textarea = (window as any).$('#persona_description');
                    if ($textarea && $textarea.length) {
                        $textarea.val(newDescription);
                        // Trigger input event để ST cập nhật token count và trạng thái khác
                        $textarea.trigger('input');
                    }
                }

                // 2. Gọi hàm module để re-render UI panel
                if (personasModule) {
                    // reloadUserAvatar() — cập nhật avatar trong chat bubbles
                    if (typeof personasModule.reloadUserAvatar === 'function') {
                        personasModule.reloadUserAvatar();
                    }
                    // selectCurrentPersona() — cập nhật toàn bộ trạng thái hiển thị current persona
                    // bao gồm description preview ở dưới tên trong list
                    if (typeof personasModule.selectCurrentPersona === 'function') {
                        await personasModule.selectCurrentPersona({ toastPersonaNameChange: false });
                    }
                    // updatePersonaUIStates() — re-render list (highlight, locked state...)
                    if (typeof personasModule.updatePersonaUIStates === 'function') {
                        personasModule.updatePersonaUIStates();
                    }
                }

                // 3. Phát event để các extension khác biết
                if (ctx.eventSource && ctx.eventTypes) {
                    ctx.eventSource.emit(ctx.eventTypes.PERSONA_CHANGED, avatarId);
                }
            }

            return true;
        } catch (err) {
            console.error('[KaizAgent] Error in editUserPersona:', err);
            return false;
        }
    }

    /**
     * Lấy toàn bộ thông tin Lorebook (World Info) bao gồm Global và Character-bound
     * @param options Các tùy chọn lọc dữ liệu
     */
    public async getLorebookInfo(
        options: {
            mode: 'summary' | 'all_full' | 'char_full' | 'by_name' | 'search' | 'by_uid' | 'simulate';
            bookName?: string;
            includeDisabled?: boolean;
            query?: string;
            uid?: string | number;
        } = { mode: 'summary' },
    ): Promise<string> {
        let result = '';
        try {
            const ctx = SillyTavern.getContext();
            let ST_WorldInfo: any = null;
            try {
                ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")();
            } catch (e) {
                console.warn('[KaizAgent] Could not dynamically import world-info.js');
            }

            const names = new Set<string>();
            const globalBooks = ST_WorldInfo?.selected_world_info || (window as any).selected_world_info || [];
            if (Array.isArray(globalBooks)) {
                globalBooks.forEach((n: any) => n && names.add(n));
            }

            const charId = ctx.characterId;
            const character = ctx.characters?.[charId];
            if (character) {
                const baseWorldName = character.data?.extensions?.world || character.world;
                if (baseWorldName) names.add(baseWorldName);

                let fileName = character.avatar;
                if (!fileName && typeof (window as any).getCharaFilename === 'function') {
                    fileName = (window as any).getCharaFilename(charId);
                }

                const charLoreList = ST_WorldInfo?.world_info?.charLore || (window as any).world_info?.charLore;
                if (fileName && Array.isArray(charLoreList)) {
                    const extraCharLore = charLoreList.find((e: any) => e.name === fileName);
                    if (extraCharLore && Array.isArray(extraCharLore.extraBooks)) {
                        extraCharLore.extraBooks.forEach((b: string) => b && names.add(b));
                    }
                }
            }

            const wiKey = ST_WorldInfo?.METADATA_KEY || (window as any).WI_METADATA_KEY || 'world_info';
            const chatWorldName = ctx.chatMetadata?.[wiKey];
            if (chatWorldName && typeof chatWorldName === 'string') names.add(chatWorldName);

            if (options.bookName && (options.mode === 'by_name' || options.mode === 'summary')) {
                // Bỏ qua kiểm tra names.has() để cho phép đọc book đang bị tắt
                names.clear();
                names.add(options.bookName);
            } else if (options.mode === 'by_name') {
                return "Lỗi: Chế độ 'by_name' yêu cầu cung cấp tên Lorebook (bookName).";
            }

            if (options.mode === 'char_full') {
                // Xoá hết global names để chỉ xử lý char lorebook
                names.clear();
            }

            if (options.mode !== 'char_full') {
                result += '=== LOREBOOKS ĐANG KÍCH HOẠT ===\n';
                if (names.size === 0) {
                    result += 'Không có Global hay Chat Lorebook nào đang được kích hoạt.\n';
                }

                for (const name of names) {
                    let data = null;
                    try {
                        if (typeof ctx.loadWorldInfo === 'function') {
                            data = await ctx.loadWorldInfo(name);
                        } else {
                            const res = await fetch('/api/worldinfo/get', {
                                method: 'POST',
                                headers: {
                                    ...(typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : {}),
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ name }),
                            });
                            if (res.ok) data = await res.json();
                        }
                    } catch (e) {
                        console.error(`[KaizAgent] Failed to load lorebook ${name}:`, e);
                    }

                    if (data && data.entries) {
                        const entries = Object.entries(data.entries);
                        let bookResult = `\n[Lorebook: ${name}]\n`;
                        let hasEntries = false;
                        for (const [entryKey, entryVal] of entries) {
                            const entry = entryVal as any;
                            if (!entry || (!entry.content && options.mode !== 'summary')) continue;
                            const isDisabled = entry.disable === true;
                            if (isDisabled && options.mode !== 'summary' && !options.includeDisabled) continue;

                            const keysList = entry.key || entry.keys || [];
                            const keys = Array.isArray(keysList) ? keysList.join(', ') : String(keysList);
                            const type = entry.constant ? 'CONSTANT' : 'NORMAL';
                            const status = isDisabled ? 'TẮT' : 'BẬT';
                            const entryUid = entry.uid ?? entry.id ?? entryKey;
                            const entryTitle = entry.comment || entry.name || `Entry #${entryUid}`;

                            // Xử lý các mode đặc biệt
                            if (options.mode === 'by_uid') {
                                if (String(entryUid) !== String(options.uid)) continue;
                            } else if (options.mode === 'search') {
                                const q = (options.query || '').toLowerCase();
                                const c = (entry.content || '').toLowerCase();
                                const k = keys.toLowerCase();
                                const t = entryTitle.toLowerCase();
                                if (!c.includes(q) && !k.includes(q) && !t.includes(q)) continue;
                            } else if (options.mode === 'simulate') {
                                const q = (options.query || '').toLowerCase();
                                let triggered = false;
                                const keysArray = Array.isArray(keysList) ? keysList : [keysList];
                                for (const key of keysArray) {
                                    const kStr = String(key).toLowerCase().trim();
                                    if (!kStr) continue;
                                    if (kStr.includes('&&')) {
                                        const parts = kStr.split('&&').map((p) => p.trim());
                                        if (parts.every((p) => q.includes(p))) {
                                            triggered = true;
                                            break;
                                        }
                                    } else {
                                        if (q.includes(kStr)) {
                                            triggered = true;
                                            break;
                                        }
                                    }
                                }
                                if (!triggered) continue;
                            }

                            hasEntries = true;
                            if (options.mode === 'summary' || options.mode === 'simulate') {
                                bookResult += `- ${entryTitle} (UID: ${entryUid}) (${type}) [${status}] | Keys: [${keys}]\n`;
                            } else {
                                bookResult += `- Entry ${entryTitle} (UID: ${entryUid}) (${type}) [${status}] | Keys: [${keys}]\n  Content: ${entry.content}\n`;
                            }
                        }
                        if (hasEntries) {
                            result += bookResult;
                        } else if (
                            options.mode === 'all_full' ||
                            options.mode === 'by_name' ||
                            options.mode === 'summary'
                        ) {
                            result += bookResult + '(Lorebook này rỗng hoặc không có entry phù hợp)\n';
                        }
                    }
                }
            }

            if (options.mode !== 'by_name') {
                result += '\n=== CHARACTER LOREBOOK (Nhúng vào thẻ) ===\n';
                if (
                    character &&
                    character.data &&
                    character.data.character_book &&
                    character.data.character_book.entries
                ) {
                    let bookResult = `\n[Character Lorebook: ${character.name}]\n`;
                    let entriesObj = character.data.character_book.entries;
                    if (Array.isArray(entriesObj)) {
                        entriesObj = Object.fromEntries(entriesObj.entries());
                    }
                    const entries = Object.entries(entriesObj);
                    let hasEntries = false;
                    for (const [entryKey, entryVal] of entries) {
                        const entry = entryVal as any;
                        if (!entry || (!entry.content && options.mode !== 'summary')) continue;
                        const isDisabled = entry.disable === true;
                        if (isDisabled && options.mode !== 'summary' && !options.includeDisabled) continue;

                        const keysList = entry.keys || entry.key || [];
                        const keys = Array.isArray(keysList) ? keysList.join(', ') : String(keysList);
                        const type = entry.constant ? 'CONSTANT' : 'NORMAL';
                        const status = isDisabled ? 'TẮT' : 'BẬT';
                        const entryUid = entry.id ?? entry.uid ?? entryKey;
                        const entryTitle = entry.comment || entry.name || `Entry #${entryUid}`;

                        // Xử lý các mode đặc biệt
                        if (options.mode === 'by_uid') {
                            if (String(entryUid) !== String(options.uid)) continue;
                        } else if (options.mode === 'search') {
                            const q = (options.query || '').toLowerCase();
                            const c = (entry.content || '').toLowerCase();
                            const k = keys.toLowerCase();
                            const t = entryTitle.toLowerCase();
                            if (!c.includes(q) && !k.includes(q) && !t.includes(q)) continue;
                        } else if (options.mode === 'simulate') {
                            const q = (options.query || '').toLowerCase();
                            let triggered = false;
                            const keysArray = Array.isArray(keysList) ? keysList : [keysList];
                            for (const key of keysArray) {
                                const kStr = String(key).toLowerCase().trim();
                                if (!kStr) continue;
                                if (kStr.includes('&&')) {
                                    const parts = kStr.split('&&').map((p) => p.trim());
                                    if (parts.every((p) => q.includes(p))) {
                                        triggered = true;
                                        break;
                                    }
                                } else {
                                    if (q.includes(kStr)) {
                                        triggered = true;
                                        break;
                                    }
                                }
                            }
                            if (!triggered) continue;
                        }

                        hasEntries = true;
                        if (options.mode === 'summary' || options.mode === 'simulate') {
                            bookResult += `- ${entryTitle} (UID: ${entryUid}) (${type}) [${status}] | Keys: [${keys}]\n`;
                        } else {
                            bookResult += `- Entry ${entryTitle} (UID: ${entryUid}) (${type}) [${status}] | Keys: [${keys}]\n  Content: ${entry.content}\n`;
                        }
                    }
                    if (hasEntries) {
                        result += bookResult;
                    } else if (
                        options.mode === 'all_full' ||
                        options.mode === 'char_full' ||
                        options.mode === 'summary'
                    ) {
                        result += bookResult + '(Character Lorebook rỗng hoặc không có entry phù hợp)\n';
                    }
                } else if (options.mode === 'summary' || options.mode === 'all_full' || options.mode === 'char_full') {
                    result += 'Nhân vật này không có Lorebook đi kèm thẻ.\n';
                }
            }

            return result;
        } catch (e: any) {
            console.error('[KaizAgent] Lỗi khi lấy toàn bộ Lorebook:', e);
            return `Lỗi khi lấy thông tin Lorebook: ${e.message}`;
        }
    }

    /**
     * Quản lý (Thêm/Sửa/Xóa) Lorebook Entry
     */
    public async manageLorebookEntry(options: {
        action: 'create' | 'edit' | 'delete';
        book_name: string;
        uid?: string | number;
        keys?: string[];
        content?: string;
        constant?: boolean;
        disable?: boolean;
        comment?: string;
    }): Promise<string> {
        try {
            let ST_WorldInfo: any = null;
            try {
                ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")();
            } catch (e) {
                return '[KaizAgent] Lỗi: Không thể import world-info.js (ST version unsupported).';
            }

            if (typeof ST_WorldInfo.loadWorldInfo !== 'function' || typeof ST_WorldInfo.saveWorldInfo !== 'function') {
                return '[KaizAgent] Lỗi: API World Info không tồn tại trong phiên bản ST này.';
            }

            // Ghi nhận WB có sẵn TRƯỚC khi load để phát hiện implicit creation
            const existingBooks: string[] = [...(ST_WorldInfo.world_names || [])];
            const isNewBook = !existingBooks.includes(options.book_name);

            const data = await ST_WorldInfo.loadWorldInfo(options.book_name);
            if (!data || !data.entries) {
                return `[KaizAgent] Lỗi: Không tìm thấy hoặc không thể tải Lorebook "${options.book_name}".`;
            }

            let resultMsg = '';

            if (options.action === 'create') {
                if (typeof ST_WorldInfo.createWorldInfoEntry !== 'function') {
                    return '[KaizAgent] Lỗi: Hàm createWorldInfoEntry không tồn tại.';
                }
                const newEntry = ST_WorldInfo.createWorldInfoEntry(options.book_name, data);
                if (!newEntry) return '[KaizAgent] Lỗi: Không thể tạo entry mới (có thể do lỗi getFreeWorldEntryUid).';

                if (options.keys !== undefined) {
                    newEntry.key = options.keys;
                    newEntry.keys = options.keys;
                }
                if (options.content !== undefined) newEntry.content = options.content;
                if (options.constant !== undefined) newEntry.constant = options.constant;
                if (options.disable !== undefined) newEntry.disable = options.disable;
                if (options.comment !== undefined) {
                    newEntry.comment = options.comment;
                    newEntry.name = options.comment;
                }

                resultMsg = `Đã tạo thành công Entry mới với UID: ${newEntry.uid} trong Lorebook "${options.book_name}".`;
            } else if (options.action === 'edit' || options.action === 'delete') {
                if (options.uid === undefined) return '[KaizAgent] Lỗi: Cần cung cấp uid để edit hoặc delete.';

                // Find entry by uid
                const entries = Object.entries(data.entries);
                let foundEntryKey: string | null = null;
                let foundEntry: any = null;

                for (const [key, val] of entries) {
                    const e = val as any;
                    const eUid = e.uid ?? e.id ?? key;
                    if (String(eUid) === String(options.uid)) {
                        foundEntryKey = key;
                        foundEntry = e;
                        break;
                    }
                }

                if (!foundEntryKey || !foundEntry) {
                    return `[KaizAgent] Lỗi: Không tìm thấy Entry có UID: ${options.uid} trong Lorebook "${options.book_name}".`;
                }

                if (options.action === 'delete') {
                    if (typeof ST_WorldInfo.deleteWorldInfoEntry === 'function') {
                        await ST_WorldInfo.deleteWorldInfoEntry(data, foundEntryKey, { silent: true });
                    } else {
                        delete data.entries[foundEntryKey];
                    }
                    resultMsg = `Đã xoá thành công Entry UID: ${options.uid} khỏi Lorebook "${options.book_name}".`;
                } else {
                    // edit
                    if (options.keys !== undefined) {
                        foundEntry.key = options.keys;
                        foundEntry.keys = options.keys;
                    }
                    if (options.content !== undefined) foundEntry.content = options.content;
                    if (options.constant !== undefined) foundEntry.constant = options.constant;
                    if (options.disable !== undefined) foundEntry.disable = options.disable;
                    if (options.comment !== undefined) {
                        foundEntry.comment = options.comment;
                        foundEntry.name = options.comment;
                    }
                    resultMsg = `Đã cập nhật thành công Entry UID: ${options.uid} trong Lorebook "${options.book_name}".`;
                }
            } else {
                return `[KaizAgent] Lỗi: Action "${options.action}" không hợp lệ.`;
            }

            // Save — saveWorldInfo đã tự emit WORLDINFO_UPDATED bên trong, không cần emit lại
            await ST_WorldInfo.saveWorldInfo(options.book_name, data, true);

            // === SYNC UI ===
            // Hai path loại trừ nhau để tránh trigger #world_editor_select 2 lần
            // (double trigger → editor render 2 lần → hiện 2 entry giống nhau)
            if (isNewBook && typeof ST_WorldInfo.updateWorldInfoList === 'function') {
                // Path A: WB mới tạo ngầm → refresh list trước rồi mới chọn editor
                // KHÔNG gọi reloadEditor sau đây vì nó sẽ trigger change lần 2
                await ST_WorldInfo.updateWorldInfoList();
                const newIdx = (ST_WorldInfo.world_names || []).indexOf(options.book_name);
                if (newIdx !== -1) {
                    (window as any).$?.('#world_editor_select')?.val(newIdx)?.trigger('change');
                }
                // Nếu không tìm thấy index dù vừa updateList → fallback reloadEditor
                else if (typeof ST_WorldInfo.reloadEditor === 'function') {
                    ST_WorldInfo.reloadEditor(options.book_name);
                }
            } else if (typeof ST_WorldInfo.reloadEditor === 'function') {
                // Path B: WB đã tồn tại → chỉ reload editor nếu đang mở, không gọi updateWorldInfoList
                ST_WorldInfo.reloadEditor(options.book_name);
            }

            return resultMsg;
        } catch (e: any) {
            console.error('[KaizAgent] Lỗi khi manageLorebookEntry:', e);
            return `Lỗi khi thực thi Lorebook Write Tool: ${e.message}`;
        }
    }

    /**
     * Quản lý (Liệt kê, bật/tắt, tạo mới) cuốn Lorebook (Worldbook) ở mức toàn cục
     */
    public async manageWorldbook(options: {
        action: 'list_all' | 'toggle' | 'create';
        book_name?: string;
        state?: 'enable' | 'disable';
    }) {
        try {
            const ST_WorldInfo = await new Function('return import("/scripts/world-info.js")')().catch(() => null);
            if (!ST_WorldInfo) {
                return '[LỖI] Không thể load module world-info.js của SillyTavern.';
            }

            const ST_Settings = await new Function('return import("/scripts/settings.js")')().catch(() => null);
            const saveSettingsDebounced = ST_Settings?.saveSettingsDebounced || (window as any).saveSettingsDebounced;

            const allBooks = ST_WorldInfo.world_names || (window as any).world_names || [];
            const activeBooks = ST_WorldInfo.selected_world_info || (window as any).selected_world_info || [];

            if (options.action === 'list_all') {
                // M5: Trả về JSON thay vì plain text để LLM dễ parse tên sách và trạng thái
                const books = allBooks.map((name: string) => ({
                    name,
                    active_globally: activeBooks.includes(name),
                }));
                return JSON.stringify({ total: books.length, worldbooks: books }, null, 2);
            }

            if (options.action === 'toggle') {
                if (!options.book_name) return '[LỖI] Thiếu tham số book_name.';
                if (!allBooks.includes(options.book_name))
                    return `[LỖI] Worldbook "${options.book_name}" không tồn tại.`;

                const state = options.state;
                const index = activeBooks.indexOf(options.book_name);
                const bookIndex = allBooks.indexOf(options.book_name);

                let changed = false;
                if (state === 'enable') {
                    if (index === -1) {
                        activeBooks.push(options.book_name);
                        changed = true;
                    }
                } else if (state === 'disable') {
                    if (index !== -1) {
                        activeBooks.splice(index, 1);
                        changed = true;
                    }
                } else {
                    return "[LỖI] Tham số 'state' phải là 'enable' hoặc 'disable'.";
                }

                if (changed) {
                    // Sync UI: trigger change trên select element theo tên WB (không dùng index dễ sai)
                    const $ = (window as any).$;
                    if ($) {
                        const wiSelect = $('#world_info');
                        if (wiSelect.length) {
                            // Tìm option theo text/value khớp tên WB thay vì index
                            const option = wiSelect.find('option').filter(function (this: HTMLOptionElement) {
                                return (
                                    $(this).text().trim() === options.book_name || $(this).val() === String(bookIndex)
                                );
                            });
                            if (option.length) {
                                option.prop('selected', state === 'enable');
                                wiSelect.trigger('change');
                            }
                        }
                    }
                    if (saveSettingsDebounced) saveSettingsDebounced();

                    // Emit đúng event để "Active World(s)" panel và các extension refresh
                    try {
                        const ctx = SillyTavern.getContext();
                        if (ctx.eventSource && ctx.eventTypes) {
                            ctx.eventSource.emit(ctx.eventTypes.WORLDINFO_SETTINGS_UPDATED);
                        }
                    } catch (_) {}
                }

                if (state === 'enable') {
                    return index === -1
                        ? `Đã BẬT kích hoạt toàn cục cho Worldbook "${options.book_name}".`
                        : `Worldbook "${options.book_name}" đã được bật từ trước.`;
                } else {
                    return index !== -1
                        ? `Đã TẮT kích hoạt toàn cục cho Worldbook "${options.book_name}".`
                        : `Worldbook "${options.book_name}" đã tắt từ trước.`;
                }
            }

            if (options.action === 'create') {
                if (!options.book_name) return '[LỖI] Thiếu tham số book_name.';
                if (allBooks.includes(options.book_name)) return `[LỖI] Worldbook "${options.book_name}" đã tồn tại.`;

                if (typeof ST_WorldInfo.createNewWorldInfo === 'function') {
                    await ST_WorldInfo.createNewWorldInfo(options.book_name, { interactive: false });

                    // === SYNC UI: Cập nhật danh sách WB trong dropdown và editor ===
                    // updateWorldInfoList() fetch lại danh sách từ server và re-render
                    if (typeof ST_WorldInfo.updateWorldInfoList === 'function') {
                        await ST_WorldInfo.updateWorldInfoList();
                    }
                    // Tự động chọn WB vừa tạo trong editor nếu có thể
                    const newIdx = (ST_WorldInfo.world_names || []).indexOf(options.book_name);
                    if (newIdx !== -1) {
                        const $ = (window as any).$;
                        if ($) {
                            $('#world_editor_select').val(newIdx).trigger('change');
                        }
                    }

                    return `Đã tạo mới Worldbook "${options.book_name}".\nLưu ý: Bạn có thể cần gọi hàm toggle để bật (enable) worldbook này nếu muốn nó tự động nạp.`;
                } else {
                    return '[LỖI] Phiên bản SillyTavern này không hỗ trợ hàm createNewWorldInfo, hoặc API đã thay đổi.';
                }
            }

            return `[LỖI] Action "${options.action}" không hợp lệ.`;
        } catch (e: any) {
            console.error('[KaizAgent] Lỗi khi manageWorldbook:', e);
            return `[LỖI] Khi thực thi manageWorldbook: ${e.message}`;
        }
    }

    /**
     * Escape chuỗi cho Regex
     */
    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& nghĩa là toàn bộ chuỗi match
    }

    /**
     * Build regex cho find and replace / highlight
     */
    private buildRegex(query: string, isRegex: boolean, caseInsensitive: boolean, wholeWord: boolean): RegExp {
        let pattern = isRegex ? query : this.escapeRegExp(query);
        if (wholeWord) {
            pattern = `\\b(?:${pattern})\\b`;
        }
        const flags = caseInsensitive ? 'gi' : 'g';
        return new RegExp(pattern, flags);
    }

    /**
     * Tìm và thay thế nội dung trực tiếp trong chat
     */
    public async findAndReplace(
        query: string,
        replacement: string,
        isRegex: boolean = false,
        caseInsensitive: boolean = false,
        wholeWord: boolean = false,
        dryRun: boolean = false,
    ): Promise<{ count: number; messages: { id: number; snippets: { oldSnippet: string; newSnippet: string }[] }[] }> {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat || !Array.isArray(ctx.chat)) return { count: 0, messages: [] };

        let count = 0;
        let regex: RegExp;
        try {
            regex = this.buildRegex(query, isRegex, caseInsensitive, wholeWord);
        } catch (e) {
            console.error('[KaizAgent] Invalid regex:', e);
            throw new Error(`Regex không hợp lệ: ${e}`);
        }

        // Cần đảm bảo regex có cờ 'g' để dùng vòng lặp exec
        if (!regex.global) {
            regex = new RegExp(regex.source, regex.flags + 'g');
        }

        const $ = (window as any).$;
        let needReload = false;
        const modifiedMessages: { id: number; snippets: { oldSnippet: string; newSnippet: string }[] }[] = [];

        for (let i = 0; i < ctx.chat.length; i++) {
            const m = ctx.chat[i];
            if (!m.mes) continue;

            regex.lastIndex = 0;
            let match;
            let resultText = '';
            let lastIndex = 0;
            let messageChanged = false;
            const snippets: { oldSnippet: string; newSnippet: string }[] = [];

            while ((match = regex.exec(m.mes)) !== null) {
                const matchStart = match.index;
                const matchText = match[0];

                // SAFEGUARD DISABLED: Tạm tắt để cho phép người dùng sửa cả nội dung HTML nếu cần.
                // Nếu cần bật lại, uncomment đoạn dưới đây.
                // const lastHtmlOpen = m.mes.lastIndexOf('<', matchStart);
                // const lastHtmlClose = m.mes.lastIndexOf('>', matchStart);
                // const isInsideHtml = lastHtmlOpen > lastHtmlClose;
                //
                // const lastMacroOpen = m.mes.lastIndexOf('{{', matchStart);
                // const lastMacroClose = m.mes.lastIndexOf('}}', matchStart);
                // const isInsideMacro = lastMacroOpen > lastMacroClose;
                //
                // if (isInsideHtml || isInsideMacro) {
                //     resultText += m.mes.substring(lastIndex, regex.lastIndex);
                //     lastIndex = regex.lastIndex;
                //     continue;
                // }

                // Thay thế
                const prefix = m.mes.substring(lastIndex, matchStart);
                resultText += prefix + replacement;

                // 2. SNIPPET EXTRACTION: Lấy 30 ký tự trước và sau để preview
                if (snippets.length < 3) {
                    // Giới hạn max 3 snippet mỗi tin nhắn để tránh rác
                    const snipStart = Math.max(0, matchStart - 35);
                    const snipEnd = Math.min(m.mes.length, matchStart + matchText.length + 35);
                    const contextOld = m.mes.substring(snipStart, snipEnd);
                    const contextNew = contextOld.replace(matchText, replacement); // Replace only the first occurrence in the snippet

                    snippets.push({
                        oldSnippet: (snipStart > 0 ? '...' : '') + contextOld + (snipEnd < m.mes.length ? '...' : ''),
                        newSnippet: (snipStart > 0 ? '...' : '') + contextNew + (snipEnd < m.mes.length ? '...' : ''),
                    });
                }

                messageChanged = true;
                lastIndex = regex.lastIndex;
            }

            if (messageChanged) {
                resultText += m.mes.substring(lastIndex);
                modifiedMessages.push({ id: i, snippets });
                count++;

                if (!dryRun) {
                    m.mes = resultText;
                    // Update DOM immediately
                    if ($) {
                        const mesBlock = $(`.mes[mesid="${i}"] .mes_text`);
                        if (mesBlock.length) {
                            const w = window as any;
                            if (
                                typeof w.MessageFormatting === 'object' &&
                                typeof w.MessageFormatting.formatMessage === 'function'
                            ) {
                                const formatted = w.MessageFormatting.formatMessage(m);
                                mesBlock.html(formatted);
                            } else {
                                needReload = true;
                            }
                        } else {
                            needReload = true;
                        }
                    } else {
                        needReload = true;
                    }
                }
            }
        }

        // Cố gắng save chat nếu có thay đổi và không phải dry-run
        if (!dryRun && count > 0) {
            if (typeof ctx.saveChat === 'function') {
                await ctx.saveChat();
            }

            if (needReload) {
                const w = window as any;
                if (typeof w.reloadCurrentChat === 'function') {
                    w.reloadCurrentChat();
                } else if (typeof ctx.reloadCurrentChat === 'function') {
                    ctx.reloadCurrentChat();
                }
            }
        }

        return { count, messages: modifiedMessages };
    }

    /**
     * Xóa toàn bộ highlight trên UI
     */
    public clearHighlight(): void {
        const $ = (window as any).$;
        if (!$) return;
        $('.kaiz-highlight-block')
            .removeClass('kaiz-highlight-block')
            .css('box-shadow', '')
            .css('border', '')
            .css('background-color', '');
    }

    /**
     * Tìm và bôi sáng (highlight block) trên UI
     */
    public findAndHighlight(
        query: string,
        isRegex: boolean = false,
        caseInsensitive: boolean = false,
        wholeWord: boolean = false,
    ): { count: number; messageIds: number[] } {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat || !Array.isArray(ctx.chat)) return { count: 0, messageIds: [] };

        let count = 0;
        let regex: RegExp;
        try {
            regex = this.buildRegex(query, isRegex, caseInsensitive, wholeWord);
        } catch (e) {
            throw new Error(`Regex không hợp lệ: ${e}`);
        }

        const $ = (window as any).$;
        if (!$) return { count: 0, messageIds: [] };

        // Xóa các highlight cũ
        this.clearHighlight();

        const messageIds: number[] = [];

        for (let i = 0; i < ctx.chat.length; i++) {
            const m = ctx.chat[i];
            regex.lastIndex = 0; // reset
            if (m.mes && regex.test(m.mes)) {
                count++;
                messageIds.push(i);
                const mesBlock = $(`.mes[mesid="${i}"]`);
                if (mesBlock.length) {
                    mesBlock.addClass('kaiz-highlight-block');
                    mesBlock.css({
                        'box-shadow': '0 0 25px 8px rgba(255, 215, 0, 0.8)',
                        border: '3px solid rgba(255, 215, 0, 1)',
                        'background-color': 'rgba(255, 215, 0, 0.15)',
                        transition: 'all 0.5s ease',
                    });
                }
            }
        }

        // Tự động cuộn đến tin nhắn đầu tiên tìm thấy
        if (count > 0) {
            const firstMatch = $('.kaiz-highlight-block').first();
            if (firstMatch.length) {
                firstMatch[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        return { count, messageIds };
    }
}
