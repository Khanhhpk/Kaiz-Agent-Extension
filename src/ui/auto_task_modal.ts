import { StateManager } from '../core/state';
import { AutoTaskScheduler } from '../core/auto_task_scheduler';
import { AutoTask } from '../core/db';
import { ToolRegistry } from '../core/tool_registry';

declare const $: any;
declare const toastr: any;

export class AutoTaskModal {
    private stateManager: StateManager;
    private scheduler: AutoTaskScheduler;
    private toolRegistry: ToolRegistry;

    // DOM Elements
    private modal: HTMLDialogElement;
    private listContainer: any;
    private addBtn: any;
    private closeBtn: any;
    private formContainer: any;
    private formSaveBtn: any;
    private formCancelBtn: any;
    private toolsListContainer: any;
    private currentToolsConfig: Record<string, boolean> = {};

    // History Modal
    private historyModal: HTMLDialogElement;
    private historyContent: any;

    constructor(stateManager: StateManager, scheduler: AutoTaskScheduler, toolRegistry: ToolRegistry) {
        this.stateManager = stateManager;
        this.scheduler = scheduler;
        this.toolRegistry = toolRegistry;

        this.modal = $('#kaiz-auto-task-modal')[0] as HTMLDialogElement;
        this.listContainer = $('#kaiz-auto-task-list');
        this.addBtn = $('#kaiz-auto-task-add-btn');
        this.closeBtn = $('#kaiz-auto-task-close');
        this.formContainer = $('#kaiz-auto-task-form-container');
        this.formSaveBtn = $('#kaiz-auto-task-save-btn');
        this.formCancelBtn = $('#kaiz-auto-task-cancel-btn');
        this.toolsListContainer = $('#kaiz-auto-task-tools-list');

        this.historyModal = $('#kaiz-auto-task-history-modal')[0] as HTMLDialogElement;
        this.historyContent = $('#kaiz-auto-task-history-content');

        this.initEvents();
    }

    private initEvents() {
        $('#kaiz-auto-task-btn').on('click', () => {
            this.show();
        });

        this.closeBtn.on('click', () => {
            this.modal.close();
        });

        this.addBtn.on('click', () => {
            this.showForm();
        });

        this.formCancelBtn.on('click', () => {
            this.hideForm();
        });

        this.formSaveBtn.on('click', async () => {
            await this.saveTask();
        });

        $('#kaiz-auto-task-history-close').on('click', () => {
            this.historyModal.style.display = 'none';
            this.historyModal.close();
        });

        $('#kaiz-auto-task-trigger-mode').on('change', function(this: any) {
            const mode = $(this).val();
            if (mode === 'turn') {
                $('#kaiz-auto-task-trigger-label').text('Giá trị (lượt):');
            } else {
                $('#kaiz-auto-task-trigger-label').text('Giá trị (giây):');
            }
        });
    }

    public async show() {
        await this.renderList();
        this.hideForm();
        if (!this.modal.open) {
            this.modal.showModal();
        }
    }

