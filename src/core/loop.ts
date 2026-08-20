import { SillyTavernAdapter, Message } from '../adapters/st_adapter';
import { ToolRegistry } from './tool_registry';
import { StateManager } from './state';
import {
    DEFAULT_CORE_IDENTITY,
    DEFAULT_CORE_BEHAVIOR,
    DEFAULT_CORE_PREFILL,
    DEFAULT_CORE_COT_PROMPT,
} from './defaults';

declare const SillyTavern: any;

export interface AgentEvent {
    type:
        | 'think_start'
        | 'think_end'
        | 'step_start'
        | 'step_end'
        | 'stream_chunk'
        | 'tool_call'
        | 'tool_result'
        | 'tool_confirm'
        | 'retry'
        | 'error'
        | 'debug';
    data?: any;
    text?: string;
    reasoning?: string | null;
    isFinal?: boolean;
}

const FORCE_ABORT_MSG =
    '⚠️ Agent đã bị CƯỠNG CHẾ DỪNG KHẨN CẤP (Force Abort) bởi người dùng. Bạn có thể đã bị kẹt ở một bước hoặc lặp lại một hành động quá lâu. Vui lòng dừng lại, xem xét lại bối cảnh và đợi lệnh mới.';
const SOFT_ABORT_MSG =
    'Agent đã bị người dùng dừng lại (Soft Abort). Người dùng muốn dừng tiến trình hiện tại. Hãy chờ chỉ thị tiếp theo.';

export class AgentLoop {
    private _aborted = false;
    private _forceAborted = false;
    private _isRunning = false;
    private _forceAbortReject: ((reason: any) => void) | null = null;
    private _safeModeReject: ((reason: any) => void) | null = null;
    private _currentAbortController: AbortController | null = null;

    constructor(
        private adapter: SillyTavernAdapter,
        private toolRegistry: ToolRegistry,
        private stateManager: StateManager,
    ) {}

    /**
     * Hủy bỏ chuỗi agent hiện tại. Vòng lặp sẽ dừng sau khi hoàn thành bước hiện tại.
     */
    public abort(): void {
        this._aborted = true;
    }

    /**
     * Cưỡng chế dừng ngay lập tức, kể cả khi đang chờ API trả về.
     */
    public forceAbort(): void {
        this._aborted = true;
        this._forceAborted = true;
        if (this._forceAbortReject) {
            this._forceAbortReject(new Error('FORCE_ABORT'));
            this._forceAbortReject = null;
        }
        if (this._safeModeReject) {
            this._safeModeReject(new Error('FORCE_ABORT'));
            this._safeModeReject = null;
        }
        if (this._currentAbortController) {
            this._currentAbortController.abort('FORCE_ABORT');
        }
    }

    public get isRunning(): boolean {
        return this._isRunning;
    }

    public async getBaseTokens(maxSteps: number): Promise<number> {
        const ctx = (window as any).SillyTavern.getContext();
        const settings = ctx.extensionSettings?.kaiz_agent || {};
        const layer1_identity = settings.coreIdentity || DEFAULT_CORE_IDENTITY;
        const cachedSystemPrompt = this.generateSystemPrompt(maxSteps);

        let fullText = layer1_identity + '\n' + cachedSystemPrompt;

        if (this.stateManager.currentWorkspace && this.stateManager.currentWorkspace.systemPrompt) {
            fullText += `\n[WORKSPACE CUSTOM PROMPT]\n${this.stateManager.currentWorkspace.systemPrompt}`;
        }

        if (settings) {
            const persona = settings.persona;
            const memories = settings.memories;

            if (persona) {
                fullText += `\n[CUSTOM PERSONA / SYSTEM PROMPT OVERRIDE]\n${persona}\n\n`;
            }

            if (memories && memories.length > 0) {
                fullText += `\n[AGENT MEMORY]\nBạn có một bộ nhớ dài hạn chứa các ghi chú và luật lệ của người dùng:\n<agent_memory>\n`;
                memories.forEach((mem: any, idx: number) => {
                    if (typeof mem === 'string') {
                        fullText += `${idx + 1}. [Untracked] ${mem}\n`;
                    } else if (mem && mem.key && mem.content) {
                        fullText += `${idx + 1}. [${mem.key}] ${mem.content}\n`;
                    }
                });
                fullText += `</agent_memory>\nHãy ưu tiên tuân thủ các ghi nhớ này khi xử lý tác vụ.\n`;
            }
        }

        if (typeof (window as any).getTokenCountAsync === 'function') {
            return await (window as any).getTokenCountAsync(fullText);
        } else if (typeof (window as any).getTokenCount === 'function') {
            return (window as any).getTokenCount(fullText);
        }
        return Math.ceil(fullText.split(/\s+/).length * 1.3);
    }

