import { KaizDB } from '../core/db';
import { SillyTavernAdapter } from '../adapters/st_adapter';
declare const jQuery: any;
const $ = jQuery;

export class BackupModal {
    private modal: any | null = null;
    private currentFilter: 'all' | 'character' | 'chat' | 'worldbook' = 'all';
    private db: KaizDB;
    private adapter: SillyTavernAdapter;

    constructor(db: KaizDB, adapter?: SillyTavernAdapter) {
        this.db = db;
        this.adapter = adapter || new SillyTavernAdapter();
    }

    public show(): void {
        this.render();
    }

    private render(): void {
        if ($('#kaiz-backup-modal').length === 0) {
            const html = `
                <dialog id="kaiz-backup-modal" class="kaiz-modal-content" style="width: 650px; max-width: 90vw; padding: 0; background: transparent; border: none;">
                    <div style="background: var(--SmartThemeBlurTintColor); backdrop-filter: blur(10px); border: 1px solid var(--SmartThemeBorderColor); border-radius: 8px; padding: 20px; color: var(--SmartThemeBodyColor); box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                        <div class="kaiz-modal-header">
                            <h2 style="margin: 0; font-size: 1.2rem;"><i class="fa-solid fa-save"></i> Backup Manager</h2>
                            <div class="kaiz-modal-close" style="cursor: pointer; font-size: 1.2rem;"><i class="fa-solid fa-xmark"></i></div>
                        </div>
                        <div class="kaiz-backup-header">
                            <h3 style="margin: 0; font-size: 1.2em;">Bản sao lưu hệ thống</h3>
                            <div id="kaiz-backup-storage-info" style="font-size: 0.85em; color: #aaa;">Đang tính toán dung lượng...</div>
                        </div>
                        <div class="kaiz-backup-tabs">
                            <div class="kaiz-tab active" data-type="all" style="padding: 8px 12px; cursor: pointer;">Tất cả</div>
                            <div class="kaiz-tab" data-type="character" style="padding: 8px 12px; cursor: pointer;">Nhân vật (Cards)</div>
                            <div class="kaiz-tab" data-type="chat" style="padding: 8px 12px; cursor: pointer;">Đoạn chat</div>
                            <div class="kaiz-tab" data-type="worldbook" style="padding: 8px 12px; cursor: pointer;">Worldbooks</div>
                        </div>
                        <div class="kaiz-backup-list" style="max-height: 420px; overflow-y: auto;">
                            <!-- Backup items will be rendered here -->
                        </div>
                        <div class="kaiz-modal-footer" style="margin-top: 15px; text-align: right;">
                            <button id="kaiz-backup-close-btn" class="menu_button">Đóng</button>
                        </div>
                    </div>
                </dialog>
            `;
            $('body').append(html);

            // Add basic styles
            if ($('#kaiz-backup-styles').length === 0) {
                $('head').append(`
                    <style id="kaiz-backup-styles">
                        dialog#kaiz-backup-modal::backdrop {
                            background: rgba(0, 0, 0, 0.6);
                            backdrop-filter: blur(2px);
                        }
                        .kaiz-modal-header {
                            display: flex; justify-content: space-between; align-items: center;
                            margin-bottom: 15px; padding-bottom: 10px;
                            border-bottom: 1px solid var(--SmartThemeBorderColor);
                        }
                        .kaiz-backup-header {
                            display: flex; justify-content: space-between; align-items: center; 
                            border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px;
                            flex-wrap: wrap; gap: 5px;
                        }
                        .kaiz-backup-tabs {
                            display: flex; gap: 10px; margin-bottom: 15px; 
                            border-bottom: 1px solid var(--SmartThemeBorderColor);
                            flex-wrap: wrap;
                        }
                        .kaiz-tab {
                            opacity: 0.6; transition: opacity 0.2s;
                        }
                        .kaiz-tab:hover { opacity: 0.8; }
                        .kaiz-tab.active {
                            opacity: 1; border-bottom: 2px solid var(--SmartThemeBodyColor);
                        }
                        .kaiz-backup-item {
                            display: flex; justify-content: space-between; align-items: center;
                            padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);
                            background: rgba(0,0,0,0.2); border-radius: 6px; margin-bottom: 8px;
                            flex-wrap: wrap; gap: 10px; transition: background 0.2s;
                        }
                        .kaiz-backup-item:hover {
                            background: rgba(255,255,255,0.06);
                        }
                        .kaiz-backup-info { flex: 1; min-width: 0; }
                        .kaiz-backup-title { 
                            font-weight: bold; font-size: 1.05em; 
                            word-break: break-word; overflow-wrap: anywhere;
                            display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
                        }
                        .kaiz-backup-meta { font-size: 0.85em; opacity: 0.7; margin-top: 4px; }
                        .kaiz-backup-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
                        .kaiz-backup-badge-png {
                            background: #27ae60; color: #ffffff; font-size: 0.7em; font-weight: bold;
                            padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px;
                        }
                        .kaiz-backup-badge-json {
                            background: #d35400; color: #ffffff; font-size: 0.7em; font-weight: bold;
                            padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px;
                        }
                    </style>
                `);
            }
        }

        this.modal = $('#kaiz-backup-modal');
        this.bindEvents();
        if (!this.modal[0].open) {
            this.modal[0].showModal();
        }
        this.loadBackups();
    }