    private async renderList() {
        const tasks = await this.stateManager.db.getAllAutoTasks();
        this.listContainer.empty();

        if (tasks.length === 0) {
            this.listContainer.append('<div style="color:#aaa; font-size:12px; text-align:center; padding:10px;">Chưa có Auto Task nào. Nhấn "Tạo Task mới" để thêm.</div>');
            return;
        }

        tasks.forEach(task => {
            const isTurn = task.triggerMode === 'turn';
            const triggerText = isTurn ? `${task.triggerValue} lượt` : `${task.triggerValue} giây`;
            const icon = isTurn ? 'fa-message' : 'fa-clock';
            const runsText = task.maxRuns > 0 ? `${task.runCount || 0}/${task.maxRuns}` : `${task.runCount || 0}/∞`;
            
            const item = $(`
                <div style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0; padding-right: 10px;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(task.name)}</div>
                        <div style="font-size: 11px; color: #aaa; margin-bottom: 2px;">
                            <i class="fa-solid ${icon}"></i> ${triggerText} &nbsp;|&nbsp; 
                            <i class="fa-solid fa-bolt"></i> ${runsText}
                        </div>
                        <div style="font-size: 11px; color: #aaa;">
                            <i class="fa-solid ${task.executionMode === 'persist' ? 'fa-database' : 'fa-leaf'}"></i> ${task.executionMode === 'persist' ? 'Persist' : 'Fresh'}
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button class="kaiz-auto-task-toggle menu_button interactable" data-id="${task.id}" style="padding: 4px 8px; font-size: 12px; color: ${task.enabled ? '#2ecc71' : '#aaa'};" title="${task.enabled ? 'Đang chạy' : 'Đã dừng'}">
                            <i class="fa-solid ${task.enabled ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        ${task.executionMode === 'persist' ? `
                        <button class="kaiz-auto-task-history menu_button interactable" data-id="${task.id}" style="padding: 4px 8px; font-size: 12px; color: #3498db;" title="Xem History">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="kaiz-auto-task-reset menu_button interactable" data-id="${task.id}" style="padding: 4px 8px; font-size: 12px; color: #9b59b6;" title="Xóa lịch sử (Reset)">
                            <i class="fa-solid fa-eraser"></i>
                        </button>
                        ` : ''}
                        <button class="kaiz-auto-task-edit menu_button interactable" data-id="${task.id}" style="padding: 4px 8px; font-size: 12px; color: #f39c12;" title="Sửa">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="kaiz-auto-task-delete menu_button interactable" data-id="${task.id}" style="padding: 4px 8px; font-size: 12px; color: #e74c3c;" title="Xóa">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `);

            // Toggle Events
            item.find('.kaiz-auto-task-toggle').on('click', async () => {
                await this.stateManager.db.updateAutoTask(task.id!, { enabled: !task.enabled });
                const updatedTask = (await this.stateManager.db.getAllAutoTasks()).find(t => t.id === task.id);
                if (updatedTask) {
                    if (updatedTask.enabled) {
                        await this.scheduler.addTask(updatedTask);
                    } else {
                        await this.scheduler.removeTask(updatedTask.id!);
                    }
                }
                this.renderList();
            });

            // Delete
            item.find('.kaiz-auto-task-delete').on('click', async () => {
                if (confirm(`Bạn có chắc chắn muốn xóa task "${task.name}"?`)) {
                    await this.stateManager.db.deleteAutoTask(task.id!);
                    if (task.chatId) {
                        await this.stateManager.db.deleteChat(task.chatId);
                    }
                    await this.scheduler.removeTask(task.id!);
                    this.renderList();
                }
            });

            // Edit
            item.find('.kaiz-auto-task-edit').on('click', () => {
                this.showForm(task);
            });

            // History
            item.find('.kaiz-auto-task-history').on('click', () => {
                this.showHistory(task);
            });

            // Reset
            item.find('.kaiz-auto-task-reset').on('click', async () => {
                if (confirm(`Bạn có chắc chắn muốn xóa toàn bộ lịch sử (Reset) của task "${task.name}"?`)) {
                    if (task.chatId) {
                        await this.stateManager.db.clearMessages(task.chatId);
                        toastr.success(`Đã xóa lịch sử của task ${task.name}`);
                    }
                }
            });

            this.listContainer.append(item);
        });
    }

    private showForm(task?: AutoTask) {
        this.addBtn.hide();
        this.listContainer.hide();
        this.formContainer.show();

        if (task) {
            $('#kaiz-auto-task-id').val(task.id!.toString());
            $('#kaiz-auto-task-name').val(task.name);
            $('#kaiz-auto-task-prompt').val(task.prompt);
            $('#kaiz-auto-task-trigger-mode').val(task.triggerMode);
            $('#kaiz-auto-task-trigger-value').val(task.triggerValue);
            $('#kaiz-auto-task-max-runs').val(task.maxRuns);
            $('#kaiz-auto-task-exec-mode').val(task.executionMode);
            this.currentToolsConfig = { ...(task.toolsConfig || {}) };
        } else {
            $('#kaiz-auto-task-id').val('');
            $('#kaiz-auto-task-name').val('');
            $('#kaiz-auto-task-prompt').val('');
            $('#kaiz-auto-task-trigger-mode').val('time');
            $('#kaiz-auto-task-trigger-value').val(30);
            $('#kaiz-auto-task-max-runs').val(0);
            $('#kaiz-auto-task-exec-mode').val('fresh');
            this.currentToolsConfig = {};
        }

        this.renderToolsUI();
        $('#kaiz-auto-task-trigger-mode').trigger('change');
    }

    private hideForm() {
        this.formContainer.hide();
        this.listContainer.show();
        this.addBtn.show();
    }