    private generateSystemPrompt(maxSteps: number): string {
        const ctx = (window as any).SillyTavern.getContext();
        const settings = ctx.extensionSettings?.kaiz_agent || {};
        const disabledTools = settings.disabledTools || {};
        let schemas = this.toolRegistry.getAllSchemas();

        if (this.stateManager.currentWorkspace) {
            const wsConfig = this.stateManager.currentWorkspace.toolsConfig || {};
            schemas = schemas.filter((s) => wsConfig[s.name] === true);
        } else {
            schemas = schemas.filter((s) => !disabledTools[s.name]);
        }

        let prompt = `(LƯU Ý QUAN TRỌNG: SỐ MAX AGENT FLOW / AGENT LOOP HIỆN TẠI LÀ: ${maxSteps}. Hãy phân bổ kế hoạch thực thi công việc sao cho hợp lý trong giới hạn số vòng lặp này.)

${ctx.extensionSettings?.kaiz_agent?.coreBehavior || DEFAULT_CORE_BEHAVIOR}

CÁC CÔNG CỤ HIỆN CÓ:
`;
        schemas.forEach((s) => {
            prompt += `<tool>
<name>${s.name}</name>
<description>${s.description}</description>
<parameters>${JSON.stringify(s.parameters)}</parameters>
</tool>
`;
        });

        prompt += `\n${settings.coreCotPrompt || DEFAULT_CORE_COT_PROMPT}`;

        return prompt;
    }

