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
    public async generateCompletion(messages: Message[], maxTokens: number, stream: boolean = false, onUpdate?: (text: string, reasoning: string | null) => void): Promise<{ text: string; reasoning: string | null; isMaxTokens: boolean }> {
        console.log("[KaizAgent] Calling ST generateCompletion...");
        const ctx = SillyTavern.getContext();
        const settings = ctx.extensionSettings['kaiz_agent'] || {};
        const abort = new AbortController();

        // 1. Nếu bật tính năng Custom Endpoint, ta gọi trực tiếp (bypass ST)
        if (settings.useCustomEndpoint && settings.customUrl) {
            console.log("[KaizAgent] Using Custom Endpoint:", settings.customUrl);
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
                            if (done) break;
                            
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || "";

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
                                            reasoning = (reasoning || '') + (delta.reasoning || delta.reasoning_content);
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
                console.error("[KaizAgent] Custom Endpoint error:", e);
                throw e;
            }
        }

        // 2. Nếu không bật Custom Endpoint, sử dụng ConnectionManager mặc định của SillyTavern
        const service = ctx.ConnectionManagerRequestService;
        let asyncGeneratorFn: any;

        try {
            let profileId = ctx.extensionSettings?.connectionManager?.selectedProfile || document.getElementById('connection_profiles')?.value;
            
            if (profileId && service && typeof service.sendRequest === 'function') {
                asyncGeneratorFn = await service.sendRequest(profileId, messages, maxTokens, {
                    stream: stream,
                    signal: abort.signal,
                    extractData: false,
                    includePreset: true
                });
            } else {
                const mainApi = window.main_api || ctx.main_api;
                if (mainApi === 'openai' && ctx.ChatCompletionService) {
                    const oaiSettings = window.oai_settings || ctx.oai_settings || {};
                    asyncGeneratorFn = await ctx.ChatCompletionService.processRequest({
                        messages: messages,
                        max_tokens: maxTokens,
                        stream: stream
                    }, { presetName: oaiSettings.preset_settings_openai }, false, abort.signal);
                } else if (mainApi === 'textgenerationwebui' && ctx.TextCompletionService) {
                    const textGenSettings = window.textgenerationwebui_settings || ctx.textgenerationwebui_settings || {};
                    asyncGeneratorFn = await ctx.TextCompletionService.processRequest({
                        prompt: messages,
                        max_tokens: maxTokens,
                        stream: stream
                    }, { presetName: textGenSettings.preset_settings_textgenerationwebui }, false, abort.signal);
                } else {
                    throw new Error('No active API connection found in SillyTavern. Please configure LLM settings.');
                }
            }

            let text = '';
            let reasoning = null;

            const isGen = typeof asyncGeneratorFn === 'function' ||
                (asyncGeneratorFn != null && typeof asyncGeneratorFn[Symbol.asyncIterator] === 'function') ||
                (asyncGeneratorFn != null && typeof asyncGeneratorFn.next === 'function');

            let lastValue: any = null;

            if (!isGen) {
                const value = asyncGeneratorFn;
                if (typeof value === 'string') {
                    text = value.trim();
                } else {
                    text = value?.text || value?.content || value?.message?.content || value?.choices?.[0]?.message?.content || '';
                }
                const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
                const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';
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
                
                let chunkText = value?.text || value?.content || value?.choices?.[0]?.delta?.content || '';
                if (value?.thinking) reasoning = (reasoning || '') + value.thinking;
                
                if (chunkText) text += chunkText;
                
                if (onUpdate) onUpdate(text, reasoning);
            }

            const finishReason = lastValue?.finish_reason || lastValue?.state?.finish_reason || lastValue?.stop_reason;
            const isMaxTokens = finishReason === 'length' || finishReason === 'max_tokens' || finishReason === 'stop_limit';
            
            return { text: text.trim(), reasoning, isMaxTokens };
        } catch (e) {
            console.error("[KaizAgent] generateCompletion error:", e);
            throw e;
        }
    }

    /**
     * Lấy lịch sử đoạn chat hiện tại (bỏ qua những tin nhắn ẩn)
     */
    public getChatContext(depth: number = 20) {
        const ctx = SillyTavern.getContext();
        if (!ctx.chat) return [];

        const total = ctx.chat.length;
        const startIndex = Math.max(0, total - depth);
        
        return ctx.chat.slice(startIndex)
            .filter((m: any) => !m.is_system && !m.is_hidden && !(m.extra && m.extra.is_hidden))
            .map((m: any, i: number) => ({
                role: m.is_user ? 'user' : 'assistant',
                name: m.is_user ? (ctx.name1 || 'User') : (m.name || ctx.name2 || 'Character'),
                content: typeof m.mes === 'string' ? m.mes : '',
                chatIndex: startIndex + i
            }));
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
     * Lấy thông tin Persona của người dùng
     */
    public async getUserPersona(): Promise<string> {
        const ctx = SillyTavern.getContext();
        if (typeof ctx.substituteParams === 'function') {
            // ST hỗ trợ macro {{persona}} để lấy User Persona description, và {{user}} cho tên
            const name = await Promise.resolve(ctx.substituteParams('{{user}}'));
            const personaText = await Promise.resolve(ctx.substituteParams('{{persona}}'));
            return `Name: ${name}\nPersona Description:\n${personaText}`;
        }
        return 'No persona available or unsupported ST version.';
    }

    /**
     * Lấy toàn bộ thông tin Lorebook (World Info) bao gồm Global và Character-bound
     * @param options Các tùy chọn lọc dữ liệu
     */
    public async getLorebookInfo(options: { mode: 'summary' | 'all_full' | 'char_full' | 'by_name' | 'search' | 'by_uid' | 'simulate', bookName?: string, includeDisabled?: boolean, query?: string, uid?: string | number } = { mode: 'summary' }): Promise<string> {
        let result = "";
        try {
            const ctx = SillyTavern.getContext();
            let ST_WorldInfo: any = null;
            try { ST_WorldInfo = await new Function("return import('/scripts/world-info.js')")(); } catch (e) { console.warn("[KaizAgent] Could not dynamically import world-info.js"); }
            
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

            if (options.mode === 'by_name') {
                if (!options.bookName) return "Lỗi: Chế độ 'by_name' yêu cầu cung cấp tên Lorebook (bookName).";
                if (!names.has(options.bookName)) return `Không tìm thấy Lorebook nào đang kích hoạt có tên "${options.bookName}".`;
                // Nếu tìm thấy, xoá hết các tên khác để chỉ query đúng sách này
                names.clear();
                names.add(options.bookName);
            }

            if (options.mode === 'char_full') {
                // Xoá hết global names để chỉ xử lý char lorebook
                names.clear();
            }

            if (options.mode !== 'char_full') {
                result += "=== LOREBOOKS ĐANG KÍCH HOẠT ===\n";
                if (names.size === 0) {
                    result += "Không có Global hay Chat Lorebook nào đang được kích hoạt.\n";
                }

                for (const name of names) {
                    let data = null;
                    try {
                        if (typeof ctx.loadWorldInfo === 'function') {
                            data = await ctx.loadWorldInfo(name);
                        } else {
                            const res = await fetch('/api/worldinfo/get', {
                                method: 'POST',
                                headers: { ...(typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : {}), 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name }),
                            });
                            if (res.ok) data = await res.json();
                        }
                    } catch (e) {
                        console.error(`[KaizAgent] Failed to load lorebook ${name}:`, e);
                    }

                    if (data && data.entries) {
                        const entries = Object.values(data.entries) as any[];
                        let bookResult = `\n[Lorebook: ${name}]\n`;
                        let hasEntries = false;
                        for (const entry of entries) {
                            if (!entry || (!entry.content && options.mode !== 'summary')) continue;
                            const isDisabled = entry.disable === true;
                            if (isDisabled && options.mode !== 'summary' && !options.includeDisabled) continue;

                            const keysList = entry.key || entry.keys || [];
                            const keys = Array.isArray(keysList) ? keysList.join(', ') : String(keysList);
                            const type = entry.constant ? "CONSTANT" : "NORMAL";
                            const status = isDisabled ? "TẮT" : "BẬT";
                            const entryUid = entry.uid || entry.id || 'Unknown';
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
                                        const parts = kStr.split('&&').map(p => p.trim());
                                        if (parts.every(p => q.includes(p))) { triggered = true; break; }
                                    } else {
                                        if (q.includes(kStr)) { triggered = true; break; }
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
                        } else if (options.mode === 'all_full' || options.mode === 'by_name' || options.mode === 'summary') {
                            result += bookResult + "(Lorebook này rỗng hoặc không có entry phù hợp)\n";
                        }
                    }
                }
            }

            if (options.mode !== 'by_name') {
                result += "\n=== CHARACTER LOREBOOK (Nhúng vào thẻ) ===\n";
                if (character && character.data && character.data.character_book && character.data.character_book.entries) {
                    let bookResult = `\n[Character Lorebook: ${character.name}]\n`;
                    const entries = character.data.character_book.entries;
                    let hasEntries = false;
                    for (const entry of entries) {
                        if (!entry || (!entry.content && options.mode !== 'summary')) continue;
                        const isDisabled = entry.disable === true;
                        if (isDisabled && options.mode !== 'summary' && !options.includeDisabled) continue;

                        const keysList = entry.keys || entry.key || [];
                        const keys = Array.isArray(keysList) ? keysList.join(', ') : String(keysList);
                        const type = entry.constant ? "CONSTANT" : "NORMAL";
                        const status = isDisabled ? "TẮT" : "BẬT";
                        const entryUid = entry.id || entry.uid || 'Unknown';
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
                                    const parts = kStr.split('&&').map(p => p.trim());
                                    if (parts.every(p => q.includes(p))) { triggered = true; break; }
                                } else {
                                    if (q.includes(kStr)) { triggered = true; break; }
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
                    } else if (options.mode === 'all_full' || options.mode === 'char_full' || options.mode === 'summary') {
                        result += bookResult + "(Character Lorebook rỗng hoặc không có entry phù hợp)\n";
                    }
                } else if (options.mode === 'summary' || options.mode === 'all_full' || options.mode === 'char_full') {
                    result += "Nhân vật này không có Lorebook đi kèm thẻ.\n";
                }
            }

            return result;
        } catch (e: any) {
            console.error('[KaizAgent] Lỗi khi lấy toàn bộ Lorebook:', e);
            return `Lỗi khi lấy thông tin Lorebook: ${e.message}`;
        }
    }
}
