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
    private readonly idleTimeoutMs = 180000; // 3 minutes idle -> sleep (when roaming is disabled)
    private roamTimer: any = null;
    private wakeTimer: any = null;
    private resizeDebounceTimer: any = null;
    private debuggerTimer: any = null;
    private isActionRunning = false;
    private consecutiveRoams = 0;
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

        // 4. Start autonomous roaming or idle timer
        if (this.config.roamingEnabled) {
            this.startRoamingLoop();
        } else {
            this.startIdleTimer();
        }

        // 5. Listen to window resize to intelligently keep pet within visible viewport
        window.addEventListener('resize', this.handleWindowResize);

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
                case 'step_start':
                    this.isActionRunning = true;
                    this.stopRoaming();
                    this.resetIdleTimer();
                    this.setState('thinking', this.getRandomQuote('thinking'));
                    break;

                case 'tool_call': {
                    this.isActionRunning = true;
                    this.stopRoaming();
                    this.resetIdleTimer();
                    const toolName = event.data?.name || 'Công cụ';
                    this.setState('working', `Đang dùng: ${toolName}... ⚡`);
                    break;
                }

                case 'tool_result':
                    this.isActionRunning = true;
                    this.stopRoaming();
                    this.resetIdleTimer();
                    this.setState('thinking', 'Đang đọc và phân tích kết quả công cụ... 💭');
                    break;

                case 'retry':
                    this.stopRoaming();
                    this.resetIdleTimer();
                    this.setState('error', 'Đang thử lại kết nối... 🔄', 3500);
                    break;

                case 'error':
                    this.isActionRunning = false;
                    this.stopRoaming();
                    this.resetIdleTimer();
                    this.setState('error', 'Ối, có lỗi xảy ra rồi... 💦', 5000);
                    setTimeout(() => {
                        if (!this.isActionRunning && this.widget?.getState() === 'idle') {
                            if (this.config.roamingEnabled) {
                                this.startRoamingLoop();
                            } else {
                                this.resetIdleTimer();
                            }
                        }
                    }, 5200);
                    break;

                case 'step_end':
                    if (event.isFinal) {
                        this.isActionRunning = false;
                        this.stopRoaming();
                        this.resetIdleTimer();
                        this.setState('success', this.getRandomQuote('success'), 4500);
                        setTimeout(() => {
                            if (!this.isActionRunning && this.widget?.getState() === 'idle') {
                                if (this.config.roamingEnabled) {
                                    this.startRoamingLoop();
                                } else {
                                    this.resetIdleTimer();
                                }
                            }
                        }, 4800);
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
            this.stopRoaming();
            this.clearIdleTimer();
        } else if (this.config.roamingEnabled) {
            this.clearIdleTimer();
            this.startRoamingLoop();
        } else {
            this.stopRoaming();
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
            this.clearWakeTimer();
            this.setState('idle', 'Oáp... Bé thức dậy rồi nè! ✨', 3500);
        }

        if (!this.isActionRunning) {
            if (this.config.roamingEnabled) {
                this.startRoamingLoop();
            } else {
                this.resetIdleTimer();
            }
        }
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

    // --- AUTONOMOUS ROAMING & SLEEP CYCLE ---

    public startRoamingLoop(): void {
        this.clearRoamTimer();
        if (!this.config.enabled || !this.config.roamingEnabled || this.isActionRunning) {
            return;
        }

        // Random delay between 12s and 25s for next autonomous action
        const nextDelayMs = Math.floor(Math.random() * 13000) + 12000;
        this.roamTimer = setTimeout(() => {
            this.executeAutonomousCycle();
        }, nextDelayMs);
    }

    public stopRoaming(): void {
        this.clearRoamTimer();
        this.clearWakeTimer();
        this.widget?.stopMoving();
    }

    private clearRoamTimer(): void {
        if (this.roamTimer) {
            clearTimeout(this.roamTimer);
            this.roamTimer = null;
        }
    }

    private clearWakeTimer(): void {
        if (this.wakeTimer) {
            clearTimeout(this.wakeTimer);
            this.wakeTimer = null;
        }
    }

    private executeAutonomousCycle(): void {
        if (!this.config.enabled || !this.config.roamingEnabled || this.isActionRunning || !this.widget) {
            return;
        }

        const currentState = this.widget.getState();
        // If agent is working/busy, do not roam
        if (currentState !== 'idle') {
            if (currentState !== 'sleeping') {
                this.startRoamingLoop();
            }
            return;
        }

        // Decision: Roam or take a nap?
        // Normal chance: 70% roam, 30% nap. If already roamed 3+ times in a row, 60% nap.
        const sleepChance = this.consecutiveRoams >= 3 ? 0.6 : 0.3;
        const willSleep = Math.random() < sleepChance;

        if (willSleep) {
            this.consecutiveRoams = 0;
            this.setState('sleeping', this.getRandomQuote('sleeping'));
            // Sleep for 18 - 35 seconds, then automatically wake up
            const sleepDurationMs = Math.floor(Math.random() * 17000) + 18000;
            this.clearWakeTimer();
            this.wakeTimer = setTimeout(() => {
                this.wakeTimer = null;
                if (!this.isActionRunning && this.widget?.getState() === 'sleeping') {
                    this.setState('idle', 'Oáp... Bé tỉnh rồi nè! ✨', 3500);
                    this.startRoamingLoop();
                }
            }, sleepDurationMs);
        } else {
            this.consecutiveRoams++;
            this.roamToRandomPosition();
        }
    }

    private roamToRandomPosition(): void {
        if (!this.widget || this.isActionRunning) return;

        const scale = Math.max(48, Math.min(180, this.config.scale || 96));
        const minX = 25;
        const maxX = Math.max(minX, window.innerWidth - scale - 25);
        const minY = 65; // Below SillyTavern header bar
        const maxY = Math.max(minY, window.innerHeight - scale - 85); // Above chat input box

        const targetX = Math.floor(minX + Math.random() * (maxX - minX));
        const targetY = Math.floor(minY + Math.random() * (maxY - minY));

        const currentPos = this.widget.getPosition();
        const dx = targetX - currentPos.x;
        const dy = targetY - currentPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Smooth speed: duration clamped between 1800ms and 3800ms
        const durationMs = Math.min(3800, Math.max(1800, Math.round((distance / 180) * 1000)));

        // Occasionally speak a cute roam line (~35% chance)
        if (Math.random() < 0.35) {
            const roamQuotes = PET_QUOTES.roam;
            const quote = roamQuotes[Math.floor(Math.random() * roamQuotes.length)];
            this.widget.showBubble(quote, Math.min(durationMs + 1000, 4000));
        }

        this.widget.moveTo(targetX, targetY, durationMs, () => {
            if (!this.isActionRunning) {
                this.startRoamingLoop();
            }
        });
    }

    // --- IDLE SLEEP FALLBACK (when roaming is disabled) ---

    private startIdleTimer(): void {
        this.clearIdleTimer();
        if (!this.config.enabled || this.config.roamingEnabled) return;

        this.idleTimer = setTimeout(() => {
            if (!this.isActionRunning && this.widget?.getState() === 'idle') {
                this.setState('sleeping', this.getRandomQuote('sleeping'));
            }
        }, this.idleTimeoutMs);
    }

    private resetIdleTimer(): void {
        if (!this.config.roamingEnabled) {
            this.startIdleTimer();
        }
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    // --- SMART RESIZE HANDLING (WINDOW SHRINK / MINIMIZE RECOVERY) ---

    private handleWindowResize = (): void => {
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
        }
        this.resizeDebounceTimer = setTimeout(() => {
            this.resizeDebounceTimer = null;
            this.checkAndRelocateIfOutOfBounds();
        }, 220);
    };

    public checkAndRelocateIfOutOfBounds(): void {
        if (!this.widget || !this.config.enabled) return;

        const scale = Math.max(48, Math.min(180, this.config.scale || 96));
        const minX = 25;
        const maxX = Math.max(minX, window.innerWidth - scale - 25);
        const minY = 65;
        const maxY = Math.max(minY, window.innerHeight - scale - 85);

        const pos = this.widget.getPosition();

        // Check if pet is outside the safe boundary (e.g. window resized smaller or minimized)
        const isOutOfBounds = pos.x < minX - 10 || pos.x > maxX + 10 || pos.y < minY - 10 || pos.y > maxY + 10;

        if (!isOutOfBounds) {
            this.updateViewportDebugger();
            return;
        }

        // If currently in an agent action (thinking, working, etc.), clamp gently so it stays visible without interrupting CoT
        if (this.isActionRunning) {
            const clampedX = Math.min(maxX, Math.max(minX, pos.x));
            const clampedY = Math.min(maxY, Math.max(minY, pos.y));
            this.widget.moveTo(clampedX, clampedY, 600);
            this.updateViewportDebugger();
            return;
        }

        // Pet is idle / roaming / sleeping: smartly jump into a random spot inside the safe viewport!
        this.stopRoaming();

        const targetX = Math.floor(minX + Math.random() * (maxX - minX));
        const targetY = Math.floor(minY + Math.random() * (maxY - minY));

        const rescueQuotes = [
            'Úi, cửa sổ co lại rồi! Bé dời vào trong đây nhé~ 💨',
            'Phù... Cửa sổ nhỏ quá, nhảy vào vùng an toàn thôi nào! ✨',
            'Bé bị kẹt ngoài rìa kìa! May mà né kịp vô trong! 🎈',
        ];
        const randomQuote = rescueQuotes[Math.floor(Math.random() * rescueQuotes.length)];
        this.widget.showBubble(randomQuote, 3500);

        this.widget.moveTo(targetX, targetY, 1500, () => {
            this.updateViewportDebugger();
            if (!this.isActionRunning && this.config.roamingEnabled) {
                this.startRoamingLoop();
            }
        });
    }

    // --- VIEWPORT BOUNDARY DEBUGGER OVERLAY ---

    public toggleViewportDebugger(): boolean {
        const existing = document.getElementById('kaiz-pet-viewport-debugger');
        if (existing) {
            this.closeViewportDebugger();
            return false;
        } else {
            this.openViewportDebugger();
            return true;
        }
    }

    public closeViewportDebugger(): void {
        if (this.debuggerTimer) {
            clearTimeout(this.debuggerTimer);
            this.debuggerTimer = null;
        }
        const el = document.getElementById('kaiz-pet-viewport-debugger');
        if (el) {
            el.classList.add('kaiz-vp-fadeout');
            setTimeout(() => el.remove(), 220);
        }
    }

    public openViewportDebugger(): void {
        this.closeViewportDebugger();

        const scale = Math.max(48, Math.min(180, this.config.scale || 96));
        const minX = 25;
        const maxX = Math.max(minX, window.innerWidth - scale - 25);
        const minY = 65;
        const maxY = Math.max(minY, window.innerHeight - scale - 85);
        const pos = this.widget?.getPosition() || { x: 0, y: 0 };

        const overlay = document.createElement('div');
        overlay.id = 'kaiz-pet-viewport-debugger';
        overlay.className = 'kaiz-viewport-debugger';

        overlay.innerHTML = `
            <div class="kaiz-vp-guide-top">
                <span><i class="fa-solid fa-arrow-down"></i> VÙNG TRÁNH: HEADER SILLYTAVERN (0px → 65px)</span>
            </div>
            <div class="kaiz-vp-safe-box" style="top: ${minY}px; left: ${minX}px; width: ${maxX - minX + scale}px; height: ${maxY - minY + scale}px;">
                <div class="kaiz-vp-corner top-left"></div>
                <div class="kaiz-vp-corner top-right"></div>
                <div class="kaiz-vp-corner bottom-left"></div>
                <div class="kaiz-vp-corner bottom-right"></div>
                <div class="kaiz-vp-header">
                    <div class="kaiz-vp-title">
                        <i class="fa-solid fa-vector-square"></i> VÙNG VIEWPORT AN TOÀN CỦA BÉ SLIME
                    </div>
                    <div class="kaiz-vp-badge">
                        <span id="kaiz-vp-dim">${window.innerWidth} × ${window.innerHeight}</span>
                    </div>
                    <button class="kaiz-vp-close" type="button" title="Đóng">&times;</button>
                </div>
                <div class="kaiz-vp-info-box">
                    <div class="kaiz-vp-row">
                        <span class="kaiz-vp-label"><i class="fa-solid fa-paw"></i> Tọa độ Bé hiện tại:</span>
                        <span id="kaiz-vp-pet-pos" class="kaiz-vp-val">X: ${Math.round(pos.x)}px, Y: ${Math.round(pos.y)}px</span>
                    </div>
                    <div class="kaiz-vp-row">
                        <span class="kaiz-vp-label"><i class="fa-solid fa-shield-halved"></i> Giới hạn an toàn:</span>
                        <span id="kaiz-vp-limits" class="kaiz-vp-val">X: ${minX}px → ${Math.round(maxX)}px | Y: ${minY}px → ${Math.round(maxY)}px</span>
                    </div>
                    <div class="kaiz-vp-row">
                        <span class="kaiz-vp-label"><i class="fa-solid fa-arrows-up-down-left-right"></i> Vùng khả dụng:</span>
                        <span class="kaiz-vp-val" style="color: #38bdf8;">${Math.round(maxX - minX + scale)}px × ${Math.round(maxY - minY + scale)}px</span>
                    </div>
                    <div class="kaiz-vp-hint">
                        Bé Slime sẽ chỉ tự do đi dạo và nhảy nhót trong khung viền xanh này. Khi bạn thu nhỏ cửa sổ, bé sẽ tự động nhảy vào bên trong!
                    </div>
                </div>
            </div>
            <div class="kaiz-vp-guide-bottom">
                <span><i class="fa-solid fa-arrow-up"></i> VÙNG TRÁNH: KHUNG NHẬP CHAT BAR (Dưới cùng 85px)</span>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('.kaiz-vp-close')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeViewportDebugger();
        });

        // Auto close after 10 seconds
        this.debuggerTimer = setTimeout(() => {
            this.closeViewportDebugger();
        }, 10000);
    }

    public updateViewportDebugger(): void {
        const overlay = document.getElementById('kaiz-pet-viewport-debugger');
        if (!overlay) return;

        const scale = Math.max(48, Math.min(180, this.config.scale || 96));
        const minX = 25;
        const maxX = Math.max(minX, window.innerWidth - scale - 25);
        const minY = 65;
        const maxY = Math.max(minY, window.innerHeight - scale - 85);
        const pos = this.widget?.getPosition() || { x: 0, y: 0 };

        const safeBox = overlay.querySelector('.kaiz-vp-safe-box') as HTMLElement | null;
        if (safeBox) {
            safeBox.style.top = `${minY}px`;
            safeBox.style.left = `${minX}px`;
            safeBox.style.width = `${maxX - minX + scale}px`;
            safeBox.style.height = `${maxY - minY + scale}px`;
        }

        const dimEl = overlay.querySelector('#kaiz-vp-dim');
        if (dimEl) dimEl.textContent = `${window.innerWidth} × ${window.innerHeight}`;

        const petPosEl = overlay.querySelector('#kaiz-vp-pet-pos');
        if (petPosEl) petPosEl.textContent = `X: ${Math.round(pos.x)}px, Y: ${Math.round(pos.y)}px`;

        const limitsEl = overlay.querySelector('#kaiz-vp-limits');
        if (limitsEl)
            limitsEl.textContent = `X: ${minX}px → ${Math.round(maxX)}px | Y: ${minY}px → ${Math.round(maxY)}px`;
    }

    public destroy(): void {
        window.removeEventListener('resize', this.handleWindowResize);
        if (this.resizeDebounceTimer) {
            clearTimeout(this.resizeDebounceTimer);
            this.resizeDebounceTimer = null;
        }
        this.closeViewportDebugger();
        this.stopRoaming();
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
