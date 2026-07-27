import { KaizDB, BackupEntry } from '../core/db';
declare const jQuery: any;
const $ = jQuery;

export class BackupModal {
    private modal: any | null = null;
    private currentFilter: 'all' | 'character' | 'chat' | 'worldbook' = 'all';
    private db: KaizDB;

    constructor(db: KaizDB) {
        this.db = db;
    }

    public show(): void {
        this.render();
    }

    private render(): void {
        if ($('#kaiz-backup-modal').length === 0) {
            const html = `
                <div id="kaiz-backup-modal" class="kaiz-modal-overlay">
                    <div class="kaiz-modal-content" style="width: 600px; max-width: 90vw;">
                        <div class="kaiz-modal-header">
                            <h2 style="margin: 0; font-size: 1.2rem;"><i class="fa-solid fa-save"></i> Backup Manager</h2>
                            <div class="kaiz-modal-close" style="cursor: pointer; font-size: 1.2rem;"><i class="fa-solid fa-xmark"></i></div>
                        </div>
                        <div class="kaiz-backup-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px;">
                            <h3 style="margin: 0; font-size: 1.2em;">Backup Manager</h3>
                            <div id="kaiz-backup-storage-info" style="font-size: 0.85em; color: #aaa;">Calculating storage...</div>
                        </div>
                        <div class="kaiz-backup-tabs" style="display: flex; gap: 10px; margin-bottom: 15px; border-bottom: 1px solid var(--SmartThemeBorderColor);">
                            <div class="kaiz-tab active" data-type="all" style="padding: 8px 12px; cursor: pointer;">All</div>
                            <div class="kaiz-tab" data-type="character" style="padding: 8px 12px; cursor: pointer;">Characters</div>
                            <div class="kaiz-tab" data-type="chat" style="padding: 8px 12px; cursor: pointer;">Chats</div>
                            <div class="kaiz-tab" data-type="worldbook" style="padding: 8px 12px; cursor: pointer;">Worldbooks</div>
                        </div>
                        <div class="kaiz-backup-list" style="max-height: 400px; overflow-y: auto;">
                            <!-- Backup items will be rendered here -->
                        </div>
                        <div class="kaiz-modal-footer" style="margin-top: 15px; text-align: right;">
                            <button id="kaiz-backup-close-btn" class="menu_button">Close</button>
                        </div>
                    </div>
                </div>
            `;
            $('body').append(html);

            // Add basic styles
            if ($('#kaiz-backup-styles').length === 0) {
                $('head').append(`
                    <style id="kaiz-backup-styles">
                        .kaiz-modal-overlay {
                            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                            background: rgba(0, 0, 0, 0.6); z-index: 99999;
                            display: flex; justify-content: center; align-items: center;
                        }
                        .kaiz-modal-content {
                            background: var(--SmartThemeBlurTintColor);
                            backdrop-filter: blur(10px);
                            border: 1px solid var(--SmartThemeBorderColor);
                            border-radius: 8px; padding: 20px;
                            color: var(--SmartThemeBodyColor);
                            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                        }
                        .kaiz-modal-header {
                            display: flex; justify-content: space-between; align-items: center;
                            margin-bottom: 15px; padding-bottom: 10px;
                            border-bottom: 1px solid var(--SmartThemeBorderColor);
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
                        }
                        .kaiz-backup-item:hover {
                            background: rgba(255,255,255,0.05);
                        }
                        .kaiz-backup-info { flex: 1; }
                        .kaiz-backup-title { font-weight: bold; font-size: 1.1em; }
                        .kaiz-backup-meta { font-size: 0.85em; opacity: 0.7; margin-top: 4px; }
                        .kaiz-backup-actions { display: flex; gap: 8px; }
                    </style>
                `);
            }
        }

        this.modal = $('#kaiz-backup-modal');
        this.bindEvents();
        this.modal.fadeIn(200);
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
            this.modal?.fadeOut(200, () => {
                this.modal?.remove();
                this.modal = null;
            });
        });

        // Tabs
        this.modal.find('.kaiz-tab').on('click', (e: any) => {
            const target = $(e.currentTarget);
            this.modal!.find('.kaiz-tab').removeClass('active');
            target.addClass('active');
            this.currentFilter = target.attr('data-type') as any;
            this.loadBackups();
        });

        // Backup list actions
        this.modal.on('click', '.kaiz-backup-download', (e: any) => {
            const id = $(e.currentTarget).attr('data-id');
            if (id) this.downloadBackup(parseInt(id));
        });

        this.modal.on('click', '.kaiz-backup-delete', (e: any) => {
            const id = $(e.currentTarget).attr('data-id');
            if (id) {
                if (confirm('Are you sure you want to delete this backup?')) {
                    this.deleteBackup(parseInt(id));
                }
            }
        });
    }

    private async loadBackups(): Promise<void> {
        if (!this.modal) return;
        const listContainer = this.modal.find('.kaiz-backup-list');
        listContainer.html('<div style="text-align: center; padding: 20px;">Loading...</div>');

        try {
            const allBackups = await this.db.getBackups();
            let filtered = allBackups;

            if (this.currentFilter !== 'all') {
                filtered = allBackups.filter((b: any) => b.type === this.currentFilter);
            }

            if (filtered.length === 0) {
                listContainer.html(
                    '<div style="text-align: center; padding: 20px; color: #888;">No backups found.</div>',
                );
            } else {
                let html = '';
                let totalBytes = 0;
                filtered.forEach((b: any) => {
                    const date = new Date(b.timestamp).toLocaleString();
                    const sizeInBytes = new Blob([b.data]).size;
                    totalBytes += sizeInBytes;
                    const sizeKb = (sizeInBytes / 1024).toFixed(1);

                    const icon =
                        b.type === 'character' ? 'fa-user' : b.type === 'chat' ? 'fa-comments' : 'fa-book-atlas';

                    html += `
                        <div class="kaiz-backup-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 5px; margin-bottom: 8px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <i class="fa-solid ${icon}" style="font-size: 1.2em; color: #888;"></i>
                                <div>
                                    <div style="font-weight: bold;">${this.escapeHtml(b.name)}</div>
                                    <div style="font-size: 0.8em; color: #888;">${date} - ${sizeKb} KB</div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button class="kaiz-backup-download kaiz-btn" data-id="${b.id}" style="padding: 5px 10px; background: #2c3e50; border: none; color: white; cursor: pointer; border-radius: 3px;" title="Download"><i class="fa-solid fa-download"></i></button>
                                <button class="kaiz-backup-delete kaiz-btn" data-id="${b.id}" style="padding: 5px 10px; background: #c0392b; border: none; color: white; cursor: pointer; border-radius: 3px;" title="Delete"><i class="fa-solid fa-trash"></i></button>
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
                this.modal.find('#kaiz-backup-storage-info').text(`Storage: ${usedMb}MB / ${quotaMb}MB used`);
            } else {
                this.modal.find('#kaiz-backup-storage-info').text('Storage info not available');
            }
        } catch (error) {
            console.error('[BackupModal] Error loading backups:', error);
            listContainer.html('<div style="color: red; padding: 10px;">Error loading backups. Check console.</div>');
        }
    }

    private async downloadBackup(id: number): Promise<void> {
        try {
            const backups = await this.db.getBackups();
            const backup = backups.find((b: any) => b.id === id);
            if (!backup) {
                alert('Backup not found!');
                return;
            }

            // Create blob and download
            const blob = new Blob([backup.data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Format file name
            const safeName = backup.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const dateStr = new Date(backup.timestamp).toISOString().split('T')[0];
            const extension = backup.type === 'chat' ? 'jsonl' : 'json';
            a.download = `${safeName}_backup_${dateStr}.${extension}`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('[BackupModal] Error downloading backup:', error);
            alert('Failed to download backup.');
        }
    }

    private async deleteBackup(id: number): Promise<void> {
        try {
            await this.db.deleteBackup(id);
            this.loadBackups(); // Refresh list
        } catch (error) {
            console.error('[BackupModal] Error deleting backup:', error);
            alert('Failed to delete backup.');
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
