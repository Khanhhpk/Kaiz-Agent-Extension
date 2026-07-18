import { AgentLoop } from "../core/loop";
import { StateManager } from "../core/state";

declare const jQuery: any;

export class ChatWindowUI {
    public static init(loop: AgentLoop, stateManager: StateManager) {
        const $ = jQuery;
        const btn = $('#kaiz-floating-btn');
        const win = $('#kaiz-chat-window');
        const closeBtn = $('#kaiz-chat-close');
        const input = $('#kaiz-chat-input');
        const sendBtn = $('#kaiz-chat-send');
        const history = $('#kaiz-chat-history');
        
        // Sidebar elements
        const menuBtn = $('#kaiz-chat-menu-btn');
        const sidebar = $('#kaiz-chat-sidebar');
        const newChatBtn = $('#kaiz-new-chat-btn');
        const chatList = $('#kaiz-chat-list');
        const chatTitle = $('#kaiz-chat-title');

        let isSidebarOpen = false;

        // Toggle cửa sổ
        btn.on('click', () => {
            win.removeClass('kaiz-hidden');
            // Refresh list khi mở
            stateManager.loadChatList().then(renderChatList);
        });

        closeBtn.on('click', () => {
            win.addClass('kaiz-hidden');
            if (isSidebarOpen) toggleSidebar(); // Đóng luôn sidebar
        });

        // Toggle Sidebar
        function toggleSidebar() {
            isSidebarOpen = !isSidebarOpen;
            if (isSidebarOpen) {
                sidebar.show();
            } else {
                sidebar.hide();
            }
        }

        menuBtn.on('click', toggleSidebar);

        // New Chat
        newChatBtn.on('click', async () => {
            history.empty();
            // Đặt stateManager về null để tin nhắn đầu tiên sẽ tạo chat mới
            stateManager.currentChatId = null;
            chatTitle.text('New Chat');
            
            // Xóa background selected ở chat list
            $('.kaiz-chat-item').css('background', 'transparent');
            toggleSidebar();
        });

        // Hàm render Chat List
        function renderChatList(chats: any[]) {
            chatList.empty();
            if (chats.length === 0) {
                chatList.append('<div style="color:#aaa; font-size:12px; text-align:center;">No chats found</div>');
                return;
            }

            for (const chat of chats) {
                const isSelected = chat.id === stateManager.currentChatId;
                const bg = isSelected ? 'rgba(0, 201, 255, 0.2)' : 'transparent';
                
                chatList.append(`
                    <div class="kaiz-chat-item interactable" data-id="${chat.id}" style="padding:8px; border-radius:5px; background:${bg}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${chat.name}</span>
                        <i class="fa-solid fa-trash kaiz-chat-delete" style="color:#e74c3c; font-size:12px;" data-id="${chat.id}"></i>
                    </div>
                `);
            }

            // Click vào chat item
            $('.kaiz-chat-item').on('click', function(this: HTMLElement, e: any) {
                if ($(e.target).hasClass('kaiz-chat-delete')) return; // Bỏ qua nếu click nút xóa
                const id = parseInt($(this).attr('data-id') || '0', 10);
                if (id) {
                    stateManager.switchChat(id);
                    chatTitle.text($(this).find('span').text());
                    toggleSidebar();
                }
            });

            // Click xóa
            $('.kaiz-chat-delete').on('click', async function(this: HTMLElement) {
                const id = parseInt($(this).attr('data-id') || '0', 10);
                if (id) {
                    if (confirm('Delete this chat?')) {
                        await stateManager.deleteChat(id);
                    }
                }
            });
        }

        // Hàm tiện ích format tin nhắn
        const formatMessage = (text: string, isFinal: boolean): string => {
            let html = text || '';
            const detailsTag = isFinal 
                ? '<details class="kaiz-cot" style="margin-bottom: 10px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border-left: 3px solid #f39c12;">'
                : '<details open class="kaiz-cot" style="margin-bottom: 10px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 5px; border-left: 3px solid #f39c12;">';
                
            html = html.replace(/<agent_cot>/g, detailsTag + '<summary style="cursor: pointer; color: #f39c12; font-size: 12px; font-weight: bold;"><i class="fa-solid fa-brain"></i> Kaiz Agent Thoughts</summary><div style="font-size: 12px; color: #aaa; margin-top: 5px; white-space: pre-wrap;">');
            html = html.replace(/<\/agent_cot>/g, '</div></details>');
            
            if (html.includes('<details') && !html.includes('</details>')) {
                html += '</div></details>';
            }

            return html.replace(/\n/g, '<br>');
        };

        // Lắng nghe StateManager
        stateManager.onChatsListUpdated = (chats) => {
            renderChatList(chats);
        };

        stateManager.onChatSwitched = (chatId, messages) => {
            history.empty();
            if (messages.length === 0 && chatId === -1) {
                chatTitle.text('Kaiz Agent');
            }
            
            for (const msg of messages) {
                const formatted = msg.role === 'agent' ? formatMessage(msg.content, true) : msg.content.replace(/\n/g, '<br>');
                addMessageToDOM(msg.role, formatted, false);
            }
        };

        // Hàm tiện ích thêm tin nhắn DOM (không save DB)
        const addMessageToDOM = (role: 'user' | 'agent' | 'system', htmlContent: string, animate: boolean = true): string => {
            let avatar = '';
            let extraClass = '';
            if (role === 'user') {
                avatar = '<i class="fa-solid fa-user"></i>';
                extraClass = 'kaiz-msg-user';
            } else if (role === 'agent') {
                avatar = '<i class="fa-solid fa-robot"></i>';
                extraClass = 'kaiz-msg-agent';
            } else {
                avatar = '<i class="fa-solid fa-gear"></i>';
                extraClass = 'kaiz-msg-agent'; 
            }

            const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);
            history.append(`
                <div class="kaiz-msg ${extraClass}" id="container-${msgId}">
                    <div class="kaiz-msg-avatar">${avatar}</div>
                    <div class="kaiz-msg-content" id="${msgId}">${htmlContent}</div>
                </div>
            `);
            if (animate) {
                history.scrollTop(history[0].scrollHeight);
            }
            return msgId;
        };