    private bindEvents(): void {
        if (!this.modal) return;

        // Remove old events
        this.modal.off();
        this.modal.find('.kaiz-tab').off();
        this.modal.find('.kaiz-modal-close, #kaiz-backup-close-btn').off();

        // Close
        this.modal.find('.kaiz-modal-close, #kaiz-backup-close-btn').on('click', () => {
            this.modal[0].close();
            this.modal.remove();
            this.modal = null;
        });

        // Tabs
        this.modal.find('.kaiz-tab').on('click', (e: any) => {
            const target = $(e.currentTarget);
            this.modal!.find('.kaiz-tab').removeClass('active');
            target.addClass('active');
            this.currentFilter = target.attr('data-type') as any;
            this.loadBackups();
        });

        // Backup list actions: Download
        this.modal.on('click', '.kaiz-backup-download', (e: any) => {
            const id = $(e.currentTarget).attr('data-id');
            if (id) this.downloadBackup(parseInt(id));
        });

        // Backup list actions: Restore
        this.modal.on('click', '.kaiz-backup-restore', (e: any) => {
            const id = $(e.currentTarget).attr('data-id');
            if (id) this.restoreBackup(parseInt(id));
        });

        // Backup list actions: Delete
        this.modal.on('click', '.kaiz-backup-delete', (e: any) => {
            const id = $(e.currentTarget).attr('data-id');
            if (id) {
                if (confirm('Bạn có chắc chắn muốn xóa bản sao lưu này khỏi bộ nhớ không?')) {
                    this.deleteBackup(parseInt(id));
                }
            }
        });
    }

