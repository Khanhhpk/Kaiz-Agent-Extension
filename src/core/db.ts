export interface Workspace {
    id?: number;
    systemId?: string;
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

export interface AutoTask {
    id?: number;
    name: string;
    prompt: string;
    triggerMode: 'turn' | 'time';
    triggerValue: number;
    maxRuns: number;
    runCount: number;
    executionMode: 'fresh' | 'persist';
    chatId?: number;
    lastTurnRequests?: number;
    totalRequests?: number;
    toolsConfig: Record<string, boolean>;
    enabled: boolean;
    createdAt: number;
}

export interface UISnapshot {
    id?: number;
    snapshotId: string;
    timestamp: number;
    label: string;
    type: 'css' | 'element' | 'theme';
    cssData?: {
        styleId: string;
        previousContent: string | null;
    };
    elementData?: {
        elementId: string;
        previousOuterHTML: string | null;
        parentSelector: string;
        position: string;
    };
    themeData?: {
        previousValues: Record<string, string>;
    };
    applied: boolean;
}

export interface ThemeReference {
    id?: number;
    name: string;
    themeJson: string;
    isDefault: boolean;
    addedAt: number;
}

export class KaizDB {
    private dbName = 'KaizAgentDB';
    private dbVersion = 5;
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

                // --- AUTO TASKS (DB v4) ---
                if (!db.objectStoreNames.contains('autoTasks')) {
                    db.createObjectStore('autoTasks', { keyPath: 'id', autoIncrement: true });
                }

                // --- UI CUSTOMIZATION (DB v5) ---
                if (!db.objectStoreNames.contains('kaiz_ui_snapshots')) {
                    const snapStore = db.createObjectStore('kaiz_ui_snapshots', { keyPath: 'id', autoIncrement: true });
                    snapStore.createIndex('snapshotId', 'snapshotId', { unique: true });
                    snapStore.createIndex('timestamp', 'timestamp', { unique: false });
                    snapStore.createIndex('applied', 'applied', { unique: false });
                }

                if (!db.objectStoreNames.contains('kaiz_theme_library')) {
                    const themeStore = db.createObjectStore('kaiz_theme_library', { keyPath: 'id', autoIncrement: true });
                    themeStore.createIndex('name', 'name', { unique: false });
                }
            };

            request.onsuccess = async (event: Event) => {
                this.db = (event.target as IDBOpenDBRequest).result;
                await this.ensureSystemWorkspaces();
                resolve();
            };

            request.onerror = (event: Event) => {
                console.error('[KaizDB] Error opening DB', event);
                reject((event.target as IDBOpenDBRequest).error);
            };
        });
    }

    private async ensureSystemWorkspaces(): Promise<void> {
        const workspaces = await this.getAllWorkspaces();

        const roleplayWs = workspaces.find((w) => w.systemId === 'roleplay');
        const roleplayPrompt = `Bạn hiện đang ở trong Workspace "Roleplay & Story". Nhiệm vụ chính của bạn là hỗ trợ người dùng đọc, phân tích và tham gia vào câu chuyện Roleplay (RP) trong SillyTavern. Bạn sẽ hành xử như một Co-writer (Người đồng sáng tác) hoặc một người dẫn truyện (Dungeon Master) tận tâm.\n\nLuồng hoạt động (Flow) bắt buộc:\n1. ĐỌC HIỂU BỐI CẢNH: Khi bắt đầu, hãy ưu tiên dùng các tool để đọc bối cảnh: get_char_info (nhân vật), get_user_persona (người dùng), get_chat_history (diễn biến truyện), và get_lorebook_info (thế giới quan).\n2. SÁNG TÁC: Khi người dùng yêu cầu tiếp tục câu chuyện hoặc viết tin nhắn thay họ, hãy phân tích kỹ tính cách nhân vật và bối cảnh. Sử dụng văn phong mượt mà, đậm chất văn học và phù hợp với tone truyện.\n3. THAO TÁC TRỰC TIẾP: Sử dụng tool manage_user_input để điền hoặc nối chữ trực tiếp vào khung chat của người dùng khi được nhờ.\n4. CỘNG SỰ SÁNG TẠO: Nếu cốt truyện có nhiều hướng rẽ, hãy đề xuất các phương án và hỏi ý kiến người dùng để cùng phát triển, không nên tự tiện áp đặt kết cục.`;
        const roleplayTools = ['get_char_info', 'get_chat_history', 'get_lorebook_info', 'get_user_persona', 'manage_user_input'];
        if (!roleplayWs) {
            await this.createSystemWorkspace('roleplay', 'Roleplay & Story', roleplayPrompt, roleplayTools);
        }

        const modderWs = workspaces.find((w) => w.systemId === 'modder');
        const modderPrompt = `Bạn hiện đang ở trong Workspace "Modding & Editor". Nhiệm vụ chính của bạn là hỗ trợ kỹ thuật, tùy biến (mod) và sửa đổi cấu trúc dữ liệu của SillyTavern (Character Cards, Lorebooks, Regex, Helper Scripts).\n\nLuồng hoạt động (Flow) bắt buộc:\n1. AN TOÀN TRƯỚC TIÊN: Trước khi thực hiện bất kỳ lệnh sửa đổi (edit) nào lên các file quan trọng, BẮT BUỘC phải cân nhắc dùng tool manage_backup để tạo bản sao lưu nếu thấy rủi ro cao.\n2. NGUYÊN TẮC "ĐỌC RỒI MỚI SỬA": Luôn gọi các hàm get_* (get_char_info, get_lorebook_info, get_regex_info...) để nắm cấu trúc hiện tại trước khi gọi các hàm edit_* hoặc manage_* tương ứng. Tuyệt đối không đoán mò dữ liệu.\n3. CHUẨN XÁC KỸ THUẬT: Khi sửa đổi Regex hoặc Script, hãy đảm bảo code chuẩn xác, không có lỗi cú pháp, và giải thích ngắn gọn nguyên lý hoạt động.\n4. BẢO TOÀN DỮ LIỆU: Khi chỉnh sửa Thẻ nhân vật (Character Card) hoặc Lorebook, hãy bảo toàn định dạng cũ, chỉ thay đổi hoặc bổ sung đúng những phần người dùng yêu cầu.`;
        const modderTools = [
            'get_chat_history', 'get_char_info', 'list_characters', 'edit_character_card',
            'get_lorebook_info', 'manage_lorebook_entry', 'manage_worldbook',
            'get_regex_list', 'get_regex_info', 'manage_regex',
            'get_tavern_helper_scripts', 'get_tavern_helper_script_info', 'manage_tavern_helper_script',
            'get_user_persona', 'edit_user_persona', 'manage_chat_text', 'manage_backup'
        ];
        if (!modderWs) {
            await this.createSystemWorkspace('modder', 'Modding & Editor', modderPrompt, modderTools);
        }

        const uiDesignerWs = workspaces.find((w) => w.systemId === 'ui_designer');
        const uiDesignerPrompt = `Bạn hiện đang ở trong Workspace "UI & Theme Designer". Nhiệm vụ chính của bạn là hỗ trợ thiết kế, tùy chỉnh giao diện (UI) và theme của SillyTavern.\n\nLuồng hoạt động (Flow) bắt buộc:\n1. TÙY BIẾN GIAO DIỆN (UI Customization): Khi người dùng muốn thay đổi giao diện SillyTavern, hãy dùng st_theme_manager (đọc/đổi theme, CSS variables), st_css_manager (inject CSS tùy chỉnh), và st_inject_element (chèn/gỡ phần tử HTML).\n2. KHẢO SÁT TRƯỚC KHI LÀM: Trước khi thay đổi lớn, hãy dùng st_theme_manager action "get_current_theme" để khảo sát theme hiện tại, và action "get_reference_themes" để xem các theme mẫu.\n3. AN TOÀN VÀ ROLLBACK: Mọi thay đổi qua các tools này đều được tự động snapshot để người dùng có thể rollback. Đừng ngại thử nghiệm, nhưng hãy đảm bảo code CSS/HTML chuẩn xác. Tuyệt đối KHÔNG tự ý giả mạo dữ liệu hay sửa file hệ thống nếu không được yêu cầu.`;
        const uiDesignerTools = ['st_theme_manager', 'st_css_manager', 'st_inject_element'];
        if (!uiDesignerWs) {
            await this.createSystemWorkspace('ui_designer', 'UI & Theme Designer', uiDesignerPrompt, uiDesignerTools);
        }
    }

    private async createSystemWorkspace(
        systemId: string,
        name: string,
        systemPrompt: string,
        toolNames: string[],
    ): Promise<void> {
        const toolsConfig: Record<string, boolean> = {};
        toolNames.forEach((t) => (toolsConfig[t] = true));

        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['workspaces'], 'readwrite');
            const store = transaction.objectStore('workspaces');

            const now = Date.now();
            const ws: Workspace = {
                systemId,
                name,
                systemPrompt,
                toolsConfig,
                createdAt: now,
                updatedAt: now,
            };

            const request = store.add(ws);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
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

        // Check if it's a system workspace
        const workspaces = await this.getAllWorkspaces();
        const ws = workspaces.find((w) => w.id === id);
        if (ws && ws.systemId) {
            throw new Error('Cannot delete a system workspace');
        }

        // Bước 1: Lấy danh sách chat trong workspace này
        const chatsToDelete = await this.getAllChats(id);

        // Bước 2: Xóa từng chat (và messages đi kèm)
        for (const chat of chatsToDelete) {
            if (chat.id) {
                await this.deleteChat(chat.id).catch(console.error);
            }
        }

        // Bước 3: Xóa bản ghi workspace trong db
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['workspaces'], 'readwrite');
            const store = transaction.objectStore('workspaces');
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    public async resetSystemWorkspace(id: number): Promise<void> {
        const workspaces = await this.getAllWorkspaces();
        const ws = workspaces.find((w) => w.id === id);
        if (!ws || !ws.systemId) return;

        let defaultName = '';
        let defaultPrompt = '';
        let defaultTools: string[] = [];

        if (ws.systemId === 'roleplay') {
            defaultName = 'Roleplay & Story';
            defaultPrompt = `Bạn hiện đang ở trong Workspace "Roleplay & Story". Nhiệm vụ chính của bạn là hỗ trợ người dùng đọc, phân tích và tham gia vào câu chuyện Roleplay (RP) trong SillyTavern. Bạn sẽ hành xử như một Co-writer (Người đồng sáng tác) hoặc một người dẫn truyện (Dungeon Master) tận tâm.\n\nLuồng hoạt động (Flow) bắt buộc:\n1. ĐỌC HIỂU BỐI CẢNH: Khi bắt đầu, hãy ưu tiên dùng các tool để đọc bối cảnh: get_char_info (nhân vật), get_user_persona (người dùng), get_chat_history (diễn biến truyện), và get_lorebook_info (thế giới quan).\n2. SÁNG TÁC: Khi người dùng yêu cầu tiếp tục câu chuyện hoặc viết tin nhắn thay họ, hãy phân tích kỹ tính cách nhân vật và bối cảnh. Sử dụng văn phong mượt mà, đậm chất văn học và phù hợp với tone truyện.\n3. THAO TÁC TRỰC TIẾP: Sử dụng tool manage_user_input để điền hoặc nối chữ trực tiếp vào khung chat của người dùng khi được nhờ.\n4. CỘNG SỰ SÁNG TẠO: Nếu cốt truyện có nhiều hướng rẽ, hãy đề xuất các phương án và hỏi ý kiến người dùng để cùng phát triển, không nên tự tiện áp đặt kết cục.`;
            defaultTools = [
                'get_char_info',
                'get_chat_history',
                'get_lorebook_info',
                'get_user_persona',
                'manage_user_input',
            ];
        } else if (ws.systemId === 'modder') {
            defaultName = 'Modding & Editor';
            defaultPrompt = `Bạn hiện đang ở trong Workspace "Modding & Editor". Nhiệm vụ chính của bạn là hỗ trợ kỹ thuật, tùy biến (mod) và sửa đổi cấu trúc dữ liệu của SillyTavern (Character Cards, Lorebooks, Regex, Helper Scripts).\n\nLuồng hoạt động (Flow) bắt buộc:\n1. AN TOÀN TRƯỚC TIÊN: Trước khi thực hiện bất kỳ lệnh sửa đổi (edit) nào lên các file quan trọng, BẮT BUỘC phải cân nhắc dùng tool manage_backup để tạo bản sao lưu nếu thấy rủi ro cao.\n2. NGUYÊN TẮC "ĐỌC RỒI MỚI SỬA": Luôn gọi các hàm get_* (get_char_info, get_lorebook_info, get_regex_info...) để nắm cấu trúc hiện tại trước khi gọi các hàm edit_* hoặc manage_* tương ứng. Tuyệt đối không đoán mò dữ liệu.\n3. CHUẨN XÁC KỸ THUẬT: Khi sửa đổi Regex hoặc Script, hãy đảm bảo code chuẩn xác, không có lỗi cú pháp, và giải thích ngắn gọn nguyên lý hoạt động.\n4. BẢO TOÀN DỮ LIỆU: Khi chỉnh sửa Thẻ nhân vật (Character Card) hoặc Lorebook, hãy bảo toàn định dạng cũ, chỉ thay đổi hoặc bổ sung đúng những phần người dùng yêu cầu.`;
            defaultTools = [
                'get_chat_history', 'get_char_info', 'list_characters', 'edit_character_card',
                'get_lorebook_info', 'manage_lorebook_entry', 'manage_worldbook',
                'get_regex_list', 'get_regex_info', 'manage_regex',
                'get_tavern_helper_scripts', 'get_tavern_helper_script_info', 'manage_tavern_helper_script',
                'get_user_persona', 'edit_user_persona', 'manage_chat_text', 'manage_backup'
            ];
        } else if (ws.systemId === 'ui_designer') {
            defaultName = 'UI & Theme Designer';
            defaultPrompt = `Bạn hiện đang ở trong Workspace "UI & Theme Designer". Nhiệm vụ chính của bạn là hỗ trợ thiết kế, tùy chỉnh giao diện (UI) và theme của SillyTavern.\n\nLuồng hoạt động (Flow) bắt buộc:\n1. TÙY BIẾN GIAO DIỆN (UI Customization): Khi người dùng muốn thay đổi giao diện SillyTavern, hãy dùng st_theme_manager (đọc/đổi theme, CSS variables), st_css_manager (inject CSS tùy chỉnh), và st_inject_element (chèn/gỡ phần tử HTML).\n2. KHẢO SÁT TRƯỚC KHI LÀM: Trước khi thay đổi lớn, hãy dùng st_theme_manager action "get_current_theme" để khảo sát theme hiện tại, và action "get_reference_themes" để xem các theme mẫu.\n3. AN TOÀN VÀ ROLLBACK: Mọi thay đổi qua các tools này đều được tự động snapshot để người dùng có thể rollback. Đừng ngại thử nghiệm, nhưng hãy đảm bảo code CSS/HTML chuẩn xác. Tuyệt đối KHÔNG tự ý giả mạo dữ liệu hay sửa file hệ thống nếu không được yêu cầu.`;
            defaultTools = ['st_theme_manager', 'st_css_manager', 'st_inject_element'];
        }

        const toolsConfig: Record<string, boolean> = {};
        defaultTools.forEach((t) => (toolsConfig[t] = true));

        return this.updateWorkspace(id, {
            name: defaultName,
            systemPrompt: defaultPrompt,
            toolsConfig,
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

    public async clearMessages(chatId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const msgStore = transaction.objectStore('messages');
            
            const msgIndex = msgStore.index('chatId');
            const req = msgIndex.openCursor(IDBKeyRange.only(chatId));
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

    public async updateMessageText(id: number, content: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');

            const request = store.get(id);
            request.onsuccess = () => {
                const msg = request.result;
                if (!msg) {
                    return reject(new Error('Message not found'));
                }
                msg.content = content;
                const updateReq = store.put(msg);
                updateReq.onsuccess = () => resolve();
                updateReq.onerror = () => reject(updateReq.error);
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

    // --- AUTO TASKS ---

    public async createAutoTask(task: Omit<AutoTask, 'id'>): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['autoTasks'], 'readwrite');
            const store = transaction.objectStore('autoTasks');

            const request = store.add(task);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllAutoTasks(): Promise<AutoTask[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['autoTasks'], 'readonly');
            const store = transaction.objectStore('autoTasks');

            const request = store.getAll();
            request.onsuccess = () => resolve(request.result as AutoTask[]);
            request.onerror = () => reject(request.error);
        });
    }

    public async updateAutoTask(id: number, data: Partial<AutoTask>): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['autoTasks'], 'readwrite');
            const store = transaction.objectStore('autoTasks');

            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const task = getReq.result as AutoTask;
                if (!task) return reject(new Error('AutoTask not found'));
                Object.assign(task, data);
                const putReq = store.put(task);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    public async deleteAutoTask(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['autoTasks'], 'readwrite');
            const store = transaction.objectStore('autoTasks');

            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- UI SNAPSHOTS ---

    public async addSnapshot(snapshot: UISnapshot): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readwrite');
            const store = transaction.objectStore('kaiz_ui_snapshots');

            const request = store.add(snapshot);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllSnapshots(): Promise<UISnapshot[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readonly');
            const store = transaction.objectStore('kaiz_ui_snapshots');
            const index = store.index('timestamp');

            const snapshots: UISnapshot[] = [];
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    snapshots.push(cursor.value as UISnapshot);
                    cursor.continue();
                } else {
                    resolve(snapshots);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    public async getActiveSnapshots(): Promise<UISnapshot[]> {
        const all = await this.getAllSnapshots();
        return all.filter((s) => s.applied === true);
    }

    public async markSnapshotRolledBack(snapshotId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readwrite');
            const store = transaction.objectStore('kaiz_ui_snapshots');
            const index = store.index('snapshotId');

            const req = index.get(snapshotId);
            req.onsuccess = () => {
                const snap = req.result as UISnapshot;
                if (!snap) return resolve();
                snap.applied = false;
                const putReq = store.put(snap);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            req.onerror = () => reject(req.error);
        });
    }

    public async markAllSnapshotsRolledBack(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readwrite');
            const store = transaction.objectStore('kaiz_ui_snapshots');

            const request = store.openCursor();
            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const snap = cursor.value as UISnapshot;
                    if (snap.applied) {
                        snap.applied = false;
                        cursor.update(snap);
                    }
                    cursor.continue();
                }
            };
            request.onerror = () => reject(request.error);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    public async deleteSnapshot(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readwrite');
            const store = transaction.objectStore('kaiz_ui_snapshots');

            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async clearAllSnapshots(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_ui_snapshots'], 'readwrite');
            const store = transaction.objectStore('kaiz_ui_snapshots');

            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // --- THEME LIBRARY ---

    public async addThemeReference(theme: ThemeReference): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_theme_library'], 'readwrite');
            const store = transaction.objectStore('kaiz_theme_library');

            const request = store.add(theme);
            request.onsuccess = () => resolve(request.result as number);
            request.onerror = () => reject(request.error);
        });
    }

    public async getAllThemeReferences(): Promise<ThemeReference[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_theme_library'], 'readonly');
            const store = transaction.objectStore('kaiz_theme_library');

            const request = store.getAll();
            request.onsuccess = () => resolve(request.result as ThemeReference[]);
            request.onerror = () => reject(request.error);
        });
    }

    public async deleteThemeReference(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_theme_library'], 'readwrite');
            const store = transaction.objectStore('kaiz_theme_library');

            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async clearThemeLibrary(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject(new Error('DB not initialized'));
            const transaction = this.db.transaction(['kaiz_theme_library'], 'readwrite');
            const store = transaction.objectStore('kaiz_theme_library');

            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
