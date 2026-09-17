import { KaizDB, GalleryImage } from '../core/db';

declare const jQuery: any;
declare const toastr: any;

export class ImageGalleryModal {
    private db: KaizDB;
    private images: GalleryImage[] = [];
    private filteredImages: GalleryImage[] = [];
    private selectedIds: Set<number> = new Set();
    private currentPreviewImage: GalleryImage | null = null;
    private displayLimit = 36;
    private currentLimit = 36;

    constructor(db: KaizDB) {
        this.db = db;
        this.bindEvents();
    }

    private isModalOpen(): boolean {
        const modal = document.getElementById('kaiz-gallery-modal') as HTMLDialogElement | null;
        return !!(modal && modal.open);
    }

    private bindEvents(): void {
        const $ = jQuery;

        // Mở Gallery từ nút trên Tools Dropdown Menu
        $('#kaiz-chat-gallery-btn')
            .off('click')
            .on('click', async () => {
                const modal = $('#kaiz-gallery-modal')[0] as HTMLDialogElement;
                if (modal) {
                    modal.showModal();
                    await this.loadAndRender();
                }
            });

        // Đóng Gallery Modal
        $('#kaiz-gallery-close')
            .off('click')
            .on('click', () => {
                const modal = $('#kaiz-gallery-modal')[0] as HTMLDialogElement;
                if (modal) modal.close();
            });

        // Tìm kiếm prompt thời gian thực
        $('#kaiz-gallery-search')
            .off('input')
            .on('input', (e: any) => {
                const query = (e.target.value || '').trim().toLowerCase();
                if (!query) {
                    this.filteredImages = [...this.images];
                } else {
                    this.filteredImages = this.images.filter((img) =>
                        (img.prompt || '').toLowerCase().includes(query),
                    );
                }
                this.currentLimit = this.displayLimit;
                this.renderGrid();
            });

        // Chọn tất cả / Bỏ chọn tất cả
        $('#kaiz-gallery-select-all-btn')
            .off('click')
            .on('click', () => {
                if (this.selectedIds.size === this.filteredImages.length && this.filteredImages.length > 0) {
                    this.selectedIds.clear();
                } else {
                    this.filteredImages.forEach((img) => {
                        if (img.id !== undefined) this.selectedIds.add(img.id);
                    });
                }
                this.updateSelectionUI();
                this.renderGrid();
            });

        // Xóa các ảnh đã chọn (Bulk delete)
        $('#kaiz-gallery-delete-selected-btn')
            .off('click')
            .on('click', async () => {
                const count = this.selectedIds.size;
                if (count === 0) return;
                if (confirm(`Bạn có chắc chắn muốn xóa ${count} bức ảnh đã chọn không?`)) {
                    const idsToDelete = Array.from(this.selectedIds);
                    await this.db.deleteMultipleGalleryImages(idsToDelete);
                    this.selectedIds.clear();
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã xóa ${count} ảnh thành công!`);
                    }
                    await this.loadAndRender();
                }
            });

        // Xóa tất cả ảnh (Delete all)
        $('#kaiz-gallery-delete-all-btn')
            .off('click')
            .on('click', async () => {
                if (this.images.length === 0) {
                    if (typeof toastr !== 'undefined') toastr.info('Thư viện ảnh hiện đang trống.');
                    return;
                }
                if (
                    confirm(
                        'CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ ảnh trong thư viện không? Thao tác này sẽ xóa vĩnh viễn và không thể khôi phục!',
                    )
                ) {
                    await this.db.clearAllGalleryImages();
                    this.selectedIds.clear();
                    if (typeof toastr !== 'undefined') {
                        toastr.success('Đã làm trống thư viện ảnh!');
                    }
                    await this.loadAndRender();
                }
            });

        // Đóng Preview Modal
        $('#kaiz-gallery-preview-close, #kaiz-preview-close-btn')
            .off('click')
            .on('click', () => {
                const previewModal = $('#kaiz-gallery-preview-modal')[0] as HTMLDialogElement;
                if (previewModal) previewModal.close();
            });

        // Sao chép Prompt trong Preview Modal
        $('#kaiz-preview-copy-prompt-btn')
            .off('click')
            .on('click', async () => {
                if (this.currentPreviewImage?.prompt) {
                    try {
                        await navigator.clipboard.writeText(this.currentPreviewImage.prompt);
                        if (typeof toastr !== 'undefined') toastr.success('Đã sao chép prompt!');
                    } catch (e) {
                        if (typeof toastr !== 'undefined') toastr.info('Không thể tự động sao chép prompt.');
                    }
                }
            });

        // Tải ảnh về máy trong Preview Modal
        $('#kaiz-preview-download-btn')
            .off('click')
            .on('click', () => {
                if (this.currentPreviewImage) {
                    this.downloadImage(this.currentPreviewImage);
                }
            });

        // Xóa ảnh hiện tại trong Preview Modal
        $('#kaiz-preview-delete-btn')
            .off('click')
            .on('click', async () => {
                if (!this.currentPreviewImage || this.currentPreviewImage.id === undefined) return;
                if (confirm('Bạn có chắc muốn xóa bức ảnh này không?')) {
                    const id = this.currentPreviewImage.id;
                    await this.db.deleteGalleryImage(id);
                    this.selectedIds.delete(id);
                    const previewModal = $('#kaiz-gallery-preview-modal')[0] as HTMLDialogElement;
                    if (previewModal) previewModal.close();
                    if (typeof toastr !== 'undefined') toastr.success('Đã xóa bức ảnh!');
                    await this.loadAndRender();
                }
            });

        // Lắng nghe sự kiện tạo ảnh mới xong từ WebImageBridge để cập nhật UI
        window.addEventListener('kaiz_gallery_updated', () => {
            if (this.isModalOpen()) {
                this.loadAndRender();
            }
        });
    }

    public async loadAndRender(): Promise<void> {
        this.images = await this.db.getAllGalleryImages();
        const query = (jQuery('#kaiz-gallery-search').val() || '').trim().toLowerCase();
        if (!query) {
            this.filteredImages = [...this.images];
        } else {
            this.filteredImages = this.images.filter((img) =>
                (img.prompt || '').toLowerCase().includes(query),
            );
        }
        this.currentLimit = this.displayLimit;
        this.updateSelectionUI();
        this.renderGrid();
    }

    private updateSelectionUI(): void {
        const $ = jQuery;
        const total = this.filteredImages.length;
        const selected = this.selectedIds.size;

        $('#kaiz-gallery-total-badge').text(`${this.images.length} ảnh`);
        $('#kaiz-gallery-selected-count').text(selected);

        if (selected > 0) {
            $('#kaiz-gallery-delete-selected-btn').show();
        } else {
            $('#kaiz-gallery-delete-selected-btn').hide();
        }

        const selectAllBtn = $('#kaiz-gallery-select-all-btn');
        if (selected > 0 && selected === total) {
            selectAllBtn.html('<i class="fa-solid fa-square-check"></i> Bỏ chọn tất cả');
        } else {
            selectAllBtn.html('<i class="fa-regular fa-square-check"></i> Chọn tất cả');
        }
    }

    private renderGrid(): void {
        const $ = jQuery;
        const grid = $('#kaiz-gallery-grid');
        const emptyState = $('#kaiz-gallery-empty');

        grid.empty();

        if (this.filteredImages.length === 0) {
            emptyState.show();
            return;
        }
        emptyState.hide();

        const itemsToShow = this.filteredImages.slice(0, this.currentLimit);

        itemsToShow.forEach((img) => {
            const isSelected = img.id !== undefined && this.selectedIds.has(img.id);
            const dateStr = this.formatDate(img.timestamp);
            const safePrompt = this.escapeHtml(img.prompt);
            const providerLabel = (img.provider || 'gemini').toUpperCase();
            const durationStr = img.durationMs ? `${(img.durationMs / 1000).toFixed(1)}s` : '';

            const card = $(`
                <div class="kaiz-gallery-card ${isSelected ? 'is-selected' : ''}" data-id="${img.id}">
                    <div class="kaiz-gallery-card-thumb">
                        <img src="${img.base64}" alt="${safePrompt}" loading="lazy" />
                        <div class="kaiz-gallery-card-checkbox ${isSelected ? 'checked' : ''}" title="Chọn ảnh">
                            <i class="fa-solid fa-check"></i>
                        </div>
                        <div class="kaiz-gallery-provider-tag">${providerLabel}${durationStr ? ` • ${durationStr}` : ''}</div>
                    </div>
                    <div class="kaiz-gallery-card-info">
                        <div class="kaiz-gallery-card-prompt" title="${safePrompt}">${safePrompt}</div>
                        <div class="kaiz-gallery-card-footer">
                            <span class="kaiz-gallery-card-date">${dateStr}${durationStr ? ` <span title="Thời gian tạo ảnh: ${durationStr}" style="opacity: 0.85; margin-left: 5px;"><i class="fa-solid fa-stopwatch" style="font-size: 10px;"></i> ${durationStr}</span>` : ''}</span>
                            <div class="kaiz-gallery-card-actions">
                                <button class="kaiz-card-action-btn copy-btn" title="Sao chép prompt">
                                    <i class="fa-regular fa-copy"></i>
                                </button>
                                <button class="kaiz-card-action-btn download-btn" title="Tải ảnh">
                                    <i class="fa-solid fa-download"></i>
                                </button>
                                <button class="kaiz-card-action-btn delete-btn" title="Xóa ảnh">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `);

            // Checkbox click toggle selection
            card.find('.kaiz-gallery-card-checkbox').on('click', (e: any) => {
                e.stopPropagation();
                if (img.id !== undefined) {
                    if (this.selectedIds.has(img.id)) {
                        this.selectedIds.delete(img.id);
                    } else {
                        this.selectedIds.add(img.id);
                    }
                    this.updateSelectionUI();
                    card.toggleClass('is-selected', this.selectedIds.has(img.id));
                    card.find('.kaiz-gallery-card-checkbox').toggleClass('checked', this.selectedIds.has(img.id));
                }
            });

            // Click vào ảnh hoặc card -> Mở Lightbox Preview
            card.find('.kaiz-gallery-card-thumb').on('click', (e: any) => {
                if ($(e.target).closest('.kaiz-gallery-card-checkbox').length) return;
                this.openPreview(img);
            });

            // Action: Copy prompt
            card.find('.copy-btn').on('click', async (e: any) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(img.prompt);
                    if (typeof toastr !== 'undefined') toastr.success('Đã sao chép prompt!');
                } catch {
                    if (typeof toastr !== 'undefined') toastr.info('Không thể tự động sao chép.');
                }
            });

            // Action: Download
            card.find('.download-btn').on('click', (e: any) => {
                e.stopPropagation();
                this.downloadImage(img);
            });

            // Action: Single Delete
            card.find('.delete-btn').on('click', async (e: any) => {
                e.stopPropagation();
                if (img.id === undefined) return;
                if (confirm('Bạn có chắc muốn xóa bức ảnh này không?')) {
                    await this.db.deleteGalleryImage(img.id);
                    this.selectedIds.delete(img.id);
                    if (typeof toastr !== 'undefined') toastr.success('Đã xóa bức ảnh!');
                    await this.loadAndRender();
                }
            });

            grid.append(card);
        });

        // Nếu còn ảnh chưa hiển thị -> Hiện nút "Xem thêm ảnh"
        if (this.filteredImages.length > this.currentLimit) {
            const remaining = this.filteredImages.length - this.currentLimit;
            const loadMoreBtn = $(`
                <div style="grid-column: 1 / -1; text-align: center; padding: 15px 0;">
                    <button id="kaiz-gallery-load-more" class="menu_button interactable" style="padding: 8px 24px; font-size: 13px;">
                        <i class="fa-solid fa-angles-down"></i> Tải thêm ảnh (${remaining} ảnh còn lại)
                    </button>
                </div>
            `);
            loadMoreBtn.find('button').on('click', () => {
                this.currentLimit += this.displayLimit;
                this.renderGrid();
            });
            grid.append(loadMoreBtn);
        }
    }

    private openPreview(img: GalleryImage): void {
        const $ = jQuery;
        this.currentPreviewImage = img;

        $('#kaiz-preview-img').attr('src', img.base64);
        $('#kaiz-preview-prompt-text').text(img.prompt);
        $('#kaiz-preview-date').text(this.formatDate(img.timestamp, true));
        $('#kaiz-preview-provider-badge').text((img.provider || 'gemini').toUpperCase());
        if (img.durationMs && img.durationMs > 0) {
            $('#kaiz-preview-duration-text').text(`${(img.durationMs / 1000).toFixed(1)}s`);
            $('#kaiz-preview-duration-badge').show();
        } else {
            $('#kaiz-preview-duration-badge').hide();
        }

        const previewModal = $('#kaiz-gallery-preview-modal')[0] as HTMLDialogElement;
        if (previewModal) {
            previewModal.showModal();
        }
    }

    private downloadImage(img: GalleryImage): void {
        const a = document.createElement('a');
        a.href = img.base64;
        const cleanPrompt = (img.prompt || 'kaiz_image')
            .replace(/[^a-zA-Z0-9]/g, '_')
            .substring(0, 25);
        a.download = `${cleanPrompt}_${img.timestamp || Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (typeof toastr !== 'undefined') toastr.success('Đang tải ảnh về máy...');
    }

    private formatDate(timestamp: number, full: boolean = false): string {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        const pad = (n: number) => (n < 10 ? '0' + n : n);
        const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
        if (full) {
            return `${time} ngày ${date}/${d.getFullYear()}`;
        }
        return `${time} ${date}`;
    }

    private escapeHtml(str: string): string {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