        // Xử lý gửi tin nhắn UI
        const sendMessage = async () => {
            const text = String(input.val()).trim();
            if (!text) return;

            input.val('');
            
            // Lưu vào DB trước
            await stateManager.addMessage('user', text);
            // In ra UI
            addMessageToDOM('user', text.replace(/\n/g, '<br>'));
            
            // Nếu là tin nhắn đầu tiên của đoạn chat mới, cập nhật Title
            if (chatTitle.text() === 'New Chat') {
                chatTitle.text(text.substring(0, 30) + (text.length > 30 ? '...' : ''));
            }

            // Spinner cho agent
            const agentMsgId = addMessageToDOM('agent', '<div class="kaiz-spinner"><i class="fa-solid fa-circle-notch"></i> Processing...</div>');
            const agentContentBox = $(`#${agentMsgId}`);

            sendBtn.prop('disabled', true);
            let fullAgentResponse = '';

            // Lấy toàn bộ lịch sử (hoặc tối đa N tin) từ DB để truyền cho AI
            const historyMsgs = stateManager.currentChatId ? await stateManager.db.getMessages(stateManager.currentChatId) : [];

            await loop.run(historyMsgs, async (event) => {
                if (event.type === 'stream_chunk') {
                    let htmlToRender = event.text ? formatMessage(event.text, false) : '';
                    if (event.reasoning && !event.text) {
                        htmlToRender += `<div style="color:#aaa; font-style:italic; font-size:12px; margin-bottom:5px;"><i class="fa-solid fa-brain"></i> Thinking...</div>`;
                    }
                    if (!htmlToRender) {
                        htmlToRender = `<div class="kaiz-spinner" style="font-size:12px;"><i class="fa-solid fa-circle-notch"></i> Generating...</div>`;
                    }
                    agentContentBox.html(htmlToRender);
                } else if (event.type === 'final_answer') {
                    agentContentBox.html(formatMessage(event.text || '', true));
                    fullAgentResponse = event.text || '';
                } else if (event.type === 'error') {
                    agentContentBox.html(`<div style="color:#e74c3c;"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${event.text}</div>`);
                    fullAgentResponse = `[Error] ${event.text}`;
                }
            });
            
            // Lưu câu trả lời cuối vào DB
            await stateManager.addMessage('agent', fullAgentResponse || 'Done.');

            sendBtn.prop('disabled', false);
            input.focus();
        };

        sendBtn.on('click', sendMessage);
        input.on('keydown', (e: any) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}