    private renderToolsUI() {
        const allSchemas = this.toolRegistry.getAllSchemas();
        this.toolsListContainer.empty();

        const chipsContainer = $('<div style="display:flex; flex-wrap:wrap; gap:5px; min-height:28px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.07);"></div>');
        const searchInput = $(`<input type="text" class="text_pole" placeholder="Tìm tool theo tên..." style="width:100%; box-sizing:border-box; padding:5px; margin-bottom:5px;">`);
        const resultList = $(`<div style="max-height:100px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:4px; background:rgba(0,0,0,0.2);"></div>`);

        this.toolsListContainer.append(chipsContainer, searchInput, resultList);

        const refreshChips = () => {
            chipsContainer.empty();
            const enabled = allSchemas.filter(s => this.currentToolsConfig[s.name] === true);
            if (enabled.length === 0) {
                chipsContainer.append('<span style="color:#666; font-size:12px; line-height:28px;">Chưa có tool nào được thêm.</span>');
                return;
            }
            enabled.forEach(schema => {
                const chip = $(`
                    <span style="
                        display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
                        background:rgba(0,201,255,0.15); border:1px solid rgba(0,201,255,0.3);
                        border-radius:12px; font-size:12px; color:#00c9ff; cursor:default;
                    ">
                        ${this.escapeHtml(schema.name)}
                        <i class="fa-solid fa-xmark kaiz-ws-tool-remove" data-tool="${this.escapeHtml(schema.name)}" style="cursor:pointer; opacity:0.7;"></i>
                    </span>
                `);
                chip.find('.kaiz-ws-tool-remove').on('click', () => {
                    delete this.currentToolsConfig[schema.name];
                    refreshChips();
                    refreshResults(String(searchInput.val() || ''));
                });
                chipsContainer.append(chip);
            });
        };

        const refreshResults = (query: string) => {
            resultList.empty();
            const available = allSchemas.filter(s => this.currentToolsConfig[s.name] !== true);
            const q = query.trim().toLowerCase();
            const matches = q ? available.filter(s => s.name.toLowerCase().includes(q)) : available;

            if (matches.length === 0) {
                resultList.append('<div style="padding:8px; color:#666; font-size:12px; text-align:center;">Không tìm thấy tool nào.</div>');
                return;
            }
            matches.forEach(schema => {
                const item = $(`
                    <div style="padding:6px 10px; cursor:pointer; font-size:13px; color:#ddd; border-bottom:1px solid rgba(255,255,255,0.04);">
                        <span style="color:#fff; font-weight:500;">${this.escapeHtml(schema.name)}</span>
                    </div>
                `);
                item.on('mouseenter', () => item.css('background', 'rgba(255,255,255,0.07)'));
                item.on('mouseleave', () => item.css('background', ''));
                item.on('click', () => {
                    this.currentToolsConfig[schema.name] = true;
                    refreshChips();
                    refreshResults(String(searchInput.val() || ''));
                });
                resultList.append(item);
            });
        };

        searchInput.on('input', function(this: any) {
            refreshResults(String($(this).val() || ''));
        });

        refreshChips();
        refreshResults('');
    }

    private async saveTask() {
        const idVal = $('#kaiz-auto-task-id').val() as string;
        const name = ($('#kaiz-auto-task-name').val() as string).trim();
        const prompt = ($('#kaiz-auto-task-prompt').val() as string).trim();
        const triggerMode = $('#kaiz-auto-task-trigger-mode').val() as 'time' | 'turn';
        const triggerValue = parseInt($('#kaiz-auto-task-trigger-value').val() as string, 10);
        const maxRuns = parseInt($('#kaiz-auto-task-max-runs').val() as string, 10);
        const executionMode = $('#kaiz-auto-task-exec-mode').val() as 'fresh' | 'persist';

        if (!name || !prompt || isNaN(triggerValue) || triggerValue <= 0) {
            alert('Vui lòng điền đầy đủ và đúng định dạng các trường bắt buộc!');
            return;
        }

        const taskData: Omit<AutoTask, 'id'> = {
            name,
            prompt,
            triggerMode,
            triggerValue,
            maxRuns: isNaN(maxRuns) ? 0 : maxRuns,
            executionMode,
            toolsConfig: this.currentToolsConfig,
            enabled: true,
            runCount: 0, // Reset runCount when editing/creating
            createdAt: Date.now() // Will be overwritten if editing
        };

        if (idVal) {
            const id = parseInt(idVal, 10);
            const { createdAt, ...updateData } = taskData;
            await this.stateManager.db.updateAutoTask(id, updateData);
        } else {
            await this.stateManager.db.createAutoTask(taskData);
        }

        // Cập nhật lại scheduler
        const allTasks = await this.stateManager.db.getAllAutoTasks();
        await this.scheduler.start(allTasks);

        this.hideForm();
        this.renderList();
    }

