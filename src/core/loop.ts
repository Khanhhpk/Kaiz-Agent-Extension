import { SillyTavernAdapter, Message } from "../adapters/st_adapter";
import { ToolRegistry } from "./tool_registry";

export interface AgentEvent {
    type: 'think_start' | 'think_end' | 'stream_chunk' | 'tool_call' | 'tool_result' | 'final_answer' | 'error';
    data?: any;
    text?: string;
    reasoning?: string | null;
}

export class AgentLoop {
    constructor(private adapter: SillyTavernAdapter, private toolRegistry: ToolRegistry) {}

    private generateSystemPrompt(): string {
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

    private parseToolCalls(text: string): { name: string; args: any; fullMatch: string }[] {
        const regex = /<tool_call\s+name="([^"]+)">([\s\S]*?)<\/tool_call>/g;
        const tools = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const name = match[1];
            const argsStr = match[2].trim();
            try {
                const args = JSON.parse(argsStr);
                tools.push({ name, args, fullMatch: match[0] });
            } catch (e) {
                console.error(`[AgentLoop] Failed to parse JSON for tool ${name}:`, argsStr);
            }
        }
        return tools;
    }

    public async run(userPrompt: string, onEvent: (event: AgentEvent) => void) {
        console.log(`[AgentLoop] Starting run with prompt: ${userPrompt}`);
        
        const messages: Message[] = [
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
                    if (!cleanText && response.reasoning) cleanText = text;
                    
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

            } catch (e: any) {
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
