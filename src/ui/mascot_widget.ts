/**
 * Virtual Assistance Pet (Crystal Slime Mascot) Widget
 * Manages the floating DOM element, dragging, boundary clamping, speech bubble, and animations.
 */

import { PetState, PetConfig, PET_ASSETS, PET_QUOTES } from '../core/mascot_constants';

declare const jQuery: any;

interface PosData {
    x: number;
    y: number;
    winW: number;
    winH: number;
}

export class MascotWidget {
    private el: HTMLElement | null = null;
    private avatarEl: HTMLElement | null = null;
    private imgEl: HTMLImageElement | null = null;
    private bubbleEl: HTMLElement | null = null;
    private bubbleTextEl: HTMLElement | null = null;

    private currentState: PetState = 'idle';
    private bubbleTimeout: any = null;
    private returnToIdleTimeout: any = null;

    // Dragging state
    private isDragging = false;
    private hasMoved = false;
    private startPointerX = 0;
    private startPointerY = 0;
    private startElemX = 0;
    private startElemY = 0;
    private activePointerId: number | null = null;

    // Click & double click tracking
    private lastClickTime = 0;
    private singleClickTimeout: any = null;

    constructor(
        private extPath: string,
        private config: PetConfig,
        private onPoke?: () => void,
        private onDoubleClick?: () => void,
    ) {}

