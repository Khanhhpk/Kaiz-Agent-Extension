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
    private activeTab: 'stats' | 'activity' | 'schema' | 'raw' = 'stats';
    private builderVariables: MvuVariableInput[] = [];
    private selectedFloorId?: number;

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

    public async refresh(floorId?: number): Promise<void> {
        const $ = jQuery;
        $('#kaiz-mvu-status-badge')
            .text('Đang đồng bộ...')
            .removeClass('badge-success badge-warning badge-danger')
            .addClass('badge-neutral');

        if (floorId !== undefined) {
            this.selectedFloorId = floorId;
        }

        try {
            this.currentReport = await MvuManager.inspectMvu(this.adapter, undefined, this.selectedFloorId);
            if (this.currentReport.currentFloor) {
                this.selectedFloorId = this.currentReport.currentFloor.messageId;
            }
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
                await this.refresh(this.selectedFloorId);
                if (typeof toastr !== 'undefined') {
                    toastr.info('Đã đồng bộ lại chỉ số MVU.');
                }
            });

        // 3.1 Bộ chọn Lượt Chat (Floor Selector)
        $('#kaiz-mvu-floor-select')
            .off('change')
            .on('change', async (e: any) => {
                const val = $(e.target).val();
                const floorId = val === '' ? undefined : Number(val);
                this.selectedFloorId = floorId;
                await this.refresh(floorId);
                if (typeof toastr !== 'undefined') {
                    toastr.info(
                        floorId !== undefined
                            ? `Đã chuyển sang lượt chat #${floorId + 1}`
                            : 'Đã chuyển sang chế độ tự động theo lượt mới nhất.',
                    );
                }
            });

        // 4. Chuyển Tab
        $('.kaiz-mvu-tab')
            .off('click')
            .on('click', (e: any) => {
                const tab = $(e.currentTarget).data('tab') as 'stats' | 'activity' | 'schema' | 'raw';
                this.switchTab(tab);
            });

        // 4.1 Bấm vào Ribbon Pills nhảy sang Tab Bảng hoạt động
        $('#kaiz-mvu-initvar-pill, #kaiz-mvu-rules-pill, #kaiz-mvu-format-pill, #kaiz-mvu-varlist-pill, #kaiz-mvu-ejs-pill')
            .off('click')
            .on('click', () => {
                this.switchTab('activity');
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

    private switchTab(tab: 'stats' | 'activity' | 'schema' | 'raw'): void {
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

        // Cập nhật Tiêu đề, Tên nhân vật, Lượt chat & Nguồn dữ liệu
        let subtitle = `Nhân vật: ${escapeHtml(report.characterName)} ${report.hasMvu ? '• ' + escapeHtml(report.zodScriptName || 'Hệ thống MVU') : ''}`;
        if (report.currentFloor) {
            subtitle += ` • Lượt #${report.currentFloor.displayIndex} (${escapeHtml(report.currentFloor.name)})`;
        }
        if (report.dataSource) {
            const src =
                report.dataSource === 'mvu' ? 'MVU API' : report.dataSource === 'helper' ? 'TavernHelper' : 'Bộ nhớ ST';
            subtitle += ` • Nguồn: ${src}`;
        }
        $('#kaiz-mvu-subtitle').html(subtitle);

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

        // 1. Cập nhật Ribbon & Floor Selector
        const floorSelect = $('#kaiz-mvu-floor-select');
        if (floorSelect.length) {
            floorSelect.empty();
            floorSelect.append('<option value="">Lượt mới nhất (Tự động)</option>');
            if (report.availableFloors && report.availableFloors.length > 0) {
                for (const fl of report.availableFloors) {
                    const isSel = this.selectedFloorId === fl.messageId ? 'selected' : '';
                    const optText = `Lượt #${fl.displayIndex} · ${escapeHtml(fl.name)} ${fl.preview ? '— ' + escapeHtml(fl.preview) : ''}`;
                    floorSelect.append(`<option value="${fl.messageId}" ${isSel}>${optText}</option>`);
                }
            }
        }

        const allDescriptors = this.flattenDescriptorsForSchema(report.parsedSchema);
        $('#kaiz-mvu-stat-count').text(allDescriptors.length);
        $('#kaiz-mvu-zod-name').text(report.zodScriptName || 'MagVarUpdate / MVU');

        if (report.lorebookActivity) {
            const act = report.lorebookActivity;
            const initItem = act.items.find((i) => i.id === 'initvar');
            const rulesItem = act.items.find((i) => i.id === 'rules');
            const formatItem = act.items.find((i) => i.id === 'format');
            const varlistItem = act.items.find((i) => i.id === 'varlist');
            const ejsItem = act.items.find((i) => i.id === 'controller');

            const updatePill = (id: string, item: any, defaultLabel: string) => {
                const el = $(`#${id}`);
                if (!el.length) return;
                if (!item) {
                    el.text(`${defaultLabel}: ?`)
                        .removeClass('badge-success badge-danger badge-warning')
                        .addClass('badge-neutral');
                    return;
                }
                el.removeClass('badge-success badge-danger badge-warning badge-neutral');
                if (item.status === 'active') {
                    el.text(`${defaultLabel}: OK`).addClass('badge-success');
                } else if (item.status === 'warning') {
                    el.text(`${defaultLabel}: Bật`).addClass('badge-warning');
                } else if (item.status === 'inactive') {
                    el.text(`${defaultLabel}: Thiếu`).addClass('badge-danger');
                } else {
                    el.text(`${defaultLabel}: —`).addClass('badge-neutral');
                }
                el.attr('title', `Nhấn để mở Bảng hoạt động · Entry: "${item.entryName}" (${item.statusText})`);
            };

            updatePill('kaiz-mvu-initvar-pill', initItem, 'InitVar');
            updatePill('kaiz-mvu-rules-pill', rulesItem, 'Quy tắc');
            updatePill('kaiz-mvu-format-pill', formatItem, 'Định dạng');
            updatePill('kaiz-mvu-varlist-pill', varlistItem, 'Danh sách');

            const ejsPill = $('#kaiz-mvu-ejs-pill');
            if (ejsItem && ejsItem.status === 'active') {
                updatePill('kaiz-mvu-ejs-pill', ejsItem, 'EJS');
                ejsPill.show();
            } else {
                ejsPill.hide();
            }
        } else {
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

            const ejsPill = $('#kaiz-mvu-ejs-pill');
            if (ejsPill.length) {
                if (report.hasEjsController) {
                    ejsPill
                        .text('EJS: OK')
                        .attr(
                            'title',
                            report.ejsControllerSummary
                                ? `Bộ điều khiển: ${report.ejsControllerSummary}`
                                : 'Có bộ điều khiển EJS Preprocessing động',
                        )
                        .removeClass('badge-neutral badge-danger')
                        .addClass('badge-success')
                        .show();
                } else {
                    ejsPill.hide();
                }
            }
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

        // 4. Render Tab 2: Activity / Lorebook MVU Table
        this.renderActivityTab(report);

        // 5. Render Tab 3: Schema Table
        this.renderSchemaTab(allDescriptors, report);

        // 6. Render Tab 4: Raw / YAML Panes
        this.renderRawTab(report);
    }

    private flattenDescriptorsForSchema(descriptors: MvuVariableDescriptor[]): MvuVariableDescriptor[] {
        const flat: MvuVariableDescriptor[] = [];
        for (const d of descriptors) {
            if (d.type === 'object' && d.children && d.children.length > 0) {
                flat.push(...this.flattenDescriptorsForSchema(d.children));
            } else if (d.type === 'record' && d.recordTemplate && d.recordTemplate.length > 0) {
                for (const t of d.recordTemplate) {
                    flat.push({
                        ...t,
                        path: `${d.path}.${t.name}`,
                    });
                }
            } else {
                flat.push(d);
            }
        }
        return flat;
    }

    /**
     * Thu thập danh sách descriptor cần hiển thị dưới dạng card.
     * Hoàn toàn cấu trúc dữ liệu thuần túy (100% Data-Driven - không hardcode bất kỳ tên card hay biến cụ thể nào):
     * 1. Nếu là z.object có children: tiếp tục đệ quy xuống các thuộc tính bên trong.
     * 2. Nếu là z.record: các item thực tế bên trong record (ví dụ từng NPC, vật phẩm, nhiệm vụ) hiển thị thành từng card riêng. Nếu record rỗng ({}) thì hiển thị chính record đó.
     * 3. Nếu là biến lá nguyên thủy (number, string, boolean, array): hiển thị thành card.
     */
    private collectDisplayDescriptors(descriptors: MvuVariableDescriptor[]): MvuVariableDescriptor[] {
        const result: MvuVariableDescriptor[] = [];

        const traverse = (items: MvuVariableDescriptor[]) => {
            for (const d of items) {
                if (d.type === 'object' && d.children && d.children.length > 0) {
                    traverse(d.children);
                } else if (d.type === 'record') {
                    if (d.children && d.children.length > 0) {
                        for (const child of d.children) {
                            result.push(child);
                        }
                    } else {
                        result.push(d);
                    }
                } else {
                    result.push(d);
                }
            }
        };

        traverse(descriptors);
        return result;
    }

    /**
     * Suy diễn danh mục hoàn toàn tự động theo cấu trúc cây Schema (100% Generic):
     * - Tên danh mục tự động lấy theo đường dẫn nhánh cha: "Nhánh_1 ➔ Nhánh_2"
     * - Các trường hệ thống bắt đầu bằng "_" tự động gom lên đầu.
     * - Không chứa bất kỳ từ khóa hay logic riêng biệt của card nào.
     */
    private getCategoryForDescriptor(desc: MvuVariableDescriptor): { name: string; icon: string; order: number } {
        const parts = desc.path.split('.');
        const parentParts = parts.length > 1 ? parts.slice(0, parts.length - 1) : [desc.name];
        const categoryName = parentParts.join(' ➔ ');

        let icon = 'fa-solid fa-folder-open';
        let order = 50;

        // Ưu tiên các trường cấu hình/hệ thống có tiền tố "_"
        if (categoryName.startsWith('_')) {
            icon = 'fa-solid fa-gear';
            order = 10;
        } else if (parentParts.length === 1) {
            order = 20;
        } else {
            order = 30;
        }

        return { name: categoryName, icon, order };
    }

    private renderStatsTab(report: MvuInspectionResult): void {
        const $ = jQuery;
        const container = $('#kaiz-mvu-stats-grid');
        container.empty();

        let displayDescriptors = this.collectDisplayDescriptors(report.parsedSchema);

        // Fallback nếu parsedSchema trống nhưng có liveVariables
        if (displayDescriptors.length === 0 && report.liveVariables) {
            const fallbackSchema = MvuManager.generateSchemaFromData(report.liveVariables);
            MvuManager.enrichWithLiveData(fallbackSchema, report.liveVariables);
            displayDescriptors = this.collectDisplayDescriptors(fallbackSchema);
        }

        if (displayDescriptors.length === 0) {
            container.html(
                '<div class="kaiz-mvu-empty-text">Chưa phát hiện biến nào trong Schema hoặc Live Variables. Hãy bấm "+ Thêm Biến".</div>',
            );
            return;
        }

        // Gom nhóm theo domain category
        const groups: Record<
            string,
            { info: { name: string; icon: string; order: number }; items: MvuVariableDescriptor[] }
        > = {};

        for (const desc of displayDescriptors) {
            const cat = this.getCategoryForDescriptor(desc);
            if (!groups[cat.name]) {
                groups[cat.name] = { info: cat, items: [] };
            }
            groups[cat.name].items.push(desc);
        }

        // Sắp xếp các danh mục theo thứ tự logic nghiệp vụ
        const sortedCats = Object.values(groups).sort((a, b) => a.info.order - b.info.order);

        for (const group of sortedCats) {
            const groupInfo = group.info;
            const descriptors = group.items;

            let catHtml = `
                <div class="kaiz-mvu-category-section">
                    <div class="kaiz-mvu-cat-header">
                        <span class="kaiz-mvu-cat-title"><i class="${groupInfo.icon}"></i> ${escapeHtml(groupInfo.name)}</span>
                        <span class="kaiz-mvu-cat-count">${descriptors.length} chỉ số</span>
                    </div>
                    <div class="kaiz-mvu-cards-grid">
            `;

            for (const desc of descriptors) {
                const liveVal = MvuManager.getLiveVariables(desc.path, this.selectedFloorId);
                let currentVal =
                    liveVal !== undefined ? liveVal : desc.defaultValue !== undefined ? desc.defaultValue : '—';
                let dynamicDesc = desc.description || '';

                if (
                    Array.isArray(currentVal) &&
                    currentVal.length === 2 &&
                    typeof currentVal[1] === 'string' &&
                    (currentVal[0] === null || ['string', 'number', 'boolean'].includes(typeof currentVal[0]))
                ) {
                    if (!dynamicDesc) dynamicDesc = currentVal[1];
                    currentVal = currentVal[0];
                }
                const isNumeric =
                    desc.type === 'number' || (typeof currentVal === 'number' && Number.isFinite(currentVal));
                const isObject = typeof currentVal === 'object' && currentVal !== null && !Array.isArray(currentVal);

                catHtml += `
                    <div class="kaiz-mvu-stat-card" data-path="${escapeHtml(desc.path)}">
                        <div class="kaiz-mvu-card-top">
                            <div class="kaiz-mvu-card-name" title="${escapeHtml(dynamicDesc ? `${desc.path} (${dynamicDesc})` : desc.path)}">
                                ${escapeHtml(desc.name)}
                                ${dynamicDesc ? `<span style="font-size: 10.5px; color: #94a3b8; font-weight: normal; margin-left: 4px;">· ${escapeHtml(dynamicDesc)}</span>` : ''}
                                ${desc.name.startsWith('_') ? `<span class="kaiz-status-pill badge-neutral" style="font-size: 9.5px; padding: 1px 5px; margin-left: 5px; font-weight: normal;" title="Biến chỉ đọc của hệ thống (Readonly)"><i class="fa-solid fa-lock"></i> Chỉ đọc</span>` : ''}
                            </div>
                            <div class="kaiz-mvu-card-actions">
                                <button type="button" class="kaiz-mvu-inline-edit-btn interactable" title="Chỉnh sửa giá trị" data-path="${escapeHtml(desc.path)}">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                            </div>
                        </div>
                `;

                if (isNumeric) {
                    const numVal = Number(currentVal) || 0;
                    const hasBounds =
                        desc.min !== undefined &&
                        desc.max !== undefined &&
                        Math.abs(desc.max) < 1e6 &&
                        Math.abs(desc.min) < 1e6;
                    catHtml += `
                        <div class="kaiz-mvu-card-numeric">
                            <span class="kaiz-mvu-val-main">${numVal}</span>
                            ${hasBounds ? `<span class="kaiz-mvu-val-bounds">(${desc.min} ➔ ${desc.max})</span>` : ''}
                        </div>
                    `;
                } else if (desc.type === 'boolean' || typeof currentVal === 'boolean') {
                    const isTrue = currentVal === true || currentVal === 'true';
                    catHtml += `
                        <div class="kaiz-mvu-card-value">
                            <span class="kaiz-status-pill ${isTrue ? 'badge-success' : 'badge-neutral'}">
                                ${isTrue ? 'True (Bật)' : 'False (Tắt)'}
                            </span>
                        </div>
                    `;
                } else if (desc.type === 'array' || Array.isArray(currentVal)) {
                    const arr = Array.isArray(currentVal) ? currentVal : [];
                    catHtml += `
                        <div class="kaiz-mvu-card-value">
                            ${arr.length > 0 ? arr.map((item: any) => `<span class="kaiz-mvu-tag">${escapeHtml(item)}</span>`).join('') : '<span class="kaiz-mvu-empty-badge">Trống ([])</span>'}
                        </div>
                    `;
                } else if (isObject) {
                    const entries = Object.entries(currentVal);
                    if (entries.length === 0) {
                        catHtml += `
                            <div class="kaiz-mvu-card-value">
                                <span class="kaiz-mvu-empty-badge">Trống ({})</span>
                            </div>
                        `;
                    } else {
                        catHtml += `<div class="kaiz-mvu-card-value"><div class="kaiz-mvu-object-badge">`;
                        for (const [subK, subV] of entries) {
                            let valStr = '';
                            if (typeof subV === 'object' && subV !== null) {
                                try {
                                    valStr = JSON.stringify(subV);
                                } catch {
                                    valStr = String(subV);
                                }
                            } else {
                                valStr = String(subV);
                            }
                            catHtml += `
                                <div class="kaiz-mvu-obj-row">
                                    <span class="kaiz-mvu-obj-k">${escapeHtml(subK)}:</span>
                                    <span class="kaiz-mvu-obj-v" title="${escapeHtml(valStr)}">${escapeHtml(valStr || '—')}</span>
                                </div>
                            `;
                        }
                        catHtml += `</div></div>`;
                    }
                } else {
                    const strVal = String(currentVal ?? '');
                    if (strVal === '') {
                        catHtml += `
                            <div class="kaiz-mvu-card-value">
                                <span class="kaiz-mvu-empty-badge">Trống ("")</span>
                            </div>
                        `;
                    } else if (strVal.length > 70 || strVal.includes('\n')) {
                        catHtml += `
                            <div class="kaiz-mvu-card-value">
                                <div class="kaiz-mvu-text-block" title="${escapeHtml(strVal)}">${escapeHtml(strVal)}</div>
                            </div>
                        `;
                    } else {
                        catHtml += `
                            <div class="kaiz-mvu-card-value">
                                <span class="kaiz-mvu-text-badge">${escapeHtml(strVal)}</span>
                            </div>
                        `;
                    }
                }

                // Inline Edit Form (Hidden by default)
                if (isObject) {
                    const formattedJson = JSON.stringify(currentVal, null, 2);
                    catHtml += `
                        <div class="kaiz-mvu-inline-editor is-textarea" id="editor-${escapeHtml(desc.path).replace(/\./g, '_')}" style="display: none;">
                            <textarea class="text_pole kaiz-mvu-inline-textarea" rows="4">${escapeHtml(formattedJson)}</textarea>
                            <div class="kaiz-mvu-editor-btns">
                                <button type="button" class="menu_button kaiz-mvu-inline-save-btn" data-path="${escapeHtml(desc.path)}" data-is-json="true" title="Lưu JSON">
                                    <i class="fa-solid fa-check"></i> Lưu JSON
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    catHtml += `
                        <div class="kaiz-mvu-inline-editor" id="editor-${escapeHtml(desc.path).replace(/\./g, '_')}" style="display: none;">
                            <input type="text" class="text_pole kaiz-mvu-inline-input" value="${escapeHtml(currentVal)}">
                            <button type="button" class="menu_button kaiz-mvu-inline-save-btn" data-path="${escapeHtml(desc.path)}" title="Lưu">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        </div>
                    `;
                }

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
            const isJson = $(e.currentTarget).data('is-json') === true;
            const editorId = `#editor-${path.replace(/\./g, '_')}`;
            const inputVal = isJson
                ? $(editorId).find('.kaiz-mvu-inline-textarea').val()
                : $(editorId).find('.kaiz-mvu-inline-input').val();

            let finalVal: any = inputVal;
            if (isJson) {
                try {
                    finalVal = JSON.parse(inputVal);
                } catch {
                    if (typeof toastr !== 'undefined') {
                        toastr.error('Định dạng JSON không hợp lệ. Vui lòng kiểm tra lại cú pháp.');
                    }
                    return;
                }
            }

            try {
                const res = await MvuManager.setLiveVariable(path, finalVal, this.selectedFloorId);
                if (res.success) {
                    if (typeof toastr !== 'undefined') {
                        toastr.success(`Đã cập nhật ${path}`);
                    }
                    await this.refresh(this.selectedFloorId);
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
            const hasBounds = desc.min !== undefined && desc.max !== undefined && desc.max <= 1e6 && desc.min >= -1e6;
            const boundsText = hasBounds
                ? `${desc.min} ➔ ${desc.max}`
                : desc.min !== undefined && desc.min >= -1e6
                  ? `Min: ${desc.min}`
                  : desc.max !== undefined && desc.max <= 1e6
                    ? `Max: ${desc.max}`
                    : '—';
            let defaultText = '—';
            if (desc.defaultValue !== undefined) {
                if (typeof desc.defaultValue === 'object' && desc.defaultValue !== null) {
                    try {
                        defaultText = JSON.stringify(desc.defaultValue);
                    } catch {
                        defaultText = String(desc.defaultValue);
                    }
                } else {
                    defaultText = String(desc.defaultValue);
                }
            }

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
        $('#kaiz-mvu-raw-wrapper').text(
            report.rawWrapper
                ? JSON.stringify(report.rawWrapper, null, 2)
                : 'Không có dữ liệu wrapper tin nhắn trong bộ nhớ.',
        );
        $('#kaiz-mvu-raw-zod').text(report.zodSchemaCode || 'Không tìm thấy Zod Schema script.');
        $('#kaiz-mvu-raw-initvar').text(
            report.initvarVariables ? YAML.stringify(report.initvarVariables) : 'Chưa có Worldbook [InitVar].',
        );
        $('#kaiz-mvu-raw-rules').text(report.updateRulesSummary || 'Chưa có Worldbook [mvu_update].');
    }

    private renderActivityTab(report: MvuInspectionResult): void {
        const $ = jQuery;
        const container = $('#kaiz-mvu-activity-container');
        if (!container.length) return;

        const act = report.lorebookActivity;
        if (!act) {
            container.html(`
                <div class="kaiz-mvu-empty-badge" style="padding: 24px; text-align: center;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; color: #f59e0b; margin-bottom: 8px; display: block;"></i>
                    Chưa có dữ liệu kiểm tra Lorebook MVU. Vui lòng bấm nút làm mới ở góc phải.
                </div>
            `);
            return;
        }

        const isAllOk = act.allRequiredActive;
        const statusBannerClass = isAllOk ? 'banner-success' : 'banner-danger';
        const bannerIcon = isAllOk ? 'fa-circle-check' : 'fa-triangle-exclamation';
        const bannerTitle = isAllOk
            ? 'Hệ thống Lorebook MVU đạt chuẩn hoạt động'
            : `Phát hiện ${act.inactiveCount} tiêu chí Lorebook MVU chưa hoạt động!`;
        const bannerSubtitle = isAllOk
            ? 'Tất cả các tiêu chí cốt lõi (Khởi tạo biến, Quy tắc cập nhật, Định dạng xuất, Danh sách biến) đã được cấu hình chuẩn xác trong Worldbook.'
            : 'Các tiêu chí hiển thị màu đỏ bên dưới đang bị thiếu hoặc bị tắt trong Worldbook. AI sẽ không thể đọc hiểu hoặc cập nhật biến.';

        let rowsHtml = '';
        for (const item of act.items) {
            let rowStatusClass = '';
            let statusBadgeClass = '';
            let iconHtml = '';

            if (item.status === 'active') {
                rowStatusClass = 'row-active';
                statusBadgeClass = 'status-active';
                iconHtml = '<i class="fa-solid fa-circle-check"></i>';
            } else if (item.status === 'warning') {
                rowStatusClass = 'row-warning';
                statusBadgeClass = 'status-warning';
                iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
            } else if (item.status === 'inactive') {
                // ĐỎ RỰC RỠ: Tiêu chí không hoạt động
                rowStatusClass = 'row-inactive';
                statusBadgeClass = 'status-inactive';
                iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
            } else {
                rowStatusClass = 'row-optional';
                statusBadgeClass = 'status-optional';
                iconHtml = '<i class="fa-solid fa-circle-minus"></i>';
            }

            const isMissing = item.entryName === 'Không tìm thấy' || item.entryName === 'Không sử dụng';
            const entryDisplay = !isMissing
                ? `<div class="kaiz-mvu-entry-badge" title="Entry ID: ${escapeHtml(item.entryId ?? 'N/A')}">
                    <i class="fa-solid fa-bookmark"></i>
                    <span class="kaiz-mvu-entry-name">${escapeHtml(item.entryName)}</span>
                   </div>`
                : `<span class="kaiz-mvu-entry-missing"><i class="fa-solid fa-ban"></i> ${escapeHtml(item.entryName)}</span>`;

            const locationBadge = item.location && item.location !== '—'
                ? `<div class="kaiz-mvu-location-tag"><i class="fa-solid fa-book-atlas"></i> <span>${escapeHtml(item.location)}</span></div>`
                : `<div class="kaiz-mvu-location-tag empty"><span>—</span></div>`;

            const reqBadge = item.isRequired
                ? '<span class="kaiz-mvu-req-tag required">Bắt buộc</span>'
                : '<span class="kaiz-mvu-req-tag optional">Tùy chọn</span>';

            rowsHtml += `
                <tr class="kaiz-mvu-activity-row ${rowStatusClass}">
                    <td class="col-criterion">
                        <div class="kaiz-mvu-criterion-header">
                            <span class="kaiz-mvu-criterion-name">${escapeHtml(item.name)}</span>
                            ${reqBadge}
                        </div>
                        <div class="kaiz-mvu-criterion-desc">${escapeHtml(item.description)}</div>
                    </td>
                    <td class="col-entry">
                        ${entryDisplay}
                        ${locationBadge}
                    </td>
                    <td class="col-status">
                        <span class="kaiz-mvu-status-badge ${statusBadgeClass}">
                            ${iconHtml} <span>${escapeHtml(item.statusText)}</span>
                        </span>
                    </td>
                    <td class="col-details">
                        <div class="kaiz-mvu-criterion-details">${escapeHtml(item.details)}</div>
                    </td>
                </tr>
            `;
        }

        const html = `
            <div class="kaiz-mvu-activity-wrapper">
                <!-- Summary Banner -->
                <div class="kaiz-mvu-activity-banner ${statusBannerClass}">
                    <div class="kaiz-mvu-banner-icon"><i class="fa-solid ${bannerIcon}"></i></div>
                    <div class="kaiz-mvu-banner-content">
                        <h4 class="kaiz-mvu-banner-title">${bannerTitle}</h4>
                        <p class="kaiz-mvu-banner-desc">${bannerSubtitle}</p>
                    </div>
                    <div class="kaiz-mvu-banner-stats">
                        <div class="kaiz-mvu-banner-metric ${act.inactiveCount > 0 ? 'metric-danger' : 'metric-success'}">
                            <span class="metric-num">${act.activeCount}/${act.totalCriteria}</span>
                            <span class="metric-lbl">Tiêu chí đạt</span>
                        </div>
                        ${act.inactiveCount > 0 ? `
                        <div class="kaiz-mvu-banner-metric metric-danger">
                            <span class="metric-num">${act.inactiveCount}</span>
                            <span class="metric-lbl">Không hoạt động</span>
                        </div>` : ''}
                    </div>
                </div>

                <!-- Lorebook Activity Table -->
                <div class="kaiz-mvu-activity-table-card">
                    <div class="kaiz-mvu-activity-table-header">
                        <div class="kaiz-mvu-activity-table-title">
                            <i class="fa-solid fa-list-check" style="color: #38bdf8;"></i>
                            <span>Bảng Đối Chiếu Hoạt Động & Chỉ Điểm Entry Worldbook</span>
                        </div>
                        <div class="kaiz-mvu-activity-legend">
                            <span class="legend-item"><span class="legend-dot dot-active"></span> Hoạt động</span>
                            <span class="legend-item"><span class="legend-dot dot-inactive"></span> Không hoạt động</span>
                            <span class="legend-item"><span class="legend-dot dot-warning"></span> Cảnh báo</span>
                        </div>
                    </div>
                    <div class="kaiz-mvu-table-responsive">
                        <table class="kaiz-mvu-activity-table">
                            <thead>
                                <tr>
                                    <th style="width: 28%;">Tiêu chí MVU</th>
                                    <th style="width: 25%;">Entry chỉ điểm (Worldbook)</th>
                                    <th style="width: 20%;">Trạng thái hoạt động</th>
                                    <th style="width: 27%;">Đánh giá & Chi tiết kỹ thuật</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="kaiz-mvu-activity-footer-hint">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>
                        <strong>Ghi chú:</strong> Hệ thống tự động phân tích cấu trúc nội dung (Content DNA) của tất cả sổ tay liên kết và sổ tay nhúng của nhân vật. Các mục hiển thị <strong>màu đỏ</strong> sẽ khiến AI không thể đọc được quy tắc hoặc xuất lệnh cập nhật biến.
                    </span>
                </div>
            </div>
        `;

        container.html(html);
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
