import { KaizDB } from '../core/db';
import { UICustomizationEngine } from '../core/ui_customization_engine';

// Default theme JSONs — cần import để reload khi reset
import catppuccinTheme from '../core/tools/catppuccin';
import redesignTheme from '../core/tools/redesign';

declare const jQuery: any;

export class UICustomizationModal {
    constructor(
        private db: KaizDB,
        private uiEngine: UICustomizationEngine,
    ) {
        this.bindEvents();
    }

    private bindEvents() {
        const $ = jQuery;

        // Mở UI Snapshot Modal từ nút trên header
        $('#kaiz-chat-ui-custom-btn').off('click').on('click', async () => {
            await this.renderSnapshots();
            ($('#kaiz-ui-snapshot-modal')[0] as HTMLDialogElement).showModal();
        });

        $('#kaiz-ui-snapshot-close').off('click').on('click', () => {
            ($('#kaiz-ui-snapshot-modal')[0] as HTMLDialogElement).close();
        });

        // Nút mở Theme Library từ Snapshot Modal
        $('#kaiz-ui-theme-lib-btn').off('click').on('click', async () => {
            ($('#kaiz-ui-snapshot-modal')[0] as HTMLDialogElement).close();
            await this.renderThemeLibrary();
            ($('#kaiz-theme-library-modal')[0] as HTMLDialogElement).showModal();
        });

        $('#kaiz-theme-library-close').off('click').on('click', () => {
            ($('#kaiz-theme-library-modal')[0] as HTMLDialogElement).close();
            ($('#kaiz-ui-snapshot-modal')[0] as HTMLDialogElement).showModal(); // Quay lại
        });

        // Rollback all
        $('#kaiz-ui-rollback-all-btn').off('click').on('click', async () => {
            if (confirm('Bạn có chắc muốn rollback TẤT CẢ thay đổi UI không? (Vẫn giữ lịch sử)')) {
                await this.uiEngine.rollbackAll();
                await this.renderSnapshots();
            }
        });

        // Remove all (Delete everything)
        $('#kaiz-ui-remove-all-btn').off('click').on('click', async () => {
            if (confirm('Xóa TẤT CẢ thay đổi UI và XÓA LUÔN LỊCH SỬ. Bạn có chắc không?')) {
                await this.uiEngine.removeAllCustomizations();
                await this.renderSnapshots();
            }
        });

        // Theme Library: Upload JSON
        $('#kaiz-theme-upload-btn').off('click').on('click', () => {
            $('#kaiz-theme-upload-input').click();
        });

        $('#kaiz-theme-upload-input').off('change').on('change', (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (evt: any) => {
                try {
                    const content = evt.target?.result as string;
                    // Validate JSON
                    JSON.parse(content);
                    const name = file.name.replace('.json', '');

                    await this.db.addThemeReference({
                        name,
                        themeJson: content,
                        isDefault: false,
                        addedAt: Date.now()
                    });
                    
                    alert(`Đã thêm theme "${name}" thành công.`);
                    await this.renderThemeLibrary();
                } catch (err: any) {
                    alert('File không hợp lệ hoặc lỗi JSON: ' + err.message);
                }
                // Reset input
                $('#kaiz-theme-upload-input').val('');
            };
            reader.readAsText(file);
        });

        // Theme Library: Khôi phục Default — nạp lại ngay lập tức
        $('#kaiz-theme-reset-btn').off('click').on('click', async () => {
            if (confirm('Bạn có chắc muốn xóa tất cả custom themes và khôi phục về mặc định?')) {
                await this.db.clearThemeLibrary();
                // Nạp lại 2 theme mặc định ngay lập tức
                await this.loadDefaultThemes();
                alert('Đã khôi phục thư viện về mặc định (2 theme mẫu).');
                await this.renderThemeLibrary();
            }
        });
    }

    /**
     * Nạp 2 theme mặc định vào DB (dùng khi reset)
     */
    private async loadDefaultThemes(): Promise<void> {
        const defaults = [
            { name: 'Catppuccin Nights', json: catppuccinTheme },
            { name: 'SillyTavern Redesign', json: redesignTheme },
        ];
        for (const d of defaults) {
            await this.db.addThemeReference({
                name: d.name,
                themeJson: JSON.stringify(d.json),
                isDefault: true,
                addedAt: Date.now(),
            });
        }
    }

