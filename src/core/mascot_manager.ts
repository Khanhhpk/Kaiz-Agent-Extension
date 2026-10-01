/**
 * Virtual Assistance Pet (Crystal Slime Mascot) Manager
 * Central coordinator linking AgentLoop, AutoTasks, Idle/Sleep timers, and the MascotWidget UI.
 */

import { PetState, PetConfig, DEFAULT_PET_CONFIG, PET_QUOTES } from './mascot_constants';
import { MascotWidget } from '../ui/mascot_widget';
import { AgentLoop, AgentEvent } from './loop';
import { AutoTaskScheduler } from './auto_task_scheduler';

declare const SillyTavern: any;
declare const jQuery: any;

export class MascotManager {
    private static instance: MascotManager | null = null;
    private widget: MascotWidget | null = null;
    private extPath = '';
    private config: PetConfig = { ...DEFAULT_PET_CONFIG };
    private idleTimer: any = null;
    private readonly idleTimeoutMs = 180000; // 3 minutes idle -> sleep
    private isActionRunning = false;
    private loopUnsubscribe: (() => void) | null = null;

    private constructor() {}

    public static getInstance(): MascotManager {
        if (!MascotManager.instance) {
            MascotManager.instance = new MascotManager();
        }
        return MascotManager.instance;
    }

    public init(extPath: string, loop?: AgentLoop, _scheduler?: AutoTaskScheduler): void {
        this.extPath = extPath;

        // 1. Load saved config from SillyTavern context
        const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        if (ctx && ctx.extensionSettings?.kaiz_agent) {
            const saved = ctx.extensionSettings.kaiz_agent.petConfig;
            if (saved && typeof saved === 'object') {
                this.config = { ...DEFAULT_PET_CONFIG, ...saved };
            } else {
                ctx.extensionSettings.kaiz_agent.petConfig = { ...this.config };
            }
        }

        // 2. Initialize Widget
        this.widget = new MascotWidget(
            this.extPath,
            this.config,
            () => this.handlePoke(),
            () => this.handleDoubleClick(),
        );
        this.widget.init();

        // 3. Connect to AgentLoop if provided
        if (loop) {
            this.connectLoop(loop);
        }

        // 4. Start idle timer for sleep state
        this.startIdleTimer();

        console.log('[KaizAgent] Virtual Assistance Pet (Crystal Slime Mascot) initialized.');
    }

    private connectLoop(loop: AgentLoop): void {
        if (this.loopUnsubscribe) {
            this.loopUnsubscribe();
            this.loopUnsubscribe = null;
        }

        this.loopUnsubscribe = loop.subscribe((event: AgentEvent) => {
            if (!this.config.enabled) return;

            switch (event.type) {
                case 'think_start':
                    this.isActionRunning = true;
                    this.resetIdleTimer();
                    this.setState('thinking', this.getRandomQuote('thinking'));
                    break;

                case 'step_start':
                    this.isActionRunning = true;
                    this.resetIdleTimer();
                    if (this.widget?.getState() !== 'working') {
                        this.setState('thinking', this.getRandomQuote('thinking'));
                    }
                    break;

                case 'tool_call': {
                    this.isActionRunning = true;
                    this.resetIdleTimer();
                    const toolName = event.data?.name || 'Công cụ';
                    this.setState('working', `Đang dùng: ${toolName}... ⚡`);
                    break;
                }

                case 'retry':
                    this.resetIdleTimer();
                    this.setState('error', 'Đang thử lại kết nối... 🔄', 3500);
                    break;

                case 'error':
                    this.isActionRunning = false;
                    this.resetIdleTimer();
                    this.setState('error', 'Ối, có lỗi xảy ra rồi... 💦', 5000);
                    break;

                case 'step_end':
                    if (event.isFinal) {
                        this.isActionRunning = false;
                        this.resetIdleTimer();
                        this.setState('success', this.getRandomQuote('success'), 4500);
                    }
                    break;
            }
        });
    }

    public setState(state: PetState, quote?: string, durationMs?: number): void {
        if (!this.widget) return;
        this.widget.setState(state, quote, durationMs);
    }

    public getState(): PetState {
        return this.widget ? this.widget.getState() : 'idle';
    }

    public showBubble(text: string, durationMs?: number): void {
        this.widget?.showBubble(text, durationMs);
    }

    public hideBubble(): void {
        this.widget?.hideBubble();
    }

    public getConfig(): PetConfig {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<PetConfig>): void {
        this.config = { ...this.config, ...newConfig };

        // Save to SillyTavern settings
        try {
            const ctx = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
            if (ctx && ctx.extensionSettings?.kaiz_agent) {
                ctx.extensionSettings.kaiz_agent.petConfig = { ...this.config };
                if (typeof ctx.saveSettingsDebounced === 'function') {
                    ctx.saveSettingsDebounced();
                }
            }
        } catch (e) {
            console.warn('[KaizAgent] Failed to save petConfig:', e);
        }

        // Apply to widget
        this.widget?.applyConfig(this.config);

        if (!this.config.enabled) {
            this.clearIdleTimer();
        } else {
            this.resetIdleTimer();
        }
    }

    public resetPosition(): void {
        this.widget?.resetPosition();
    }

    public poke(): void {
        this.widget?.poke();
        this.handlePoke();
    }

    private handlePoke(): void {
        if (!this.config.enabled) return;

        // If currently sleeping, wake up joyfully!
        if (this.widget?.getState() === 'sleeping') {
            this.setState('idle', 'Oáp... Bé thức dậy rồi nè! ✨', 3500);
        }
        this.resetIdleTimer();
    }

    private handleDoubleClick(): void {
        if (typeof jQuery !== 'undefined') {
            // Trigger Kaiz floating button to toggle chat window
            jQuery('#kaiz-floating-btn').trigger('click');
        }
    }

    private getRandomQuote(state: PetState): string {
        const quotes = PET_QUOTES[state] || PET_QUOTES.idle;
        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    private startIdleTimer(): void {
        this.clearIdleTimer();
        if (!this.config.enabled) return;

        this.idleTimer = setTimeout(() => {
            if (!this.isActionRunning && this.widget?.getState() === 'idle') {
                this.setState('sleeping', this.getRandomQuote('sleeping'));
            }
        }, this.idleTimeoutMs);
    }

    private resetIdleTimer(): void {
        this.startIdleTimer();
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    public destroy(): void {
        this.clearIdleTimer();
        if (this.loopUnsubscribe) {
            this.loopUnsubscribe();
            this.loopUnsubscribe = null;
        }
        if (this.widget) {
            this.widget.destroy();
            this.widget = null;
        }
    }
}
