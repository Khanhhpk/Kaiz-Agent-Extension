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

        // 2. Mở Modal từ Settings Quick Toolbar
        $('#kaiz-settings-preset-git-btn')
            .off('click')
            .on('click', async () => {
                await this.open();
            });

        // 3. Đóng Modal
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

        // 7. Hủy Nháp (Discard)
        $('#kaiz-pg-discard-staged-btn')
            .off('click')
            .on('click', async () => {
                if (confirm('Bạn có chắc muốn hủy bỏ toàn bộ các thay đổi nháp trong Staging Sandbox không?')) {
                    this.manager.discard();
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.warning('Đã hủy bỏ toàn bộ nháp. Working tree đã sạch.');
                }
            });

        // 8. Xem Diff Nháp (Staged Diff)
        $('#kaiz-pg-view-staged-diff-btn')
            .off('click')
            .on('click', () => {
                const diff = this.manager.calculateDiff();
                this.openDiffModal('Thay đổi trong Vùng Nháp (Staging Diff)', diff.items);
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
                ? `● ${diff.totalChanges} thay đổi nháp (Sandbox)`
                : `● ${diff.totalChanges} thay đổi SillyTavern`;

            $('#kaiz-pg-staging-badge')
                .text(badgeLabel)
                .removeClass('badge-neutral badge-success')
                .addClass('badge-warning');

            const sourceText = isStaged
                ? '(Dữ liệu SillyTavern gốc chưa bị đè)'
                : '(Thay đổi từ giao diện SillyTavern chưa tạo commit)';

            $('#kaiz-pg-staging-summary').html(
                `<b>Có ${diff.totalChanges} thay đổi chưa commit:</b> +${diff.added} tạo mới, ~${diff.modified} chỉnh sửa, -${diff.deleted} đã xóa. ${sourceText}`,
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
                    `<div style="font-size: 10px; opacity: 0.6; padding-left: 8px">...và còn ${diff.items.length - 5} thay đổi khác (bấm "Xem Diff Nháp" để xem hết)</div>`,
                );
            }
        } else {
            $('#kaiz-pg-staging-badge')
                .text('Clean')
                .removeClass('badge-warning badge-danger')
                .addClass('badge-success');

            $('#kaiz-pg-staging-summary').text(
                'Working tree sạch — Không có thay đổi nào. Toàn bộ prompt blocks đang đồng bộ với commit HEAD.',
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
                toastr.warning('Vui lòng nhập Commit Message mô tả thay đổi trước khi lưu!');
            $('#kaiz-pg-commit-msg-input').focus();
            return;
        }

        const dirtyInfo = await this.manager.isDirtyAgainstHead();
        if (!dirtyInfo.isDirty && !tag) {
            if (typeof toastr !== 'undefined')
                toastr.warning('Working tree sạch — Không có thay đổi nào giữa preset và commit HEAD!');
            return;
        }

        try {
            const result = await this.manager.manualCommit(msg, tag || undefined, true);
            $('#kaiz-pg-commit-msg-input').val('');
            $('#kaiz-pg-commit-tag-input').val('');

            await this.loadAndRender();

            if (typeof toastr !== 'undefined') {
                toastr.success(`Đã commit thành công [${result.hash}]! Dữ liệu đã được lưu và cập nhật SillyTavern.`);
            }
        } catch (e: any) {
            console.error('[PresetGitModal] Commit thất bại:', e);
            if (typeof toastr !== 'undefined') toastr.error(`Lỗi khi commit: ${e.message}`);
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
                <div style="text-align: center; padding: 40px 20px; opacity: 0.6">
                    <i class="fa-solid fa-code-commit" style="font-size: 32px; margin-bottom: 10px; display: block; opacity: 0.4"></i>
                    <div style="font-size: 13px">Không có commit nào ${this.searchQuery ? 'khớp với tìm kiếm' : 'cho preset này'}.</div>
                    <div style="font-size: 11px; margin-top: 4px; opacity: 0.7">
                        Mọi thay đổi qua Agent hoặc nút "Lưu Commit Thủ Công" đều sẽ tạo thành các node lịch sử tại đây.
                    </div>
                </div>
            `);
            return;
        }

        filtered.forEach((commit) => {
            const isHead = commit.hash === headHash;
            const isOlder = headCommit ? commit.timestamp < headTimestamp : false;
            const isNewer = headCommit ? commit.timestamp > headTimestamp : false;

            const dateStr = new Date(commit.timestamp).toLocaleString();
            const author = commit.author || 'Kaiz Agent';
            const isManual = author.toLowerCase().includes('manual') || author.toLowerCase().includes('user');
            const authorBadge = isManual
                ? `<span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 1px 6px; border-radius: 4px; font-size: 10px"><i class="fa-solid fa-user"></i> Manual</span>`
                : `<span style="background: rgba(167, 139, 250, 0.15); color: #a78bfa; padding: 1px 6px; border-radius: 4px; font-size: 10px"><i class="fa-solid fa-robot"></i> Agent</span>`;

            const tagBadge = commit.tag
                ? `<span style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); padding: 1px 7px; border-radius: 4px; font-size: 10px; font-weight: 500"><i class="fa-solid fa-tag"></i> ${escapeHtml(commit.tag)}</span>`
                : '';

            const headPill = isHead
                ? `<span style="background: #2ecc71; color: #000; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 700">CURRENT HEAD</span>`
                : '';

            const promptCount = commit.tree?.prompts?.length || 0;
            const diffSummary = commit.diffSummary || (commit as any).diff?.summary || `${promptCount} blocks`;

            let navActionBtn: string;
            if (isHead) {
                navActionBtn = `<button class="menu_button" disabled style="font-size: 11px; padding: 3px 8px; opacity: 0.55; color: #2ecc71"><i class="fa-solid fa-check"></i> Đang ở HEAD</button>`;
            } else if (isOlder) {
                navActionBtn = `
                    <button class="kaiz-pg-btn-rollback menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.3)" title="Hoàn tác toàn bộ chuỗi commit mới hơn để lùi về mốc này (Safe Revert)">
                        <i class="fa-solid fa-rotate-left"></i> Revert Chuỗi
                    </button>
                    <button class="kaiz-pg-btn-hard-reset menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #ff6b6b; border-color: rgba(255, 107, 107, 0.3)" title="Rollback về điểm này VÀ XÓA BỎ các commit phía sau để giải phóng bộ nhớ">
                        <i class="fa-solid fa-fire"></i> Hard Reset
                    </button>
                `;
            } else if (isNewer) {
                navActionBtn = `
                    <button class="kaiz-pg-btn-forward menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #a78bfa; border-color: rgba(167, 139, 250, 0.3)" title="Áp dụng toàn bộ các commit tích lũy để tiến tới mốc này (Fast-Forward)">
                        <i class="fa-solid fa-forward"></i> Tiến Chuỗi
                    </button>
                `;
            } else {
                navActionBtn = `
                    <button class="kaiz-pg-btn-rollback menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.3)">
                        <i class="fa-solid fa-rotate-left"></i> Rollback
                    </button>
                `;
            }

            const card = $(`
                <div class="kaiz-pg-commit-card" data-hash="${commit.hash}" style="
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid ${isHead ? 'rgba(46, 204, 113, 0.35)' : 'rgba(255, 255, 255, 0.06)'};
                    border-radius: 8px;
                    padding: 10px 12px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    transition: all 0.15s ease;
                ">
                    <!-- Row 1: Header (Hash, Badges, Date) -->
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px">
                        <div style="display: flex; align-items: center; gap: 8px">
                            <span class="kaiz-pg-hash-btn" title="Mã Commit Hash (Bấm để copy)" style="
                                font-family: monospace;
                                font-size: 11px;
                                font-weight: 600;
                                background: rgba(0, 0, 0, 0.4);
                                padding: 2px 7px;
                                border-radius: 4px;
                                border: 1px solid rgba(255, 255, 255, 0.1);
                                cursor: pointer;
                                color: #38bdf8;
                            "><i class="fa-regular fa-copy" style="font-size: 10px; margin-right: 3px; opacity: 0.7"></i>${commit.hash}</span>
                            ${headPill}
                            ${authorBadge}
                            ${tagBadge}
                        </div>
                        <div style="font-size: 11px; opacity: 0.55">
                            <i class="fa-regular fa-clock" style="margin-right: 3px"></i>${dateStr}
                        </div>
                    </div>

                    <!-- Row 2: Message & Summary -->
                    <div style="font-size: 13px; font-weight: 500; color: #fff; line-height: 1.4">
                        ${escapeHtml(commit.message)}
                    </div>
                    <div style="font-size: 11px; opacity: 0.65; display: flex; align-items: center; gap: 10px">
                        <span><i class="fa-solid fa-layer-group" style="font-size: 10px; margin-right: 4px"></i>${escapeHtml(diffSummary)}</span>
                        ${commit.parentHash ? `<span style="font-family: monospace; font-size: 10px"><i class="fa-solid fa-arrow-turn-up" style="transform: rotate(90deg); margin-right: 2px"></i>parent: ${commit.parentHash.substring(0, 8)}</span>` : '<span style="font-size: 10px; opacity: 0.5">(root commit)</span>'}
                    </div>

                    <!-- Row 3: Action Buttons -->
                    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 4px; border-top: 1px solid rgba(255, 255, 255, 0.04); padding-top: 6px">
                        <button class="kaiz-pg-btn-diff menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #38bdf8; border-color: rgba(56, 189, 248, 0.3)" title="Xem chi tiết các thay đổi trong commit này">
                            <i class="fa-solid fa-code-compare"></i> Xem Diff
                        </button>
                        <button class="kaiz-pg-btn-tag menu_button interactable" style="font-size: 11px; padding: 3px 8px; color: #fbbf24; border-color: rgba(251, 191, 36, 0.3)" title="Gán nhãn phiên bản (Tag) cho commit này">
                            <i class="fa-solid fa-tag"></i> Tag
                        </button>
                        ${navActionBtn}
                    </div>
                </div>
            `);

            // Event Copy Hash
            card.find('.kaiz-pg-hash-btn').on('click', () => {
                navigator.clipboard.writeText(commit.hash);
                if (typeof toastr !== 'undefined') toastr.info(`Đã copy mã hash: ${commit.hash}`);
            });

            // Event View Diff
            card.find('.kaiz-pg-btn-diff').on('click', () => {
                this.viewCommitDiff(commit);
            });

            // Event Add Tag
            card.find('.kaiz-pg-btn-tag').on('click', async () => {
                const newTag = prompt(`Nhập tên nhãn (Tag) cho commit [${commit.hash}]:`, commit.tag || 'v1.0');
                if (newTag && newTag.trim()) {
                    await this.manager.tagCommit(commit.hash, newTag.trim());
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã gắn tag "${newTag}" cho commit [${commit.hash}]!`);
                    }
                }
            });

            // Event Rollback (Older)
            card.find('.kaiz-pg-btn-rollback').on('click', async () => {
                if (
                    confirm(
                        `Bạn có chắc chắn muốn hoàn tác toàn bộ chuỗi commit mới hơn để lùi về mốc [${commit.hash}] ("${commit.message}") không?\n(Dữ liệu các commit vẫn được lưu an toàn)`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, false);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.success(res.summary);
                }
            });

            // Event Forward (Newer)
            card.find('.kaiz-pg-btn-forward').on('click', async () => {
                if (
                    confirm(
                        `Bạn có chắc chắn muốn áp dụng toàn bộ chuỗi commit tích lũy để tiến tới mốc [${commit.hash}] ("${commit.message}") không?`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, false);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.success(res.summary);
                }
            });

            // Event Hard Reset
            card.find('.kaiz-pg-btn-hard-reset').on('click', async () => {
                if (
                    confirm(
                        `⚠️ CẢNH BÁO HARD RESET:\nBạn có chắc muốn rollback về commit [${commit.hash}] VÀ XÓA SỔ toàn bộ các commit sinh ra sau thời điểm này khỏi database để giải phóng bộ nhớ không?`,
                    )
                ) {
                    const res = await this.manager.rollback(commit.hash, true);
                    await this.loadAndRender();
                    if (typeof toastr !== 'undefined') toastr.warning(res.summary);
                }
            });

            container.append(card);
        });
    }

    private viewCommitDiff(commit: PresetCommitEntry): void {
        const title = `Commit [${commit.hash}] Diff: "${commit.message}"`;
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
                    <div style="padding: 10px; background: rgba(0,0,0,0.2); border-radius: 6px">
                        <div style="color: #38bdf8; font-weight: bold; margin-bottom: 6px">Root / Snapshot Content (${fullPrompts.length} blocks):</div>
                        ${fullPrompts
                            .map(
                                (p, i) => `
                            <div style="margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px">
                                <div style="color: #4ade80">#${i + 1} [${p.identifier}] ${escapeHtml(p.name)} (${p.role || 'system'})</div>
                                <div style="color: #aaa; font-size: 11px; white-space: pre-wrap; max-height: 80px; overflow-y: auto; margin-top: 2px">${escapeHtml((p.content || '').substring(0, 300))}</div>
                            </div>
                        `,
                            )
                            .join('')}
                    </div>
                `);
            } else {
                body.append(
                    `<div style="text-align: center; padding: 30px; opacity: 0.6">Không có thông tin diff chi tiết được ghi nhận cho mốc này.</div>`,
                );
            }
        } else {
            items.forEach((item, index) => {
                let badgeColor = '#38bdf8';
                if (item.type === 'create') badgeColor = '#2ecc71';
                else if (item.type === 'delete') badgeColor = '#e74c3c';
                else if (item.type === 'update') badgeColor = '#f39c12';

                body.append(`
                    <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 10px">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px">
                            <span style="background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}44; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px">
                                #${index + 1} ${item.type.toUpperCase()}
                            </span>
                            <span style="font-size: 11px; color: #888">[${escapeHtml(item.identifier || '')}]</span>
                        </div>
                        <div style="font-size: 12px; color: #fff; margin-bottom: 4px">${escapeHtml(item.summary || '')}</div>
                        ${
                            item.oldValue !== undefined || item.newValue !== undefined
                                ? `
                            <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px; font-size: 11px">
                                ${item.oldValue !== undefined ? `<div style="background: rgba(231, 76, 60, 0.15); color: #ff8b8b; padding: 4px 8px; border-radius: 4px; white-space: pre-wrap">- ${escapeHtml(String(item.oldValue).substring(0, 400))}</div>` : ''}
                                ${item.newValue !== undefined ? `<div style="background: rgba(46, 204, 113, 0.15); color: #8bffb8; padding: 4px 8px; border-radius: 4px; white-space: pre-wrap">+ ${escapeHtml(String(item.newValue).substring(0, 400))}</div>` : ''}
                            </div>
                        `
                                : ''
                        }
                    </div>
                `);
            });
        }

        const diffModal = $('#kaiz-preset-diff-modal')[0] as HTMLDialogElement;
        if (diffModal) {
            diffModal.style.display = 'flex';
            diffModal.showModal();
        }
    }
}
