/**
 * SillyTavern Adapter
 * Lớp trung gian để bọc các API của ST, dựa trên cách làm của ST-Copilot.
 */

export class SillyTavernAdapter {
    constructor() {}

    /**
     * Gửi request lên LLM thông qua ConnectionManager của ST
     */
    public async generateCompletion(messages: any[], maxTokens: number, stream: boolean = false) {
        console.log("[STAdapter] Calling LLM generateCompletion...");
        // TODO: Map to SillyTavern.getContext().ConnectionManagerRequestService
        return { text: "Simulated response" };
    }

    /**
     * Lấy ngữ cảnh chat hiện tại
     */
    public getChatContext() {
        console.log("[STAdapter] Getting chat context...");
        // TODO: Call ST APIs to get chat
        return [];
    }
}
