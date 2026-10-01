/**
 * Interactive Circular Avatar Cropper Modal
 * Cung cấp công cụ cắt ảnh tròn trực quan (Pan / Drag, Zoom, Xoay 90 độ, Live Preview).
 * Dùng cho cả Avatar Người Dùng và Biểu tượng tùy chỉnh của Kaiz Agent.
 */

export class AvatarCropperModal {
    private static instance: AvatarCropperModal;
    private modal: HTMLDialogElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private previewCanvas: HTMLCanvasElement | null = null;

    private img: HTMLImageElement | null = null;
    private onSaveCallback: ((dataUrl: string) => void) | null = null;

    // State
    private scale = 1.0;
    private baseScale = 1.0;
    private offsetX = 0;
    private offsetY = 0;
    private rotation = 0; // 0, 90, 180, 270

    // Interaction
    private isDragging = false;
    private startX = 0;
    private startY = 0;

    private readonly canvasSize = 340;
    private readonly cropRadius = 120; // 240px đường kính

    private constructor() {
        this.ensureModalDOM();
        this.bindEvents();
    }

    public static getInstance(): AvatarCropperModal {
        if (!AvatarCropperModal.instance) {
            AvatarCropperModal.instance = new AvatarCropperModal();
        }
        return AvatarCropperModal.instance;
    }