    public init(): void {
        const existing = document.getElementById('kaiz-assistant-pet');
        if (existing) {
            existing.remove();
        }

        // Create widget root container
        const widget = document.createElement('div');
        widget.id = 'kaiz-assistant-pet';
        widget.className = 'kaiz-pet-widget';
        widget.setAttribute('role', 'complementary');
        widget.setAttribute('aria-label', 'Kaiz Virtual Assistance Pet');

        // Create Speech Bubble
        const bubble = document.createElement('div');
        bubble.className = 'kaiz-pet-bubble';
        bubble.style.display = 'none';

        const bubbleText = document.createElement('span');
        bubbleText.className = 'kaiz-pet-bubble-text';

        const bubbleTail = document.createElement('div');
        bubbleTail.className = 'kaiz-pet-bubble-tail';

        bubble.appendChild(bubbleText);
        bubble.appendChild(bubbleTail);

        // Click bubble to dismiss immediately
        bubble.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideBubble();
        });

        // Create Avatar container & Image
        const avatar = document.createElement('div');
        avatar.className = 'kaiz-pet-avatar';

        const img = document.createElement('img');
        img.className = 'kaiz-pet-sprite';
        img.alt = 'Bé Slime Tinh Thể Kaiz';
        img.draggable = false;

        avatar.appendChild(img);
        widget.appendChild(bubble);
        widget.appendChild(avatar);

        document.body.appendChild(widget);

        this.el = widget;
        this.avatarEl = avatar;
        this.imgEl = img;
        this.bubbleEl = bubble;
        this.bubbleTextEl = bubbleText;

        // Restore saved position or use default bottom-right
        this.restorePosition();

        // Bind Dragging & Click events
        this.bindEvents();

        // Apply initial config
        this.applyConfig(this.config);

        // Set initial state
        this.setState('idle');
    }

    private resolveAssetUrl(state: PetState): string {
        const relPath = PET_ASSETS[state] || PET_ASSETS.idle;
        return `/scripts/extensions/${this.extPath}/${relPath}`;
    }

    public setState(state: PetState, quote?: string, durationMs?: number): void {
        if (!this.imgEl) return;
        this.currentState = state;

        // Clear any pending return to idle
        if (this.returnToIdleTimeout) {
            clearTimeout(this.returnToIdleTimeout);
            this.returnToIdleTimeout = null;
        }

        // Update image source
        const newSrc = this.resolveAssetUrl(state);
        if (this.imgEl.src !== newSrc) {
            this.imgEl.src = newSrc;
        }

        // Update CSS class for container
        if (this.el) {
            this.el.className = `kaiz-pet-widget kaiz-pet-state-${state}`;
        }

        // Show contextual speech bubble if quote provided
        if (quote) {
            this.showBubble(quote, durationMs);
        }

        // If state is transient (e.g. success or error or bounce), schedule return to idle
        if (state === 'success' || state === 'error' || state === 'bounce') {
            const delay = durationMs || (state === 'bounce' ? 1200 : 4500);
            this.returnToIdleTimeout = setTimeout(() => {
                if (this.currentState === state) {
                    this.setState('idle');
                }
            }, delay);
        }
    }

    public getState(): PetState {
        return this.currentState;
    }

    public showBubble(text: string, durationMs: number = 4500): void {
        if (!this.config.bubbleEnabled || !this.bubbleEl || !this.bubbleTextEl || !this.el) return;

        if (this.bubbleTimeout) {
            clearTimeout(this.bubbleTimeout);
            this.bubbleTimeout = null;
        }

        this.bubbleTextEl.textContent = text;
        this.bubbleEl.style.display = 'flex';
        this.bubbleEl.classList.remove('kaiz-bubble-fadeout');

        // Check if pet is too close to top of viewport -> flip bubble to bottom
        const rect = this.el.getBoundingClientRect();
        if (rect.top < 95) {
            this.bubbleEl.classList.add('bubble-bottom');
        } else {
            this.bubbleEl.classList.remove('bubble-bottom');
        }

        this.bubbleTimeout = setTimeout(() => {
            this.hideBubble();
        }, durationMs);
    }

    public hideBubble(): void {
        if (!this.bubbleEl) return;
        this.bubbleEl.classList.add('kaiz-bubble-fadeout');
        setTimeout(() => {
            if (this.bubbleEl && this.bubbleEl.classList.contains('kaiz-bubble-fadeout')) {
                this.bubbleEl.style.display = 'none';
                this.bubbleEl.classList.remove('kaiz-bubble-fadeout');
            }
        }, 220);
    }

    public applyConfig(newConfig: Partial<PetConfig>): void {
        this.config = { ...this.config, ...newConfig };
        if (!this.el || !this.avatarEl || !this.imgEl) return;

        // Visibility
        if (!this.config.enabled) {
            this.el.style.display = 'none';
            return;
        } else {
            this.el.style.display = 'flex';
        }

        // Scale
        const scalePx = Math.max(48, Math.min(180, this.config.scale || 96));
        this.avatarEl.style.width = `${scalePx}px`;
        this.avatarEl.style.height = `${scalePx}px`;
        this.imgEl.style.width = `${scalePx}px`;
        this.imgEl.style.height = `${scalePx}px`;

        // Opacity
        const opVal = Math.max(0.4, Math.min(1.0, (this.config.opacity ?? 100) / 100));
        this.avatarEl.style.opacity = opVal.toString();

        // Bubble visibility
        if (!this.config.bubbleEnabled) {
            this.hideBubble();
        }
    }

    public resetPosition(): void {
        if (!this.el) return;
        try {
            localStorage.removeItem('kaiz_pet_pos');
        } catch (_) {}

        this.el.style.left = 'auto';
        this.el.style.top = 'auto';
        this.el.style.right = '28px';
        this.el.style.bottom = '100px';

        // Play brief bounce & squish celebration
        this.poke();
    }

    public poke(): void {
        if (!this.avatarEl) return;

        // Trigger squish animation
        this.avatarEl.classList.remove('kaiz-pet-squished');
        void this.avatarEl.offsetWidth; // Trigger reflow
        this.avatarEl.classList.add('kaiz-pet-squished');

        // Play random poke quote
        const quotes = PET_QUOTES.click;
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        this.showBubble(randomQuote, 3500);

        if (this.onPoke) {
            this.onPoke();
        }
    }

    private restorePosition(): void {
        if (!this.el) return;
        try {
            const raw = localStorage.getItem('kaiz_pet_pos');
            if (raw) {
                const pos: PosData = JSON.parse(raw);
                if (typeof pos.x === 'number' && typeof pos.y === 'number') {
                    const maxW = Math.max(100, window.innerWidth - (this.config.scale || 96));
                    const maxH = Math.max(100, window.innerHeight - (this.config.scale || 96));
                    const clampedX = Math.max(10, Math.min(maxW - 10, pos.x));
                    const clampedY = Math.max(10, Math.min(maxH - 10, pos.y));

                    this.el.style.left = `${clampedX}px`;
                    this.el.style.top = `${clampedY}px`;
                    this.el.style.right = 'auto';
                    this.el.style.bottom = 'auto';
                    return;
                }
            }
        } catch (_) {}

        // Default: Bottom-right corner above ST bar
        this.el.style.left = 'auto';
        this.el.style.top = 'auto';
        this.el.style.right = '28px';
        this.el.style.bottom = '100px';
    }

    private savePosition(x: number, y: number): void {
        try {
            const pos: PosData = {
                x,
                y,
                winW: window.innerWidth,
                winH: window.innerHeight,
            };
            localStorage.setItem('kaiz_pet_pos', JSON.stringify(pos));
        } catch (_) {}
    }

    private bindEvents(): void {
        if (!this.el) return;

        // Pointer Down (Mouse, Touch, Pen)
        this.el.addEventListener('pointerdown', (e: PointerEvent) => {
            // Only respond to main button
            if (e.button !== 0) return;
            e.preventDefault();

            this.isDragging = false;
            this.hasMoved = false;
            this.activePointerId = e.pointerId;
            this.el?.setPointerCapture(e.pointerId);

            this.startPointerX = e.clientX;
            this.startPointerY = e.clientY;

            const rect = this.el!.getBoundingClientRect();
            this.startElemX = rect.left;
            this.startElemY = rect.top;
        });

        // Pointer Move
        this.el.addEventListener('pointermove', (e: PointerEvent) => {
            if (this.activePointerId !== e.pointerId) return;

            const dx = e.clientX - this.startPointerX;
            const dy = e.clientY - this.startPointerY;

            // Threshold of 5px to distinguish drag from click
            if (!this.isDragging && Math.hypot(dx, dy) > 5) {
                this.isDragging = true;
                this.hasMoved = true;
                this.el?.classList.add('kaiz-pet-dragging');
                // Switch to bounce animation while dragging
                if (this.currentState === 'idle' || this.currentState === 'sleeping') {
                    this.setState('bounce');
                }
            }

            if (this.isDragging && this.el) {
                const targetScale = this.config.scale || 96;
                const maxX = Math.max(0, window.innerWidth - targetScale);
                const maxY = Math.max(0, window.innerHeight - targetScale);

                const newX = Math.max(0, Math.min(maxX, this.startElemX + dx));
                const newY = Math.max(0, Math.min(maxY, this.startElemY + dy));

                this.el.style.left = `${newX}px`;
                this.el.style.top = `${newY}px`;
                this.el.style.right = 'auto';
                this.el.style.bottom = 'auto';
            }
        });

        // Pointer Up
        const onPointerUp = (e: PointerEvent) => {
            if (this.activePointerId !== e.pointerId) return;
            if (this.el?.hasPointerCapture(e.pointerId)) {
                this.el.releasePointerCapture(e.pointerId);
            }
            this.activePointerId = null;
            this.el?.classList.remove('kaiz-pet-dragging');

            if (this.isDragging && this.el) {
                this.isDragging = false;
                const rect = this.el.getBoundingClientRect();
                this.savePosition(rect.left, rect.top);
                // Return from bounce to idle after dropping
                setTimeout(() => {
                    if (this.currentState === 'bounce') {
                        this.setState('idle');
                    }
                }, 300);
            } else if (!this.hasMoved) {
                // Click handler (Single vs Double Click)
                const now = Date.now();
                if (now - this.lastClickTime < 320) {
                    // Double click!
                    if (this.singleClickTimeout) {
                        clearTimeout(this.singleClickTimeout);
                        this.singleClickTimeout = null;
                    }
                    this.lastClickTime = 0;
                    if (this.onDoubleClick) {
                        this.onDoubleClick();
                    } else {
                        // Default double-click action: trigger floating button to open chat window
                        if (typeof jQuery !== 'undefined') {
                            jQuery('#kaiz-floating-btn').trigger('click');
                        }
                    }
                } else {
                    // Single click with slight delay to distinguish from double click
                    this.lastClickTime = now;
                    this.singleClickTimeout = setTimeout(() => {
                        this.poke();
                        this.singleClickTimeout = null;
                    }, 320);
                }
            }
        };

        this.el.addEventListener('pointerup', onPointerUp);
        this.el.addEventListener('pointercancel', onPointerUp);

        // Window resize boundary protection
        window.addEventListener('resize', () => {
            if (!this.el || this.el.style.display === 'none') return;
            const rect = this.el.getBoundingClientRect();
            const targetScale = this.config.scale || 96;
            const maxX = Math.max(0, window.innerWidth - targetScale);
            const maxY = Math.max(0, window.innerHeight - targetScale);

            if (rect.left > maxX || rect.top > maxY) {
                const clampedX = Math.max(0, Math.min(maxX, rect.left));
                const clampedY = Math.max(0, Math.min(maxY, rect.top));
                this.el.style.left = `${clampedX}px`;
                this.el.style.top = `${clampedY}px`;
                this.savePosition(clampedX, clampedY);
            }
        });
    }

    public destroy(): void {
        if (this.bubbleTimeout) clearTimeout(this.bubbleTimeout);
        if (this.returnToIdleTimeout) clearTimeout(this.returnToIdleTimeout);
        if (this.singleClickTimeout) clearTimeout(this.singleClickTimeout);
        if (this.el) {
            this.el.remove();
            this.el = null;
        }
    }
}