    private async showHistory(task: AutoTask) {
        if (!task.chatId) return;

        $('#kaiz-auto-task-history-title').text(task.name);
        this.historyContent.empty();

        const messages = await this.stateManager.db.getMessages(task.chatId);
        if (messages.length === 0) {
            this.historyContent.append('<div style="text-align: center; color: #aaa; margin-top: 20px;">Lịch sử trống.</div>');
        } else {
            const parseToolCallsToHtml = (contentToParse: string): string => {
                const toolCalls: string[] = [];
                let result = contentToParse.replace(
                    /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g,
                    (match, name, content) => {
                        const cleanContent = content.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
                        const toolHtml = `<details class="kaiz-tool-call-block"><summary class="kaiz-tool-summary"><i class="fa-solid fa-bolt"></i> Tool Call: ${this.escapeHtml(name)}</summary><div class="kaiz-tool-content">${cleanContent}</div></details>`;
                        toolCalls.push(toolHtml);
                        return `__TOOL_CALL_${toolCalls.length - 1}__`;
                    },
                );
                for (let i = 0; i < toolCalls.length; i++) {
                    result = result.replace(`__TOOL_CALL_${i}__`, toolCalls[i]);
                }
                return result;
            };

            const formatUserMessage = (text: string): string => {
                const safeText = text || '';
                const escapedText = this.escapeHtml(safeText).replace(/\n/g, '<br>');
                let finalHtml = escapedText;

                if (safeText.startsWith('[Tool Result')) {
                    let color = '#a1a1aa';
                    let icon = 'fa-wrench';
                    const firstLine = safeText.split('\n')[0];

                    if (firstLine.includes('CÓ LỖI') || firstLine.includes('LỖI (ERROR)')) {
                        color = '#ef4444';
                        icon = 'fa-circle-xmark';
                    } else if (firstLine.includes('THÀNH CÔNG')) {
                        color = '#4ade80';
                        icon = 'fa-circle-check';
                    }

                    finalHtml = `<details class="kaiz-system-result-block" style="border-left: 3px solid ${color};">
<summary class="kaiz-system-summary" style="color: ${color};"><i class="fa-solid ${icon}"></i> System: Tool Result</summary>
<div class="kaiz-system-content" style="font-family: monospace; white-space: pre-wrap; word-break: break-all;">${escapedText}</div>
</details>`;
                }
                return finalHtml;
            };

            messages.forEach(msg => {
                const isUser = msg.role === 'user';
                const name = isUser ? 'Prompt' : 'Agent';
                
                let textContent = '';
                if (typeof msg.content === 'string') {
                    textContent = msg.content;
                } else if (Array.isArray(msg.content)) {
                    textContent = (msg.content as any[]).map((p: any) => p.type === 'text' ? p.text : '[Image/Attachment]').join('\n');
                } else {
                    textContent = String(msg.content);
                }
                
                let formatted = '';
                if (isUser) {
                    formatted = formatUserMessage(textContent);
                } else {
                    const closeIndex = textContent.indexOf('</agent_cot>');
                    if (closeIndex !== -1) {
                        const cotContent = this.escapeHtml(textContent.substring(0, closeIndex).replace('<agent_cot>', '').trim());
                        let restContent = textContent.substring(closeIndex + '</agent_cot>'.length).trim();
                        restContent = parseToolCallsToHtml(restContent);
                        
                        formatted += `<details class="kaiz-cot-block">
                            <summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Agent Thoughts</summary>
                            <div class="kaiz-cot-content">${cotContent}</div>
                        </details>`;
                        if (restContent) {
                            const parsedMarkdown = (window as any).marked ? (window as any).marked.parse(restContent) : restContent;
                            formatted += `<div style="margin-top: 8px;" class="kaiz-markdown-body">${parsedMarkdown}</div>`;
                        }
                    } else {
                        const parsedContent = parseToolCallsToHtml(textContent.trim());
                        formatted = `<div class="kaiz-markdown-body">${(window as any).marked ? (window as any).marked.parse(parsedContent) : parsedContent}</div>`;
                    }
                }

                const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);
                const avatar = isUser ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-yin-yang"></i>';
                const extraClass = isUser ? 'kaiz-msg-user' : 'kaiz-msg-agent';

                const msgHtml = `
                    <div class="kaiz-msg ${extraClass}" id="container-${msgId}" style="margin-bottom: 15px; background: transparent; padding: 0; border: none;">
                        <div class="kaiz-msg-avatar">
                            ${avatar}
                        </div>
                        <div class="kaiz-msg-content">
                            <div class="kaiz-msg-sender">${name}</div>
                            <div class="kaiz-msg-text" id="${msgId}">${formatted}</div>
                        </div>
                    </div>
                `;
                this.historyContent.append(msgHtml);
            });
        }

        this.historyModal.style.display = 'flex';
        this.historyModal.showModal();
        // Scroll to bottom
        setTimeout(() => {
            this.historyContent.scrollTop(this.historyContent[0].scrollHeight);
        }, 50);
    }

    private escapeHtml(unsafe: string): string {
        return (unsafe || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