    private ensureModalDOM(): void {
        if (document.getElementById('kaiz-avatar-cropper-modal')) {
            this.modal = document.getElementById('kaiz-avatar-cropper-modal') as HTMLDialogElement;
            this.canvas = document.getElementById('kaiz-crop-main-canvas') as HTMLCanvasElement;
            this.previewCanvas = document.getElementById('kaiz-crop-live-preview') as HTMLCanvasElement;
            if (this.canvas) this.ctx = this.canvas.getContext('2d');
            return;
        }

        const modalHtml = `
        <dialog id="kaiz-avatar-cropper-modal" class="kaiz-cropper-dialog" style="padding: 0; background: #181920; color: #fff; border: 1px solid rgba(255,255,255,0.18); border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); width: 420px; max-width: 95vw; overflow: hidden; z-index: 10005;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02);">
                <div id="kaiz-cropper-title" style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-crop-simple" style="color: var(--accent, #6495ed);"></i> Cắt & Căn Chỉnh Avatar
                </div>
                <i id="kaiz-cropper-close-btn" class="fa-solid fa-xmark interactable" style="cursor: pointer; font-size: 16px; color: #aaa;"></i>
            </div>

            <div style="padding: 16px 18px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
                <!-- Main Canvas Viewport -->
                <div style="position: relative; width: 340px; height: 340px; background: #0c0d11; border-radius: 10px; overflow: hidden; box-shadow: inset 0 0 16px rgba(0,0,0,0.8); cursor: grab; user-select: none;" id="kaiz-crop-canvas-wrapper">
                    <canvas id="kaiz-crop-main-canvas" width="340" height="340" style="display: block; width: 340px; height: 340px;"></canvas>
                </div>

                <div style="font-size: 11px; color: #888; text-align: center;">
                    <i class="fa-solid fa-hand-pointer"></i> Kéo để di chuyển • <i class="fa-solid fa-arrows-up-down"></i> Cuộn chuột để Phóng to/Thu nhỏ
                </div>

                <!-- Controls & Slider -->
                <div style="width: 100%; display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.03); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <span style="font-size: 12px; color: #ccc; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-magnifying-glass"></i> Thu phóng:</span>
                        <input id="kaiz-crop-zoom-range" type="range" class="kaiz-range" min="0.5" max="3.5" step="0.05" value="1" style="flex: 1;" />
                        <span id="kaiz-crop-zoom-val" style="font-size: 11px; color: var(--accent, #6495ed); min-width: 38px; text-align: right; font-weight: 600;">100%</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <div style="display: flex; gap: 6px;">
                            <button type="button" id="kaiz-crop-rotate-btn" class="menu_button interactable" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px;">
                                <i class="fa-solid fa-rotate-right"></i> Xoay 90°
                            </button>
                            <button type="button" id="kaiz-crop-center-btn" class="menu_button interactable" style="font-size: 11px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 5px;">
                                <i class="fa-solid fa-arrows-to-dot"></i> Căn giữa
                            </button>
                        </div>

                        <!-- Live Mini Preview -->
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 11px; color: #888;">Xem trước:</span>
                            <canvas id="kaiz-crop-live-preview" width="38" height="38" style="width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.25); background: #000; display: block;"></canvas>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer Buttons -->
            <div style="display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2);">
                <button type="button" id="kaiz-crop-cancel-btn" class="menu_button interactable" style="font-size: 12px; padding: 6px 14px;">
                    Hủy bỏ
                </button>
                <button type="button" id="kaiz-crop-apply-btn" class="menu_button interactable" style="font-size: 12px; padding: 6px 18px; background: var(--accent, #6495ed); color: #fff; font-weight: 600;">
                    <i class="fa-solid fa-check"></i> Cắt & Áp dụng
                </button>
            </div>
        </dialog>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        this.modal = document.getElementById('kaiz-avatar-cropper-modal') as HTMLDialogElement;
        this.canvas = document.getElementById('kaiz-crop-main-canvas') as HTMLCanvasElement;
        this.previewCanvas = document.getElementById('kaiz-crop-live-preview') as HTMLCanvasElement;
        if (this.canvas) this.ctx = this.canvas.getContext('2d');
    }

    private bindEvents(): void {
        if (!this.canvas || !this.modal) return;
        const $ = (window as any).jQuery;

        $('#kaiz-cropper-close-btn, #kaiz-crop-cancel-btn').on('click', () => {
            this.modal?.close();
        });

        // Mouse drag on canvas
        const wrapper = document.getElementById('kaiz-crop-canvas-wrapper');
        if (wrapper) {
            wrapper.addEventListener('mousedown', (e) => {
                this.isDragging = true;
                wrapper.style.cursor = 'grabbing';
                this.startX = e.clientX - this.offsetX;
                this.startY = e.clientY - this.offsetY;
            });

            window.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                this.offsetX = e.clientX - this.startX;
                this.offsetY = e.clientY - this.startY;
                this.draw();
            });

            window.addEventListener('mouseup', () => {
                if (this.isDragging && wrapper) {
                    this.isDragging = false;
                    wrapper.style.cursor = 'grab';
                }
            });

            // Mouse wheel zoom
            wrapper.addEventListener(
                'wheel',
                (e) => {
                    e.preventDefault();
                    const delta = e.deltaY < 0 ? 0.08 : -0.08;
                    this.setScale(this.scale + delta);
                },
                { passive: false },
            );
        }

        // Zoom range input
        $('#kaiz-crop-zoom-range').on('input', (e: any) => {
            const val = parseFloat(e.target.value);
            this.setScale(val);
        });

        // Rotate button
        $('#kaiz-crop-rotate-btn').on('click', () => {
            this.rotation = (this.rotation + 90) % 360;
            this.draw();
        });

        // Center button
        $('#kaiz-crop-center-btn').on('click', () => {
            this.resetView();
        });

        // Apply crop button
        $('#kaiz-crop-apply-btn').on('click', () => {
            this.exportAndSave();
        });
    }

    public open(file: File, onSave: (dataUrl: string) => void, titleText?: string): void {
        this.ensureModalDOM();
        this.onSaveCallback = onSave;

        if (titleText && document.getElementById('kaiz-cropper-title')) {
            document.getElementById('kaiz-cropper-title')!.innerHTML =
                `<i class="fa-solid fa-crop-simple" style="color: var(--accent, #6495ed);"></i> ${titleText}`;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                this.img = img;
                this.rotation = 0;
                this.resetView();
                this.modal?.showModal();
            };
            img.src = dataUrl;
        };
        reader.readAsDataURL(file);
    }

    private resetView(): void {
        if (!this.img) return;
        const cropDiameter = this.cropRadius * 2;
        // Fit image so minimum dimension covers the crop circle
        const minDim = Math.min(this.img.width, this.img.height);
        this.baseScale = cropDiameter / minDim;
        this.scale = this.baseScale;
        this.offsetX = this.canvasSize / 2;
        this.offsetY = this.canvasSize / 2;

        const zoomInput = document.getElementById('kaiz-crop-zoom-range') as HTMLInputElement;
        if (zoomInput) {
            zoomInput.value = '1';
        }
        this.updateZoomLabel();
        this.draw();
    }

    private setScale(val: number): void {
        const clamped = Math.max(0.2, Math.min(5.0, val));
        this.scale = clamped * this.baseScale;
        const zoomInput = document.getElementById('kaiz-crop-zoom-range') as HTMLInputElement;
        if (zoomInput) {
            zoomInput.value = clamped.toFixed(2);
        }
        this.updateZoomLabel();
        this.draw();
    }

    private updateZoomLabel(): void {
        const label = document.getElementById('kaiz-crop-zoom-val');
        if (label && this.baseScale > 0) {
            const pct = Math.round((this.scale / this.baseScale) * 100);
            label.textContent = `${pct}%`;
        }
    }

    private draw(): void {
        if (!this.ctx || !this.canvas || !this.img) return;

        const cx = this.canvasSize / 2;
        const cy = this.canvasSize / 2;

        // 1. Clear canvas
        this.ctx.clearRect(0, 0, this.canvasSize, this.canvasSize);

        // 2. Draw user image transformed
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.rotate((this.rotation * Math.PI) / 180);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);
        this.ctx.restore();

        // 3. Draw Dark Mask with Circular Cutout
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(10, 12, 16, 0.72)';
        this.ctx.beginPath();
        // Outer rect
        this.ctx.rect(0, 0, this.canvasSize, this.canvasSize);
        // Inner circle (counter-clockwise cutout)
        this.ctx.arc(cx, cy, this.cropRadius, 0, Math.PI * 2, true);
        this.ctx.fill();

        // 4. Draw Circular Guide Border
        this.ctx.strokeStyle = 'rgba(100, 149, 237, 0.85)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 4]);
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, this.cropRadius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Crosshair ticks
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 10, cy);
        this.ctx.lineTo(cx + 10, cy);
        this.ctx.moveTo(cx, cy - 10);
        this.ctx.lineTo(cx, cy + 10);
        this.ctx.stroke();

        this.ctx.restore();

        // 5. Update live mini preview
        this.drawMiniPreview();
    }

    private drawMiniPreview(): void {
        if (!this.previewCanvas || !this.img) return;
        const pCtx = this.previewCanvas.getContext('2d');
        if (!pCtx) return;

        const pSize = 38;
        pCtx.clearRect(0, 0, pSize, pSize);

        pCtx.save();
        // Circular clip
        pCtx.beginPath();
        pCtx.arc(pSize / 2, pSize / 2, pSize / 2, 0, Math.PI * 2);
        pCtx.clip();

        // Calculate mapping from crop circle (diameter 240) to mini preview (diameter 38)
        const scaleFactor = pSize / (this.cropRadius * 2);
        const cx = this.canvasSize / 2;
        const cy = this.canvasSize / 2;

        pCtx.translate(pSize / 2, pSize / 2);
        pCtx.scale(scaleFactor, scaleFactor);
        pCtx.translate(-cx, -cy);

        pCtx.translate(this.offsetX, this.offsetY);
        pCtx.rotate((this.rotation * Math.PI) / 180);
        pCtx.scale(this.scale, this.scale);
        pCtx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);

        pCtx.restore();
    }

    private exportAndSave(): void {
        if (!this.img) return;

        // Export high-res 256x256 circular image
        const exportSize = 256;
        const outCanvas = document.createElement('canvas');
        outCanvas.width = exportSize;
        outCanvas.height = exportSize;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) return;

        const cx = this.canvasSize / 2;
        const cy = this.canvasSize / 2;
        const scaleFactor = exportSize / (this.cropRadius * 2);

        outCtx.save();
        outCtx.beginPath();
        outCtx.arc(exportSize / 2, exportSize / 2, exportSize / 2, 0, Math.PI * 2);
        outCtx.clip();

        outCtx.translate(exportSize / 2, exportSize / 2);
        outCtx.scale(scaleFactor, scaleFactor);
        outCtx.translate(-cx, -cy);

        outCtx.translate(this.offsetX, this.offsetY);
        outCtx.rotate((this.rotation * Math.PI) / 180);
        outCtx.scale(this.scale, this.scale);
        outCtx.drawImage(this.img, -this.img.width / 2, -this.img.height / 2);

        outCtx.restore();

        const croppedDataUrl = outCanvas.toDataURL('image/png');

        if (this.onSaveCallback) {
            this.onSaveCallback(croppedDataUrl);
        }

        this.modal?.close();
    }
}
