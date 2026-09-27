import { SillyTavernAdapter } from '../adapters/st_adapter';
import { MvuManager, MvuInspectionResult, MvuVariableDescriptor, MvuVariableInput } from '../core/mvu_manager';
import YAML from 'yaml';

declare const jQuery: any;
declare const toastr: any;

const escapeHtml = (str: any): string => {
    if (str === null || str === undefined) return '';
    const s = typeof str === 'object' ? JSON.stringify(str) : String(str);
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

export class MvuDashboardModal {
    private currentReport: MvuInspectionResult | null = null;
    private activeTab: 'stats' | 'schema' | 'raw' = 'stats';
    private builderVariables: MvuVariableInput[] = [];

    constructor(private adapter: SillyTavernAdapter) {
        this.bindEvents();
    }

    private getModalElement(): HTMLDialogElement | null {
        const el = document.getElementById('kaiz-mvu-dashboard-modal') as HTMLDialogElement | null;
        return el;
    }

    public async open(): Promise<void> {
        const modal = this.getModalElement();
        if (!modal) return;

        if (!modal.open) {
            modal.showModal();
        }
        await this.refresh();
    }

    public close(): void {
        const modal = this.getModalElement();
        if (modal && modal.open) {
            modal.close();
        }
    }

    public async refresh(): Promise<void> {
        const $ = jQuery;
        $('#kaiz-mvu-status-badge')
            .text('Đang đồng bộ...')
            .removeClass('badge-success badge-warning badge-danger')
            .addClass('badge-neutral');

        try {
            this.currentReport = await MvuManager.inspectMvu(this.adapter);
            this.render();
        } catch (error: any) {
            console.error('[MvuDashboardModal] Error inspecting MVU:', error);
            if (typeof toastr !== 'undefined') {
                toastr.error('Lỗi khi tải thông tin MVU: ' + (error?.message || String(error)));
            }
        }
    }

    private bindEvents(): void {
        const $ = jQuery;

        // 1. Mở Modal từ Header Tools Menu
        $('#kaiz-mvu-dashboard-btn')
            .off('click')
            .on('click', async () => {
                $('#kaiz-chat-tools-menu').hide();
                await this.open();
            });

        // 2. Đóng Modal
        $('#kaiz-mvu-close-btn')
            .off('click')
            .on('click', () => {
                this.close();
            });

        // 3. Nút Làm Mới (Refresh)
        $('#kaiz-mvu-refresh-btn')
            .off('click')
            .on('click', async () => {
                await this.refresh();
                if (typeof toastr !== 'undefined') {
                    toastr.info('Đã đồng bộ lại chỉ số MVU.');
                }
            });

        // 4. Chuyển Tab
        $('.kaiz-mvu-tab')
            .off('click')
            .on('click', (e: any) => {
                const tab = $(e.currentTarget).data('tab') as 'stats' | 'schema' | 'raw';
                this.switchTab(tab);
            });

        // 5. Chuyển Chế Độ Khởi Tạo MVU (khi nhân vật chưa có MVU)
        $('.kaiz-mvu-scaffold-tab')
            .off('click')
            .on('click', (e: any) => {
                const mode = $(e.currentTarget).data('mode');
                $('.kaiz-mvu-scaffold-tab').removeClass('active');
                $(e.currentTarget).addClass('active');
                $('.kaiz-mvu-scaffold-pane').hide();
                $(`#kaiz-scaffold-pane-${mode}`).fadeIn(150);
            });

        // 5.1 Mode 1: AI Tự Phân Tích & Thiết Kế
        $('#kaiz-mvu-ai-scaffold-btn')
            .off('click')
            .on('click', () => {
                const userPrompt = ($('#kaiz-mvu-ai-prompt').val() || '').trim();
                const requestText = userPrompt
                    ? `Hãy phân tích nhân vật hiện tại và khởi tạo sàn MVU Zod 4 linh hoạt bằng công cụ scaffold_mvu_card theo yêu cầu sau: "${userPrompt}". Hãy tự thiết kế các biến, kiểu dữ liệu (type), giới hạn (min/max), giá trị mặc định và quy tắc check phù hợp nhất mà không dùng bất kỳ template có sẵn nào.`
                    : `Hãy phân tích persona, lore và thế giới của nhân vật hiện tại, sau đó sử dụng công cụ scaffold_mvu_card để tự thiết kế và khởi tạo một sàn hệ thống biến MVU Zod 4 tối ưu, phù hợp nhất cho nhân vật này.`;

                this.close();
                const chatInput = $('#kaiz-chat-input');
                chatInput.val(requestText);
                $('#kaiz-send-btn').trigger('click');
            });

        // 5.2 Mode 2: Quick Builder - Thay đổi kiểu dữ liệu
        $('#kaiz-builder-type')
            .off('change')
            .on('change', (e: any) => {
                if ($(e.target).val() === 'number') {
                    $('.kaiz-builder-num-row').show();
                } else {
                    $('.kaiz-builder-num-row').hide();
                }
            });

        // 5.2 Mode 2: Quick Builder - Thêm dòng biến vào danh sách
        $('#kaiz-builder-add-row-btn')
            .off('click')
            .on('click', () => {
                const path = ($('#kaiz-builder-path').val() || '').trim();
                const type = $('#kaiz-builder-type').val() as any;
                const minStr = ($('#kaiz-builder-min').val() || '').trim();
                const maxStr = ($('#kaiz-builder-max').val() || '').trim();
                const defaultStr = ($('#kaiz-builder-default').val() || '').trim();
                const rule = ($('#kaiz-builder-rule').val() || '').trim();

                if (!path) {
                    if (typeof toastr !== 'undefined') toastr.warning('Vui lòng nhập đường dẫn biến.');
                    return;
                }

                let defaultValue: any = defaultStr;
                if (type === 'number') {
                    defaultValue = defaultStr ? Number(defaultStr) : minStr ? Number(minStr) : 0;
                } else if (type === 'boolean') {
                    defaultValue = defaultStr === 'true';
                }

                this.builderVariables.push({
                    path,
                    type,
                    min: minStr ? Number(minStr) : undefined,
                    max: maxStr ? Number(maxStr) : undefined,
                    defaultValue,
                    ruleCheck: rule || undefined,
                });

                $('#kaiz-builder-path').val('');
                $('#kaiz-builder-min').val('');
                $('#kaiz-builder-max').val('');
                $('#kaiz-builder-default').val('');
                $('#kaiz-builder-rule').val('');

                this.renderBuilderList();
            });

        // 5.2 Mode 2: Quick Builder - Nạp các biến đã chọn
        $('#kaiz-mvu-builder-submit-btn')
            .off('click')
            .on('click', async () => {
                if (this.builderVariables.length === 0) {
                    if (typeof toastr !== 'undefined') toastr.warning('Danh sách biến trống. Hãy thêm ít nhất 1 biến.');
                    return;
                }

                try {
                    const res = await MvuManager.scaffoldMvuCard(this.adapter, {
                        variables: this.builderVariables,
                    });
                    if (res.success) {
                        if (typeof toastr !== 'undefined') {
                            toastr.success(
                                `Đã khởi tạo thành công hệ thống MVU với ${this.builderVariables.length} biến!`,
                            );
                        }
                        this.builderVariables = [];
                        await this.refresh();
                    }
                } catch (err: any) {
                    console.error('[MvuDashboardModal] Builder scaffold error:', err);
                    if (typeof toastr !== 'undefined') {
                        toastr.error('Lỗi khi nạp hệ thống MVU: ' + (err?.message || String(err)));
                    }
                }
            });

        // 5.3 Mode 3: Nạp Zod Schema / YAML Trực Tiếp
        $('#kaiz-mvu-raw-submit-btn')
            .off('click')
            .on('click', async () => {
                const customZodSchema = ($('#kaiz-raw-zod-input').val() || '').trim();
                const customInitvarYaml = ($('#kaiz-raw-initvar-input').val() || '').trim();

                if (!customZodSchema && !customInitvarYaml) {
                    if (typeof toastr !== 'undefined') toastr.warning('Vui lòng nhập mã Zod Schema hoặc YAML.');
                    return;
                }

                try {
                    const res = await MvuManager.scaffoldMvuCard(this.adapter, {
                        customZodSchema: customZodSchema || undefined,
                        customInitvarYaml: customInitvarYaml || undefined,
                    });
                    if (res.success) {
                        if (typeof toastr !== 'undefined') {
                            toastr.success('Đã nạp thành công mã Zod Schema tùy chỉnh vào Card!');
                        }
                        await this.refresh();
                    }
                } catch (err: any) {
                    console.error('[MvuDashboardModal] Raw scaffold error:', err);
                    if (typeof toastr !== 'undefined') {
                        toastr.error('Lỗi khi nạp Schema: ' + (err?.message || String(err)));
                    }
                }
            });

        // 6. Ẩn / Hiện Panel Thêm Biến
        $('#kaiz-mvu-toggle-add-btn')
            .off('click')
            .on('click', () => {
                $('#kaiz-mvu-add-panel').slideToggle(200);
            });

        $('#kaiz-mvu-close-add-panel')
            .off('click')
            .on('click', () => {
                $('#kaiz-mvu-add-panel').slideUp(200);
            });

        // 7. Thay đổi Kiểu Dữ Liệu trong Add Panel (ẩn hiện min/max)
        $('#kaiz-mvu-select-type')
            .off('change')
            .on('change', (e: any) => {
                const val = $(e.target).val();
                if (val === 'number') {
                    $('.kaiz-mvu-num-field').show();
                } else {
                    $('.kaiz-mvu-num-field').hide();
                }
            });

        // 8. Submit Thêm Biến Mới
        $('#kaiz-mvu-submit-add-btn')
            .off('click')
            .on('click', async () => {
                await this.handleAddVariable();
            });

        // Đóng modal khi click ra ngoài backdrop
        const modal = this.getModalElement();
        if (modal) {
            modal.addEventListener('click', (e: MouseEvent) => {
                if (e.target === modal) {
                    this.close();
                }
            });
        }
    }

    private switchTab(tab: 'stats' | 'schema' | 'raw'): void {
        const $ = jQuery;
        this.activeTab = tab;
        $('.kaiz-mvu-tab').removeClass('active');
        $(`.kaiz-mvu-tab[data-tab="${tab}"]`).addClass('active');

        $('.kaiz-mvu-tab-content').removeClass('active');
        $(`#kaiz-mvu-tab-${tab}`).addClass('active');
    }

    private async handleAddVariable(): Promise<void> {
        const $ = jQuery;
        const path = ($('#kaiz-mvu-input-path').val() || '').trim();
        const type = $('#kaiz-mvu-select-type').val() as any;
        const minStr = ($('#kaiz-mvu-input-min').val() || '').trim();
        const maxStr = ($('#kaiz-mvu-input-max').val() || '').trim();
        const defaultStr = ($('#kaiz-mvu-input-default').val() || '').trim();
        const ruleCheck = ($('#kaiz-mvu-input-rule').val() || '').trim();

        if (!path) {
            if (typeof toastr !== 'undefined') toastr.warning('Vui lòng nhập đường dẫn hoặc tên biến.');
            return;
        }

        const min = minStr !== '' ? Number(minStr) : undefined;
        const max = maxStr !== '' ? Number(maxStr) : undefined;

        let defaultValue: any = defaultStr;
        if (type === 'number') {
            defaultValue = defaultStr !== '' ? Number(defaultStr) : (min ?? 0);
        } else if (type === 'boolean') {
            defaultValue = defaultStr.toLowerCase() === 'true';
        } else if (type === 'array') {
            defaultValue = [];
        }

        try {
            const res = await MvuManager.mutateMvuSchema(this.adapter, {
                action: 'add',
                variablePath: path,
                type,
                min,
                max,
                defaultValue,
                ruleCheck: ruleCheck || undefined,
            });

            if (res.success) {
                if (typeof toastr !== 'undefined') {
                    toastr.success(`Đã thêm thành công biến "${path}" vào Card!`);
                }
                // Reset form
                $('#kaiz-mvu-input-path').val('');
                $('#kaiz-mvu-input-min').val('');
                $('#kaiz-mvu-input-max').val('');
                $('#kaiz-mvu-input-default').val('');
                $('#kaiz-mvu-input-rule').val('');
                $('#kaiz-mvu-add-panel').slideUp(200);

                await this.refresh();
            }
        } catch (err: any) {
            console.error('[MvuDashboardModal] Error adding variable:', err);
            if (typeof toastr !== 'undefined') {
                toastr.error('Lỗi khi thêm biến: ' + (err?.message || String(err)));
            }
        }
    }

    private render(): void {
        const $ = jQuery;
        const report = this.currentReport;
        if (!report) return;

        // Cập nhật Tiêu đề & Tên nhân vật
        $('#kaiz-mvu-subtitle').text(
            `Nhân vật: ${report.characterName} ${report.hasMvu ? '• ' + (report.zodScriptName || 'Zod Schema') : ''}`,
        );

        if (!report.hasMvu) {
            // Không có MVU
            $('#kaiz-mvu-status-badge')
                .text('Chưa có MVU')
                .removeClass('badge-success badge-neutral')
                .addClass('badge-warning');
            $('#kaiz-mvu-empty-container').show();
            $('#kaiz-mvu-active-container').hide();
            return;
        }

        // Có MVU
        $('#kaiz-mvu-status-badge')
            .html('<i class="fa-solid fa-bolt"></i> Live Active')
            .removeClass('badge-warning badge-neutral')
            .addClass('badge-success');
        $('#kaiz-mvu-empty-container').hide();
        $('#kaiz-mvu-active-container').show();

        // 1. Cập nhật Ribbon
        const allDescriptors = this.flattenDescriptors(report.parsedSchema);
        $('#kaiz-mvu-stat-count').text(allDescriptors.length);
        $('#kaiz-mvu-zod-name').text(report.zodScriptName || 'Zod 4 Schema');

        if (report.initvarVariables) {
            $('#kaiz-mvu-initvar-pill')
                .text('InitVar: OK')
                .removeClass('badge-neutral badge-danger')
                .addClass('badge-success');
        } else {
            $('#kaiz-mvu-initvar-pill')
                .text('InitVar: Thiếu')
                .removeClass('badge-neutral badge-success')
                .addClass('badge-danger');
        }

        if (report.updateRulesSummary) {
            $('#kaiz-mvu-rules-pill')
                .text('Quy tắc: OK')
                .removeClass('badge-neutral badge-danger')
                .addClass('badge-success');
        } else {
            $('#kaiz-mvu-rules-pill')
                .text('Quy tắc: Thiếu')
                .removeClass('badge-neutral badge-success')
                .addClass('badge-danger');
        }

        // 2. Cảnh báo Inconsistencies / Warnings
        const warnings = [...(report.healthWarnings || []), ...(report.inconsistencies || [])];
        const warnContainer = $('#kaiz-mvu-warnings-container');
        if (warnings.length > 0) {
            let warnHtml = `<div class="kaiz-mvu-warning-box"><div class="kaiz-mvu-warning-header"><i class="fa-solid fa-triangle-exclamation"></i> Chú ý tính toàn vẹn dữ liệu:</div><ul>`;
            for (const w of warnings) {
                warnHtml += `<li>${escapeHtml(w)}</li>`;
            }
            warnHtml += `</ul></div>`;
            warnContainer.html(warnHtml).show();
        } else {
            warnContainer.hide().empty();
        }

        // 3. Render Tab 1: Stats Grid
        this.renderStatsTab(report);

        // 4. Render Tab 2: Schema Table
        this.renderSchemaTab(allDescriptors, report);

        // 5. Render Tab 3: Raw / YAML Panes
        this.renderRawTab(report);
    }

    private flattenDescriptors(descriptors: MvuVariableDescriptor[]): MvuVariableDescriptor[] {
        const flat: MvuVariableDescriptor[] = [];
        for (const d of descriptors) {
            if (d.type === 'object' && d.children && d.children.length > 0) {
                flat.push(...this.flattenDescriptors(d.children));
            } else {
                flat.push(d);
            }
        }
        return flat;
    }

    private getProgressBarTheme(name: string): { fillClass: string; color: string } {
        const n = name.toLowerCase();
        if (n.includes('sinh_mệnh') || n.includes('hp') || n.includes('máu') || n.includes('thể_lực')) {
            return { fillClass: 'mvu-bar-crimson', color: '#f43f5e' };
        }
        if (n.includes('ma_lực') || n.includes('mp') || n.includes('chân_nguyên') || n.includes('mana')) {
            return { fillClass: 'mvu-bar-cyan', color: '#06b6d4' };
        }
        if (n.includes('hảo_cảm') || n.includes('tình_cảm') || n.includes('affection') || n.includes('yêu')) {
            return { fillClass: 'mvu-bar-rose', color: '#ec4899' };
        }
        if (n.includes('vàng') || n.includes('tiền') || n.includes('linh_thạch') || n.includes('gold')) {
            return { fillClass: 'mvu-bar-amber', color: '#eab308' };
        }
        return { fillClass: 'mvu-bar-emerald', color: '#10b981' };
    }

    private renderStatsTab(report: MvuInspectionResult): void {
        const $ = jQuery;
        const container = $('#kaiz-mvu-stats-grid');
        container.empty();

        // Gom nhóm theo category (Root object hoặc Parent)
        const groups: Record<string, MvuVariableDescriptor[]> = {};

        for (const d of report.parsedSchema) {
            if (d.type === 'object' && d.children && d.children.length > 0) {
                groups[d.name] = this.flattenDescriptors(d.children);
            } else {
                if (!groups['Chỉ số chung']) groups['Chỉ số chung'] = [];
                groups['Chỉ số chung'].push(d);
            }
        }

        // Nếu parsedSchema trống nhưng có liveVariables
        if (Object.keys(groups).length === 0 && report.liveVariables) {
            groups['Chỉ số thời gian thực'] = [];
            for (const [k, v] of Object.entries(report.liveVariables)) {
                if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
                    for (const [subK, subV] of Object.entries(v)) {
                        groups[k] = groups[k] || [];
                        groups[k].push({
                            name: subK,
                            path: `${k}.${subK}`,
                            type:
                                typeof subV === 'number' ? 'number' : typeof subV === 'boolean' ? 'boolean' : 'string',
                            defaultValue: subV,
                        });
                    }
                } else {
                    groups['Chỉ số thời gian thực'].push({
                        name: k,
                        path: k,
                        type: typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : 'string',
                        defaultValue: v,
                    });
                }
            }
        }

        if (Object.keys(groups).length === 0) {
            container.html(
                '<div class="kaiz-mvu-empty-text">Chưa phát hiện biến nào trong Schema hoặc Live Variables. Hãy bấm "+ Thêm Biến".</div>',
            );
            return;
        }

        for (const [groupName, descriptors] of Object.entries(groups)) {
            let catHtml = `
                <div class="kaiz-mvu-category-section">
                    <div class="kaiz-mvu-cat-header">
                        <span class="kaiz-mvu-cat-title"><i class="fa-solid fa-folder-open"></i> ${escapeHtml(groupName)}</span>
                        <span class="kaiz-mvu-cat-count">${descriptors.length} chỉ số</span>
                    </div>
                    <div class="kaiz-mvu-cards-grid">
            `;

            for (const desc of descriptors) {
                const liveVal = MvuManager.getLiveVariables(desc.path);
                const currentVal =
                    liveVal !== undefined ? liveVal : desc.defaultValue !== undefined ? desc.defaultValue : '—';
                const hasClamp = desc.type === 'number' && desc.min !== undefined && desc.max !== undefined;

                catHtml += `
                    <div class="kaiz-mvu-stat-card" data-path="${escapeHtml(desc.path)}">
                        <div class="kaiz-mvu-card-top">
                            <div class="kaiz-mvu-card-name" title="${escapeHtml(desc.path)}">${escapeHtml(desc.name)}</div>
                            <div class="kaiz-mvu-card-actions">
                                <button type="button" class="kaiz-mvu-inline-edit-btn interactable" title="Chỉnh sửa giá trị" data-path="${escapeHtml(desc.path)}">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            </div>
                        </div>
                `;

                if (hasClamp) {
                    const min = desc.min!;
                    const max = desc.max!;
                    const numVal = Number(currentVal) || 0;
                    const pct = Math.min(100, Math.max(0, ((numVal - min) / (max - min)) * 100));
                    const theme = this.getProgressBarTheme(desc.name);

                    catHtml += `
                        <div class="kaiz-mvu-card-numeric">
                            <span class="kaiz-mvu-val-main" style="color: ${theme.color};">${numVal}</span>
                            <span class="kaiz-mvu-val-bounds">/ ${max}</span>
                        </div>
                        <div class="kaiz-mvu-progress-track">
                            <div class="kaiz-mvu-progress-fill ${theme.fillClass}" style="width: ${pct}%;"></div>
                        </div>
                        <div class="kaiz-mvu-progress-labels">
                            <span>Min: ${min}</span>
                            <span>${pct.toFixed(0)}%</span>
                            <span>Max: ${max}</span>
                        </div>
                    `;
                } else if (desc.type === 'boolean') {
                    const isTrue = currentVal === true || currentVal === 'true';
                    catHtml += `
                        <div class="kaiz-mvu-card-value">
                            <span class="kaiz-status-pill ${isTrue ? 'badge-success' : 'badge-neutral'}">
                                ${isTrue ? 'True (Bật)' : 'False (Tắt)'}
                            </span>
                        </div>
                    `;
                } else if (desc.type === 'array') {
                    const arr = Array.isArray(currentVal) ? currentVal : [];
                    catHtml += `
                        <div class="kaiz-mvu-card-value">
                            ${arr.length > 0 ? arr.map((item: any) => `<span class="kaiz-mvu-tag">${escapeHtml(item)}</span>`).join('') : '<span class="kaiz-mvu-empty-badge">Trống</span>'}
                        </div>
                    `;
                } else {
                    catHtml += `
                        <div class="kaiz-mvu-card-value">
                            <span class="kaiz-mvu-text-badge">${escapeHtml(currentVal)}</span>
                        </div>
                    `;
                }

                // Inline Edit Form (Hidden by default)
                catHtml += `
                    <div class="kaiz-mvu-inline-editor" id="editor-${escapeHtml(desc.path).replace(/\./g, '_')}" style="display: none;">
                        <input type="text" class="text_pole kaiz-mvu-inline-input" value="${escapeHtml(currentVal)}">
                        <button type="button" class="menu_button kaiz-mvu-inline-save-btn" data-path="${escapeHtml(desc.path)}" title="Lưu">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                `;

                catHtml += `</div>`; // Close stat-card
            }

            catHtml += `</div></div>`; // Close category-section
            container.append(catHtml);
        }

        // Gắn sự kiện click inline edit
        container.find('.kaiz-mvu-inline-edit-btn').on('click', (e: any) => {
            const path = $(e.currentTarget).data('path');
            const editorId = `#editor-${path.replace(/\./g, '_')}`;
            $(editorId).slideToggle(150);
        });

        container.find('.kaiz-mvu-inline-save-btn').on('click', async (e: any) => {
            const path = $(e.currentTarget).data('path');
            const editorId = `#editor-${path.replace(/\./g, '_')}`;
            const inputVal = $(editorId).find('.kaiz-mvu-inline-input').val();

            try {
                const res = await MvuManager.setLiveVariable(path, inputVal);
                if (res.success) {
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã cập nhật ${path} = ${inputVal}`);
                    }
                    await this.refresh();
                }
            } catch (err: any) {
                console.error('[MvuDashboardModal] Error setting live variable:', err);
                if (typeof toastr !== 'undefined') {
                    toastr.error('Lỗi khi cập nhật biến: ' + (err?.message || String(err)));
                }
            }
        });
    }

    private renderSchemaTab(allDescriptors: MvuVariableDescriptor[], _report: MvuInspectionResult): void {
        const $ = jQuery;
        const container = $('#kaiz-mvu-schema-table-container');
        container.empty();

        if (allDescriptors.length === 0) {
            container.html('<div class="kaiz-mvu-empty-text">Chưa có khai báo biến nào trong Zod Schema.</div>');
            return;
        }

        let tableHtml = `
            <div class="kaiz-mvu-table-responsive">
                <table class="kaiz-mvu-table">
                    <thead>
                        <tr>
                            <th>Đường dẫn biến</th>
                            <th>Kiểu</th>
                            <th>Khoảng (Min - Max)</th>
                            <th>Khởi tạo (Init)</th>
                            <th>Thao tác</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        for (const desc of allDescriptors) {
            const hasBounds = desc.min !== undefined && desc.max !== undefined;
            const boundsText = hasBounds
                ? `${desc.min} ➔ ${desc.max}`
                : desc.min !== undefined
                  ? `Min: ${desc.min}`
                  : desc.max !== undefined
                    ? `Max: ${desc.max}`
                    : '—';
            const defaultText = desc.defaultValue !== undefined ? escapeHtml(desc.defaultValue) : '—';

            tableHtml += `
                <tr>
                    <td class="kaiz-mvu-td-path"><code>${escapeHtml(desc.path)}</code></td>
                    <td><span class="kaiz-mvu-type-badge type-${desc.type}">${desc.type}</span></td>
                    <td>${boundsText}</td>
                    <td>${defaultText}</td>
                    <td class="kaiz-mvu-td-actions">
                        <button type="button" class="menu_button kaiz-mvu-del-btn interactable" data-path="${escapeHtml(desc.path)}" title="Xóa biến khỏi Card">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        }

        tableHtml += `</tbody></table></div>`;
        container.html(tableHtml);

        // Gắn sự kiện Xóa biến
        container.find('.kaiz-mvu-del-btn').on('click', async (e: any) => {
            const path = $(e.currentTarget).data('path');
            if (
                !confirm(
                    `Bạn có chắc muốn XÓA biến "${path}" khỏi toàn bộ kịch bản Zod và Worldbook không? Thao tác sẽ được đồng bộ ngay lập tức.`,
                )
            ) {
                return;
            }

            try {
                const res = await MvuManager.mutateMvuSchema(this.adapter, {
                    action: 'delete',
                    variablePath: path,
                });
                if (res.success) {
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã xóa biến "${path}" thành công!`);
                    }
                    await this.refresh();
                }
            } catch (err: any) {
                console.error('[MvuDashboardModal] Error deleting variable:', err);
                if (typeof toastr !== 'undefined') {
                    toastr.error('Lỗi khi xóa biến: ' + (err?.message || String(err)));
                }
            }
        });
    }

    private renderRawTab(report: MvuInspectionResult): void {
        const $ = jQuery;
        $('#kaiz-mvu-raw-live').text(
            report.liveVariables
                ? JSON.stringify(report.liveVariables, null, 2)
                : 'Không có dữ liệu stat_data trong bộ nhớ.',
        );
        $('#kaiz-mvu-raw-zod').text(report.zodSchemaCode || 'Không tìm thấy Zod Schema script.');
        $('#kaiz-mvu-raw-initvar').text(
            report.initvarVariables ? YAML.stringify(report.initvarVariables) : 'Chưa có Worldbook [InitVar].',
        );
        $('#kaiz-mvu-raw-rules').text(report.updateRulesSummary || 'Chưa có Worldbook [mvu_update].');
    }

    private renderBuilderList(): void {
        const $ = jQuery;
        const listEl = $('#kaiz-builder-items-list');
        listEl.empty();

        if (this.builderVariables.length === 0) {
            listEl.html(
                '<div class="kaiz-mvu-empty-badge" id="kaiz-builder-list-empty">Chưa có biến nào trong danh sách. Hãy điền thông tin bên trên và bấm "Thêm Vào Danh Sách".</div>',
            );
            return;
        }

        for (let i = 0; i < this.builderVariables.length; i++) {
            const v = this.builderVariables[i];
            const bounds = v.min !== undefined && v.max !== undefined ? ` [${v.min} ~ ${v.max}]` : '';
            const itemHtml = $(`
                <div class="kaiz-mvu-builder-item">
                    <div class="kaiz-mvu-builder-item-info">
                        <strong><code>${escapeHtml(v.path)}</code></strong>
                        <span class="kaiz-mvu-type-badge type-${v.type}">${v.type}${bounds}</span>
                        <span style="color:#94a3b8; font-size:11px;">Khởi tạo: ${escapeHtml(v.defaultValue ?? '—')}</span>
                    </div>
                    <button type="button" class="menu_button kaiz-builder-del-item" data-index="${i}" title="Xóa dòng này" style="padding: 2px 8px; font-size: 11px;">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `);
            listEl.append(itemHtml);
        }

        listEl.find('.kaiz-builder-del-item').on('click', (e: any) => {
            const idx = Number($(e.currentTarget).data('index'));
            this.builderVariables.splice(idx, 1);
            this.renderBuilderList();
        });
    }
}
