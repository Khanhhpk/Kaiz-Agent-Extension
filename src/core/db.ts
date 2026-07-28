export interface Workspace {
    id?: number;
    name: string;
    systemPrompt: string;
    toolsConfig: Record<string, boolean>;
    createdAt: number;
    updatedAt: number;
}

export interface ChatSession {
    id?: number;
    workspaceId?: number | null;
    name: string;
    createdAt: number;
    updatedAt: number;
}

export interface ChatAttachment {
    name: string;
    type: 'image' | 'text';
    data: string; // Base64 for images, raw string for text
}

export interface ChatMessage {
    id?: number;
    chatId: number;
    role: 'user' | 'agent' | 'system';
    content: string;
    attachments?: ChatAttachment[];
    timestamp: number;
}

export interface BackupEntry {
    id?: number;
    type: 'character' | 'chat' | 'worldbook';
    name: string;
    data: string;
    timestamp: number;
}

export class KaizDB {
    private dbName = 'KaizAgentDB';
    private dbVersion = 3;
    private db: IDBDatabase | null = null;

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('workspaces')) {
                    const wsStore = db.createObjectStore('workspaces', { keyPath: 'id', autoIncrement: true });
                    wsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                if (!db.objectStoreNames.contains('chats')) {
                    const chatStore = db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    chatStore.createIndex('workspaceId', 'workspaceId', { unique: false });
                } else if (event.oldVersion < 3) {
                    const txn = (event.target as IDBOpenDBRequest).transaction;
                    const chatStore = txn!.objectStore('chats');
                    if (!chatStore.indexNames.contains('workspaceId')) {
                        chatStore.createIndex('workspaceId', 'workspaceId', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    msgStore.createIndex('chatId', 'chatId', { unique: false });
                    msgStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                if (!db.objectStoreNames.contains('backups')) {
                    const backupStore = db.createObjectStore('backups', { keyPath: 'id', autoIncrement: true });
                    backupStore.createIndex('type', 'type', { unique: false });
                    backupStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };

            request.onsuccess = (event: Event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                resolve();
            };

            request.onerror = (event: Event) => {
                console.error('[KaizDB] Error opening DB', event);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    }

    // --- WORKSPACES ---

    public async createWorkspace(name: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['workspaces'], 'readwrite');
            const store = transaction.objectStore('workspaces');
            const now = Date.now();
            const ws: Workspace = { name, systemPrompt: '', toolsConfig: {}, createdAt: now, updatedAt: now };

            const request = store.add(ws);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async updateWorkspace(id: number, data: Partial<Workspace>): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['workspaces'], 'readwrite');
            const store = transaction.objectStore('workspaces');

            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const ws = getReq.result as Workspace;
                if (!ws) return reject(new Error('Workspace not found'));
                Object.assign(ws, data);
                ws.updatedAt = Date.now();
                const putReq = store.put(ws);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    public async getAllWorkspaces(): Promise<Workspace[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['workspaces'], 'readonly');
            const store = transaction.objectStore('workspaces');
            const index = store.index('updatedAt');

            const workspaces: Workspace[] = [];
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    workspaces.push(cursor.value as Workspace);
                    cursor.continue();
                } else {
                    resolve(workspaces);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteWorkspace(id: number): Promise<void> {
        if (!this.db) throw new Error('DB not initialized');

        // Bước 1: Lấy danh sách chat trong workspace này
        const chatsToDelete = await this.getAllChats(id);

        // Bước 2: Xóa từng chat (và messages đi kèm)
        for (const chat of chatsToDelete) {
            if (chat.id) {
                await this.deleteChat(chat.id).catch(console.error);
            }
        }

        // Bước 3: Xóa workspace
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['workspaces'], 'readwrite');
            const store = transaction.objectStore('workspaces');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- CHATS ---

    public async createChat(name: string, workspaceId: number | null = null): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');
            const now = Date.now();
            const chat: ChatSession = { name, workspaceId, createdAt: now, updatedAt: now };

            const request = store.add(chat);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async updateChatName(id: number, name: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');

            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const chat = getReq.result as ChatSession;
                if (!chat) return reject(new Error('Chat not found'));
                chat.name = name;
                chat.updatedAt = Date.now();
                const putReq = store.put(chat);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    public async updateChatTimestamp(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');

            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const chat = getReq.result as ChatSession;
                if (!chat) return resolve(); // Bỏ qua nếu ko tìm thấy
                chat.updatedAt = Date.now();
                const putReq = store.put(chat);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    public async getAllChats(workspaceId: number | null = null): Promise<ChatSession[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats'], 'readonly');
            const store = transaction.objectStore('chats');
            const index = store.index('updatedAt');

            const chats: ChatSession[] = [];
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const chat = cursor.value as ChatSession;
                    const cWorkspaceId = chat.workspaceId ?? null;
                    if (cWorkspaceId === workspaceId) {
                        chats.push(chat);
                    }
                    cursor.continue();
                } else {
                    resolve(chats);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteChat(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats', 'messages'], 'readwrite');
            const chatStore = transaction.objectStore('chats');
            const msgStore = transaction.objectStore('messages');

            chatStore.delete(id);

            // Xóa message thuộc chat này
            const msgIndex = msgStore.index('chatId');
            const req = msgIndex.openCursor(IDBKeyRange.only(id));
            req.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    cursor.delete();
                    cursor.continue();
                }
            };
            req.onerror = () => reject(req.error);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // --- MESSAGES ---

    public async addMessage(
        chatId: number,
        role: 'user' | 'agent' | 'system',
        content: string,
        attachments?: ChatAttachment[],
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const msg: ChatMessage = { chatId, role, content, timestamp: Date.now() };
            if (attachments && attachments.length > 0) {
                msg.attachments = attachments;
            }

            const request = store.add(msg);
            request.onsuccess = async () => {
                await this.updateChatTimestamp(chatId).catch(console.error);
                resolve(request.result as number);
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async getMessages(chatId: number): Promise<ChatMessage[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('chatId');

            const request = index.getAll(IDBKeyRange.only(chatId));
            request.onsuccess = () => {
                const msgs = request.result as ChatMessage[];
                msgs.sort((a, b) => a.timestamp - b.timestamp);
                resolve(msgs);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- BACKUPS ---

    public async addBackup(type: 'character' | 'chat' | 'worldbook', name: string, data: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['backups'], 'readwrite');
            const store = transaction.objectStore('backups');
            const entry: BackupEntry = { type, name, data, timestamp: Date.now() };

            const request = store.add(entry);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async getBackups(type?: 'character' | 'chat' | 'worldbook'): Promise<BackupEntry[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['backups'], 'readonly');
            const store = transaction.objectStore('backups');
            const index = store.index('timestamp');

            const backups: BackupEntry[] = [];
            const request = index.openCursor(null, 'prev'); // sort descending
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const entry = cursor.value as BackupEntry;
                    if (!type || entry.type === type) {
                        backups.push(entry);
                    }
                    cursor.continue();
                } else {
                    resolve(backups);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteBackup(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['backups'], 'readwrite');
            const store = transaction.objectStore('backups');

            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