    private parseToolCalls(text: string): { name: string; args: any; fullMatch: string; parseError?: string }[] {
        const regex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
        const tools: { name: string; args: any; fullMatch: string; parseError?: string }[] = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            let argsStr = match[2].trim();
            argsStr = argsStr
                .replace(/^```(?:json)?\s*/im, '')
                .replace(/\s*```$/im, '')
                .trim();
            try {
                const args = JSON.parse(argsStr);
                tools.push({ name, args, fullMatch: match[0] });
            } catch (e) {
                console.error(`[AgentLoop] Failed to parse JSON for tool ${name}:`, argsStr);
                // Đẩy lỗi parse vào danh sách thay vì bỏ qua âm thầm
                tools.push({
                    name,
                    args: {},
                    fullMatch: match[0],
                    parseError: `JSON không hợp lệ cho tool "${name}". Nội dung nhận được: ${argsStr.substring(0, 200)}. Hãy kiểm tra lại cú pháp JSON và gọi lại tool.`,
                });
            }
        }
        return tools;
    }

    public stripCotAndPrefill(text: string): string {
        if (!text) return '';
        return String(text)
            .replace(/^(?:[\s\S]*?<agent_cot>)?[\s\S]*?<\/agent_cot>\s*/gi, '')
            .replace(/<agent_cot>[\s\S]*?(?:<\/agent_cot>|$)/gi, '')
            .trim();
    }

    public async applyTokenSafeLimit(internalHistory: any[]): Promise<any[]> {
        const ctx = (window as any).SillyTavern.getContext();
        const settings = ctx.extensionSettings?.kaiz_agent || {};

        const limit = settings.tokenSafeLimit || 0;
        if (limit <= 0) return internalHistory;

        const trimAgent = !!settings.trimAgent;
        const trimUser = !!settings.trimUser;
        const trimTool = !!settings.trimTool;

        if (!trimAgent && !trimUser && !trimTool) return internalHistory;

        const maxLoops = settings.maxAgentLoops || 5;
        const baseTokens = await this.getBaseTokens(maxLoops);

        const currentHistory = [...internalHistory];

        let fullText = '';
        for (const m of currentHistory) {
            let content = m.content || '';
            if (m.role === 'agent' || m.role === 'assistant') {
                content = this.stripCotAndPrefill(content) || '[Đã xử lý suy luận CoT]';
            }
            fullText += content + ' ';
        }

        const getTokenCount = async (text: string): Promise<number> => {
            if (typeof (window as any).getTokenCountAsync === 'function') {
                return await (window as any).getTokenCountAsync(text);
            } else if (typeof (window as any).getTokenCount === 'function') {
                return (window as any).getTokenCount(text);
            }
            return Math.ceil(text.split(/\s+/).length * 1.3);
        };

        const totalTokens = await getTokenCount(fullText);
        let excessTokens = baseTokens + totalTokens - limit;

        if (excessTokens <= 0) return currentHistory;

        // [TỐI ƯU HÓA]: Tính toán số lượng token của tất cả tin nhắn bằng Promise.all thay vì đợi tuần tự trong vòng lặp
        const msgTokensCache = await Promise.all(
            currentHistory.map((m) => {
                let contentStr = m.content || '';
                if (m.role === 'agent' || m.role === 'assistant') {
                    contentStr = this.stripCotAndPrefill(contentStr) || '[Đã xử lý suy luận CoT]';
                }
                return getTokenCount(contentStr);
            })
        );

        for (let i = 0; i < currentHistory.length; i++) {
            if (excessTokens <= 0) break;

            const m = currentHistory[i];
            let isToolResult = false;
            let isUserMsg = false;
            let isAgentMsg = false;

            if (m.role === 'user') {
                if (typeof m.content === 'string' && m.content.startsWith('[Tool Result -')) {
                    isToolResult = true;
                } else {
                    isUserMsg = true;
                }
            } else if (m.role === 'agent' || m.role === 'assistant') {
                isAgentMsg = true;
            }

            if ((isAgentMsg && trimAgent) || (isUserMsg && trimUser) || (isToolResult && trimTool)) {
                const msgTokens = msgTokensCache[i];

                if (typeof m.content === 'string' && m.content.includes('đã bị lược bỏ do giới hạn Context Limit')) {
                    // Already a placeholder, completely remove it
                    currentHistory.splice(i, 1);
                    msgTokensCache.splice(i, 1); // keep cache aligned
                    excessTokens -= msgTokens;
                    i--; // adjust index since we removed an element
                } else {
                    // Replace with a placeholder
                    let replacement = '';
                    if (isToolResult) {
                        replacement =
                            '[Tool Result - Đã bị lược bỏ do giới hạn Context Limit. Nếu cần thiết, bạn có thể gọi lại Tool để lấy thông tin.]';
                    } else if (isAgentMsg) {
                        replacement = '[Tin nhắn của Agent đã bị lược bỏ do giới hạn Context Limit]';
                    } else if (isUserMsg) {
                        replacement = '[Tin nhắn của User đã bị lược bỏ do giới hạn Context Limit]';
                    }

                    // Dùng lại hàm đếm token chính xác của ST cho placeholder để đảm bảo độ chuẩn xác 100%. 
                    // ST có cache nội bộ cho chuỗi trùng lặp nên bước này rất nhanh, không bị overhead.
                    const replacementTokens = await getTokenCount(replacement);
                    const saving = msgTokens - replacementTokens;

                    // Only replace if it actually saves tokens
                    if (saving > 0) {
                        currentHistory[i] = {
                            ...m,
                            content: replacement,
                        };
                        excessTokens -= saving;
                    }
                }
            }
        }

        return currentHistory;
    }

    private buildMessages(
        internalHistory: any[],
        maxSteps: number,
        step: number,
        hasError: boolean,
        cachedSystemPrompt: string,
        continueMode: boolean = false,
    ): Message[] {
        const ctx = (window as any).SillyTavern.getContext();
        const settings = ctx.extensionSettings?.kaiz_agent || {};

        const layer1_identity = settings.coreIdentity || DEFAULT_CORE_IDENTITY;

        const msgs: Message[] = [
            { role: 'system', content: layer1_identity },
            { role: 'system', content: cachedSystemPrompt },
        ];

        if (this.stateManager.currentWorkspace && this.stateManager.currentWorkspace.systemPrompt) {
            msgs.push({
                role: 'system',
                content: `[WORKSPACE CUSTOM PROMPT]\n${this.stateManager.currentWorkspace.systemPrompt}`,
            });
        }

        if (settings) {
            const persona = settings.persona;
            const memories = settings.memories;

            let customContent = '';
            if (persona) {
                customContent += `[CUSTOM PERSONA / SYSTEM PROMPT OVERRIDE]\n${persona}\n\n`;
            }

            if (memories && memories.length > 0) {
                customContent += `[AGENT MEMORY]\nBạn có một bộ nhớ dài hạn chứa các ghi chú và luật lệ của người dùng:\n<agent_memory>\n`;
                memories.forEach((mem: any, idx: number) => {
                    if (typeof mem === 'string') {
                        customContent += `${idx + 1}. [Untracked] ${mem}\n`;
                    } else if (mem && mem.key && mem.content) {
                        customContent += `${idx + 1}. [${mem.key}] ${mem.content}\n`;
                    }
                });
                customContent += `</agent_memory>\nHãy ưu tiên tuân thủ các ghi nhớ này khi xử lý tác vụ.\n`;
            }

            if (customContent) {
                msgs.push({ role: 'system', content: customContent.trim() });
            }
        }

        if (step > 1) {
            const feedbackBase = hasError
                ? `⚠️ LƯU Ý TỰ ĐỘNG GỠ LỖI (Vòng lặp ${step}/${maxSteps}): Có ít nhất 1 tool vừa gọi bị lỗi hệ thống. HÃY TỰ ĐỘNG đọc kỹ thông báo lỗi phía trên, suy luận trong <agent_cot> và GỌI LẠI TOOL sửa lỗi ngay trong lượt này, KHÔNG ĐƯỢC dừng lại hay bỏ cuộc!`
                : `👉 HỆ THỐNG AGENTIC LOOP ĐANG HOẠT ĐỘNG (Vòng lặp ${step}/${maxSteps}): Vòng lặp tiếp theo đã kích hoạt!\n- Hãy kiểm tra kết quả tool trả về ở dưới (có thể là dữ liệu thực, hoặc thông báo không tìm thấy).\n- Nếu nhiệm vụ chưa xong: HÃY TIẾP TỤC gọi tool xử lý bước tiếp theo!\n- Nếu nhiệm vụ đã hoàn thành 100%: HÃY DỪNG LẠI (không gọi tool nữa) để trả lời user.`;

            msgs.push({ role: 'system', content: feedbackBase });
        }

        for (let i = 0; i < internalHistory.length; i++) {
            const msg = internalHistory[i];
            let content = msg.content;
            if (msg.role === 'assistant' || msg.role === 'agent') {
                content = this.stripCotAndPrefill(content) || '[Đã xử lý suy luận CoT]';
            }

            const apiRole = msg.role === 'agent' ? 'assistant' : msg.role;

            if (msg.attachments && msg.attachments.length > 0) {
                const multiContent: any[] = [{ type: 'text', text: content }];
                for (const att of msg.attachments) {
                    if (att.type === 'text') {
                        multiContent.push({
                            type: 'text',
                            text: `\n\n[Attached File: ${att.name}]\n${att.data}`,
                        });
                    } else if (att.type === 'image') {
                        multiContent.push({
                            type: 'image_url',
                            image_url: { url: att.data },
                        });
                    }
                }
                msgs.push({ role: apiRole as 'user' | 'assistant' | 'system', content: multiContent });
            } else {
                msgs.push({ role: apiRole as 'user' | 'assistant' | 'system', content: content });
            }
        }

        if (!(continueMode && step === 1)) {
            const prefill = settings.corePrefill || DEFAULT_CORE_PREFILL;
            msgs.push({ role: 'assistant', content: prefill });
        } else {
            let isCutOffInsideCot = false;
            if (internalHistory.length > 0) {
                const lastMsg = internalHistory[internalHistory.length - 1];
                if ((lastMsg.role === 'agent' || lastMsg.role === 'assistant') && lastMsg.content) {
                    const openIndex = lastMsg.content.lastIndexOf('<agent_cot>');
                    const closeIndex = lastMsg.content.lastIndexOf('</agent_cot>');
                    if (openIndex > closeIndex) {
                        isCutOffInsideCot = true;
                    } else if (openIndex === -1 && closeIndex === -1) {
                        // Prefill starts with <agent_cot>, so if no close tag exists, we are still inside it
                        isCutOffInsideCot = true;
                    }
                }
            }

            if (isCutOffInsideCot) {
                msgs.push({
                    role: 'user',
                    content:
                        "SYSTEM DIRECTIVE: The assistant's last message was cut off in the middle of <agent_cot>. Please continue exactly from where it left off. You MUST output </agent_cot> when you finish your thought to close the tag, then output your answer. DO NOT repeat what was already written.",
                });
            } else {
                msgs.push({
                    role: 'user',
                    content:
                        "SYSTEM DIRECTIVE: The assistant's last message was cut off due to length limits. Please continue the last message exactly from where it left off. DO NOT repeat what was already written. DO NOT use <agent_cot> tags. Start immediately with the next word.",
                });
            }
        }

        return msgs;
    }

    public async run(
        history: any[],
        maxSteps: number,
        onEvent: (event: AgentEvent) => void | Promise<void>,
        continueMode: boolean = false,
    ) {
        console.log(`[AgentLoop] Starting run with history length: ${history.length}`);

        const cachedSystemPrompt = this.generateSystemPrompt(maxSteps);

        const internalHistory = history.map((msg) => ({ ...msg }));

        for (let i = internalHistory.length - 1; i >= 0; i--) {
            if (internalHistory[i].role === 'user') {
                const header = '📌 [YÊU CẦU CHÍNH CHỦ CỦA USER]:\n"';
                const footer =
                    '"\n\n-> NẾU ĐÃ HOÀN THÀNH TRIỆT ĐỂ YÊU CẦU NÀY, hãy DỪNG GỌI TOOL và trả lời kết quả cuối cùng!';

                if (typeof internalHistory[i].content === 'string') {
                    internalHistory[i].content = header + internalHistory[i].content + footer;
                } else if (Array.isArray(internalHistory[i].content)) {
                    internalHistory[i].content = [...internalHistory[i].content];
                    const textIndex = internalHistory[i].content.findIndex((c: any) => c.type === 'text');
                    if (textIndex !== -1) {
                        internalHistory[i].content[textIndex] = {
                            ...internalHistory[i].content[textIndex],
                            text: header + internalHistory[i].content[textIndex].text + footer,
                        };
                    } else {
                        internalHistory[i].content.unshift({ type: 'text', text: header + footer });
                    }
                }
                break;
            }
        }

        let step = 0;
        let lastToolError = false;
        let reachedFinal = false;
        this._aborted = false;
        this._forceAborted = false;
        this._isRunning = true;

        try {
            while (step < maxSteps) {
                // Kiểm tra cờ abort đầu mỗi vòng lặp
                if (this._aborted) {
                    if (this._forceAborted) {
                        await onEvent({ type: 'error', text: FORCE_ABORT_MSG });
                        break;
                    }
                    await onEvent({ type: 'error', text: SOFT_ABORT_MSG });
                    break;
                }
                step++;
                await onEvent({ type: 'step_start', data: { isContinue: continueMode && step === 1 } });

                try {
                    const truncatedHistory = await this.applyTokenSafeLimit(internalHistory);

                    const messages = this.buildMessages(
                        truncatedHistory,
                        maxSteps,
                        step,
                        lastToolError,
                        cachedSystemPrompt,
                        continueMode,
                    );

                    let currentText = '';

                    const extSettings = SillyTavern?.getContext?.()?.extensionSettings?.['kaiz_agent'] || {};
                    const maxRetries = extSettings.maxRetries ?? 3;
                    const retryDelay = extSettings.retryDelay || 3000;
                    const rawKeywords = extSettings.retryKeywords || '';
                    const retryKeywords = rawKeywords
                        .split(',')
                        .map((k: string) => k.trim().toLowerCase())
                        .filter((k: string) => k);

                    let retryCount = 0;
                    let response: any = null;

                    while (retryCount <= maxRetries) {
                        try {
                            this._currentAbortController = new AbortController();
                            response = await Promise.race([
                                this.adapter.generateCompletion(
                                    messages,
                                    1500,
                                    true,
                                    async (text, reasoning) => {
                                        if (this._forceAborted) return;
                                        currentText = text;

                                        let combinedText = currentText;
                                        if (continueMode && step === 1) {
                                            const lastMsg = internalHistory[internalHistory.length - 1];
                                            if (lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'agent')) {
                                                combinedText = lastMsg.content + currentText;
                                            }
                                        }
                                        await onEvent({ type: 'stream_chunk', text: combinedText, reasoning });
                                    },
                                    this._currentAbortController.signal,
                                ),
                                new Promise<never>((_, reject) => {
                                    this._forceAbortReject = reject;
                                }),
                            ]);
                            this._forceAbortReject = null;
                            this._currentAbortController = null;
                            break;
                        } catch (e: any) {
                            this._forceAbortReject = null;
                            this._currentAbortController = null;

                            const isForceAbort =
                                e.message === 'FORCE_ABORT' || e.name === 'AbortError' || this._forceAborted;
                            if (isForceAbort) {
                                throw e;
                            }

                            const msgStr = (e.message || String(e)).toLowerCase();
                            const shouldRetry =
                                retryKeywords.length > 0 && retryKeywords.some((k: string) => msgStr.includes(k));

                            if (shouldRetry && retryCount < maxRetries) {
                                retryCount++;
                                const displayMsg = `Lỗi: ${e.message || String(e)}. Thử lại sau ${retryDelay / 1000}s... (${retryCount}/${maxRetries})`;
                                await onEvent({ type: 'retry', text: displayMsg });

                                if (this._aborted) throw e; // Don't sleep if already aborted

                                try {
                                    await Promise.race([
                                        new Promise<void>((r) => {
                                            const checkInterval = setInterval(() => {
                                                if (this._aborted || this._forceAborted) {
                                                    clearInterval(checkInterval);
                                                    r();
                                                }
                                            }, 100);
                                            setTimeout(() => {
                                                clearInterval(checkInterval);
                                                r();
                                            }, retryDelay);
                                        }),
                                        new Promise<never>((_, reject) => {
                                            this._forceAbortReject = reject;
                                        }),
                                    ]);
                                } catch (sleepErr: any) {
                                    if (sleepErr.message === 'FORCE_ABORT') {
                                        throw sleepErr;
                                    }
                                    throw e;
                                } finally {
                                    this._forceAbortReject = null;
                                }

                                if (this._aborted) throw e; // Don't continue if aborted during sleep
                                continue;
                            } else {
                                throw e;
                            }
                        }
                    }

                    await onEvent({ type: 'think_end', data: response.reasoning });

                    const text = response.text;
                    let fullText = text;

                    if (continueMode && step === 1) {
                        const lastMsg = internalHistory[internalHistory.length - 1];
                        if (lastMsg && (lastMsg.role === 'assistant' || lastMsg.role === 'agent')) {
                            lastMsg.content += text;
                            fullText = lastMsg.content;
                        } else {
                            internalHistory.push({ role: 'assistant', content: text });
                        }
                    } else {
                        internalHistory.push({ role: 'assistant', content: text });
                    }

                    await onEvent({
                        type: 'debug',
                        data: { messages: JSON.parse(JSON.stringify(messages)), responseText: fullText },
                    });

                    const toolCalls = this.parseToolCalls(fullText);

                    if (toolCalls.length === 0) {
                        reachedFinal = true;
                        await onEvent({
                            type: 'step_end',
                            text: fullText,
                            isFinal: true,
                            data: { isContinue: continueMode && step === 1 },
                        });
                        break;
                    }

                    await onEvent({
                        type: 'step_end',
                        text: fullText,
                        isFinal: false,
                        data: { isContinue: continueMode && step === 1 },
                    });

                    // Cơ chế Autonomous Agency: Thực thi toàn bộ các tool được gọi trong 1 lượt (tuần tự)
                    let resultsFormatted = '';
                    let hasError = false;
                    let isTerminalFound = false;

                    for (let i = 0; i < toolCalls.length; i++) {
                        if (this._forceAborted) throw new Error('FORCE_ABORT');
                        const call = toolCalls[i];

                        // --- SAFE MODE CHECK ---
                        const ctx = (window as any).SillyTavern.getContext();
                        const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
                        const safeMode = extSettings.safeMode;
                        const safeModeBlacklist = extSettings.safeModeBlacklist || {};

                        if (safeMode && safeModeBlacklist[call.name]) {
                            let confirmResult = false;
                            try {
                                confirmResult = await Promise.race([
                                    new Promise<boolean>((resolve) => {
                                        onEvent({
                                            type: 'tool_confirm',
                                            data: { call, resolve },
                                        });
                                    }),
                                    new Promise<boolean>((_, reject) => {
                                        this._safeModeReject = reject;
                                    }),
                                ]);
                                this._safeModeReject = null;
                            } catch (e: any) {
                                this._safeModeReject = null;
                                if (e.message === 'FORCE_ABORT') throw e;
                                console.error('[KaizAgent] Lỗi khi tạo tool_confirm event:', e);
                                const msg = `[SAFE MODE] Lỗi hệ thống khi xác nhận công cụ: ${call.name}. Tiến trình bị hủy.`;
                                await onEvent({ type: 'error', text: msg });
                                break;
                            }

                            if (!confirmResult) {
                                const msg = `[SAFE MODE] Người dùng đã từ chối thực thi công cụ: ${call.name}. Tiến trình Agent đã bị tạm ngưng theo yêu cầu.`;
                                await onEvent({ type: 'error', text: msg });
                                throw new Error('SAFE_MODE_REJECTED');
                            }
                        }
                        // --- END SAFE MODE CHECK ---

                        await onEvent({ type: 'tool_call', data: call });

                        let result;
                        if (call.parseError) {
                            // JSON parse lỗi → trả lỗi cho LLM tự sửa thay vì thực thi
                            result = { content: call.parseError, isError: true };
                        } else {
                            try {
                                this._currentAbortController = new AbortController();
                                result = await Promise.race([
                                    this.toolRegistry.executeTool(call.name, call.args, {
                                        adapter: this.adapter,
                                        stateManager: this.stateManager,
                                        abortSignal: this._currentAbortController.signal,
                                    }),
                                    new Promise<any>((_, reject) => {
                                        this._forceAbortReject = reject;
                                    }),
                                ]);
                            } finally {
                                this._forceAbortReject = null;
                                this._currentAbortController = null;
                            }
                        }
                        if (this._forceAborted) throw new Error('FORCE_ABORT');
                        let isToolError = false;
                        if (result.isError) {
                            hasError = true;
                            isToolError = true;
                        }

                        const statusText = isToolError ? '❌ LỖI (ERROR)' : '✅ THÀNH CÔNG (SUCCESS)';
                        resultsFormatted += `[Tool ${i + 1}/${toolCalls.length}: ${call.name} - ${statusText}]\nRESULT:\n${result.content}\n\n`;

                        if (result.isTerminal) {
                            isTerminalFound = true;
                            break;
                        }
                    }

                    resultsFormatted = resultsFormatted.trim();

                    const dbRawResult = `[Tool Result - ${hasError ? 'CÓ LỖI/ERROR' : 'THÀNH CÔNG'}]\n${resultsFormatted}`;

                    lastToolError = hasError;

                    await onEvent({
                        type: 'tool_result',
                        data: { name: 'Multiple Tools', result: resultsFormatted },
                        text: dbRawResult,
                    });

                    internalHistory.push({ role: 'user', content: dbRawResult });

                    if (isTerminalFound) {
                        reachedFinal = true;
                        this.abort();
                        break;
                    }
                } catch (e: any) {
                    this._forceAbortReject = null;
                    this._currentAbortController = null;
                    if (e.message === 'SAFE_MODE_REJECTED') {
                        break;
                    }
                    const isForceAbort = e.message === 'FORCE_ABORT' || e.name === 'AbortError' || this._forceAborted;
                    const errorMsg = isForceAbort ? FORCE_ABORT_MSG : e.message || String(e);
                    console.error('[AgentLoop] Error during completion:', e);
                    await onEvent({ type: 'error', text: errorMsg });
                    break;
                }
            }

            if (step >= maxSteps && !reachedFinal) {
                await onEvent({ type: 'error', text: 'Max steps reached without a final answer.' });
            }
        } finally {
            this._isRunning = false;
        }
    }
}
