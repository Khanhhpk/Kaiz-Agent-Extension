export interface ChatSession {
    id?: number;
    name: string;
    createdAt: number;
    updatedAt: number;
}

export interface ChatMessage {
    id?: number;
    chatId: number;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: number;
}

export class KaizDB {
    private dbName = 'KaizAgentDB';
    private dbVersion = 1;
    private db: IDBDatabase | null = null;

    public async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                const db = (event.target as IDBOpenDBRequest).result;

                if (!db.objectStoreNames.contains('chats')) {
                    const chatStore = db.createObjectStore('chats', { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                }

                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    msgStore.createIndex('chatId', 'chatId', { unique: false });
                    msgStore.createIndex('timestamp', 'timestamp', { unique: false });
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

    // --- CHATS ---

    public async createChat(name: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['chats'], 'readwrite');
            const store = transaction.objectStore('chats');
            const now = Date.now();
            const chat: ChatSession = { name, createdAt: now, updatedAt: now };

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

    public async getAllChats(): Promise<ChatSession[]> {
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
                    chats.push(cursor.value as ChatSession);
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

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // --- MESSAGES ---

    public async addMessage(chatId: number, role: 'user' | 'agent' | 'system', content: string): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');
            const msg: ChatMessage = { chatId, role, content, timestamp: Date.now() };

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
}
