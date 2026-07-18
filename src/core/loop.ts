/**
 * Agent Loop
 * Xử lý vòng lặp suy nghĩ và hành động của Agent, dựa trên ý tưởng từ LumiAgent.
 */

export class AgentLoop {
    constructor(private adapter: any, private toolRegistry: any) {}

    public async run(userPrompt: string) {
        console.log(`[AgentLoop] Starting run with prompt: ${userPrompt}`);
        // TODO: Implement streaming loop, call adapter to send to LLM, parse tool calls
    }
}
