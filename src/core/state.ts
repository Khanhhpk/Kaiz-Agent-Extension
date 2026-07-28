import { KaizDB, ChatSession, ChatMessage, Workspace } from './db';

export class StateManager {
    public db: KaizDB;
    public currentChatId: number | null = null;
    public currentWorkspaceId: number | null = null;
    public currentWorkspace: Workspace | null = null;
    private pendingCreateChatPromise: Promise<number> | null = null;

    public onChatSwitched?: (chatId: number, messages: ChatMessage[]) => void;
    public onChatsListUpdated?: (chats: ChatSession[]) => void;
    public onChatRenamed?: (id: number, newName: string) => void;
    public onWorkspacesListUpdated?: (workspaces: Workspace[]) => void;
    public onWorkspaceSwitched?: (workspace: Workspace | null) => void;

    constructor() {
        this.db = new KaizDB();
    }

    public async init(): Promise<void> {
        await this.db.init();
        const workspaces = await this.db.getAllWorkspaces();
        if (this.onWorkspacesListUpdated) this.onWorkspacesListUpdated(workspaces);

        this.currentWorkspaceId = null;
        this.currentWorkspace = null;
        if (this.onWorkspaceSwitched) this.onWorkspaceSwitched(null);

        const chats = await this.db.getAllChats(this.currentWorkspaceId);

        // Mặc định luôn là New Chat khi refresh trang
        this.currentChatId = null;
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(-1, []);
    }

    public async createNewChat(firstMessage: string): Promise<number> {
        // Tên chat dựa trên tin nhắn đầu tiên (cắt ngắn 30 ký tự)
        let name = firstMessage.trim().substring(0, 30);
        if (firstMessage.length > 30) name += '...';

        const id = await this.db.createChat(name, this.currentWorkspaceId);
        this.currentChatId = id;

        // Refresh list
        const chats = await this.db.getAllChats(this.currentWorkspaceId);
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(id, []);

        return id;
    }

    public async switchChat(id: number): Promise<void> {
        this.currentChatId = id;
        const messages = await this.db.getMessages(id);

        const chats = await this.db.getAllChats(this.currentWorkspaceId);
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
        if (this.onChatSwitched) this.onChatSwitched(id, messages);
    }

    public async addMessage(
        role: 'user' | 'agent' | 'system',
        content: string,
        attachments?: import('./db').ChatAttachment[],
    ): Promise<void> {
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

        await this.db.addMessage(chatId, role, content, attachments);

        // Cập nhật lại UI List vì timestamp vừa đổi (đẩy lên đầu)
        const chats = await this.db.getAllChats(this.currentWorkspaceId);
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }

    public async loadChatList(): Promise<ChatSession[]> {
        return await this.db.getAllChats(this.currentWorkspaceId);
    }

    public async updateChatName(id: number, name: string): Promise<void> {
        await this.db.updateChatName(id, name);
        if (this.onChatRenamed) this.onChatRenamed(id, name);
        const chats = await this.db.getAllChats(this.currentWorkspaceId);
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }

    public async deleteChat(id: number): Promise<void> {
        await this.db.deleteChat(id);
        const chats = await this.db.getAllChats(this.currentWorkspaceId);

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

    // --- WORKSPACE METHODS ---

    public async createWorkspace(name: string): Promise<number> {
        const id = await this.db.createWorkspace(name);
        const workspaces = await this.db.getAllWorkspaces();
        if (this.onWorkspacesListUpdated) this.onWorkspacesListUpdated(workspaces);
        await this.switchWorkspace(id);
        return id;
    }

    public async switchWorkspace(id: number | null): Promise<void> {
        this.currentWorkspaceId = id;
        
        if (id === null) {
            this.currentWorkspace = null;
        } else {
            const workspaces = await this.db.getAllWorkspaces();
            this.currentWorkspace = workspaces.find((ws) => ws.id === id) || null;
            if (!this.currentWorkspace) {
                this.currentWorkspaceId = null;
            }
        }

        if (this.onWorkspaceSwitched) this.onWorkspaceSwitched(this.currentWorkspace);

        // Chuyển sang chat trống
        this.currentChatId = null;
        if (this.onChatSwitched) this.onChatSwitched(-1, []);

        // Load danh sách chat của workspace mới
        const chats = await this.db.getAllChats(this.currentWorkspaceId);
        if (this.onChatsListUpdated) this.onChatsListUpdated(chats);
    }

    public async updateWorkspace(id: number, data: Partial<Workspace>): Promise<void> {
        await this.db.updateWorkspace(id, data);
        const workspaces = await this.db.getAllWorkspaces();
        if (this.onWorkspacesListUpdated) this.onWorkspacesListUpdated(workspaces);
        if (this.currentWorkspaceId === id) {
            this.currentWorkspace = workspaces.find((ws) => ws.id === id) || null;
            if (this.onWorkspaceSwitched) this.onWorkspaceSwitched(this.currentWorkspace);
        }
    }

    public async deleteWorkspace(id: number): Promise<void> {
        await this.db.deleteWorkspace(id);
        const workspaces = await this.db.getAllWorkspaces();
        if (this.onWorkspacesListUpdated) this.onWorkspacesListUpdated(workspaces);

        if (this.currentWorkspaceId === id) {
            await this.switchWorkspace(null);
        }
    }
}
