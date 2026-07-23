import { KaizDB, ChatSession, ChatMessage } from './db';

export class StateManager {
    public db: KaizDB;
    public currentChatId: number | null = null;
    private pendingCreateChatPromise: Promise<number> | null = null;

    // Callbacks cho UI
    public onChatSwitched?: (chatId: number, messages: ChatMessage[]) => void;
    public onChatsListUpdated?: (chats: ChatSession[]) => void;
    public onChatRenamed?: (id: number, newName: string) => void;

    constructor() {
        this.db = new KaizDB();
    }

    public async init(): Promise<void> {
        await this.db.init();
        const chats = await this.db.getAllChats();

        // Mặc định luôn là New Chat khi refresh trang
        this.currentChatId = null;
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(-1, []);
    }

    public async createNewChat(firstMessage: string): Promise<number> {
        // Tên chat dựa trên tin nhắn đầu tiên (cắt ngắn 30 ký tự)
        let name = firstMessage.trim().substring(0, 30);
        if (firstMessage.length > 30) name += '...';

        const id = await this.db.createChat(name);
        this.currentChatId = id;

        // Refresh list
        const chats = await this.db.getAllChats();
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(id, []);

        return id;
    }

    public async switchChat(id: number): Promise<void> {
        this.currentChatId = id;
        const messages = await this.db.getMessages(id);

        const chats = await this.db.getAllChats();
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(id, messages);
    }

    public async addMessage(role: 'user' | 'agent' | 'system', content: string): Promise<void> {
        let chatId = this.currentChatId;

        if (!chatId) {
            if (this.pendingCreateChatPromise) {
                chatId = await this.pendingCreateChatPromise;
            } else {
                // Nếu chưa có chat nào (người dùng vừa mở app lên lúc trống), tạo chat mới với tin nhắn này làm tên
                let nameStr = role === 'user' ? content : 'New Chat';
                if (nameStr.startsWith('[Tool')) nameStr = 'New Chat';
                this.pendingCreateChatPromise = this.createNewChat(nameStr);
                try {
                    chatId = await this.pendingCreateChatPromise;
                } finally {
                    this.pendingCreateChatPromise = null;
                }
            }
        }

        await this.db.addMessage(chatId, role, content);

        // Cập nhật lại UI List vì timestamp vừa đổi (đẩy lên đầu)
        const chats = await this.db.getAllChats();
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }

    public async loadChatList(): Promise<ChatSession[]> {
        return await this.db.getAllChats();
    }

    public async updateChatName(id: number, name: string): Promise<void> {
        await this.db.updateChatName(id, name);
        if (this.onChatRenamed) this.onChatRenamed(id, name);
        const chats = await this.db.getAllChats();
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }

    public async deleteChat(id: number): Promise<void> {
        await this.db.deleteChat(id);
        const chats = await this.db.getAllChats();

        if (this.currentChatId === id) {
            if (chats.length > 0) {
                await this.switchChat(chats[0].id!);
            } else {
                this.currentChatId = null;
                if (this.onChatSwitched) this.onChatSwitched(-1, []);
            }
        }

        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }
}
