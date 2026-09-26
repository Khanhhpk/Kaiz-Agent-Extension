import { KaizDB, PresetCommitEntry } from '../core/db';
import { PresetGitManager, PromptBlock } from '../core/tools/preset_helpers';

declare const jQuery: any;
declare const toastr: any;

const escapeHtml = (str: string): string =>
    (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export class PresetGitModal {
    private manager = PresetGitManager.getInstance();
    private currentSelectedPreset: string = '';
    private commitsCache: PresetCommitEntry[] = [];
    private searchQuery: string = '';

    constructor(private db: KaizDB) {
        this.bindEvents();
    }

    private isModalOpen(): boolean {
        const modal = document.getElementById('kaiz-preset-git-modal') as HTMLDialogElement | null;
        return !!(modal && modal.open);
    }

    private bindEvents(): void {
        const $ = jQuery;

        // 1. Mở Modal từ Header Tools Dropdown
        $('#kaiz-chat-preset-git-btn')
            .off('click')
            .on('click', async () => {
                $('#kaiz-chat-tools-menu').hide();
                await this.open();
            });

        // 2. Đóng Modal
        $('#kaiz-pg-close-btn')
            .off('click')
            .on('click', () => {
                this.close();
            });

        // 4. Nút Làm Mới
        $('#kaiz-pg-refresh-btn')
            .off('click')
            .on('click', async () => {
                await this.refresh();
                if (typeof toastr !== 'undefined') toastr.info('Đã làm mới dữ liệu Git Preset.');
            });

        // 5. Thay đổi Preset trong Selector Dropdown
        $('#kaiz-pg-preset-select')
            .off('change')
            .on('change', async (e: any) => {
                const val = $(e.target).val();
                if (val) {
                    this.currentSelectedPreset = val;
                    await this.loadAndRender();
                }
            });

        // 6. Tìm kiếm Timeline
        $('#kaiz-pg-timeline-search')
            .off('input')
            .on('input', (e: any) => {
                this.searchQuery = ($(e.target).val() || '').trim().toLowerCase();
                this.renderCommitList();
            });

        // 7. Hủy Nháp / Khôi phục về HEAD (Discard)
        $('#kaiz-pg-discard-staged-btn')
            .off('click')
            .on('click', async () => {
                if (
                    confirm(
                        'Bạn có chắc muốn hủy bỏ toàn bộ các thay đổi chưa lưu để khôi phục preset về phiên bản gần nhất (HEAD) không?',
                    )
                ) {
                    const res = await this.manager.discard();
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.warning(res.summary);
                }
            });

        // 8. Xem Diff Chưa Lưu (Diff against HEAD / Staging)
        $('#kaiz-pg-view-staged-diff-btn')
            .off('click')
            .on('click', async () => {
                const dirtyInfo = await this.manager.isDirtyAgainstHead();
                const diff = dirtyInfo.diff;
                const title = dirtyInfo.isStaged
                    ? 'Thay đổi trong Vùng Nháp (Staging Diff)'
                    : 'Thay đổi chưa lưu so với phiên bản hiện tại (Working Tree Diff)';
                this.openDiffModal(title, diff.items, this.manager.getPrompts());
            });

        // 9. Manual Commit (Tiết kiệm API)
        $('#kaiz-pg-manual-commit-btn')
            .off('click')
            .on('click', async () => {
                await this.handleManualCommit();
            });

        // 10. Prune Commits (Cắt tỉa bộ nhớ)
        $('#kaiz-pg-prune-btn')
            .off('click')
            .on('click', async () => {
                if (
                    confirm(
                        `Bạn có muốn cắt tỉa lịch sử của preset "${this.currentSelectedPreset}", chỉ giữ lại 30 commit gần nhất để giải phóng bộ nhớ?`,
                    )
                ) {
                    const res = await this.manager.pruneCommits(30);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.success(res.summary);
                }
            });

        // 11. Xóa toàn bộ lịch sử commit của preset này
        $('#kaiz-pg-clear-history-btn')
            .off('click')
            .on('click', async () => {
                if (
                    confirm(
                        `⚠️ CẢNH BÁO: Bạn có chắc chắn muốn XÓA SẠCH toàn bộ lịch sử commit của preset "${this.currentSelectedPreset}" không? Hành động này sẽ giải phóng toàn bộ bộ nhớ của preset này nhưng không thể hoàn tác.`,
                    )
                ) {
                    await this.db.deletePresetCommits(this.currentSelectedPreset);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined')
                        toastr.success(`Đã xóa sạch lịch sử commit của preset "${this.currentSelectedPreset}".`);
                }
            });

        // 12. Đóng Diff Modal
        $('#kaiz-pg-diff-close')
            .off('click')
            .on('click', () => {
                const diffModal = $('#kaiz-preset-diff-modal')[0] as HTMLDialogElement;
                if (diffModal) diffModal.close();
            });

        // 13. Tự động đồng bộ khi quay lại cửa sổ hoặc SillyTavern cập nhật preset
        window.addEventListener('focus', async () => {
            if (this.isModalOpen()) {
                await this.loadAndRender();
            }
        });

        const win = window as any;
        if (win.SillyTavern && typeof win.SillyTavern.getContext === 'function') {
            try {
                const ctx = win.SillyTavern.getContext();
                ctx?.eventSource?.on?.('oai_preset_changed_after', async () => {
                    if (this.isModalOpen()) {
                        await this.loadAndRender();
                    }
                });
            } catch {
                // ignore
            }
        }
    }

    public async open(): Promise<void> {
        const $ = jQuery;
        const modal = $('#kaiz-preset-git-modal')[0] as HTMLDialogElement;
        if (modal) {
            modal.style.display = 'flex';
            modal.showModal();
            await this.refresh();
        }
    }

    public close(): void {
        const $ = jQuery;
        const modal = $('#kaiz-preset-git-modal')[0] as HTMLDialogElement;
        if (modal && modal.open) {
            modal.close();
            modal.style.display = 'none';
        }
    }

    public async refresh(): Promise<void> {
        const activeName = this.manager.getActivePresetName();
        if (!this.currentSelectedPreset) {
            this.currentSelectedPreset = activeName;
        }

        // Đảm bảo preset đang kích hoạt luôn có mốc commit ban đầu để tính diff
        if (this.currentSelectedPreset === activeName) {
            await this.manager.ensureInitialCommit(activeName);
        }

        // 1. Nạp danh sách Presets
        await this.populatePresetSelector();

        // 2. Nạp dữ liệu và render
        await this.loadAndRender();
    }

    private async populatePresetSelector(): Promise<void> {
        const $ = jQuery;
        const select = $('#kaiz-pg-preset-select');
        const activeName = this.manager.getActivePresetName();
        const savedPresets = await this.db.getDistinctPresetNames();

        const presetSet = new Set<string>();
        if (activeName) presetSet.add(activeName);
        for (const p of savedPresets) {
            if (p) presetSet.add(p);
        }

        select.empty();
        for (const p of presetSet) {
            const isLive = p === activeName;
            const label = isLive ? `⭐ ${p} (Đang dùng)` : `📦 ${p}`;
            const opt = $('<option>').val(p).text(label);
            if (p === this.currentSelectedPreset) {
                opt.prop('selected', true);
            }
            select.append(opt);
        }
    }

    private async loadAndRender(): Promise<void> {
        const $ = jQuery;
        const activeName = this.manager.getActivePresetName();
        const isCurrentActive = this.currentSelectedPreset === activeName;

        // Cập nhật badge Live Active
        if (isCurrentActive) {
            $('#kaiz-pg-active-badge')
                .text('Live Active')
                .removeClass('badge-neutral')
                .addClass('badge-success')
                .show();
            $('#kaiz-pg-staging-card').show();
        } else {
            $('#kaiz-pg-active-badge')
                .text('Archived History')
                .removeClass('badge-success')
                .addClass('badge-neutral')
                .show();
            $('#kaiz-pg-staging-card').hide(); // Staging chỉ áp dụng cho preset đang active
        }

        // 1. Thống kê bộ nhớ & metrics
        await this.renderStorageMetrics();

        // 2. Render Staging Sandbox
        if (isCurrentActive) {
            await this.renderStagingSandbox();
        }

        // 3. Render Lịch sử Commit
        this.commitsCache = await this.db.getPresetCommits(this.currentSelectedPreset, 100);
        await this.renderCommitList();
    }

    private async renderStorageMetrics(): Promise<void> {
        const $ = jQuery;
        const stats = await this.db.getPresetStorageStats();
        const headHash = await this.manager.getHeadCommitHash(this.currentSelectedPreset);

        const currentPresetStats = stats.byPreset[this.currentSelectedPreset] || { commits: 0, bytes: 0 };

        $('#kaiz-pg-stat-memory').text(
            `${formatBytes(currentPresetStats.bytes)} (Tổng: ${formatBytes(stats.totalBytes)})`,
        );
        $('#kaiz-pg-stat-commits').text(`${currentPresetStats.commits} (Toàn hệ thống: ${stats.totalCommits})`);
        $('#kaiz-pg-stat-presets').text(`${stats.presetCount} presets`);
        $('#kaiz-pg-stat-head').text(headHash ? headHash.substring(0, 8) : 'none');
    }

    private async renderStagingSandbox(): Promise<void> {
        const $ = jQuery;
        const dirtyInfo = await this.manager.isDirtyAgainstHead();
        const isDirty = dirtyInfo.isDirty;
        const diff = dirtyInfo.diff;
        const isStaged = dirtyInfo.isStaged;

        if (isDirty) {
            const badgeLabel = isStaged
                ? `● ${diff.totalChanges} thay đổi chưa lưu (Nháp)`
                : `● ${diff.totalChanges} thay đổi chưa lưu`;

            $('#kaiz-pg-staging-badge')
                .text(badgeLabel)
                .removeClass('badge-neutral badge-success')
                .addClass('badge-warning');

            const sourceText = isStaged
                ? '(Dữ liệu SillyTavern gốc chưa bị ghi đè)'
                : '(Thay đổi từ giao diện SillyTavern chưa được lưu thành mốc)';

            $('#kaiz-pg-staging-summary').html(
                `<b>Có ${diff.totalChanges} thay đổi chưa lưu:</b> +${diff.added} tạo mới, ~${diff.modified} chỉnh sửa, -${diff.deleted} đã xóa. ${sourceText}`,
            );

            $('#kaiz-pg-staging-actions').css('display', 'flex');

            // Render staged items preview
            const list = $('#kaiz-pg-staged-list');
            list.empty().css('display', 'flex');

            for (const item of diff.items.slice(0, 5)) {
                let badgeColor = '#38bdf8';
                let icon = 'fa-pen';
                if (item.type === 'create') {
                    badgeColor = '#2ecc71';
                    icon = 'fa-plus';
                } else if (item.type === 'delete') {
                    badgeColor = '#e74c3c';
                    icon = 'fa-trash';
                }

                list.append(`
                    <div style="font-size: 11px; display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; border-left: 3px solid ${badgeColor}">
                        <i class="fa-solid ${icon}" style="color: ${badgeColor}; font-size: 10px"></i>
                        <span style="font-weight: 500">${escapeHtml(item.name || item.identifier || item.type)}:</span>
                        <span style="opacity: 0.8">${escapeHtml(item.summary)}</span>
                    </div>
                `);
            }

            if (diff.items.length > 5) {
                list.append(
                    `<div style="font-size: 10px; opacity: 0.6; padding-left: 8px">...và còn ${diff.items.length - 5} thay đổi khác (bấm "Xem Thay Đổi" để xem hết)</div>`,
                );
            }
        } else {
            $('#kaiz-pg-staging-badge')
                .text('Đồng bộ')
                .removeClass('badge-warning badge-danger')
                .addClass('badge-success');

            $('#kaiz-pg-staging-summary').text(
                'Trạng thái đồng bộ — Preset đang ở phiên bản mới nhất, không có chỉnh sửa dở dang.',
            );

            $('#kaiz-pg-staging-actions').hide();
            $('#kaiz-pg-staged-list').empty().hide();
        }
    }

    private async handleManualCommit(): Promise<void> {
        const $ = jQuery;
        const msg = ($('#kaiz-pg-commit-msg-input').val() || '').trim();
        const tag = ($('#kaiz-pg-commit-tag-input').val() || '').trim();

        if (!msg) {
            if (typeof toastr !== 'undefined')
                toastr.warning('Vui lòng nhập tên hoặc mô tả mốc lưu trước khi bấm Lưu!');
            $('#kaiz-pg-commit-msg-input').focus();
            return;
        }

        const dirtyInfo = await this.manager.isDirtyAgainstHead();
        if (!dirtyInfo.isDirty && !tag) {
            if (typeof toastr !== 'undefined') toastr.warning('Preset hiện tại chưa có thay đổi nào mới để lưu!');
            return;
        }

        try {
            const result = await this.manager.manualCommit(msg, tag || undefined, true);
            $('#kaiz-pg-commit-msg-input').val('');
            $('#kaiz-pg-commit-tag-input').val('');

            await this.loadAndRender();

            if (typeof toastr !== 'undefined') {
                toastr.success(`Đã lưu phiên bản [#${result.hash.substring(0, 8)}] thành công!`);
            }
        } catch (e: any) {
            console.error('[PresetGitModal] Commit thất bại:', e);
            if (typeof toastr !== 'undefined') toastr.error(`Lỗi khi lưu phiên bản: ${e.message}`);
        }
    }

    private async renderCommitList(): Promise<void> {
        const $ = jQuery;
        const container = $('#kaiz-pg-commit-list');
        container.empty();

        const headHash = await this.manager.getHeadCommitHash(this.currentSelectedPreset);
        const headCommit = this.commitsCache.find((c) => c.hash === headHash);
        const headTimestamp = headCommit ? headCommit.timestamp : 0;

        let filtered = this.commitsCache;
        if (this.searchQuery) {
            filtered = this.commitsCache.filter(
                (c) =>
                    c.hash.toLowerCase().includes(this.searchQuery) ||
                    (c.message || '').toLowerCase().includes(this.searchQuery) ||
                    (c.tag || '').toLowerCase().includes(this.searchQuery) ||
                    (c.author || '').toLowerCase().includes(this.searchQuery),
            );
        }

        if (filtered.length === 0) {
            container.append(`
                <div style="text-align: center; padding: 45px 20px; opacity: 0.65; display: flex; flex-direction: column; align-items: center; gap: 8px">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255, 255, 255, 0.04); display: flex; align-items: center; justify-content: center; font-size: 20px; color: #a78bfa; margin-bottom: 4px">
                        <i class="fa-solid fa-timeline"></i>
                    </div>
                    <div style="font-size: 13.5px; font-weight: 500; color: #f1f5f9">
                        ${this.searchQuery ? 'Không tìm thấy phiên bản phù hợp' : 'Chưa có mốc lịch sử nào cho preset này'}
                    </div>
                    <div style="font-size: 11.5px; max-width: 380px; line-height: 1.5; opacity: 0.75">
                        ${this.searchQuery ? 'Thử tìm với từ khóa khác như mã hash, tag hoặc tên thay đổi.' : 'Mọi thay đổi qua Kaiz Agent hoặc nút "Lưu phiên bản" phía trên sẽ tự động xuất hiện tại đây.'}
                    </div>
                </div>
            `);
            return;
        }

        filtered.forEach((commit) => {
            const isHead = commit.hash === headHash;
            const isOlder = headCommit ? commit.timestamp < headTimestamp : false;
            const isNewer = headCommit ? commit.timestamp > headTimestamp : false;

            const dateStr = formatRelativeTime(commit.timestamp);
            const fullDateStr = new Date(commit.timestamp).toLocaleString();
            const author = commit.author || 'Kaiz Agent';
            const isManual = author.toLowerCase().includes('manual') || author.toLowerCase().includes('user');

            const authorBadge = isManual
                ? `<span style="background: rgba(56, 189, 248, 0.12); color: #7dd3fc; border: 1px solid rgba(56, 189, 248, 0.25); padding: 1px 6px; border-radius: 4px; font-size: 10px"><i class="fa-solid fa-user"></i> Bạn lưu</span>`
                : `<span style="background: rgba(167, 139, 250, 0.12); color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.25); padding: 1px 6px; border-radius: 4px; font-size: 10px"><i class="fa-solid fa-robot"></i> Agent</span>`;

            const tagBadge = commit.tag
                ? `<span style="background: rgba(251, 191, 36, 0.12); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 500"><i class="fa-solid fa-tag"></i> ${escapeHtml(commit.tag)}</span>`
                : '';

            const headPill = isHead
                ? `<span style="background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.35); padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 600"><i class="fa-solid fa-check"></i> Đang dùng</span>`
                : '';

            const promptCount = commit.tree?.prompts?.length || 0;
            let diffSummary = commit.diffSummary || (commit as any).diff?.summary || `${promptCount} blocks`;
            if (diffSummary.includes('thay đổi chưa lưu')) {
                diffSummary = diffSummary.replace(/Preset có \d+ thay đổi chưa lưu:\s*/i, '');
            }

            // Node dot
            let dotHtml: string;
            if (isHead) {
                dotHtml = `<div class="kaiz-pg-timeline-dot is-head" title="Phiên bản đang kích hoạt"><i class="fa-solid fa-check"></i></div>`;
            } else if (isManual) {
                dotHtml = `<div class="kaiz-pg-timeline-dot is-manual" title="Mốc lưu thủ công"><i class="fa-solid fa-user"></i></div>`;
            } else {
                dotHtml = `<div class="kaiz-pg-timeline-dot is-agent" title="Kaiz Agent lưu"><i class="fa-solid fa-robot"></i></div>`;
            }

            // Navigation Main Button
            let navActionBtn: string;
            if (isHead) {
                navActionBtn = `<button class="kaiz-pg-btn-primary-action menu_button" disabled style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); opacity: 0.95; cursor: default"><i class="fa-solid fa-circle-check"></i> Đang sử dụng</button>`;
            } else if (isOlder) {
                navActionBtn = `
                    <button class="kaiz-pg-btn-rollback kaiz-pg-btn-primary-action menu_button interactable" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3)" title="Khôi phục lại phiên bản này (Các mốc mới hơn vẫn được lưu an toàn trong lịch sử)">
                        <i class="fa-solid fa-rotate-left"></i> Quay lại bản này
                    </button>
                `;
            } else if (isNewer) {
                navActionBtn = `
                    <button class="kaiz-pg-btn-forward kaiz-pg-btn-primary-action menu_button interactable" style="background: rgba(167, 139, 250, 0.15); color: #c4b5fd; border: 1px solid rgba(167, 139, 250, 0.35)" title="Đi tới phiên bản này cùng các thay đổi tích lũy">
                        <i class="fa-solid fa-forward"></i> Đi tới bản này
                    </button>
                `;
            } else {
                navActionBtn = `
                    <button class="kaiz-pg-btn-rollback kaiz-pg-btn-primary-action menu_button interactable" style="background: rgba(56, 189, 248, 0.12); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3)">
                        <i class="fa-solid fa-rotate-left"></i> Khôi phục
                    </button>
                `;
            }

            // Subtle hard reset button for older commits
            const hardResetBtn = isOlder
                ? `<button class="kaiz-pg-btn-hard-reset kaiz-pg-icon-btn danger menu_button interactable" title="Quay về mốc này và xóa các bản mới hơn phía sau để dọn bộ nhớ"><i class="fa-solid fa-trash-can"></i></button>`
                : '';

            const shortHash = commit.hash.substring(0, 8);

            const cardNode = $(`
                <div class="kaiz-pg-timeline-node">
                    ${dotHtml}
                    <div class="kaiz-pg-commit-card ${isHead ? 'is-head' : ''}" data-hash="${commit.hash}">
                        <!-- Row 1: Message & Relative Time -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px">
                            <div style="font-size: 13.5px; font-weight: 600; color: #f8fafc; line-height: 1.4; word-break: break-word">
                                ${escapeHtml(commit.message)}
                            </div>
                            <div style="font-size: 11px; opacity: 0.6; white-space: nowrap; flex-shrink: 0" title="${fullDateStr}">
                                <i class="fa-regular fa-clock" style="margin-right: 3px"></i>${dateStr}
                            </div>
                        </div>

                        <!-- Row 2: Badges, Hash & Change Summary -->
                        <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 11px">
                            <span class="kaiz-pg-hash-btn" title="Mã phiên bản (Bấm để sao chép)">
                                <i class="fa-regular fa-copy" style="font-size: 9px; margin-right: 2px; opacity: 0.7"></i>#${shortHash}
                            </span>
                            ${headPill}
                            ${authorBadge}
                            ${tagBadge}
                            <span style="opacity: 0.6; margin-left: 2px; font-size: 10.5px">
                                <i class="fa-solid fa-layer-group" style="font-size: 10px; margin-right: 3px"></i>${escapeHtml(diffSummary)}
                            </span>
                        </div>

                        <!-- Row 3: Action Buttons -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 6px; margin-top: 2px">
                            <div>
                                ${navActionBtn}
                            </div>
                            <div style="display: flex; align-items: center; gap: 5px">
                                <button class="kaiz-pg-btn-diff kaiz-pg-icon-btn menu_button interactable" title="Xem chi tiết các thay đổi">
                                    <i class="fa-solid fa-eye"></i>
                                </button>
                                <button class="kaiz-pg-btn-tag kaiz-pg-icon-btn menu_button interactable" title="Gán nhãn mốc (Ví dụ: v1.0)">
                                    <i class="fa-solid fa-tag"></i>
                                </button>
                                ${hardResetBtn}
                            </div>
                        </div>
                    </div>
                </div>
            `);

            // Event Copy Hash
            cardNode.find('.kaiz-pg-hash-btn').on('click', () => {
                navigator.clipboard.writeText(commit.hash);
                if (typeof toastr !== 'undefined') toastr.info(`Đã sao chép mã commit: #${shortHash}`);
            });

            // Event View Diff
            cardNode.find('.kaiz-pg-btn-diff').on('click', () => {
                this.viewCommitDiff(commit);
            });

            // Event Add Tag
            cardNode.find('.kaiz-pg-btn-tag').on('click', async () => {
                const newTag = prompt(`Nhập tên nhãn cho mốc [#${shortHash}]:`, commit.tag || 'v1.0');
                if (newTag && newTag.trim()) {
                    await this.manager.tagCommit(commit.hash, newTag.trim());
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã gắn tag "${newTag}" cho mốc [#${shortHash}]!`);
                    }
                }
            });

            // Event Rollback (Older)
            cardNode.find('.kaiz-pg-btn-rollback').on('click', async () => {
                if (
                    confirm(
                        `Bạn có chắc chắn muốn quay lại phiên bản [#${shortHash}] ("${commit.message}") không?\n(Toàn bộ các phiên bản mới hơn vẫn được lưu giữ an toàn, bạn có thể quay lại bất cứ lúc nào)`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, false);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.success(res.summary);
                }
            });

            // Event Forward (Newer)
            cardNode.find('.kaiz-pg-btn-forward').on('click', async () => {
                if (
                    confirm(
                        `Bạn có chắc chắn muốn chuyển tiếp tới phiên bản [#${shortHash}] ("${commit.message}") không?`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, false);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.success(res.summary);
                }
            });

            // Event Hard Reset
            cardNode.find('.kaiz-pg-btn-hard-reset').on('click', async () => {
                if (
                    confirm(
                        `⚠️ CẢNH BÁO DỌN DẸP BỘ NHỚ:\nBạn có chắc muốn quay về mốc [#${shortHash}] VÀ XÓA BỎ toàn bộ các mốc sinh ra sau thời điểm này để giải phóng dung lượng không?`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, true);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.warning(res.summary);
                }
            });

            container.append(cardNode);
        });
    }

    private viewCommitDiff(commit: PresetCommitEntry): void {
        const title = `Chi tiết thay đổi [#${commit.hash.substring(0, 8)}]: "${commit.message}"`;
        const items = commit.diffItems || (commit as any).diff?.items || [];
        this.openDiffModal(title, items, commit.tree?.prompts || []);
    }

    private openDiffModal(title: string, items: any[], fullPrompts?: PromptBlock[]): void {
        const $ = jQuery;
        $('#kaiz-pg-diff-modal-title').text(title);
        const body = $('#kaiz-pg-diff-body');
        body.empty();

        if (!items || items.length === 0) {
            if (fullPrompts && fullPrompts.length > 0) {
                body.append(`
                    <div style="padding: 12px; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px">
                        <div style="color: #38bdf8; font-weight: 600; margin-bottom: 8px; font-size: 13px">Nội dung Snapshot (${fullPrompts.length} prompt blocks):</div>
                        ${fullPrompts
                            .map(
                                (p, i) => `
                            <div style="margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px">
                                <div style="color: #34d399; font-weight: 500; font-size: 12px">#${i + 1} [${p.identifier}] ${escapeHtml(p.name)} <span style="opacity: 0.6; font-size: 11px">(${p.role || 'system'})</span></div>
                                <div style="color: #cbd5e1; font-size: 11px; white-space: pre-wrap; overflow-y: auto; margin-top: 4px; background: rgba(0,0,0,0.2); padding: 6px 8px; border-radius: 4px">${escapeHtml(p.content || '')}</div>
                            </div>
                        `,
                            )
                            .join('')}
                    </div>
                `);
            } else {
                body.append(
                    `<div style="text-align: center; padding: 35px 20px; opacity: 0.6">Không có thông tin thay đổi chi tiết được ghi nhận cho mốc này.</div>`,
                );
            }
        } else {
            const promptMap = new Map<string, PromptBlock>();
            if (Array.isArray(fullPrompts) && fullPrompts.length > 0) {
                fullPrompts.forEach((p) => {
                    if (p?.identifier) promptMap.set(p.identifier, p);
                });
            }
            try {
                const mgrPrompts = this.manager.getPrompts();
                if (Array.isArray(mgrPrompts)) {
                    mgrPrompts.forEach((p) => {
                        if (p?.identifier && !promptMap.has(p.identifier)) {
                            promptMap.set(p.identifier, p);
                        }
                    });
                }
            } catch {
                // ignore
            }

            body.append(`
                <div class="kaiz-diff-toolbar">
                    <div class="kaiz-diff-toolbar-info">
                        <span class="kaiz-diff-toolbar-count">
                            <i class="fa-solid fa-list-check" style="color: #38bdf8"></i>
                            <strong>${items.length}</strong> mục thay đổi
                        </span>
                        <span class="kaiz-diff-toolbar-sub">(Mặc định thu gọn • Bấm vào để mở/đóng)</span>
                    </div>
                    <div class="kaiz-diff-toolbar-actions">
                        <button id="kaiz-diff-expand-all-btn" class="kaiz-diff-btn-action interactable" type="button" title="Mở rộng tất cả các mục thay đổi">
                            <i class="fa-solid fa-angles-down"></i> Mở rộng tất cả
                        </button>
                        <button id="kaiz-diff-collapse-all-btn" class="kaiz-diff-btn-action interactable" type="button" title="Thu gọn tất cả các mục thay đổi">
                            <i class="fa-solid fa-angles-up"></i> Thu gọn tất cả
                        </button>
                    </div>
                </div>
            `);

            items.forEach((item, index) => {
                let badgeColor = '#38bdf8';
                let typeLabel = 'THAY ĐỔI';
                if (item.type === 'create') {
                    badgeColor = '#34d399';
                    typeLabel = 'TẠO MỚI';
                } else if (item.type === 'delete') {
                    badgeColor = '#f87171';
                    typeLabel = 'XÓA BỎ';
                } else if (item.type === 'update') {
                    badgeColor = '#fbbf24';
                    typeLabel = 'CHỈNH SỬA';
                } else if (item.type === 'reorder') {
                    badgeColor = '#818cf8';
                    typeLabel = 'ĐỔI THỨ TỰ';
                } else if (item.type === 'varUpdate') {
                    badgeColor = '#fb923c';
                    typeLabel = 'CẬP NHẬT VAR';
                } else if (item.type === 'varRename') {
                    badgeColor = '#a78bfa';
                    typeLabel = 'ĐỔI TÊN VAR';
                }

                // Build card HTML
                let contentHtml = '';

                if (item.type === 'update' && item.oldValue && item.newValue) {
                    // ── Separate metadata changes from content changes ──
                    const oldBlock = item.oldValue as PromptBlock;
                    const newBlock = item.newValue as PromptBlock;

                    const oldContent = (oldBlock.content || '').replace(/\r\n/g, '\n');
                    const newContent = (newBlock.content || '').replace(/\r\n/g, '\n');
                    const contentChanged = oldContent !== newContent;

                    // Metadata pills
                    const metaPills: string[] = [];
                    if ((oldBlock.name || '') !== (newBlock.name || ''))
                        metaPills.push(
                            `📝 Name: <span class="kaiz-diff-old">${escapeHtml(oldBlock.name || '')}</span> → <span class="kaiz-diff-new">${escapeHtml(newBlock.name || '')}</span>`,
                        );
                    if ((oldBlock.role || 'system') !== (newBlock.role || 'system'))
                        metaPills.push(
                            `🎭 Role: <span class="kaiz-diff-old">${escapeHtml(oldBlock.role || 'system')}</span> → <span class="kaiz-diff-new">${escapeHtml(newBlock.role || 'system')}</span>`,
                        );
                    if ((oldBlock.enabled !== false) !== (newBlock.enabled !== false))
                        metaPills.push(
                            `👁 Enabled: <span class="kaiz-diff-old">${oldBlock.enabled !== false}</span> → <span class="kaiz-diff-new">${newBlock.enabled !== false}</span>`,
                        );
                    if ((oldBlock.injection_depth ?? 4) !== (newBlock.injection_depth ?? 4))
                        metaPills.push(
                            `📏 Depth: <span class="kaiz-diff-old">${oldBlock.injection_depth ?? 4}</span> → <span class="kaiz-diff-new">${newBlock.injection_depth ?? 4}</span>`,
                        );
                    if ((oldBlock.injection_position ?? 0) !== (newBlock.injection_position ?? 0))
                        metaPills.push(
                            `📍 Position: <span class="kaiz-diff-old">${oldBlock.injection_position ?? 0}</span> → <span class="kaiz-diff-new">${newBlock.injection_position ?? 0}</span>`,
                        );
                    if ((oldBlock.injection_order ?? 100) !== (newBlock.injection_order ?? 100))
                        metaPills.push(
                            `🔢 Order: <span class="kaiz-diff-old">${oldBlock.injection_order ?? 100}</span> → <span class="kaiz-diff-new">${newBlock.injection_order ?? 100}</span>`,
                        );
                    if (Boolean(oldBlock.system_prompt) !== Boolean(newBlock.system_prompt))
                        metaPills.push(
                            `⚙ System: <span class="kaiz-diff-old">${Boolean(oldBlock.system_prompt)}</span> → <span class="kaiz-diff-new">${Boolean(newBlock.system_prompt)}</span>`,
                        );
                    if (Boolean(oldBlock.forbid_overrides) !== Boolean(newBlock.forbid_overrides))
                        metaPills.push(
                            `🔒 ForbidOverrides: <span class="kaiz-diff-old">${Boolean(oldBlock.forbid_overrides)}</span> → <span class="kaiz-diff-new">${Boolean(newBlock.forbid_overrides)}</span>`,
                        );

                    if (metaPills.length > 0) {
                        contentHtml += `<div class="kaiz-diff-meta-pills">${metaPills.map((p) => `<span class="kaiz-diff-meta-pill">${p}</span>`).join('')}</div>`;
                    }

                    if (contentChanged) {
                        contentHtml += buildUnifiedDiffHtml(oldContent, newContent);
                    }
                } else if (item.type === 'create' && item.newValue) {
                    const newBlock = item.newValue as PromptBlock;
                    const content = (newBlock.content || '').replace(/\r\n/g, '\n');
                    if (content) {
                        contentHtml += buildCreatedContentHtml(content);
                    }
                } else if (item.type === 'delete' && item.oldValue) {
                    const oldBlock = item.oldValue as PromptBlock;
                    const content = (oldBlock.content || '').replace(/\r\n/g, '\n');
                    if (content) {
                        contentHtml += buildDeletedContentHtml(content);
                    }
                } else if (item.type === 'reorder') {
                    contentHtml += buildReorderDiffHtml(item, promptMap);
                } else {
                    // varUpdate, varRename, or unknown — simple old→new
                    const oldStr = item.oldValue !== undefined && item.oldValue !== null ? String(item.oldValue) : '';
                    const newStr = item.newValue !== undefined && item.newValue !== null ? String(item.newValue) : '';
                    if (oldStr || newStr) {
                        contentHtml += `<div class="kaiz-diff-simple">`;
                        if (oldStr) contentHtml += `<div class="kaiz-diff-simple-old">- ${escapeHtml(oldStr)}</div>`;
                        if (newStr) contentHtml += `<div class="kaiz-diff-simple-new">+ ${escapeHtml(newStr)}</div>`;
                        contentHtml += `</div>`;
                    }
                }

                const hasContent = Boolean(contentHtml && contentHtml.trim());

                body.append(`
                    <div class="kaiz-diff-item ${hasContent ? 'kaiz-diff-collapsed has-content' : 'no-content'}">
                        <div class="kaiz-diff-item-toggle ${hasContent ? 'interactable' : ''}" ${hasContent ? 'title="Bấm để mở rộng / thu gọn chi tiết"' : ''}>
                            <div class="kaiz-diff-item-header">
                                <div class="kaiz-diff-header-left">
                                    <span class="kaiz-diff-badge" style="background: ${badgeColor}18; color: ${badgeColor}; border-color: ${badgeColor}35">
                                        #${index + 1} ${typeLabel}
                                    </span>
                                    <span class="kaiz-diff-identifier">[${escapeHtml(item.identifier || item.name || '')}]</span>
                                </div>
                                ${
                                    hasContent
                                        ? `
                                <div class="kaiz-diff-header-right">
                                    <span class="kaiz-diff-toggle-state-label"></span>
                                    <i class="fa-solid fa-chevron-right kaiz-diff-chevron"></i>
                                </div>
                                `
                                        : ''
                                }
                            </div>
                            <div class="kaiz-diff-summary">${escapeHtml(item.summary || '')}</div>
                        </div>
                        ${
                            hasContent
                                ? `
                        <div class="kaiz-diff-item-content" style="display: none">
                            ${contentHtml}
                        </div>
                        `
                                : ''
                        }
                    </div>
                `);
            });

            // Toggle expand/collapse for individual diff items
            body.find('.kaiz-diff-item.has-content .kaiz-diff-item-toggle')
                .off('click')
                .on('click', function (this: HTMLElement) {
                    const itemEl = $(this).closest('.kaiz-diff-item');
                    const contentEl = itemEl.find('.kaiz-diff-item-content');
                    const isCollapsed = itemEl.hasClass('kaiz-diff-collapsed');

                    if (isCollapsed) {
                        itemEl.removeClass('kaiz-diff-collapsed').addClass('kaiz-diff-expanded');
                        contentEl.slideDown(150);
                    } else {
                        itemEl.removeClass('kaiz-diff-expanded').addClass('kaiz-diff-collapsed');
                        contentEl.slideUp(150);
                    }
                });

            // Global Expand All / Collapse All
            body.find('#kaiz-diff-expand-all-btn')
                .off('click')
                .on('click', function () {
                    const itemsWithContent = body.find('.kaiz-diff-item.has-content');
                    itemsWithContent.removeClass('kaiz-diff-collapsed').addClass('kaiz-diff-expanded');
                    itemsWithContent.find('.kaiz-diff-item-content').slideDown(150);
                });

            body.find('#kaiz-diff-collapse-all-btn')
                .off('click')
                .on('click', function () {
                    const itemsWithContent = body.find('.kaiz-diff-item.has-content');
                    itemsWithContent.removeClass('kaiz-diff-expanded').addClass('kaiz-diff-collapsed');
                    itemsWithContent.find('.kaiz-diff-item-content').slideUp(150);
                });

            // Interactive cross-column highlight for reordered blocks
            body.find('.kaiz-diff-reorder-block')
                .off('mouseenter mouseleave')
                .on('mouseenter', function (this: HTMLElement) {
                    const blockId = $(this).attr('data-block-id');
                    if (blockId) {
                        body.find(`.kaiz-diff-reorder-block[data-block-id="${blockId}"]`).addClass(
                            'kaiz-diff-reorder-highlight',
                        );
                    }
                })
                .on('mouseleave', function (this: HTMLElement) {
                    body.find('.kaiz-diff-reorder-block').removeClass('kaiz-diff-reorder-highlight');
                });
        }

        const diffModal = $('#kaiz-preset-diff-modal')[0] as HTMLDialogElement;
        if (diffModal) {
            diffModal.style.display = 'flex';
            diffModal.showModal();
        }
    }
}

function formatRelativeTime(timestamp: number): string {
    const diff = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ngày trước`;
    return new Date(timestamp).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ─── Unified Line Diff Engine ────────────────────────────────────────────────

/** Compute LCS table for two string arrays. */
function lcsTable(a: string[], b: string[]): number[][] {
    const m = a.length;
    const n = b.length;
    // Use two-row rolling array to save memory
    let prev = new Array(n + 1).fill(0);
    let curr: number[];
    const table: number[][] = new Array(m + 1);
    table[0] = prev.slice();
    for (let i = 1; i <= m; i++) {
        curr = new Array(n + 1).fill(0);
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                curr[j] = prev[j - 1] + 1;
            } else {
                curr[j] = Math.max(prev[j], curr[j - 1]);
            }
        }
        prev = curr.slice();
        table[i] = prev.slice();
    }
    return table;
}

type DiffLine = { type: 'context' | 'add' | 'del'; text: string; lineOld?: number; lineNew?: number };

/** Generate a unified list of diff lines via LCS backtrack. */
function generateLineDiff(oldLines: string[], newLines: string[]): DiffLine[] {
    const table = lcsTable(oldLines, newLines);
    const result: DiffLine[] = [];

    function backtrack(i: number, j: number): void {
        if (i === 0 && j === 0) return;
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            backtrack(i - 1, j - 1);
            result.push({ type: 'context', text: oldLines[i - 1], lineOld: i, lineNew: j });
        } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
            backtrack(i, j - 1);
            result.push({ type: 'add', text: newLines[j - 1], lineNew: j });
        } else {
            backtrack(i - 1, j);
            result.push({ type: 'del', text: oldLines[i - 1], lineOld: i });
        }
    }

    backtrack(oldLines.length, newLines.length);
    return result;
}

const DIFF_CONTEXT_SIZE = 2; // lines of context around each change

/** Build escaped HTML for the unified diff viewer.
 *
 * Strategy to handle prompts of any length correctly:
 * 1. Strip common prefix lines (O(n) pass) — these are always unchanged.
 * 2. Strip common suffix lines (O(n) pass).
 * 3. Run LCS only on the "changed middle" region — guarantees changes anywhere
 *    in the file (e.g. line 800 of 1000) are always found and fully shown.
 * 4. Render prefix/suffix as fold separators with absolute line numbers.
 */
function buildUnifiedDiffHtml(oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    // ── Step 1: strip common prefix ──────────────────────────────────────────
    let prefixLen = 0;
    while (prefixLen < oldLines.length && prefixLen < newLines.length && oldLines[prefixLen] === newLines[prefixLen]) {
        prefixLen++;
    }

    // ── Step 2: strip common suffix ──────────────────────────────────────────
    let suffixLen = 0;
    while (
        suffixLen < oldLines.length - prefixLen &&
        suffixLen < newLines.length - prefixLen &&
        oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
    ) {
        suffixLen++;
    }

    // ── Step 3: extract middle (changed) region ───────────────────────────────
    const oldEnd = suffixLen > 0 ? oldLines.length - suffixLen : oldLines.length;
    const newEnd = suffixLen > 0 ? newLines.length - suffixLen : newLines.length;
    const oldMiddle = oldLines.slice(prefixLen, oldEnd);
    const newMiddle = newLines.slice(prefixLen, newEnd);

    // ── Step 4: run LCS on middle only ────────────────────────────────────────
    // LCS input is already limited to the changed region after prefix/suffix strip.
    // No cap needed — show the full diff.
    const diffLines = generateLineDiff(oldMiddle, newMiddle);

    // Shift line numbers to absolute positions
    diffLines.forEach((dl) => {
        if (dl.lineOld !== undefined) dl.lineOld += prefixLen;
        if (dl.lineNew !== undefined) dl.lineNew += prefixLen;
    });

    // ── Step 5: mark lines near changes for context folding ───────────────────
    const visible = new Set<number>();
    diffLines.forEach((dl, idx) => {
        if (dl.type !== 'context') {
            for (
                let k = Math.max(0, idx - DIFF_CONTEXT_SIZE);
                k <= Math.min(diffLines.length - 1, idx + DIFF_CONTEXT_SIZE);
                k++
            ) {
                visible.add(k);
            }
        }
    });

    // ── Step 6: render ─────────────────────────────────────────────────────────
    let html = '<div class="kaiz-diff-unified">';

    // Show common prefix fold
    if (prefixLen >= 3) {
        html += `<div class="kaiz-diff-fold">⸺ ${prefixLen} dòng đầu không đổi ⸺</div>`;
    } else if (prefixLen > 0) {
        // Show the 1–2 prefix lines as context (with absolute line numbers)
        for (let p = 0; p < prefixLen; p++) {
            const ln = String(p + 1).padStart(3, ' ');
            html += `<div class="kaiz-diff-line kaiz-diff-ctx"><span class="kaiz-diff-ln">${escapeHtml(ln)} ${escapeHtml(ln)}</span><span class="kaiz-diff-sign"> </span><span class="kaiz-diff-text">${escapeHtml(oldLines[p])}</span></div>`;
        }
    }

    let i = 0;
    while (i < diffLines.length) {
        if (visible.has(i)) {
            const dl = diffLines[i];
            const lineNumOld = dl.lineOld !== undefined ? String(dl.lineOld).padStart(3, ' ') : '   ';
            const lineNumNew = dl.lineNew !== undefined ? String(dl.lineNew).padStart(3, ' ') : '   ';
            const lineNums = `<span class="kaiz-diff-ln">${escapeHtml(lineNumOld)} ${escapeHtml(lineNumNew)}</span>`;
            if (dl.type === 'del') {
                html += `<div class="kaiz-diff-line kaiz-diff-del">${lineNums}<span class="kaiz-diff-sign">-</span><span class="kaiz-diff-text">${escapeHtml(dl.text)}</span></div>`;
            } else if (dl.type === 'add') {
                html += `<div class="kaiz-diff-line kaiz-diff-add">${lineNums}<span class="kaiz-diff-sign">+</span><span class="kaiz-diff-text">${escapeHtml(dl.text)}</span></div>`;
            } else {
                html += `<div class="kaiz-diff-line kaiz-diff-ctx">${lineNums}<span class="kaiz-diff-sign"> </span><span class="kaiz-diff-text">${escapeHtml(dl.text)}</span></div>`;
            }
            i++;
        } else {
            // Count consecutive hidden context lines
            let j = i;
            while (j < diffLines.length && !visible.has(j)) j++;
            const skipped = j - i;
            if (skipped >= 3) {
                html += `<div class="kaiz-diff-fold">⸺ ${skipped} dòng không đổi ⸺</div>`;
                i = j;
            } else {
                while (i < j) {
                    const dl = diffLines[i];
                    const lineNumOld = dl.lineOld !== undefined ? String(dl.lineOld).padStart(3, ' ') : '   ';
                    const lineNumNew = dl.lineNew !== undefined ? String(dl.lineNew).padStart(3, ' ') : '   ';
                    const lineNums = `<span class="kaiz-diff-ln">${escapeHtml(lineNumOld)} ${escapeHtml(lineNumNew)}</span>`;
                    html += `<div class="kaiz-diff-line kaiz-diff-ctx">${lineNums}<span class="kaiz-diff-sign"> </span><span class="kaiz-diff-text">${escapeHtml(dl.text)}</span></div>`;
                    i++;
                }
            }
        }
    }

    // Show common suffix fold
    if (suffixLen >= 3) {
        html += `<div class="kaiz-diff-fold">⸺ ${suffixLen} dòng cuối không đổi ⸺</div>`;
    } else if (suffixLen > 0) {
        const startOld = oldLines.length - suffixLen;
        const startNew = newLines.length - suffixLen;
        for (let s = 0; s < suffixLen; s++) {
            const lnOld = String(startOld + s + 1).padStart(3, ' ');
            const lnNew = String(startNew + s + 1).padStart(3, ' ');
            html += `<div class="kaiz-diff-line kaiz-diff-ctx"><span class="kaiz-diff-ln">${escapeHtml(lnOld)} ${escapeHtml(lnNew)}</span><span class="kaiz-diff-sign"> </span><span class="kaiz-diff-text">${escapeHtml(oldLines[startOld + s])}</span></div>`;
        }
    }

    html += '</div>';
    return html;
}

/** Build HTML for a newly created block's content (all-green). */
function buildCreatedContentHtml(content: string): string {
    const lines = content.split('\n');
    let html = '<div class="kaiz-diff-unified">';
    lines.forEach((line, i) => {
        html += `<div class="kaiz-diff-line kaiz-diff-add"><span class="kaiz-diff-ln">   ${String(i + 1).padStart(3, ' ')}</span><span class="kaiz-diff-sign">+</span><span class="kaiz-diff-text">${escapeHtml(line)}</span></div>`;
    });
    html += '</div>';
    return html;
}

/** Build HTML for a deleted block's content (all-red). */
function buildDeletedContentHtml(content: string): string {
    const lines = content.split('\n');
    let html = '<div class="kaiz-diff-unified">';
    lines.forEach((line, i) => {
        html += `<div class="kaiz-diff-line kaiz-diff-del"><span class="kaiz-diff-ln">${String(i + 1).padStart(3, ' ')}   </span><span class="kaiz-diff-sign">-</span><span class="kaiz-diff-text">${escapeHtml(line)}</span></div>`;
    });
    html += '</div>';
    return html;
}

interface OrderBlockItem {
    identifier: string;
    name: string;
    role: string;
    enabled: boolean;
}

function normalizeOrderItem(raw: any, promptMap?: Map<string, PromptBlock>): OrderBlockItem {
    if (typeof raw === 'string') {
        const p = promptMap?.get(raw);
        return {
            identifier: raw,
            name: p?.name || raw,
            role: p?.role || 'system',
            enabled: p?.enabled !== false,
        };
    }
    if (raw && typeof raw === 'object') {
        const id = String(raw.identifier || raw.id || '');
        const p = promptMap?.get(id);
        return {
            identifier: id,
            name: String(raw.name || p?.name || id || '(không tên)'),
            role: String(raw.role || p?.role || 'system'),
            enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : p?.enabled !== false,
        };
    }
    return {
        identifier: String(raw || ''),
        name: String(raw || ''),
        role: 'system',
        enabled: true,
    };
}

function buildReorderDiffHtml(item: any, promptMap: Map<string, PromptBlock>): string {
    const rawOld = Array.isArray(item.oldValue) ? item.oldValue : [];
    const rawNew = Array.isArray(item.newValue) ? item.newValue : [];

    const oldBlocks: OrderBlockItem[] = rawOld.map((r: any) => normalizeOrderItem(r, promptMap));
    const newBlocks: OrderBlockItem[] = rawNew.map((r: any) => normalizeOrderItem(r, promptMap));

    if (oldBlocks.length === 0 && newBlocks.length === 0) {
        return `<div style="font-size: 11px; opacity: 0.65; font-style: italic; padding: 6px 0">Không có thông tin thứ tự block.</div>`;
    }

    let movedCount = 0;
    let addedCount = 0;
    let removedCount = 0;

    oldBlocks.forEach((ob: OrderBlockItem, oldIdx: number) => {
        const newIdx = newBlocks.findIndex((nb: OrderBlockItem) => nb.identifier === ob.identifier);
        if (newIdx === -1) {
            removedCount++;
        } else if (newIdx !== oldIdx) {
            movedCount++;
        }
    });

    newBlocks.forEach((nb: OrderBlockItem) => {
        if (!oldBlocks.some((ob: OrderBlockItem) => ob.identifier === nb.identifier)) {
            addedCount++;
        }
    });

    const oldCardsHtml = oldBlocks
        .map((block: OrderBlockItem, oldIdx: number) => {
            const oldPos = oldIdx + 1;
            const newIdx = newBlocks.findIndex((nb: OrderBlockItem) => nb.identifier === block.identifier);
            let status: string;
            let badgeHtml: string;

            if (newIdx === -1) {
                status = 'removed';
                badgeHtml = `<span class="kaiz-diff-reorder-badge removed" title="Đã bị gỡ khỏi danh sách linked blocks"><i class="fa-solid fa-minus"></i> Gỡ bỏ</span>`;
            } else if (newIdx !== oldIdx) {
                status = 'moved';
                const newPos = newIdx + 1;
                badgeHtml = `<span class="kaiz-diff-reorder-badge moved" title="Chuyển sang vị trí #${newPos} ở thứ tự mới"><i class="fa-solid fa-arrow-right"></i> #${newPos}</span>`;
            } else {
                status = 'same';
                badgeHtml = `<span class="kaiz-diff-reorder-badge same" title="Vị trí không đổi"><i class="fa-solid fa-check"></i> Không đổi</span>`;
            }

            return `
                <div class="kaiz-diff-reorder-block status-${status}" data-block-id="${escapeHtml(block.identifier)}">
                    <div class="kaiz-diff-reorder-block-main">
                        <span class="kaiz-diff-reorder-idx">#${oldPos}</span>
                        <div class="kaiz-diff-reorder-info">
                            <div class="kaiz-diff-reorder-name-row">
                                <span class="kaiz-diff-reorder-name" title="${escapeHtml(block.name)}">${escapeHtml(block.name)}</span>
                                ${!block.enabled ? '<span class="kaiz-diff-reorder-disabled-pill" title="Block đang tắt">Tắt</span>' : ''}
                            </div>
                            <div class="kaiz-diff-reorder-meta-row">
                                <span class="kaiz-diff-reorder-id">[${escapeHtml(block.identifier)}]</span>
                                <span class="kaiz-diff-reorder-role">${escapeHtml(block.role)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="kaiz-diff-reorder-badge-wrap">
                        ${badgeHtml}
                    </div>
                </div>
            `;
        })
        .join('');

    const newCardsHtml = newBlocks
        .map((block: OrderBlockItem, newIdx: number) => {
            const newPos = newIdx + 1;
            const oldIdx = oldBlocks.findIndex((ob: OrderBlockItem) => ob.identifier === block.identifier);
            let status: string;
            let badgeHtml: string;

            if (oldIdx === -1) {
                status = 'added';
                badgeHtml = `<span class="kaiz-diff-reorder-badge added" title="Thêm mới vào thứ tự"><i class="fa-solid fa-plus"></i> Mới thêm</span>`;
            } else if (oldIdx !== newIdx) {
                status = 'moved';
                const oldPos = oldIdx + 1;
                badgeHtml = `<span class="kaiz-diff-reorder-badge moved-target" title="Chuyển từ vị trí #${oldPos} ở thứ tự cũ"><i class="fa-solid fa-arrow-left"></i> từ #${oldPos}</span>`;
            } else {
                status = 'same';
                badgeHtml = `<span class="kaiz-diff-reorder-badge same" title="Vị trí không đổi"><i class="fa-solid fa-check"></i> Không đổi</span>`;
            }

            return `
                <div class="kaiz-diff-reorder-block status-${status}" data-block-id="${escapeHtml(block.identifier)}">
                    <div class="kaiz-diff-reorder-block-main">
                        <span class="kaiz-diff-reorder-idx">#${newPos}</span>
                        <div class="kaiz-diff-reorder-info">
                            <div class="kaiz-diff-reorder-name-row">
                                <span class="kaiz-diff-reorder-name" title="${escapeHtml(block.name)}">${escapeHtml(block.name)}</span>
                                ${!block.enabled ? '<span class="kaiz-diff-reorder-disabled-pill" title="Block đang tắt">Tắt</span>' : ''}
                            </div>
                            <div class="kaiz-diff-reorder-meta-row">
                                <span class="kaiz-diff-reorder-id">[${escapeHtml(block.identifier)}]</span>
                                <span class="kaiz-diff-reorder-role">${escapeHtml(block.role)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="kaiz-diff-reorder-badge-wrap">
                        ${badgeHtml}
                    </div>
                </div>
            `;
        })
        .join('');

    return `
        <div class="kaiz-diff-reorder-container">
            <div class="kaiz-diff-reorder-summary-bar">
                <span class="kaiz-diff-reorder-summary-tag moved"><i class="fa-solid fa-arrows-up-down"></i> ${movedCount} blocks đổi vị trí</span>
                ${addedCount > 0 ? `<span class="kaiz-diff-reorder-summary-tag added"><i class="fa-solid fa-plus"></i> ${addedCount} thêm mới</span>` : ''}
                ${removedCount > 0 ? `<span class="kaiz-diff-reorder-summary-tag removed"><i class="fa-solid fa-minus"></i> ${removedCount} gỡ bỏ</span>` : ''}
                <span class="kaiz-diff-reorder-hint"><i class="fa-solid fa-circle-info"></i> Rê chuột để đối chiếu block tương ứng</span>
            </div>
            <div class="kaiz-diff-reorder-grid">
                <div class="kaiz-diff-reorder-col old-col">
                    <div class="kaiz-diff-reorder-col-header">
                        <div class="kaiz-diff-reorder-col-title">
                            <i class="fa-solid fa-clock-rotate-left" style="color: #f87171"></i>
                            <span>Thứ tự ban đầu</span>
                        </div>
                        <span class="kaiz-diff-reorder-col-count">${oldBlocks.length} blocks</span>
                    </div>
                    <div class="kaiz-diff-reorder-list">
                        ${oldCardsHtml || '<div class="kaiz-diff-reorder-empty">(Trống)</div>'}
                    </div>
                </div>
                <div class="kaiz-diff-reorder-col new-col">
                    <div class="kaiz-diff-reorder-col-header">
                        <div class="kaiz-diff-reorder-col-title">
                            <i class="fa-solid fa-arrow-down-1-9" style="color: #34d399"></i>
                            <span>Thứ tự mới</span>
                        </div>
                        <span class="kaiz-diff-reorder-col-count">${newBlocks.length} blocks</span>
                    </div>
                    <div class="kaiz-diff-reorder-list">
                        ${newCardsHtml || '<div class="kaiz-diff-reorder-empty">(Trống)</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}
