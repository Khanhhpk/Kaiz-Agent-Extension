import { AutoTask } from './db';
import { AgentLoop, AgentEvent } from './loop';
import { StateManager } from './state';
import { ChatWindowUI } from '../ui/chat_window';

export class AutoTaskScheduler {
    private tasks: AutoTask[] = [];
    private timers: Map<number, number> = new Map();
    private eventSourceListener: any = null;
    private chatChangedListener: any = null;
    private messageCount: number = 0;
    
    constructor(
        private agentLoop: AgentLoop,
        private stateManager: StateManager
    ) {}

    public async start(tasks: AutoTask[]) {
        this.stop();
        this.tasks = tasks.filter(t => t.enabled);
        
        console.log(`[AutoTaskScheduler] Starting with ${this.tasks.length} active tasks.`);

        // 1. Setup Time-based triggers
        for (const task of this.tasks) {
            if (task.triggerMode === 'time' && task.triggerValue > 0) {
                const intervalId = window.setInterval(() => {
                    this.executeTask(task);
                }, task.triggerValue * 1000);
                this.timers.set(task.id!, intervalId);
            }
        }

        // 2. Setup Turn-based triggers
        const hasTurnTasks = this.tasks.some(t => t.triggerMode === 'turn');
        if (hasTurnTasks) {
            try {
                // SillyTavern global eventSource
                const ctx = (window as any).SillyTavern?.getContext?.();
                if (ctx?.eventSource) {
                    const renderEvent = ctx.eventTypes?.GENERATION_ENDED || 'generation_ended';
                    this.eventSourceListener = () => this.handleMessageReceived();
                    ctx.eventSource.on(renderEvent, this.eventSourceListener);
                    
                    const chatChangedEvent = ctx.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
                    this.chatChangedListener = () => {
                        this.messageCount = 0;
                        console.log('[AutoTaskScheduler] Chat changed. Reset messageCount to 0.');
                    };
                    ctx.eventSource.on(chatChangedEvent, this.chatChangedListener);

                    console.log(`[AutoTaskScheduler] Hooked to ST ${renderEvent} and ${chatChangedEvent} events.`);
                }
            } catch (e) {
                console.warn('[AutoTaskScheduler] Failed to hook into ST eventSource:', e);
            }
        }
    }

    public stop() {
        for (const [taskId, intervalId] of this.timers.entries()) {
            clearInterval(intervalId);
        }
        this.timers.clear();

        if (this.eventSourceListener) {
            try {
                const ctx = (window as any).SillyTavern?.getContext?.();
                if (ctx?.eventSource) {
                    const removeFn = ctx.eventSource.removeListener ? ctx.eventSource.removeListener.bind(ctx.eventSource) : ctx.eventSource.off.bind(ctx.eventSource);
                    const renderEvent = ctx.eventTypes?.GENERATION_ENDED || 'generation_ended';
                    removeFn(renderEvent, this.eventSourceListener);
                    
                    if (this.chatChangedListener) {
                        const chatChangedEvent = ctx.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
                        removeFn(chatChangedEvent, this.chatChangedListener);
                    }
                }
            } catch (e) {
                console.error('[AutoTaskScheduler] Error removing ST event listener:', e);
            }
            this.eventSourceListener = null;
            this.chatChangedListener = null;
        }
        this.messageCount = 0;
    }

    private async handleMessageReceived() {
        this.messageCount++;
        
        const turnTasks = this.tasks.filter(t => t.triggerMode === 'turn');
        for (const task of turnTasks) {
            if (task.triggerValue > 0 && this.messageCount % task.triggerValue === 0) {
                this.executeTask(task);
            }
        }
    }

    public async addTask(task: AutoTask) {
        // Cập nhật lại toàn bộ list từ DB
        const allTasks = await this.stateManager.db.getAllAutoTasks();
        await this.start(allTasks);
    }

    public async removeTask(taskId: number) {
        const allTasks = await this.stateManager.db.getAllAutoTasks();
        await this.start(allTasks);
    }

