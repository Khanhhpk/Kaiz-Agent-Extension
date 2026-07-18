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
}