    private async loadBackups(): Promise<void> {
        if (!this.modal) return;
        const listContainer = this.modal.find('.kaiz-backup-list');
        listContainer.html('<div style="text-align: center; padding: 20px;">Đang tải danh sách bản sao lưu...</div>');

        try {
            const allBackups = await this.db.getBackups();
            let filtered = allBackups;

            if (this.currentFilter !== 'all') {
                filtered = allBackups.filter((b: any) => b.type === this.currentFilter);
            }

            if (filtered.length === 0) {
                listContainer.html(
                    '<div style="text-align: center; padding: 20px; color: #888;">Chưa có bản sao lưu nào.</div>',
                );
            } else {
                let html = '';
                filtered.forEach((b: any) => {
                    const date = new Date(b.timestamp).toLocaleString();
                    const sizeInBytes = new Blob([b.data]).size;
                    const sizeKb = (sizeInBytes / 1024).toFixed(1);

                    const icon =
                        b.type === 'character' ? 'fa-user' : b.type === 'chat' ? 'fa-comments' : 'fa-book-atlas';

                    const isCharacter = b.type === 'character';
                    const isPng =
                        b.format === 'png' || (typeof b.data === 'string' && b.data.startsWith('data:image/png'));

                    let badgeHtml = '';
                    if (isCharacter) {
                        badgeHtml = isPng
                            ? `<span class="kaiz-backup-badge-png">PNG</span>`
                            : `<span class="kaiz-backup-badge-json">JSON</span>`;
                    }

                    // Avatar or Icon preview
                    const visualPreview =
                        isCharacter && (b.avatarUrl || isPng)
                            ? `<img src="${b.avatarUrl || b.data}" alt="${this.escapeHtml(b.name)}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.3);" />`
                            : `<div style="width: 44px; height: 44px; border-radius: 6px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fa-solid ${icon}" style="font-size: 1.3em; color: #888;"></i></div>`;

                    html += `
                        <div class="kaiz-backup-item">
                            <div class="kaiz-backup-info" style="display: flex; align-items: center; gap: 12px;">
                                ${visualPreview}
                                <div style="min-width: 0;">
                                    <div class="kaiz-backup-title">
                                        <span>${this.escapeHtml(b.name)}</span>
                                        ${badgeHtml}
                                    </div>
                                    <div class="kaiz-backup-meta">${date} • ${sizeKb} KB</div>
                                </div>
                            </div>
                            <div class="kaiz-backup-actions">
                                ${
                                    isCharacter
                                        ? `<button class="kaiz-backup-restore kaiz-btn" data-id="${b.id}" style="padding: 6px 12px; background: #2980b9; border: none; color: white; cursor: pointer; border-radius: 4px; font-size: 0.85em;" title="Khôi phục vào SillyTavern"><i class="fa-solid fa-rotate-left"></i> Khôi phục</button>`
                                        : ''
                                }
                                <button class="kaiz-backup-download kaiz-btn" data-id="${b.id}" style="padding: 6px 10px; background: #2c3e50; border: none; color: white; cursor: pointer; border-radius: 4px;" title="Tải về máy"><i class="fa-solid fa-download"></i></button>
                                <button class="kaiz-backup-delete kaiz-btn" data-id="${b.id}" style="padding: 6px 10px; background: #c0392b; border: none; color: white; cursor: pointer; border-radius: 4px;" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>
                    `;
                });
                listContainer.html(html);
            }

            // Update storage estimation
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                const usedMb = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
                const quotaMb = ((estimate.quota || 0) / (1024 * 1024)).toFixed(2);
                this.modal.find('#kaiz-backup-storage-info').text(`Bộ nhớ đã dùng: ${usedMb}MB / ${quotaMb}MB`);
            } else {
                this.modal.find('#kaiz-backup-storage-info').text('');
            }
        } catch (error) {
            console.error('[BackupModal] Error loading backups:', error);
            listContainer.html(
                '<div style="color: red; padding: 10px;">Lỗi khi tải danh sách bản sao lưu. Vui lòng kiểm tra Console.</div>',
            );
        }
    }

    private async downloadBackup(id: number): Promise<void> {
        try {
            const backups = await this.db.getBackups();
            const backup = backups.find((b: any) => b.id === id);
            if (!backup) {
                alert('Không tìm thấy bản sao lưu!');
                return;
            }

            const safeName = backup.name.replace(/[/\\:*?"<>|]/g, '_');
            const dateStr = new Date(backup.timestamp).toISOString().split('T')[0];
            const isPng =
                backup.format === 'png' ||
                (typeof backup.data === 'string' && backup.data.startsWith('data:image/png'));

            let blob: Blob;
            let extension: string;

            if (isPng) {
                // Convert Data URL to binary blob
                const b64 = backup.data.replace(/^data:image\/png;base64,/, '');
                const bin = window.atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) {
                    bytes[i] = bin.charCodeAt(i);
                }
                blob = new Blob([bytes], { type: 'image/png' });
                extension = 'png';
            } else {
                blob = new Blob([backup.data], { type: 'application/json' });
                extension = backup.type === 'chat' ? 'jsonl' : 'json';
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}_backup_${dateStr}.${extension}`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('[BackupModal] Error downloading backup:', error);
            alert('Lỗi khi tải bản sao lưu về máy.');
        }
    }

    private async restoreBackup(id: number): Promise<void> {
        try {
            const backups = await this.db.getBackups();
            const backup = backups.find((b: any) => b.id === id);
            if (!backup) {
                alert('Không tìm thấy bản sao lưu!');
                return;
            }

            if (
                !confirm(
                    `Bạn có chắc chắn muốn khôi phục thẻ nhân vật [${backup.name}] từ bản sao lưu này vào SillyTavern không?\nThao tác này sẽ cập nhật các trường thông tin của nhân vật hiện tại.`,
                )
            ) {
                return;
            }

            const res = await this.adapter.restoreCharacterBackup(backup);
            alert(`✅ ${res.message}`);
        } catch (error: any) {
            console.error('[BackupModal] Error restoring backup:', error);
            alert(`❌ Không thể khôi phục bản sao lưu: ${error.message}`);
        }
    }

    private async deleteBackup(id: number): Promise<void> {
        try {
            await this.db.deleteBackup(id);
            this.loadBackups(); // Refresh list
        } catch (error) {
            console.error('[BackupModal] Error deleting backup:', error);
            alert('Lỗi khi xóa bản sao lưu.');
        }
    }

    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