    private async executeTask(task: AutoTask) {
        if (!task.id) return;
        console.log(`[AutoTaskScheduler] Attempting to execute task ${task.id}: "${task.name}"`);

        // Queue check: wait if agent is running
        let attempts = 0;
        while (this.agentLoop.isRunning && attempts < 120) { // Max 60 seconds (500ms * 120)
            await new Promise(r => setTimeout(r, 500));
            attempts++;
        }

        if (this.agentLoop.isRunning) {
            console.warn(`[AutoTaskScheduler] Skipped task ${task.id} execution because Agent is busy for too long.`);
            return;
        }

        // Setup History for the run
        let historyForRun: any[] = [];
        
        if (task.executionMode === 'persist') {
            if (!task.chatId) {
                // Lần đầu chạy persist -> Tạo chat mới riêng cho auto task này (sử dụng -1 để ẩn khỏi danh sách chat mặc định)
                const chatId = await this.stateManager.db.createChat(`[Auto] ${task.name}`, -1);
                task.chatId = chatId;
                await this.stateManager.db.updateAutoTask(task.id!, { chatId });
                console.log(`[AutoTaskScheduler] Created distinct chat history (ID: ${chatId}) for task ${task.id}`);
            }
            
            // Load history của task
            const messages = await this.stateManager.db.getMessages(task.chatId);
            historyForRun = messages.map(m => ({ role: m.role, content: m.content }));
        } else {
            // mode = 'fresh'
            historyForRun = [];
        }

        // Add prompt as user message
        historyForRun.push({ role: 'user', content: task.prompt });

        // Run agent
        try {
            console.log(`[AutoTaskScheduler] Running AgentLoop for task ${task.id}`);
            let finalResult = '';
            // Save prompt before run if persist
            if (task.executionMode === 'persist' && task.chatId) {
                await this.stateManager.db.addMessage(task.chatId, 'user', task.prompt);
            }
            
            let turnRequests = 0;

            await this.agentLoop.run(
                historyForRun,
                15, // max steps
                async (event: AgentEvent) => {
                    // Update Floating UI Icon & Request Logs
                    if (event.type === 'step_start') {
                        turnRequests++;
                        (window as any).jQuery?.('#kaiz-floating-btn i').addClass('kaiz-icon-spin');
                        (window as any).jQuery?.('#kaiz-floating-btn').removeClass('kaiz-btn-blink');
                    } else if (event.type === 'debug') {
                        ChatWindowUI.lastLogSent = JSON.stringify(event.data.messages, null, 2);
                        ChatWindowUI.lastLogRecv = event.data.responseText;
                        
                        // Update logs real-time if the modal happens to be open
                        (window as any).jQuery?.('#kaiz-log-sent').text(ChatWindowUI.lastLogSent);
                        (window as any).jQuery?.('#kaiz-log-recv').text(ChatWindowUI.lastLogRecv);
                    } else if (event.type === 'tool_confirm') {
                        // Auto-allow cho Auto Task để không bị kẹt tiến trình
                        console.log(`[AutoTaskScheduler] Auto-allowing tool ${event.data?.call?.name} (Safe Mode bypassed)`);
                        event.data?.resolve?.(true);
                    }

                    // Save to DB on the fly if persist
                    if (task.executionMode === 'persist' && task.chatId) {
                        if (event.type === 'step_end') {
                            await this.stateManager.db.addMessage(task.chatId, 'agent', event.text || '');
                        } else if (event.type === 'tool_result') {
                            await this.stateManager.db.addMessage(task.chatId, 'user', event.text || '');
                        }
                    }
                },
                false, // continueMode
                task.toolsConfig // toolsConfigOverride
            );
            
            // Stop UI spinning
            (window as any).jQuery?.('#kaiz-floating-btn i').removeClass('kaiz-icon-spin');
            (window as any).jQuery?.('#kaiz-floating-btn').removeClass('kaiz-btn-blink');

            // Final result isn't needed here anymore since we saved in stream

            // Expiry logic
            task.runCount = (task.runCount || 0) + 1;
            task.lastTurnRequests = turnRequests;
            task.totalRequests = (task.totalRequests || 0) + turnRequests;
            
            const updates: Partial<AutoTask> = { 
                runCount: task.runCount,
                lastTurnRequests: task.lastTurnRequests,
                totalRequests: task.totalRequests
            };
            
            if (task.maxRuns > 0 && task.runCount >= task.maxRuns) {
                updates.enabled = false;
                console.log(`[AutoTaskScheduler] Task ${task.id} has reached maxRuns (${task.maxRuns}). Disabling.`);
            }

            await this.stateManager.db.updateAutoTask(task.id, updates);
            
            // Update local memory and restart if enabled state changed
            if (updates.enabled === false) {
                const allTasks = await this.stateManager.db.getAllAutoTasks();
                await this.start(allTasks);
            }
            
        } catch (e) {
            console.error(`[AutoTaskScheduler] Error executing task ${task.id}:`, e);
        }
    }
}
