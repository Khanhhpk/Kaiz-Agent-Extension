import { marked } from 'marked';
import { AgentLoop } from '../core/loop';
import { StateManager } from '../core/state';

declare const jQuery: any;

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export class ChatWindowUI {
    public static init(loop: AgentLoop, stateManager: StateManager) {
        const $ = jQuery;
        const btn = $('#kaiz-floating-btn');
        const win = $('#kaiz-chat-window');
        const closeBtn = $('#kaiz-chat-close');

        // --- Bổ sung nút và khung Log Request ---
        closeBtn.before(
            '<i id="kaiz-chat-log-btn" class="fa-solid fa-scroll interactable" style="font-size:16px; margin-right:15px; cursor:pointer;" title="View Request Logs"></i>',
        );
        const logBtn = $('#kaiz-chat-log-btn');

        if ($('#kaiz-log-modal').length === 0) {
            $('body').append(`
                <dialog id="kaiz-log-modal" class="kaiz-log-modal">
                    <div class="kaiz-log-header">
                        <h3 class="kaiz-log-title">Agent Request Logs</h3>
                        <i id="kaiz-log-close" class="fa-solid fa-xmark interactable kaiz-log-close"></i>
                    </div>
                    <div class="kaiz-log-body">
                        <div class="kaiz-log-pane-left">
                            <h4 class="kaiz-log-pane-title">Messages Sent (JSON)</h4>
                            <pre id="kaiz-log-sent" class="kaiz-log-pre"></pre>
                        </div>
                        <div class="kaiz-log-pane-right">
                            <h4 class="kaiz-log-pane-title">Raw Response Received</h4>
                            <pre id="kaiz-log-recv" class="kaiz-log-pre"></pre>
                        </div>
                    </div>
                </dialog>
            `);
        }

        let lastLogSent = 'No data yet.';
        let lastLogRecv = 'No data yet.';

        $('#kaiz-log-close').on('click', () => {
            ($('#kaiz-log-modal')[0] as HTMLDialogElement).close();
        });

        $('#kaiz-chat-settings-btn').on('click', () => {
            const modal = $('#kaiz-persona-memory-modal')[0] as HTMLDialogElement;
            if (modal) modal.showModal();
        });

        $('#kaiz-persona-memory-close').on('click', () => {
            const modal = $('#kaiz-persona-memory-modal')[0] as HTMLDialogElement;
            if (modal) modal.close();
        });

        logBtn.on('click', () => {
            $('#kaiz-log-sent').text(lastLogSent);
            $('#kaiz-log-recv').text(lastLogRecv);
            const dialog = $('#kaiz-log-modal')[0] as HTMLDialogElement;
            if (!dialog.open) {
                dialog.showModal();
            }
        });
        // ------------------------------------

        // --- Quick Prompts Logic ---
        const quickPromptBtn = $('#kaiz-quick-prompt-btn');
        const quickPromptMenu = $('#kaiz-quick-prompt-menu');
        const input = $('#kaiz-chat-input');

        function populateQuickPrompts() {
            quickPromptMenu.empty();
            const ctx = (window as any).SillyTavern.getContext();
            const settings = ctx.extensionSettings['kaiz_agent'] || {};
            const prompts = settings.quickPrompts || [];

            if (prompts.length === 0) {
                quickPromptMenu.append(
                    '<div style="padding: 10px; color: #888; text-align: center; font-size: 12px;">No quick prompts configured. Add them in Settings.</div>',
                );
                return;
            }

            prompts.forEach((qp: any) => {
                const iconName = qp.icon || 'zap';
                const $item = $(`
                    <div class="kaiz-quick-prompt-item">
                        <div class="kaiz-qp-item-icon" style="display: flex; justify-content: center; width: 20px;"><i data-lucide="${iconName}"></i></div>
                        <div class="kaiz-qp-item-name" title="${qp.name}">${qp.name || 'Prompt'}</div>
                    </div>
                `);
                $item.on('click', () => {
                    const currentText = String(input.val() || '');
                    // Nếu đã có text, nối thêm dòng mới, nếu không thì chèn thẳng
                    const newText = currentText
                        ? currentText + (currentText.endsWith('\n') ? '' : '\n') + qp.prompt
                        : qp.prompt;
                    input.val(newText).trigger('input');
                    input.focus();
                    quickPromptMenu.hide();
                });
                quickPromptMenu.append($item);
            });

            // Yêu cầu Lucide vẽ SVG
            if ((window as any).lucide) {
                (window as any).lucide.createIcons();
            } else {
                setTimeout(() => {
                    if ((window as any).lucide) (window as any).lucide.createIcons();
                }, 100);
            }
        }

        quickPromptBtn.on('click', (e: any) => {
            e.stopPropagation();
            if (quickPromptMenu.is(':visible')) {
                quickPromptMenu.hide();
            } else {
                populateQuickPrompts();
                quickPromptMenu.css('display', 'flex'); // Flex to support column layout
            }
        });

        // Đóng menu khi click ra ngoài
        $(document).on('click', (e: any) => {
            if (
                !$(e.target).closest('#kaiz-quick-prompt-btn').length &&
                !$(e.target).closest('#kaiz-quick-prompt-menu').length
            ) {
                quickPromptMenu.hide();
            }
        });
        // ------------------------------------

        const sendBtn = $('#kaiz-chat-send');
        const history = $('#kaiz-chat-history');

        // --- Drag Logic ---
        const ensureInBounds = (el: any) => {
            if (el[0].tagName === 'DIALOG' && !el[0].open) return null;
            if (el.hasClass('kaiz-hidden')) return null;
            const rect = el[0].getBoundingClientRect();
            const w = window.innerWidth;
            const h = window.innerHeight;

            let newLeft = rect.left;
            let newTop = rect.top;
            let updated = false;

            if (newLeft < 0) {
                newLeft = 0;
                updated = true;
            }
            if (newTop < 0) {
                newTop = 0;
                updated = true;
            }
            if (newLeft + rect.width > w) {
                newLeft = w - rect.width;
                updated = true;
            }
            if (newTop + rect.height > h) {
                newTop = h - rect.height;
                updated = true;
            }

            if (updated) {
                el.css({ right: 'auto', bottom: 'auto', left: newLeft + 'px', top: newTop + 'px' });
            }
            return { left: newLeft, top: newTop };
        };

        let isDraggingBtn = false;
        if (typeof ($.fn as any).draggable === 'function') {
            const makeDraggable = (el: any, storageKey: string, options: any = {}) => {
                const savedPos = localStorage.getItem(storageKey);
                if (savedPos) {
                    try {
                        const parsed = JSON.parse(savedPos);
                        el.css({ right: 'auto', bottom: 'auto', left: parsed.left + 'px', top: parsed.top + 'px' });
                    } catch (e) {}
                }

                el.draggable({
                    containment: 'window',
                    scroll: false,
                    distance: 5,
                    start: function () {
                        if (el.attr('id') === 'kaiz-floating-btn') {
                            isDraggingBtn = true;
                        }
                    },
                    ...options,
                    stop: function () {
                        if (el.attr('id') === 'kaiz-floating-btn') {
                            setTimeout(() => {
                                isDraggingBtn = false;
                            }, 100);
                        }
                        const pos = ensureInBounds($(this));
                        if (pos) localStorage.setItem(storageKey, JSON.stringify(pos));
                    },
                });
            };

            makeDraggable(btn, 'kaiz_btn_pos');
            setTimeout(() => {
                ensureInBounds(btn);
            }, 500);

            makeDraggable(win, 'kaiz_win_pos', {
                handle: '.kaiz-chat-header',
                cancel: 'input,textarea,button,select,option,i',
            });
        }

        let resizeTimeout: any;
        $(window).off('resize.kaiz').on('resize.kaiz', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const btnPos = ensureInBounds(btn);
                if (btnPos) localStorage.setItem('kaiz_btn_pos', JSON.stringify(btnPos));

                if ((win[0] as HTMLDialogElement).open) {
                    const winPos = ensureInBounds(win);
                    if (winPos) localStorage.setItem('kaiz_win_pos', JSON.stringify(winPos));
                }
            }, 100);
        });
        // ------------------

        // Sidebar elements
        const menuBtn = $('#kaiz-chat-menu-btn');
        const sidebar = $('#kaiz-chat-sidebar');
        const newChatBtn = $('#kaiz-new-chat-btn');
        const chatList = $('#kaiz-chat-list');
        const chatTitle = $('#kaiz-chat-title');

        let isSidebarOpen = false;

        // Toggle cửa sổ
        btn.on('click', (e: any) => {
            if (isDraggingBtn) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const dialogEl = win[0] as HTMLDialogElement;
            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const isPhoneMode = !!extSettings.phoneMode;

            if (!dialogEl.open) {
                if (isPhoneMode) {
                    dialogEl.showModal();
                } else {
                    dialogEl.show();
                    setTimeout(() => {
                        const winPos = ensureInBounds(win);
                        if (winPos) localStorage.setItem('kaiz_win_pos', JSON.stringify(winPos));
                    }, 50);
                }
                // Refresh list khi mở
                stateManager.loadChatList().then(renderChatList);
            } else {
                dialogEl.close();
                if (isSidebarOpen) toggleSidebar();
            }
        });

        closeBtn.on('click', () => {
            const dialogEl = win[0] as HTMLDialogElement;
            dialogEl.close();
            if (isSidebarOpen) toggleSidebar(); // Đóng luôn sidebar
        });

        // --- Phone Mode Logic ---
        const applyPhoneMode = () => {
            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const isPhoneMode = !!extSettings.phoneMode;

            if (isPhoneMode) {
                win.addClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('disable');
                }
            } else {
                win.removeClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('enable');
                }
            }
        };

        // Khởi tạo phone mode ban đầu
        setTimeout(applyPhoneMode, 200);
        // ------------------------------------

        // Toggle Sidebar
        function toggleSidebar() {
            isSidebarOpen = !isSidebarOpen;
            if (isSidebarOpen) {
                sidebar.css('display', 'flex');
            } else {
                sidebar.css('display', 'none');
            }
        }

        menuBtn.on('click', toggleSidebar);

        // New Chat
        newChatBtn.on('click', async () => {
            history.empty();
            // Đặt stateManager về null để tin nhắn đầu tiên sẽ tạo chat mới
            stateManager.currentChatId = null;
            chatTitle.text('New Chat');
            addWelcomeMessage();

            // Xóa background selected ở chat list
            $('.kaiz-chat-item').css('background', 'transparent');
            toggleSidebar();
        });

        // Cài đặt Event Delegation cho danh sách chat (chỉ gán 1 lần duy nhất)
        chatList.on('click', '.kaiz-chat-item', function (this: HTMLElement, e: any) {
            if ($(e.target).hasClass('kaiz-chat-delete') || $(e.target).hasClass('kaiz-chat-edit')) return; // Bỏ qua nếu click nút xóa hoặc sửa
            const id = parseInt($(this).attr('data-id') || '0', 10);
            if (id) {
                stateManager.switchChat(id);
                chatTitle.text($(this).find('span').text());
                toggleSidebar();
            }
        });

        chatList.on('click', '.kaiz-chat-delete', async function (this: HTMLElement, e: any) {
            e.stopPropagation();
            const id = parseInt($(this).attr('data-id') || '0', 10);
            if (id) {
                if (confirm('Delete this chat?')) {
                    await stateManager.deleteChat(id);
                }
            }
        });

        chatList.on('click', '.kaiz-chat-edit', async function (this: HTMLElement, e: any) {
            e.stopPropagation();
            const id = parseInt($(this).attr('data-id') || '0', 10);
            const currentName = $(this).attr('data-name') || '';
            if (id) {
                const newName = prompt('Enter new chat name:', currentName);
                if (newName !== null && newName.trim() !== '') {
                    await stateManager.updateChatName(id, newName.trim());
                }
            }
        });

        // Hàm render Chat List
        function renderChatList(chats: any[]) {
            chatList.empty();
            if (chats.length === 0) {
                chatList.append('<div style="color:#aaa; font-size:12px; text-align:center;">No chats found</div>');
                return;
            }

            let htmlBuffer = '';
            for (const chat of chats) {
                const isSelected = chat.id === stateManager.currentChatId;
                const bg = isSelected ? 'rgba(0, 201, 255, 0.2)' : 'transparent';

                htmlBuffer += `
                    <div class="kaiz-chat-item interactable" data-id="${chat.id}" style="padding:8px; border-radius:5px; background:${bg}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">${escapeHtml(chat.name)}</span>
                        <div>
                            <i class="fa-solid fa-pen kaiz-chat-edit" style="color:#f39c12; font-size:12px; margin-right:8px;" data-id="${chat.id}" data-name="${chat.name.replace(/"/g, '&quot;')}"></i>
                            <i class="fa-solid fa-trash kaiz-chat-delete" style="color:#e74c3c; font-size:12px;" data-id="${chat.id}"></i>
                        </div>
                    </div>
                `;
            }
            chatList.append(htmlBuffer);
        }

        // Hàm tiện ích phân tích và render Tool Calls thành HTML
        const parseToolCallsToHtml = (contentToParse: string, escapeText: boolean = false): string => {
            const toolCalls: string[] = [];
            let result = contentToParse.replace(
                /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g,
                (match, name, content) => {
                    const cleanContent = content.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const toolHtml = `<details class="kaiz-tool-call-block"><summary class="kaiz-tool-summary"><i class="fa-solid fa-bolt"></i> Tool Call: ${name}</summary><div class="kaiz-tool-content">${cleanContent}</div></details>`;
                    toolCalls.push(toolHtml);
                    return `__TOOL_CALL_${toolCalls.length - 1}__`;
                },
            );

            if (escapeText) {
                result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }

            // KHÔNG escape < > ở đây, để dành cho marked.parse xử lý
            for (let i = 0; i < toolCalls.length; i++) {
                result = result.replace(`__TOOL_CALL_${i}__`, toolCalls[i]);
            }
            return result;
        };

        // Hàm render Mermaid (Lazy load)
        const renderMermaid = async () => {
            const mermaidBlocks = $('.kaiz-chat-history .language-mermaid');
            if (mermaidBlocks.length === 0) return;

            if (!(window as any).mermaid) {
                // Tải lười thư viện Mermaid từ CDN
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
                    script.onload = () => {
                        if ((window as any).mermaid) {
                            (window as any).mermaid.initialize({ startOnLoad: false, theme: 'dark' });
                        }
                        resolve();
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            mermaidBlocks.each(function (this: any) {
                const block = $(this);
                if (block.hasClass('mermaid-rendered')) return;

                const code = block.text();
                const id = 'mermaid-' + Date.now() + Math.floor(Math.random() * 1000);

                try {
                    if ((window as any).mermaid) {
                        (window as any).mermaid
                            .render(id, code)
                            .then((result: any) => {
                                const parentPre = block.parent('pre');
                                if (parentPre.length) {
                                    parentPre.replaceWith(
                                        `<div class="kaiz-mermaid-container" style="text-align:center; margin:10px 0; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; overflow-x:auto;">${result.svg}</div>`,
                                    );
                                }
                            })
                            .catch((e: any) => {
                                console.error('Mermaid render error', e);
                                block.addClass('mermaid-rendered');
                            });
                    }
                } catch (e) {
                    console.error('Mermaid error', e);
                    block.addClass('mermaid-rendered');
                }
            });
        };

        // Cấu hình marked để render break lines giống ST
        marked.setOptions({ breaks: true });

        // Hàm tiện ích format tin nhắn
        const formatMessage = (text: string, isFinal: boolean): string => {
            let html = text || '';

            const detailsTag = isFinal ? '<details class="kaiz-cot-block">' : '<details open class="kaiz-cot-block">';

            const closeIndex = html.indexOf('</agent_cot>');
            if (closeIndex !== -1) {
                const cotContent = html.substring(0, closeIndex).replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                let restContent = html.substring(closeIndex + '</agent_cot>'.length).trim();

                restContent = parseToolCallsToHtml(restContent, !isFinal);

                html = `${detailsTag}<summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Kaiz Agent Thoughts</summary><div class="kaiz-cot-content">${cotContent}</div></details>`;
                if (restContent) {
                    const parsedMarkdown = isFinal ? marked.parse(restContent) : restContent;
                    html += `<div style="margin-top: 8px;" class="kaiz-markdown-body">${parsedMarkdown}</div>`;
                }
            } else if (!isFinal) {
                // Đang stream và chưa thấy thẻ đóng -> do có prefill nên chắc chắn đây là CoT
                const cotContent = html.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                html = `${detailsTag}<summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Kaiz Agent Thoughts</summary><div class="kaiz-cot-content">${cotContent}</div></details>`;
            } else {
                // Message đã load xong không có thẻ đóng (lịch sử cũ hoặc LLM quên đóng thẻ)
                const parsedContent = parseToolCallsToHtml(html.trim(), false);
                html = `<div class="kaiz-markdown-body">${marked.parse(parsedContent)}</div>`;
            }

            return html;
        };

        // Hàm tiện ích format tin nhắn user (đặc biệt là Tool Result)
        const formatUserMessage = (text: string): string => {
            const safeText = text;

            const escapedText = escapeHtml(safeText).replace(/\n/g, '<br>');

            if (safeText.startsWith('[Tool Result')) {
                // ... logic Tool Result ...
                let color = '#a1a1aa'; // default
                let icon = 'fa-wrench';
                if (safeText.includes('CÓ LỖI') || safeText.includes('LỖI (ERROR)')) {
                    color = '#ef4444'; // red
                    icon = 'fa-circle-xmark';
                } else if (safeText.includes('THÀNH CÔNG')) {
                    color = '#4ade80'; // green
                    icon = 'fa-circle-check';
                }

                return `<details class="kaiz-system-result-block" style="border-left: 3px solid ${color};">
<summary class="kaiz-system-summary" style="color: ${color};"><i class="fa-solid ${icon}"></i> System: Tool Result</summary>
<div class="kaiz-system-content" style="font-family: monospace; white-space: pre-wrap; word-break: break-all;">${escapedText}</div>
</details>`;
            }

            return escapedText;
        };

        // Lắng nghe StateManager
        stateManager.onChatsListUpdated = (chats) => {
            renderChatList(chats);
        };

        stateManager.onChatRenamed = (id, newName) => {
            if (id === stateManager.currentChatId) {
                chatTitle.text(newName);
            }
        };

        stateManager.onChatSwitched = (chatId, messages) => {
            history.empty();
            if (messages.length === 0 && chatId === -1) {
                chatTitle.text('Kaiz Agent');
                addWelcomeMessage();
            } else if (messages.length === 0) {
                addWelcomeMessage();
            }

            // Dùng HTML buffer để tránh Reflow/Repaint liên tục
            let htmlBuffer = '';
            for (const msg of messages) {
                const formatted =
                    msg.role === 'agent' ? formatMessage(msg.content, true) : formatUserMessage(msg.content);
                const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);

                const avatar =
                    msg.role === 'user'
                        ? '<i class="fa-solid fa-user"></i>'
                        : msg.role === 'agent'
                          ? '<i class="fa-solid fa-yin-yang"></i>'
                          : '<i class="fa-solid fa-gear"></i>';
                const extraClass = msg.role === 'user' ? 'kaiz-msg-user' : 'kaiz-msg-agent';

                htmlBuffer += `
                    <div class="kaiz-msg ${extraClass}" id="container-${msgId}">
                        <div class="kaiz-msg-avatar">${avatar}</div>
                        <div class="kaiz-msg-content" id="${msgId}">${formatted}</div>
                    </div>
                `;
            }
            if (htmlBuffer) {
                history.append(htmlBuffer);
                history.scrollTop(history[0].scrollHeight);
            }
        };

        const addWelcomeMessage = () => {
            const welcomeHtml = `
            <div class="kaiz-msg kaiz-msg-agent">
                <div class="kaiz-msg-avatar"><i class="fa-solid fa-yin-yang"></i></div>
                <div class="kaiz-msg-content">Xin chào! Tôi là <b>Kaiz Agent</b>. Hãy ra lệnh cho tôi để thao tác với SillyTavern!</div>
            </div>`;
            history.append(welcomeHtml);
        };

        // Hàm tiện ích thêm tin nhắn DOM (không save DB)
        const addMessageToDOM = (
            role: 'user' | 'agent' | 'system',
            htmlContent: string,
            animate: boolean = true,
        ): string => {
            let avatar = '';
            let extraClass = '';
            if (role === 'user') {
                avatar = '<i class="fa-solid fa-user"></i>';
                extraClass = 'kaiz-msg-user';
            } else if (role === 'agent') {
                avatar = '<i class="fa-solid fa-yin-yang"></i>';
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
            if (sendBtn.prop('disabled')) return;
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

            sendBtn.prop('disabled', true);
            sendBtn.find('i').removeClass('fa-paper-plane').addClass('fa-stop');
            sendBtn.prop('disabled', false); // Bật lại ngay để cho phép click Stop
            sendBtn.addClass('kaiz-stop-mode');

            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const maxLoops = extSettings.maxAgentLoops || 5;

            // Lấy toàn bộ lịch sử (hoặc tối đa N tin) từ DB để truyền cho AI
            const historyMsgs = stateManager.currentChatId
                ? await stateManager.db.getMessages(stateManager.currentChatId)
                : [];

            let agentMsgId = '';
            let agentContentBox: any = null;
            let currentStepResponse = '';

            let streamUpdatePending = false;
            let lastStreamEvent: any = null;

            const flushStreamUpdate = () => {
                if (!lastStreamEvent || !agentContentBox) {
                    streamUpdatePending = false;
                    return;
                }
                const event = lastStreamEvent;
                let htmlToRender = event.text ? formatMessage(event.text, false) : '';
                if (event.reasoning && !event.text) {
                    htmlToRender += `<div style="color:#aaa; font-style:italic; font-size:12px; margin-bottom:5px;"><i class="fa-solid fa-brain"></i> Thinking...</div>`;
                }
                if (!htmlToRender) {
                    htmlToRender = `<div class="kaiz-spinner" style="font-size:12px;"><i class="fa-solid fa-circle-notch"></i> Generating...</div>`;
                }
                agentContentBox.html(htmlToRender);
                lastStreamEvent = null;

                // Giải phóng khóa sau khi browser render xong frame này
                requestAnimationFrame(() => {
                    streamUpdatePending = false;
                });
            };

            await loop.run(historyMsgs, maxLoops, async (event) => {
                const btnIcon = $('#kaiz-floating-btn i');
                const btnFloat = $('#kaiz-floating-btn');

                if (event.type === 'step_start') {
                    btnIcon.addClass('kaiz-icon-spin');
                    btnFloat.removeClass('kaiz-btn-blink');
                    agentMsgId = addMessageToDOM(
                        'agent',
                        '<div class="kaiz-spinner"><i class="fa-solid fa-circle-notch"></i> Processing...</div>',
                    );
                    agentContentBox = $(`#${agentMsgId}`);
                    currentStepResponse = '';
                } else if (event.type === 'stream_chunk') {
                    if (!agentContentBox) return;
                    lastStreamEvent = event;
                    if (!streamUpdatePending) {
                        streamUpdatePending = true;
                        requestAnimationFrame(flushStreamUpdate);
                    }
                } else if (event.type === 'step_end') {
                    lastStreamEvent = null;
                    streamUpdatePending = false;
                    if (!agentContentBox) return;
                    agentContentBox.html(formatMessage(event.text || '', true));
                    // Gọi render biểu đồ Mermaid
                    renderMermaid();

                    currentStepResponse = event.text || '';
                    await stateManager.addMessage('agent', currentStepResponse);
                    agentContentBox = null;
                } else if (event.type === 'tool_result') {
                    const formatted = formatUserMessage(event.text || '');
                    addMessageToDOM('user', formatted);
                    await stateManager.addMessage('user', event.text || '');
                } else if (event.type === 'tool_confirm') {
                    btnIcon.removeClass('kaiz-icon-spin');
                    btnFloat.addClass('kaiz-btn-blink');

                    const call = event.data.call;
                    const resolveFn = event.data.resolve;

                    const confirmId = Date.now() + Math.floor(Math.random() * 1000);
                    const html = `
                        <div class="kaiz-safe-mode-pending" style="border-left: 3px solid #f39c12; padding: 10px; background: rgba(243,156,18,0.1); border-radius: 5px;">
                            <div style="color: #f39c12; font-weight: bold; margin-bottom: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> Safe Mode Warning</div>
                            <div style="font-size: 13px;">Agent muốn tự động chạy công cụ: <b style="color:#fff;">${call.name}</b> nhưng công cụ này nằm trong Blacklist. Bạn có cho phép không?</div>
                            <div style="display: flex; gap: 10px; margin-top: 10px;">
                                <button id="kaiz-allow-${confirmId}" style="background: #2ecc71; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-check"></i> Allow</button>
                                <button id="kaiz-deny-${confirmId}" style="background: #e74c3c; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-xmark"></i> Deny</button>
                            </div>
                        </div>
                    `;

                    const domId = addMessageToDOM('agent', html);

                    $(`#kaiz-allow-${confirmId}`).on('click', () => {
                        if (!loop.isRunning) return;
                        $(`#${domId}`).find('.kaiz-safe-mode-pending').removeClass('kaiz-safe-mode-pending');
                        $(`#${domId}`).html(
                            `<div style="color: #2ecc71; font-style: italic;"><i class="fa-solid fa-check"></i> Đã cho phép chạy công cụ: ${call.name}</div>`,
                        );
                        btnIcon.addClass('kaiz-icon-spin');
                        btnFloat.removeClass('kaiz-btn-blink');
                        resolveFn(true);
                    });

                    $(`#kaiz-deny-${confirmId}`).on('click', () => {
                        if (!loop.isRunning) return;
                        $(`#${domId}`).find('.kaiz-safe-mode-pending').removeClass('kaiz-safe-mode-pending');
                        $(`#${domId}`).html(
                            `<div style="color: #e74c3c; font-style: italic;"><i class="fa-solid fa-xmark"></i> Đã từ chối công cụ: ${call.name}</div>`,
                        );
                        btnIcon.removeClass('kaiz-icon-spin');
                        btnFloat.removeClass('kaiz-btn-blink');
                        resolveFn(false);
                    });
                } else if (event.type === 'error') {
                    // Ng\u1eaft stream render ngay l\u1eadp t\u1ee9c \u0111\u1ec3 kh\u00f4ng b\u1ecb \u0111\u00e8 l\u00ean th\u00f4ng b\u00e1o l\u1ed7i
                    lastStreamEvent = null;
                    streamUpdatePending = false;

                    if (agentContentBox) {
                        agentContentBox.append(
                            `<div style="margin-top: 10px; color:#e74c3c; border-left: 3px solid #e74c3c; padding: 10px; background: rgba(231,76,60,0.1); border-radius: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${event.text}</div>`,
                        );
                        agentContentBox = null; // Ng\u0103n b\u1ea5t k\u1ef3 callback n\u00e0o c\u00f2n s\u00f3t ghi \u0111\u00e8
                    } else {
                        addMessageToDOM(
                            'agent',
                            `<div style="color:#e74c3c; border-left: 3px solid #e74c3c; padding: 10px; background: rgba(231,76,60,0.1); border-radius: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${event.text}</div>`,
                        );
                    }
                    await stateManager.addMessage('agent', `[Error] ${event.text}`);
                } else if (event.type === 'debug') {
                    lastLogSent = JSON.stringify(event.data.messages, null, 2);
                    lastLogRecv = event.data.responseText;
                }
            });

            // Dọn dẹp tất cả các hộp thoại safe mode bị treo (do abort hoặc lỗi)
            $('.kaiz-safe-mode-pending').each(function (this: any) {
                $(this).html(
                    `<div style="color: #95a5a6; font-style: italic;"><i class="fa-solid fa-ban"></i> Đã hủy xác nhận công cụ (Tiến trình bị ngắt).</div>`,
                );
                $(this).removeClass('kaiz-safe-mode-pending');
            });

            $('#kaiz-floating-btn i').removeClass('kaiz-icon-spin');
            $('#kaiz-floating-btn').removeClass('kaiz-btn-blink');

            if (!sendBtn.hasClass('kaiz-force-aborted')) {
                sendBtn.find('i').removeClass('fa-stop').addClass('fa-paper-plane');
            }
            sendBtn.removeClass('kaiz-stop-mode');
            sendBtn.prop('disabled', false);
            input.focus();
        };

        let forceAbortTimer: any = null;

        sendBtn.on('mousedown touchstart', (e: any) => {
            if (!sendBtn.hasClass('kaiz-stop-mode')) return;
            e.preventDefault();

            // Nhấn ngắn → gọi abort thường (chờ bước hiện tại xong)
            // Giữ 1s → force abort (dừng ngay lập tức)
            forceAbortTimer = setTimeout(() => {
                forceAbortTimer = null;
                sendBtn.addClass('kaiz-force-aborted');
                loop.forceAbort();
                // UI feedback
                sendBtn.find('i').removeClass('fa-stop fa-paper-plane').addClass('fa-skull');
                setTimeout(() => {
                    sendBtn.find('i').removeClass('fa-skull').addClass('fa-paper-plane');
                    sendBtn.removeClass('kaiz-force-aborted');
                }, 1500);
            }, 1000);
        });

        sendBtn.on('mouseup mouseleave touchend touchcancel', () => {
            if (forceAbortTimer) {
                clearTimeout(forceAbortTimer);
                forceAbortTimer = null;
                // Nhả sớm → abort thường
                if (sendBtn.hasClass('kaiz-stop-mode')) {
                    loop.abort();
                }
            }
        });

        sendBtn.on('click', () => {
            if (sendBtn.hasClass('kaiz-stop-mode')) {
                // Không làm gì thêm, mousedown/mouseup đã xử lý
                return;
            }
            sendMessage();
        });
        input.on('keydown', (e: any) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}