    private async renderSnapshots() {
        const $ = jQuery;
        const list = $('#kaiz-ui-snapshot-list');
        list.empty();

        const snapshots = await this.uiEngine.getSnapshotHistory();
        if (snapshots.length === 0) {
            list.append('<div style="color: #aaa; font-style: italic; text-align: center; padding: 20px;">Chưa có lịch sử thay đổi giao diện nào.</div>');
            return;
        }

        // Sort descending by timestamp (getAllSnapshots đã sort nhưng chắc chắn)
        snapshots.sort((a, b) => b.timestamp - a.timestamp);

        snapshots.forEach((snap) => {
            const date = new Date(snap.timestamp).toLocaleString();
            let icon = 'fa-code';
            let color = '#aaa';
            if (snap.type === 'css') { icon = 'fa-css3-alt'; color = '#3498db'; }
            else if (snap.type === 'element') { icon = 'fa-cube'; color = '#2ecc71'; }
            else if (snap.type === 'theme') { icon = 'fa-palette'; color = '#f1c40f'; }

            const statusBadge = snap.applied 
                ? '<span style="color: #2ecc71; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(46, 204, 113, 0.15);">Đang Áp dụng</span>'
                : '<span style="color: #e74c3c; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: rgba(231, 76, 60, 0.15);">Đã Rollback</span>';

            // Nút undo riêng cho từng snapshot (chỉ hiển thị cho snapshot đang applied)
            const undoBtn = snap.applied 
                ? `<button class="kaiz-snap-undo-btn menu_button interactable" data-snapshot-id="${snap.snapshotId}" style="padding: 3px 8px; height: auto; font-size: 11px; color: #f1c40f; border-color: rgba(241, 196, 15, 0.3);" title="Gỡ riêng thay đổi này (Cherry-pick)"><i class="fa-solid fa-eraser"></i></button>`
                : '';
                
            // Nút rollback về điểm này
            const rollbackToBtn = snap.applied 
                ? `<button class="kaiz-snap-rollback-to-btn menu_button interactable" data-snapshot-id="${snap.snapshotId}" style="padding: 3px 8px; height: auto; font-size: 11px; color: #3498db; border-color: rgba(52, 152, 219, 0.3);" title="Rollback lịch sử về điểm này (Xoá các thay đổi mới hơn)"><i class="fa-solid fa-clock-rotate-left"></i></button>`
                : '';
            
            // Nút xoá
            const deleteBtn = `<button class="kaiz-snap-del-btn menu_button interactable" data-snapshot-id="${snap.id}" style="padding: 3px 8px; height: auto; font-size: 11px; color: #ff6b6b; border-color: rgba(255, 107, 107, 0.3);" title="Xoá khỏi lịch sử"><i class="fa-solid fa-trash"></i></button>`;

            const item = $(`
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 10px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid ${icon}" style="color: ${color}; font-size: 18px; width: 24px; text-align: center; flex-shrink: 0;"></i>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${snap.label}</div>
                        <div style="font-size: 11px; color: #aaa; display: flex; align-items: center; gap: 6px; margin-top: 2px;">${date} ${statusBadge}</div>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        ${rollbackToBtn}
                        ${undoBtn}
                        ${deleteBtn}
                    </div>
                </div>
            `);
            list.append(item);
        });

        // Bind event: Undo từng snapshot
        list.find('.kaiz-snap-undo-btn').on('click', async (e: any) => {
            const snapshotId = $(e.currentTarget).attr('data-snapshot-id');
            if (!snapshotId) return;
            // Rollback trực tiếp snapshot này (cherry-pick undo)
            const result = await this.uiEngine.undoSpecific(snapshotId);
            if (result) {
                await this.renderSnapshots();
            }
        });
        
        // Bind event: Rollback về điểm này
        list.find('.kaiz-snap-rollback-to-btn').on('click', async (e: any) => {
            const snapshotId = $(e.currentTarget).attr('data-snapshot-id');
            if (!snapshotId) return;
            if (confirm('Khôi phục lịch sử về thời điểm này? (Tất cả các thay đổi mới hơn sẽ bị gỡ bỏ)')) {
                const count = await this.uiEngine.rollbackTo(snapshotId);
                if (count > 0) {
                    await this.renderSnapshots();
                } else {
                    toastr.info('Đây đã là phiên bản mới nhất.');
                }
            }
        });

        // Bind event: Xoá từng snapshot
        list.find('.kaiz-snap-del-btn').on('click', async (e: any) => {
            const idStr = $(e.currentTarget).attr('data-snapshot-id');
            if (!idStr) return;
            const id = parseInt(idStr, 10);
            if (isNaN(id)) return;
            
            if (confirm('Xoá bước này khỏi lịch sử? (Không rollback)')) {
                await this.db.deleteSnapshot(id);
                await this.renderSnapshots();
            }
        });
    }

    private async renderThemeLibrary() {
        const $ = jQuery;
        const list = $('#kaiz-theme-library-list');
        list.empty();

        const themes = await this.db.getAllThemeReferences();
        if (themes.length === 0) {
            list.append('<div style="color: #aaa; font-style: italic; text-align: center; padding: 20px;">Thư viện trống. Bấm "Khôi phục Default" để nạp lại theme mẫu.</div>');
            return;
        }

        themes.forEach((theme) => {
            const date = new Date(theme.addedAt).toLocaleString();
            const defaultTag = theme.isDefault ? '<span style="background: rgba(46, 204, 113, 0.2); color: #2ecc71; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">Mặc định</span>' : '';
            
            // Hiển thị kích thước theme JSON
            const sizeKB = (theme.themeJson.length / 1024).toFixed(1);
            
            const item = $(`
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 14px; color: #fff;">${theme.name} ${defaultTag}</div>
                        <div style="font-size: 11px; color: #aaa;">Đã thêm: ${date} · ${sizeKB} KB</div>
                    </div>
                    <button class="kaiz-del-theme-btn menu_button interactable" data-id="${theme.id}" style="padding: 4px 8px; color: #ff6b6b; height: auto;" title="Xoá theme này"><i class="fa-solid fa-trash"></i></button>
                </div>
            `);
            list.append(item);
        });

        // Bắt event xoá
        list.find('.kaiz-del-theme-btn').on('click', async (e: any) => {
            const idStr = $(e.currentTarget).attr('data-id');
            if (!idStr) return;
            const id = parseInt(idStr, 10);
            
            if (confirm('Bạn có chắc muốn xoá theme này khỏi thư viện?')) {
                await this.db.deleteThemeReference(id);
                await this.renderThemeLibrary();
            }
        });
    }
}
