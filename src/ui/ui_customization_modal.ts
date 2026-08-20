import { KaizDB } from '../core/db';
import { UICustomizationEngine } from '../core/ui_customization_engine';

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
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
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

        // Theme Library: Khôi phục Default
        $('#kaiz-theme-reset-btn').off('click').on('click', async () => {
            if (confirm('Bạn có chắc muốn xóa tất cả custom themes và khôi phục về mặc định?')) {
                await this.db.clearThemeLibrary();
                // Import tool `ensureDefaultThemes` functionality is triggered next time `get_reference_themes` runs, 
                // but since we want it immediately visible, we will trigger it via tool or manually here.
                // We'll just clear it and tell user they'll be auto-loaded next time.
                alert('Đã xóa tất cả themes. Các theme mặc định sẽ được nạp lại tự động khi AI yêu cầu.');
                await this.renderThemeLibrary();
            }
        });
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

        // Sort descending by timestamp
        snapshots.sort((a, b) => b.timestamp - a.timestamp);

        snapshots.forEach((snap) => {
            const date = new Date(snap.timestamp).toLocaleString();
            let icon = 'fa-code';
            let color = '#aaa';
            if (snap.type === 'css') { icon = 'fa-css3-alt'; color = '#3498db'; }
            else if (snap.type === 'element') { icon = 'fa-cube'; color = '#2ecc71'; }
            else if (snap.type === 'theme') { icon = 'fa-palette'; color = '#f1c40f'; }

            const statusHtml = snap.applied 
                ? '<span style="color: #2ecc71; font-size: 11px; margin-left: auto;">[Đang Áp dụng]</span>'
                : '<span style="color: #e74c3c; font-size: 11px; margin-left: auto;">[Đã Rollback]</span>';

            const item = $(`
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 10px; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid ${icon}" style="color: ${color}; font-size: 18px; width: 24px; text-align: center;"></i>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${snap.label}</div>
                        <div style="font-size: 11px; color: #aaa;">${date}</div>
                    </div>
                    ${statusHtml}
                </div>
            `);
            list.append(item);
        });
    }

    private async renderThemeLibrary() {
        const $ = jQuery;
        const list = $('#kaiz-theme-library-list');
        list.empty();

        const themes = await this.db.getAllThemeReferences();
        if (themes.length === 0) {
            list.append('<div style="color: #aaa; font-style: italic; text-align: center; padding: 20px;">Thư viện trống. Theme mặc định sẽ tự nạp khi cần.</div>');
            return;
        }

        themes.forEach((theme) => {
            const date = new Date(theme.addedAt).toLocaleString();
            const defaultTag = theme.isDefault ? '<span style="background: rgba(46, 204, 113, 0.2); color: #2ecc71; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;">Mặc định</span>' : '';
            
            const item = $(`
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 14px; color: #fff;">${theme.name} ${defaultTag}</div>
                        <div style="font-size: 11px; color: #aaa;">Đã thêm: ${date}</div>
                    </div>
                    ${!theme.isDefault ? `<button class="kaiz-del-theme-btn menu_button interactable" data-id="${theme.id}" style="padding: 4px 8px; color: #ff6b6b; height: auto;"><i class="fa-solid fa-trash"></i></button>` : ''}
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
