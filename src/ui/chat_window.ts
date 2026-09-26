import { marked } from 'marked';
import { AgentLoop } from '../core/loop';
import { StateManager } from '../core/state';
import { ToolRegistry } from '../core/tool_registry';
import { BackupModal } from './backup_modal';

declare const jQuery: any;

const escapeHtml = (s: string): string =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
declare const SillyTavern: any;
declare const toastr: any;

export class ChatWindowUI {
    private static currentAttachments: import('../core/db').ChatAttachment[] = [];
    public static lastLogSent: string = 'No data yet.';
    public static lastLogRecv: string = 'No data yet.';

    public static init(loop: AgentLoop, stateManager: StateManager, registry: ToolRegistry) {
        const $ = jQuery;
        const btn = $('#kaiz-floating-btn');
        const win = $('#kaiz-chat-window');
        const closeBtn = $('#kaiz-chat-close');
        const toolsBtn = $('#kaiz-chat-tools-btn');
        const toolsMenu = $('#kaiz-chat-tools-menu');
        const ctx = SillyTavern.getContext();
        const settings = ctx.extensionSettings['kaiz_agent'] || {};
        if (settings.enableBrowser === false) {
            $('#kaiz-chat-browser-btn').hide();
        }

        // --- Tools Menu Logic ---
        toolsBtn.on('click', (e: any) => {
            e.stopPropagation();
            toolsMenu.toggle();
            toolsBtn.toggleClass('active', toolsMenu.is(':visible'));
        });

        $(document)
            .off('click.kaiz_tools_menu')
            .on('click.kaiz_tools_menu', (e: any) => {
                if (
                    !$(e.target).closest('#kaiz-chat-tools-btn').length &&
                    !$(e.target).closest('#kaiz-chat-tools-menu').length
                ) {
                    toolsMenu.hide();
                    toolsBtn.removeClass('active');
                }
            });

        toolsMenu.on('click', '.kaiz-menu-item', () => {
            toolsMenu.hide();
            toolsBtn.removeClass('active');
        });

        $(document)
            .off('keydown.kaiz_tools_menu')
            .on('keydown.kaiz_tools_menu', (e: any) => {
                if (e.key === 'Escape' && toolsMenu.is(':visible')) {
                    toolsMenu.hide();
                    toolsBtn.removeClass('active');
                }
            });

        const logBtn = $('#kaiz-chat-log-btn');
        const backupBtn = $('#kaiz-chat-backup-btn');

        if ($('#kaiz-log-modal').length === 0) {
            $('body').append(`
                <dialog id="kaiz-log-modal" class="kaiz-log-modal">
                    <div class="kaiz-log-header">
                        <h3 class="kaiz-log-title">Agent Request Logs</h3>
                        <i id="kaiz-log-close" class="fa-solid fa-xmark interactable kaiz-log-close"></i>
                    </div>
                    <div class="kaiz-log-body">
                        <div class="kaiz-log-pane-left">
                            <h4 class="kaiz-log-pane-title">Messages Sent (JSON)</h4>
                            <pre id="kaiz-log-sent" class="kaiz-log-pre"></pre>
                        </div>
                        <div class="kaiz-log-pane-right">
                            <h4 class="kaiz-log-pane-title">Raw Response Received</h4>
                            <pre id="kaiz-log-recv" class="kaiz-log-pre"></pre>
                        </div>
                    </div>
                </dialog>
            `);
        }

        $('#kaiz-log-close').on('click', () => {
            ($('#kaiz-log-modal')[0] as HTMLDialogElement).close();
        });

        $('#kaiz-chat-settings-btn').on('click', () => {
            const modal = $('#kaiz-persona-memory-modal')[0] as HTMLDialogElement;
            if (modal) modal.showModal();
        });

        $('#kaiz-persona-memory-close').on('click', () => {
            const modal = $('#kaiz-persona-memory-modal')[0] as HTMLDialogElement;
            if (modal) modal.close();
        });

        const backupModal = new BackupModal(stateManager.db);
        backupBtn.on('click', () => {
            backupModal.show();
        });

        logBtn.on('click', () => {
            $('#kaiz-log-sent').text(ChatWindowUI.lastLogSent);
            $('#kaiz-log-recv').text(ChatWindowUI.lastLogRecv);
            const dialog = $('#kaiz-log-modal')[0] as HTMLDialogElement;
            if (!dialog.open) {
                dialog.showModal();
            }
        });
        // ------------------------------------

        // --- Quick Prompts Logic ---
        const quickPromptBtn = $('#kaiz-quick-prompt-btn');
        const quickPromptMenu = $('#kaiz-quick-prompt-menu');
        const input = $('#kaiz-chat-input');

        function populateQuickPrompts() {
            quickPromptMenu.empty();
            const ctx = (window as any).SillyTavern.getContext();
            const settings = ctx.extensionSettings['kaiz_agent'] || {};
            const prompts = settings.quickPrompts || [];

            if (prompts.length === 0) {
                quickPromptMenu.append(
                    '<div style="padding: 10px; color: #888; text-align: center; font-size: 12px;">No quick prompts configured. Add them in Settings.</div>',
                );
                return;
            }

            prompts.forEach((qp: any) => {
                const iconName = qp.icon || 'zap';
                const $item = $(`
                    <div class="kaiz-quick-prompt-item">
                        <div class="kaiz-qp-item-icon" style="display: flex; justify-content: center; width: 20px;"><i data-lucide="${iconName}"></i></div>
                        <div class="kaiz-qp-item-name" title="${qp.name}">${qp.name || 'Prompt'}</div>
                    </div>
                `);
                $item.on('click', () => {
                    const currentText = String(input.val() || '');
                    // Nếu đã có text, nối thêm dòng mới, nếu không thì chèn thẳng
                    const newText = currentText
                        ? currentText + (currentText.endsWith('\n') ? '' : '\n') + qp.prompt
                        : qp.prompt;
                    input.val(newText).trigger('input');
                    input.focus();
                    quickPromptMenu.hide();
                });
                quickPromptMenu.append($item);
            });

            // Yêu cầu Lucide vẽ SVG
            if ((window as any).lucide) {
                (window as any).lucide.createIcons();
            } else {
                setTimeout(() => {
                    if ((window as any).lucide) (window as any).lucide.createIcons();
                }, 100);
            }
        }

        quickPromptBtn.on('click', (e: any) => {
            e.stopPropagation();
            if (quickPromptMenu.is(':visible')) {
                quickPromptMenu.hide();
            } else {
                populateQuickPrompts();
                quickPromptMenu.css('display', 'flex'); // Flex to support column layout
            }
        });

        // Đóng menu khi click ra ngoài
        $(document).on('click', (e: any) => {
            if (
                !$(e.target).closest('#kaiz-quick-prompt-btn').length &&
                !$(e.target).closest('#kaiz-quick-prompt-menu').length
            ) {
                quickPromptMenu.hide();
            }
        });
        // ------------------------------------

        // --- File Attachments Logic ---
        const attachBtn = $('#kaiz-attach-btn');
        const fileInput = $('#kaiz-file-upload');
        const attachmentsPreview = $('#kaiz-attachments-preview');

        const renderAttachmentsPreview = () => {
            attachmentsPreview.empty();
            if (ChatWindowUI.currentAttachments.length === 0) {
                attachmentsPreview.hide();
                return;
            }
            attachmentsPreview.show();
            ChatWindowUI.currentAttachments.forEach((att, index) => {
                const item = $('<div class="kaiz-attachment-item"></div>');
                if (att.type === 'image') {
                    item.addClass('is-image');
                    item.append(`<img src="${att.data}" title="${escapeHtml(att.name)}" />`);
                } else {
                    item.addClass('is-file');
                    item.append(`<i class="fa-solid fa-file-lines"></i>`);
                    item.append(`<span>${escapeHtml(att.name)}</span>`);
                }
                const removeBtn = $('<div class="kaiz-attachment-remove"><i class="fa-solid fa-xmark"></i></div>');
                removeBtn.on('click', () => {
                    ChatWindowUI.currentAttachments.splice(index, 1);
                    renderAttachmentsPreview();
                });
                item.append(removeBtn);
                attachmentsPreview.append(item);
            });
        };

        const processFile = (file: File) => {
            const reader = new FileReader();
            if (file.type.startsWith('image/')) {
                reader.onload = (e) => {
                    ChatWindowUI.currentAttachments.push({
                        name: file.name,
                        type: 'image',
                        data: e.target?.result as string,
                    });
                    renderAttachmentsPreview();
                };
                reader.readAsDataURL(file);
            } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                reader.onload = (e) => {
                    ChatWindowUI.currentAttachments.push({
                        name: file.name,
                        type: 'text',
                        data: e.target?.result as string,
                    });
                    renderAttachmentsPreview();
                };
                reader.readAsText(file);
            } else {
                console.warn('Kaiz Agent: Unsupported file type', file.name);
            }
        };

        attachBtn.on('click', () => {
            fileInput.trigger('click');
        });

        fileInput.on('change', (e: any) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    processFile(files[i]);
                }
            }
            fileInput.val(''); // Reset
        });

        // Paste support
        input.on('paste', (e: any) => {
            const clipboardData = e.clipboardData || e.originalEvent.clipboardData;
            if (clipboardData && clipboardData.items) {
                for (let i = 0; i < clipboardData.items.length; i++) {
                    const item = clipboardData.items[i];
                    if (item.kind === 'file') {
                        const file = item.getAsFile();
                        if (file) {
                            processFile(file);
                        }
                    }
                }
            }
        });

        // Drag & Drop support
        const dropZone = $('.kaiz-chat-input-area');
        dropZone.on('dragover', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.css('background', 'rgba(255, 255, 255, 0.1)');
        });
        dropZone.on('dragleave', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.css('background', 'rgba(0, 0, 0, 0.2)');
        });
        dropZone.on('drop', (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.css('background', 'rgba(0, 0, 0, 0.2)');
            const files = e.originalEvent.dataTransfer.files;
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    processFile(files[i]);
                }
            }
        });
        // ------------------------------------

        const continueBtn = $('#kaiz-chat-continue');
        const sendBtn = $('#kaiz-chat-send');
        const history = $('#kaiz-chat-history');

        const updateContinueBtnVisibility = () => {
            if (loop.isRunning) {
                continueBtn.hide();
                return;
            }
            const lastMsgRow = history.find('.kaiz-msg').last();
            if (
                lastMsgRow.length > 0 &&
                lastMsgRow.hasClass('kaiz-msg-agent') &&
                !lastMsgRow.hasClass('kaiz-msg-welcome')
            ) {
                continueBtn.css('display', 'inline-flex');
            } else {
                continueBtn.hide();
            }
        };

        // ==========================================
        // --- REFINED MILESTONE SCROLLBAR RAIL LOGIC (PC/MOBILE) ---
        // ==========================================
        const milestoneRail = $('#kaiz-milestone-rail');
        const milestoneTrack = $('#kaiz-milestone-track');
        const milestoneTooltip = $('#kaiz-milestone-tooltip');
        const milestoneBtnTop = $('#kaiz-milestone-btn-top');
        const milestoneBtnBottom = $('#kaiz-milestone-btn-bottom');
        const milestoneActiveThumb = $('#kaiz-milestone-active-thumb');

        interface MilestoneData {
            index: number;
            msgEl: HTMLElement;
            relativeTop: number;
            posPercent: number;
            excerpt: string;
        }

        let currentMilestones: MilestoneData[] = [];
        let currentMarkerEls: HTMLElement[] = [];
        let milestoneDebounceTimer: any = null;
        let isScrubbingMilestones = false;
        let activeMilestoneIndex = -1;
        let scrollTrackerRafId: number | null = null;
        let hudHideTimeout: any = null;
        let cachedTrackRect: DOMRect | null = null;
        let cachedRailRect: DOMRect | null = null;

        // Quick Jump buttons
        milestoneBtnTop.on('click', (e: any) => {
            e.stopPropagation();
            history[0]?.scrollTo({ top: 0, behavior: 'smooth' });
        });

        milestoneBtnBottom.on('click', (e: any) => {
            e.stopPropagation();
            const hEl = history[0];
            if (hEl) {
                hEl.scrollTo({ top: hEl.scrollHeight, behavior: 'smooth' });
            }
        });

        // Hàm hiển thị HUD Preview
        const showMilestoneHUD = (item: MilestoneData, clientY?: number) => {
            clearTimeout(hudHideTimeout);
            const total = currentMilestones.length;
            milestoneTooltip.html(`
                <div class="kaiz-milestone-tt-header">
                    <span class="kaiz-milestone-tt-badge"><i class="fa-solid fa-user"></i> LƯỢT #${item.index + 1} / ${total}</span>
                    <span class="kaiz-milestone-tt-percent">${Math.round(item.posPercent)}%</span>
                </div>
                <div class="kaiz-milestone-tt-body">${escapeHtml(item.excerpt)}</div>
                <div class="kaiz-milestone-tt-hint"><i class="fa-solid fa-arrows-up-down"></i> Kéo để duyệt các lượt chat</div>
            `);

            const trackRect = cachedTrackRect || milestoneTrack[0]?.getBoundingClientRect();
            const railRect = cachedRailRect || milestoneRail[0]?.getBoundingClientRect();
            if (!trackRect || !railRect) return;

            let targetY: number;
            if (clientY !== undefined) {
                targetY = clientY - railRect.top;
            } else {
                targetY = trackRect.top - railRect.top + trackRect.height * (item.posPercent / 100);
            }

            const clampedY = Math.max(25, Math.min(railRect.height - 25, targetY));
            milestoneTooltip.css({
                top: `${clampedY}px`,
                display: 'block',
            });
        };

        const hideMilestoneHUD = (delay: number = 0) => {
            clearTimeout(hudHideTimeout);
            if (delay > 0) {
                hudHideTimeout = setTimeout(() => {
                    milestoneTooltip.hide();
                }, delay);
            } else {
                milestoneTooltip.hide();
            }
        };

        // Hàm cuộn tới tin nhắn của milestone (sử dụng offsetTop được cache sẵn, KHÔNG layout thrash)
        const scrollToMilestone = (item: MilestoneData, smooth: boolean = true) => {
            const hEl = history[0];
            if (!hEl) return;
            const targetTop = item.relativeTop - 16;
            hEl.scrollTo({
                top: Math.max(0, targetTop),
                behavior: smooth ? 'smooth' : 'instant',
            });
        };

        // Hàm cập nhật trạng thái milestone đang hiển thị trong viewport
        const updateActiveMilestone = () => {
            if (isScrubbingMilestones || currentMilestones.length === 0) return;
            const hEl = history[0];
            if (!hEl) return;

            const currentScroll = hEl.scrollTop;
            const maxScroll = Math.max(1, hEl.scrollHeight - hEl.clientHeight);

            let bestIndex = 0;
            if (currentScroll >= maxScroll - 30) {
                bestIndex = currentMilestones.length - 1;
            } else if (currentScroll <= 30) {
                bestIndex = 0;
            } else {
                const thresholdY = currentScroll + hEl.clientHeight * 0.25;
                for (let i = 0; i < currentMilestones.length; i++) {
                    if (currentMilestones[i].relativeTop <= thresholdY) {
                        bestIndex = i;
                    } else {
                        break;
                    }
                }
            }

            if (bestIndex !== activeMilestoneIndex) {
                if (activeMilestoneIndex >= 0 && currentMarkerEls[activeMilestoneIndex]) {
                    currentMarkerEls[activeMilestoneIndex].classList.remove('is-active');
                }
                if (currentMarkerEls[bestIndex]) {
                    currentMarkerEls[bestIndex].classList.add('is-active');
                }
                activeMilestoneIndex = bestIndex;

                const activeItem = currentMilestones[bestIndex];
                if (activeItem) {
                    milestoneActiveThumb.css({
                        top: `${activeItem.posPercent.toFixed(2)}%`,
                        display: 'block',
                    });
                }
            }
        };

        const requestUpdateActiveMilestone = () => {
            if (scrollTrackerRafId !== null) return;
            scrollTrackerRafId = requestAnimationFrame(() => {
                scrollTrackerRafId = null;
                updateActiveMilestone();
            });
        };

        // Lắng nghe scroll trên history để cập nhật indicator
        history.off('scroll.kaiz_milestones').on('scroll.kaiz_milestones', requestUpdateActiveMilestone);

        const updateMilestones = () => {
            if (!history[0] || !milestoneTrack[0]) return;
            const userMsgs = history
                .find('.kaiz-msg-user')
                .filter((_: any, el: HTMLElement) => {
                    const $el = $(el);
                    if ($el.find('.kaiz-system-result-block').length > 0) return false;
                    const text = $el.find('.kaiz-msg-content').text().trim();
                    return !text.startsWith('[Tool Result');
                })
                .toArray();

            if (userMsgs.length === 0) {
                currentMilestones = [];
                currentMarkerEls = [];
                activeMilestoneIndex = -1;
                milestoneTrack.find('.kaiz-milestone-marker').remove();
                milestoneActiveThumb.hide();
                milestoneRail.css('opacity', '0.2');
                hideMilestoneHUD();
                return;
            }

            milestoneRail.css('opacity', '1');
            const historyEl = history[0];
            const scrollHeight = Math.max(historyEl.scrollHeight, 1);

            currentMilestones = userMsgs.map((msgEl: HTMLElement, index: number) => {
                const relativeTop = msgEl.offsetTop;
                const posPercent = Math.max(0, Math.min(100, (relativeTop / scrollHeight) * 100));
                const rawText = $(msgEl).find('.kaiz-msg-content').text().trim();
                const excerpt = rawText.length > 70 ? rawText.substring(0, 67) + '...' : rawText || '(Tin nhắn trống)';
                return {
                    index,
                    msgEl,
                    relativeTop,
                    posPercent,
                    excerpt,
                };
            });

            // Giữ lại activeThumb, xóa các markers cũ
            milestoneTrack.find('.kaiz-milestone-marker').remove();
            currentMarkerEls = [];

            const frag = document.createDocumentFragment();
            for (let i = 0; i < currentMilestones.length; i++) {
                const item = currentMilestones[i];
                const marker = document.createElement('div');
                marker.className = 'kaiz-milestone-marker';
                marker.style.top = `${item.posPercent.toFixed(2)}%`;
                marker.setAttribute('data-index', String(item.index));
                frag.appendChild(marker);
                currentMarkerEls.push(marker);
            }
            milestoneTrack[0]?.appendChild(frag);

            updateActiveMilestone();
        };

        const requestUpdateMilestones = () => {
            const chatWinEl = win[0] as HTMLDialogElement;
            if (!chatWinEl || !chatWinEl.open) return;
            clearTimeout(milestoneDebounceTimer);
            milestoneDebounceTimer = setTimeout(updateMilestones, 120);
        };

        // --- HÀM TÌM MILESTONE GẦN NHẤT VỚI TỌA ĐỘ Y ---
        const getClosestMilestoneByY = (clientY: number): MilestoneData | null => {
            if (currentMilestones.length === 0) return null;
            const trackRect = cachedTrackRect || milestoneTrack[0]?.getBoundingClientRect();
            if (!trackRect) return null;
            const clickY = clientY - trackRect.top;
            const percent = Math.max(0, Math.min(100, (clickY / Math.max(trackRect.height, 1)) * 100));

            let closest = currentMilestones[0];
            let minDist = Math.abs(currentMilestones[0].posPercent - percent);
            for (let i = 1; i < currentMilestones.length; i++) {
                const dist = Math.abs(currentMilestones[i].posPercent - percent);
                if (dist < minDist) {
                    minDist = dist;
                    closest = currentMilestones[i];
                }
            }
            return closest;
        };

        // --- CƠ CHẾ SCRUBBING (KÉO TRƯỢT TRÊN PC VÀ VUỐT NGÓN TAY TRÊN MOBILE) ---
        const handleScrubMove = (clientY: number) => {
            const target = getClosestMilestoneByY(clientY);
            if (!target) return;

            // Di chuyển active thumb và hiển thị HUD theo ngón tay/chuột
            milestoneActiveThumb.css({
                top: `${target.posPercent.toFixed(2)}%`,
                display: 'block',
            });

            for (let i = 0; i < currentMarkerEls.length; i++) {
                const el = currentMarkerEls[i];
                if (!el) continue;
                if (i === target.index) {
                    el.classList.add('is-hovered');
                    el.classList.remove('is-proximity');
                } else if (Math.abs(i - target.index) <= 1) {
                    el.classList.add('is-proximity');
                    el.classList.remove('is-hovered');
                } else {
                    el.classList.remove('is-hovered', 'is-proximity');
                }
            }

            showMilestoneHUD(target, clientY);
            // Live scroll tức thì khi đang kéo mà không layout thrash
            scrollToMilestone(target, false);
        };

        const handleScrubEnd = (clientY: number) => {
            isScrubbingMilestones = false;
            cachedTrackRect = null;
            cachedRailRect = null;
            milestoneRail.removeClass('is-scrubbing');
            $(document).off('.kaiz_milestone_scrub');

            for (let i = 0; i < currentMarkerEls.length; i++) {
                currentMarkerEls[i]?.classList.remove('is-hovered', 'is-proximity');
            }

            const target = getClosestMilestoneByY(clientY);
            if (target) {
                scrollToMilestone(target, true);
                $(target.msgEl).removeClass('kaiz-msg-highlight-pulse');
                void target.msgEl.offsetWidth;
                $(target.msgEl).addClass('kaiz-msg-highlight-pulse');
                setTimeout(() => {
                    $(target.msgEl).removeClass('kaiz-msg-highlight-pulse');
                }, 1500);
            }
            hideMilestoneHUD(500);
            requestUpdateActiveMilestone();
        };

        const startScrubbing = (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentMilestones.length === 0) return;

            isScrubbingMilestones = true;
            milestoneRail.addClass('is-scrubbing');
            cachedTrackRect = milestoneTrack[0]?.getBoundingClientRect() || null;
            cachedRailRect = milestoneRail[0]?.getBoundingClientRect() || null;

            const clientY = e.type.startsWith('touch') ? e.originalEvent.touches[0].clientY : e.clientY;
            handleScrubMove(clientY);

            $(document)
                .off('.kaiz_milestone_scrub')
                .on('mousemove.kaiz_milestone_scrub', (moveEv: any) => {
                    if (!isScrubbingMilestones) return;
                    handleScrubMove(moveEv.clientY);
                })
                .on('touchmove.kaiz_milestone_scrub', (moveEv: any) => {
                    if (!isScrubbingMilestones || !moveEv.originalEvent.touches[0]) return;
                    handleScrubMove(moveEv.originalEvent.touches[0].clientY);
                })
                .on('mouseup.kaiz_milestone_scrub', (upEv: any) => {
                    handleScrubEnd(upEv.clientY);
                })
                .on('touchend.kaiz_milestone_scrub touchcancel.kaiz_milestone_scrub', (upEv: any) => {
                    const endY = upEv.originalEvent.changedTouches?.[0]?.clientY || clientY;
                    handleScrubEnd(endY);
                });
        };

        // Gắn sự kiện mousedown và touchstart lên toàn bộ milestoneTrack
        milestoneTrack.on('mousedown', (e: any) => {
            startScrubbing(e);
        });

        milestoneTrack.on('touchstart', (e: any) => {
            startScrubbing(e);
        });

        // Event delegation trên milestoneTrack cho hover hiển thị HUD
        milestoneTrack
            .on('mouseenter', '.kaiz-milestone-marker', function (this: HTMLElement) {
                if (isScrubbingMilestones) return;
                const idx = parseInt(this.getAttribute('data-index') || '-1', 10);
                const item = currentMilestones[idx];
                if (item) showMilestoneHUD(item);
            })
            .on('mouseleave', '.kaiz-milestone-marker', function () {
                if (isScrubbingMilestones) return;
                hideMilestoneHUD();
            });

        // ==========================================
        // --- IN-CHAT SEARCH BAR LOGIC ---
        // ==========================================
        const searchToggleBtn = $('#kaiz-chat-search-toggle-btn');
        const searchBar = $('#kaiz-chat-search-bar');
        const searchInput = $('#kaiz-search-input');
        const searchCounter = $('#kaiz-search-counter');
        const searchPrevBtn = $('#kaiz-search-prev-btn');
        const searchNextBtn = $('#kaiz-search-next-btn');
        const searchCloseBtn = $('#kaiz-search-close-btn');

        let currentSearchMatches: HTMLElement[] = [];
        let activeMatchIndex = -1;
        let searchDebounceTimer: any = null;

        const clearSearchHighlights = () => {
            if (currentSearchMatches.length === 0) return;
            const parentsToNormalize = new Set<Node>();
            for (const mark of currentSearchMatches) {
                const parent = mark.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
                    parentsToNormalize.add(parent);
                }
            }
            for (const p of parentsToNormalize) {
                p.normalize();
            }
            currentSearchMatches = [];
            activeMatchIndex = -1;
        };

        const highlightCurrentMatch = (hitCap: boolean = false) => {
            currentSearchMatches.forEach((m) => m.classList.remove('kaiz-search-mark-active'));
            if (activeMatchIndex >= 0 && activeMatchIndex < currentSearchMatches.length) {
                const currentEl = currentSearchMatches[activeMatchIndex];
                currentEl.classList.add('kaiz-search-mark-active');
                const suffix = hitCap ? '+' : '';
                searchCounter.text(`${activeMatchIndex + 1}/${currentSearchMatches.length}${suffix}`);

                const historyEl = history[0];
                if (historyEl) {
                    const targetRect = currentEl.getBoundingClientRect();
                    const historyRect = historyEl.getBoundingClientRect();
                    const targetTop =
                        targetRect.top -
                        historyRect.top +
                        historyEl.scrollTop -
                        historyRect.height / 2 +
                        targetRect.height / 2;

                    historyEl.scrollTo({
                        top: Math.max(0, targetTop),
                        behavior: 'smooth',
                    });
                }
            }
        };

        const performSearch = (query: string) => {
            clearSearchHighlights();
            const cleanQuery = query.trim();
            if (!cleanQuery) {
                searchCounter.text('0/0');
                searchPrevBtn.prop('disabled', true);
                searchNextBtn.prop('disabled', true);
                return;
            }

            const matches: HTMLElement[] = [];
            const queryLower = cleanQuery.toLowerCase();
            // Capped highlights để giữ DOM luôn nhẹ, tránh giật lag khi query ngắn
            const MAX_MATCHES = cleanQuery.length < 2 ? 100 : 250;
            let hitCap = false;

            const historyEl = history[0];
            if (!historyEl) return;
            // Dùng getElementsByClassName nguyên bản nhanh hơn nhiều so với jQuery find
            const msgContents = historyEl.getElementsByClassName('kaiz-msg-content');

            for (let i = 0; i < msgContents.length; i++) {
                const contentEl = msgContents[i] as HTMLElement;
                const textContent = contentEl.textContent || '';
                // SPEED BOOSTER: Nếu tin nhắn không chứa từ khóa, bỏ qua ngay lập tức!
                if (!textContent.toLowerCase().includes(queryLower)) {
                    continue;
                }

                const walker = document.createTreeWalker(contentEl, 4 /* NodeFilter.SHOW_TEXT */, {
                    acceptNode: (node: Node) => {
                        if (node.parentElement?.tagName === 'MARK') return 2; /* NodeFilter.FILTER_REJECT */
                        return 1; /* NodeFilter.FILTER_ACCEPT */
                    },
                });

                const textNodes: Text[] = [];
                let currentNode = walker.nextNode();
                while (currentNode) {
                    textNodes.push(currentNode as Text);
                    currentNode = walker.nextNode();
                }

                for (const textNode of textNodes) {
                    const text = textNode.nodeValue || '';
                    const textLower = text.toLowerCase();
                    let matchIndex = textLower.indexOf(queryLower);

                    if (matchIndex === -1) continue;

                    const frag = document.createDocumentFragment();
                    let lastIdx = 0;

                    while (matchIndex !== -1) {
                        if (matchIndex > lastIdx) {
                            frag.appendChild(document.createTextNode(text.substring(lastIdx, matchIndex)));
                        }
                        const mark = document.createElement('mark');
                        mark.className = 'kaiz-search-mark';
                        mark.textContent = text.substring(matchIndex, matchIndex + cleanQuery.length);
                        frag.appendChild(mark);
                        matches.push(mark);

                        if (matches.length >= MAX_MATCHES) {
                            hitCap = true;
                            break;
                        }

                        lastIdx = matchIndex + cleanQuery.length;
                        matchIndex = textLower.indexOf(queryLower, lastIdx);
                    }

                    if (lastIdx < text.length) {
                        frag.appendChild(document.createTextNode(text.substring(lastIdx)));
                    }

                    textNode.parentNode?.replaceChild(frag, textNode);
                    if (hitCap) break;
                }

                if (hitCap) break;
            }

            currentSearchMatches = matches;
            if (matches.length > 0) {
                activeMatchIndex = 0;
                highlightCurrentMatch(hitCap);
                searchPrevBtn.prop('disabled', false);
                searchNextBtn.prop('disabled', false);
            } else {
                activeMatchIndex = -1;
                searchCounter.text('0/0');
                searchPrevBtn.prop('disabled', true);
                searchNextBtn.prop('disabled', true);
            }
        };

        const openSearch = () => {
            searchBar.slideDown(150, () => {
                searchInput.focus().select();
            });
            searchToggleBtn.addClass('active');
            const q = String(searchInput.val() || '');
            if (q) performSearch(q);
        };

        const closeSearch = () => {
            searchBar.slideUp(150);
            searchToggleBtn.removeClass('active');
            clearSearchHighlights();
            searchCounter.text('0/0');
            searchPrevBtn.prop('disabled', true);
            searchNextBtn.prop('disabled', true);
        };

        searchToggleBtn.on('click', (e: any) => {
            e.stopPropagation();
            if (searchBar.is(':visible')) {
                closeSearch();
            } else {
                openSearch();
            }
        });

        searchCloseBtn.on('click', () => {
            closeSearch();
        });

        searchInput.on('input', function (this: HTMLInputElement) {
            clearTimeout(searchDebounceTimer);
            const val = this.value;
            // Debounce 220ms: Độ trễ tối ưu cho phản hồi gõ bàn phím mượt mà
            searchDebounceTimer = setTimeout(() => {
                performSearch(val);
            }, 220);
        });

        const nextSearchMatch = () => {
            if (currentSearchMatches.length === 0) return;
            activeMatchIndex = (activeMatchIndex + 1) % currentSearchMatches.length;
            highlightCurrentMatch();
        };

        const prevSearchMatch = () => {
            if (currentSearchMatches.length === 0) return;
            activeMatchIndex = (activeMatchIndex - 1 + currentSearchMatches.length) % currentSearchMatches.length;
            highlightCurrentMatch();
        };

        searchNextBtn.on('click', nextSearchMatch);
        searchPrevBtn.on('click', prevSearchMatch);

        searchInput.on('keydown', (e: any) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (searchDebounceTimer) {
                    clearTimeout(searchDebounceTimer);
                    searchDebounceTimer = null;
                    performSearch(String(searchInput.val() || ''));
                } else if (e.shiftKey) {
                    prevSearchMatch();
                } else {
                    nextSearchMatch();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
            }
        });

        // Phím tắt Ctrl+F / Cmd+F: CHỈ kích hoạt khi con trỏ hoặc focus đang ở trong Kaiz chat window
        $(document).on('keydown.kaiz_search_shortcut', (e: any) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
                const chatWinEl = win[0] as HTMLDialogElement;
                if (!chatWinEl || !chatWinEl.open) return;

                // Tuyệt đối không cướp Ctrl+F của SillyTavern nếu người dùng không tương tác trong Kaiz
                const isInsideKaiz = $(e.target).closest('#kaiz-chat-window').length > 0;
                if (!isInsideKaiz) return;

                e.preventDefault();
                e.stopPropagation();
                if (!searchBar.is(':visible')) {
                    openSearch();
                } else {
                    searchInput.focus().select();
                }
            }
        });

        $(window).on('resize.kaiz_milestones', requestUpdateMilestones);

        // --- Drag Logic ---
        const ensureInBounds = (el: any) => {
            if (el[0].tagName === 'DIALOG' && !el[0].open) return null;
            if (el.hasClass('kaiz-hidden')) return null;
            const rect = el[0].getBoundingClientRect();
            const w = window.innerWidth;
            const h = window.innerHeight;

            let newLeft = rect.left;
            let newTop = rect.top;
            let updated = false;

            if (newLeft < 0) {
                newLeft = 0;
                updated = true;
            }
            if (newTop < 0) {
                newTop = 0;
                updated = true;
            }
            if (newLeft + rect.width > w) {
                newLeft = w - rect.width;
                updated = true;
            }
            if (newTop + rect.height > h) {
                newTop = h - rect.height;
                updated = true;
            }

            if (updated) {
                el.css({ right: 'auto', bottom: 'auto', left: newLeft + 'px', top: newTop + 'px' });
            }
            return { left: newLeft, top: newTop };
        };

        let isDraggingBtn = false;
        if (typeof ($.fn as any).draggable === 'function') {
            const makeDraggable = (el: any, storageKey: string, options: any = {}) => {
                const savedPos = localStorage.getItem(storageKey);
                if (savedPos) {
                    try {
                        const parsed = JSON.parse(savedPos);
                        el.css({ right: 'auto', bottom: 'auto', left: parsed.left + 'px', top: parsed.top + 'px' });
                    } catch {
                        // ignore error
                    }
                }

                el.draggable({
                    containment: 'window',
                    scroll: false,
                    distance: 5,
                    start: function () {
                        if (el.attr('id') === 'kaiz-floating-btn') {
                            isDraggingBtn = true;
                        }
                    },
                    ...options,
                    stop: function () {
                        if (el.attr('id') === 'kaiz-floating-btn') {
                            setTimeout(() => {
                                isDraggingBtn = false;
                            }, 100);
                        }
                        const pos = ensureInBounds($(this));
                        if (pos) localStorage.setItem(storageKey, JSON.stringify(pos));
                    },
                });
            };

            makeDraggable(btn, 'kaiz_btn_pos');
            setTimeout(() => {
                ensureInBounds(btn);
            }, 500);

            makeDraggable(win, 'kaiz_win_pos', {
                handle: '.kaiz-chat-header',
                cancel: 'input,textarea,button,select,option,i',
            });
        }

        let resizeTimeout: any;
        $(window)
            .off('resize.kaiz')
            .on('resize.kaiz', () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const btnPos = ensureInBounds(btn);
                    if (btnPos) localStorage.setItem('kaiz_btn_pos', JSON.stringify(btnPos));

                    if ((win[0] as HTMLDialogElement).open) {
                        const winPos = ensureInBounds(win);
                        if (winPos) localStorage.setItem('kaiz_win_pos', JSON.stringify(winPos));
                    }
                }, 100);
            });

        // --- Floating Window Resize Logic ---
        const resizer = $('#kaiz-window-resizer');

        const restoreSavedWinSize = () => {
            if (win.hasClass('kaiz-phone-mode') || win.hasClass('kaiz-browser-mode')) return;
            const savedSize = localStorage.getItem('kaiz_win_size');
            if (savedSize) {
                try {
                    const parsed = JSON.parse(savedSize);
                    if (parsed.width && parsed.height) {
                        const clampedW = Math.max(360, Math.min(parsed.width, window.innerWidth - 20));
                        const clampedH = Math.max(420, Math.min(parsed.height, window.innerHeight - 20));
                        win.css({ width: `${clampedW}px`, height: `${clampedH}px` });
                    }
                } catch {
                    // ignore
                }
            }
        };

        restoreSavedWinSize();

        let isResizingWin = false;
        resizer.on('mousedown', (e: any) => {
            if (win.hasClass('kaiz-phone-mode') || win.hasClass('kaiz-browser-mode')) return;
            e.preventDefault();
            e.stopPropagation();

            isResizingWin = true;
            resizer.addClass('resizing');
            $('body').css({ 'user-select': 'none', cursor: 'se-resize' });

            const rect = win[0].getBoundingClientRect();
            // Anchor left and top explicitly so resizing bottom-right expands outwards smoothly
            win.css({
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                right: 'auto',
                bottom: 'auto',
            });

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = rect.width;
            const startHeight = rect.height;

            $(document)
                .off('.kaiz_resizing')
                .on('mousemove.kaiz_resizing', (ev: any) => {
                    if (!isResizingWin) return;
                    const minWidth = 360;
                    const minHeight = 420;
                    const maxWidth = Math.max(minWidth, window.innerWidth - rect.left - 10);
                    const maxHeight = Math.max(minHeight, window.innerHeight - rect.top - 10);

                    const newWidth = Math.max(minWidth, Math.min(startWidth + (ev.clientX - startX), maxWidth));
                    const newHeight = Math.max(minHeight, Math.min(startHeight + (ev.clientY - startY), maxHeight));

                    win.css({ width: `${newWidth}px`, height: `${newHeight}px` });
                })
                .on('mouseup.kaiz_resizing', () => {
                    if (!isResizingWin) return;
                    isResizingWin = false;
                    resizer.removeClass('resizing');
                    $('body').css({ 'user-select': '', cursor: '' });
                    $(document).off('.kaiz_resizing');

                    const finalWidth = Math.round(win.outerWidth() || 550);
                    const finalHeight = Math.round(win.outerHeight() || 600);
                    localStorage.setItem('kaiz_win_size', JSON.stringify({ width: finalWidth, height: finalHeight }));

                    const pos = ensureInBounds(win);
                    if (pos) localStorage.setItem('kaiz_win_pos', JSON.stringify(pos));
                });
        });
        // ------------------

        // Sidebar elements
        const menuBtn = $('#kaiz-chat-menu-btn');
        const sidebar = $('#kaiz-chat-sidebar');
        const newChatBtn = $('#kaiz-new-chat-btn');
        const chatList = $('#kaiz-chat-list');

        let isSidebarOpen = false;

        // --- Workspace UI Logic ---
        const wsSelect = $('#kaiz-workspace-select');
        const wsSettingsBtn = $('#kaiz-workspace-settings-btn');
        const wsAddBtn = $('#kaiz-workspace-add-btn');

        stateManager.onWorkspacesListUpdated = (workspaces) => {
            wsSelect.empty();
            wsSelect.append('<option value="default">Default</option>');
            for (const ws of workspaces) {
                wsSelect.append(`<option value="${ws.id}">${escapeHtml(ws.name)}</option>`);
            }
            if (stateManager.currentWorkspaceId) {
                wsSelect.val(stateManager.currentWorkspaceId.toString());
            } else {
                wsSelect.val('default');
            }
        };

        stateManager.onWorkspaceSwitched = (ws) => {
            if (ws) {
                wsSelect.val(ws.id!.toString());
                wsSettingsBtn.show();
            } else {
                wsSelect.val('default');
                wsSettingsBtn.hide();
            }
        };

        wsSelect.on('change', () => {
            if (loop.isRunning) {
                wsSelect.val(stateManager.currentWorkspaceId ? stateManager.currentWorkspaceId.toString() : 'default');
                toastr.warning('Vui lòng đợi Agent chạy xong trước khi thao tác!', 'Kaiz Agent');
                return;
            }
            const val = wsSelect.val();
            if (val === 'default') {
                stateManager.switchWorkspace(null);
            } else {
                stateManager.switchWorkspace(parseInt(val as string, 10));
            }
        });

        wsAddBtn.on('click', async () => {
            if (loop.isRunning) {
                toastr.warning('Vui lòng đợi Agent chạy xong trước khi tạo Workspace!', 'Kaiz Agent');
                return;
            }
            const name = prompt('Nhập tên Workspace mới:');
            if (name && name.trim()) {
                await stateManager.createWorkspace(name.trim());
            }
        });

        wsSettingsBtn.on('click', () => {
            const ws = stateManager.currentWorkspace;
            if (!ws) return;
            $('#kaiz-ws-name').val(ws.name);
            $('#kaiz-ws-prompt').val(ws.systemPrompt || '');

            const delBtn = $('#kaiz-ws-delete-btn');
            if (ws.systemId) {
                delBtn.html('<i class="fa-solid fa-rotate-left"></i> Khôi phục mặc định');
                delBtn.css({ color: '#f39c12', borderColor: 'rgba(243, 156, 18, 0.3)' });
            } else {
                delBtn.html('<i class="fa-solid fa-trash"></i> Xóa Workspace');
                delBtn.css({ color: '#ff6b6b', borderColor: 'rgba(255, 107, 107, 0.3)' });
            }

            renderWsToolsUI(ws.toolsConfig || {});

            ($('#kaiz-workspace-settings-modal')[0] as HTMLDialogElement).showModal();
        });

        function renderWsToolsUI(toolsConfig: Record<string, boolean>) {
            const toolsList = $('#kaiz-ws-tools-list');
            toolsList.empty();

            const allSchemas = registry.getAllSchemas();

            // --- Chips (tools đang được bật) ---
            const chipsContainer = $(
                '<div style="display:flex; flex-wrap:wrap; gap:5px; min-height:28px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.07);"></div>',
            );

            // --- Ô search ---
            const searchInput = $(
                `<input type="text" class="text_pole" placeholder="Tìm tool theo tên hoặc mô tả..." style="width:100%; box-sizing:border-box; padding:5px; margin-bottom:5px;">`,
            );

            // --- Result list (luôn hiện, mặc định = tất cả) ---
            const resultList = $(
                `<div style="max-height:140px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:4px; background:rgba(0,0,0,0.2);"></div>`,
            );

            toolsList.append(chipsContainer, searchInput, resultList);
            toolsList.data('toolsConfig', toolsConfig);

            function refreshChips() {
                chipsContainer.empty();
                const enabled = allSchemas.filter((s) => toolsConfig[s.name] === true);
                if (enabled.length === 0) {
                    chipsContainer.append(
                        '<span style="color:#666; font-size:12px; line-height:28px;">Chưa có tool nào được thêm.</span>',
                    );
                    return;
                }
                enabled.forEach((schema) => {
                    const chip = $(`
                        <span class="kaiz-ws-tool-chip" data-tool="${escapeHtml(schema.name)}" style="
                            display:inline-flex; align-items:center; gap:4px; padding:3px 8px;
                            background:rgba(0,201,255,0.15); border:1px solid rgba(0,201,255,0.3);
                            border-radius:12px; font-size:12px; color:#00c9ff; cursor:default;
                        ">
                            ${escapeHtml(schema.name)}
                            <i class="fa-solid fa-xmark kaiz-ws-tool-remove" data-tool="${escapeHtml(schema.name)}" style="cursor:pointer; opacity:0.7;"></i>
                        </span>
                    `);
                    chipsContainer.append(chip);
                });
            }

            function refreshResults(query: string) {
                resultList.empty();
                const available = allSchemas.filter((s) => toolsConfig[s.name] !== true);
                const q = query.trim().toLowerCase();
                const matches = q
                    ? available.filter(
                          (s) =>
                              s.name.toLowerCase().includes(q) ||
                              (s.description && s.description.toLowerCase().includes(q)),
                      )
                    : available;

                if (matches.length === 0) {
                    resultList.append(
                        '<div style="padding:8px; color:#666; font-size:12px; text-align:center;">Không tìm thấy tool nào.</div>',
                    );
                    return;
                }
                matches.forEach((schema) => {
                    const item = $(`
                        <div class="kaiz-ws-tool-result" data-tool="${escapeHtml(schema.name)}" style="
                            padding:6px 10px; cursor:pointer; font-size:13px; color:#ddd;
                            border-bottom:1px solid rgba(255,255,255,0.04);
                        ">
                            <span style="color:#fff; font-weight:500;">${escapeHtml(schema.name)}</span>
                            ${schema.description ? `<span style="color:#777; font-size:11px; margin-left:6px;">${escapeHtml(schema.description.substring(0, 70))}${schema.description.length > 70 ? '...' : ''}</span>` : ''}
                        </div>
                    `);
                    item.on('mouseenter', function (this: any) {
                        $(this).css('background', 'rgba(255,255,255,0.07)');
                    });
                    item.on('mouseleave', function (this: any) {
                        $(this).css('background', '');
                    });
                    item.on('click', () => {
                        toolsConfig[schema.name] = true;
                        toolsList.data('toolsConfig', toolsConfig);
                        refreshChips();
                        // Giữ nguyên filter hiện tại, chỉ refresh results
                        refreshResults(String(searchInput.val() || ''));
                    });
                    resultList.append(item);
                });
            }

            // Chip remove — dùng event delegation trên chipsContainer
            chipsContainer.on('click', '.kaiz-ws-tool-remove', function (this: any) {
                const toolName = $(this).attr('data-tool');
                if (toolName) {
                    delete toolsConfig[toolName];
                    toolsList.data('toolsConfig', toolsConfig);
                    refreshChips();
                    refreshResults(String(searchInput.val() || ''));
                }
            });

            searchInput.on('input', function (this: any) {
                refreshResults(String($(this).val() || ''));
            });

            // Render lần đầu
            refreshChips();
            refreshResults('');
        }

        $('#kaiz-workspace-settings-close').on('click', () => {
            ($('#kaiz-workspace-settings-modal')[0] as HTMLDialogElement).close();
        });

        $('#kaiz-ws-save-btn').on('click', async () => {
            if (!stateManager.currentWorkspaceId) return;
            const newName = String($('#kaiz-ws-name').val() || '').trim();
            const newPrompt = String($('#kaiz-ws-prompt').val() || '');

            // Lấy toolsConfig từ data đã được cập nhật bởi renderWsToolsUI
            const toolsConfig: Record<string, boolean> = $('#kaiz-ws-tools-list').data('toolsConfig') || {};

            if (newName) {
                await stateManager.updateWorkspace(stateManager.currentWorkspaceId, {
                    name: newName,
                    systemPrompt: newPrompt,
                    toolsConfig: toolsConfig,
                });
            }
            ($('#kaiz-workspace-settings-modal')[0] as HTMLDialogElement).close();
        });

        $('#kaiz-ws-delete-btn').on('click', async () => {
            if (!stateManager.currentWorkspaceId) return;
            const ws = stateManager.currentWorkspace;
            if (!ws) return;
            const wsName = ws.name || 'này';

            if (ws.systemId) {
                if (
                    confirm(
                        `Khôi phục Workspace "${wsName}" về trạng thái mặc định gốc?\n\nTên, Prompt và Danh sách Tools sẽ bị reset. (Lịch sử chat VẪN ĐƯỢC GIỮ NGUYÊN).`,
                    )
                ) {
                    await stateManager.db.resetSystemWorkspace(stateManager.currentWorkspaceId);
                    const workspaces = await stateManager.db.getAllWorkspaces();
                    if (stateManager.onWorkspacesListUpdated) stateManager.onWorkspacesListUpdated(workspaces);
                    stateManager.currentWorkspace =
                        workspaces.find((w) => w.id === stateManager.currentWorkspaceId) || null;
                    if (stateManager.onWorkspaceSwitched)
                        stateManager.onWorkspaceSwitched(stateManager.currentWorkspace);
                    ($('#kaiz-workspace-settings-modal')[0] as HTMLDialogElement).close();
                }
            } else {
                if (
                    confirm(
                        `Xóa Workspace "${wsName}"?\n\nTất cả các đoạn chat bên trong cũng sẽ bị xóa vĩnh viễn và không thể khôi phục.`,
                    )
                ) {
                    await stateManager.deleteWorkspace(stateManager.currentWorkspaceId);
                    ($('#kaiz-workspace-settings-modal')[0] as HTMLDialogElement).close();
                }
            }
        });
        // --------------------------

        // Toggle cửa sổ
        btn.on('click', (e: any) => {
            if (isDraggingBtn) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const dialogEl = win[0] as HTMLDialogElement;
            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const isPhoneMode = !!extSettings.phoneMode;

            if (!dialogEl.open) {
                if (isPhoneMode) {
                    dialogEl.showModal();
                } else {
                    dialogEl.show();
                    setTimeout(() => {
                        const winPos = ensureInBounds(win);
                        if (winPos) localStorage.setItem('kaiz_win_pos', JSON.stringify(winPos));
                    }, 50);
                }
                // Refresh list khi mở
                stateManager.loadChatList().then(renderChatList);
                setTimeout(requestUpdateMilestones, 150);
            } else {
                dialogEl.close();
                toolsMenu.hide();
                toolsBtn.removeClass('active');
                closeSearch();
                if (isSidebarOpen) toggleSidebar();
            }
        });

        closeBtn.on('click', () => {
            const dialogEl = win[0] as HTMLDialogElement;
            dialogEl.close();
            toolsMenu.hide();
            toolsBtn.removeClass('active');
            closeSearch();
            if (isSidebarOpen) toggleSidebar(); // Đóng luôn sidebar
        });

        // --- Phone Mode Logic ---
        const applyPhoneMode = () => {
            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const isPhoneMode = !!extSettings.phoneMode;

            if (isPhoneMode) {
                win.addClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('disable');
                }
            } else {
                win.removeClass('kaiz-phone-mode');
                if (typeof ($.fn as any).draggable === 'function' && win.hasClass('ui-draggable')) {
                    win.draggable('enable');
                }
                restoreSavedWinSize();
            }
        };

        // Khởi tạo phone mode ban đầu
        setTimeout(applyPhoneMode, 200);
        // ------------------------------------

        // Toggle Sidebar
        function toggleSidebar() {
            isSidebarOpen = !isSidebarOpen;
            if (isSidebarOpen) {
                sidebar.css('display', 'flex');
            } else {
                sidebar.css('display', 'none');
            }
        }

        menuBtn.on('click', toggleSidebar);

        // New Chat
        newChatBtn.on('click', async () => {
            if (loop.isRunning) {
                toastr.warning('Vui lòng đợi Agent chạy xong trước khi tạo chat mới!', 'Kaiz Agent');
                return;
            }
            history.empty();
            // Đặt stateManager về null để tin nhắn đầu tiên sẽ tạo chat mới
            stateManager.currentChatId = null;
            addWelcomeMessage();
            closeSearch();
            requestUpdateMilestones();

            // Xóa background selected ở chat list
            $('.kaiz-chat-item').css('background', 'transparent');
            toggleSidebar();
        });

        // Cài đặt Event Delegation cho danh sách chat (chỉ gán 1 lần duy nhất)
        chatList.on('click', '.kaiz-chat-item', function (this: HTMLElement, e: any) {
            if ($(e.target).hasClass('kaiz-chat-delete') || $(e.target).hasClass('kaiz-chat-edit')) return; // Bỏ qua nếu click nút xóa hoặc sửa
            if (loop.isRunning) {
                toastr.warning('Vui lòng đợi Agent chạy xong trước khi chuyển chat!', 'Kaiz Agent');
                return;
            }
            const id = parseInt($(this).attr('data-id') || '0', 10);
            if (id) {
                stateManager.switchChat(id);
                toggleSidebar();
            }
        });

        chatList.on('click', '.kaiz-chat-delete', async function (this: HTMLElement, e: any) {
            e.stopPropagation();
            if (loop.isRunning) {
                toastr.warning('Vui lòng đợi Agent chạy xong trước khi xóa chat!', 'Kaiz Agent');
                return;
            }
            const id = parseInt($(this).attr('data-id') || '0', 10);
            if (id) {
                if (confirm('Delete this chat?')) {
                    await stateManager.deleteChat(id);
                }
            }
        });

        chatList.on('click', '.kaiz-chat-edit', async function (this: HTMLElement, e: any) {
            e.stopPropagation();
            const id = parseInt($(this).attr('data-id') || '0', 10);
            const currentName = $(this).attr('data-name') || '';
            if (id) {
                const newName = prompt('Enter new chat name:', currentName);
                if (newName !== null && newName.trim() !== '') {
                    await stateManager.updateChatName(id, newName.trim());
                }
            }
        });

        // Hàm render Chat List
        function renderChatList(chats: any[]) {
            chatList.empty();
            if (chats.length === 0) {
                chatList.append('<div style="color:#aaa; font-size:12px; text-align:center;">No chats found</div>');
                return;
            }

            let htmlBuffer = '';
            for (const chat of chats) {
                const isSelected = chat.id === stateManager.currentChatId;
                const bg = isSelected ? 'rgba(0, 201, 255, 0.2)' : 'transparent';

                htmlBuffer += `
                    <div class="kaiz-chat-item interactable" data-id="${chat.id}" style="padding:8px; border-radius:5px; background:${bg}; display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                        <span style="font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:120px;">${escapeHtml(chat.name)}</span>
                        <div>
                            <i class="fa-solid fa-pen kaiz-chat-edit" style="color:#f39c12; font-size:12px; margin-right:8px;" data-id="${chat.id}" data-name="${chat.name.replace(/"/g, '&quot;')}"></i>
                            <i class="fa-solid fa-trash kaiz-chat-delete" style="color:#e74c3c; font-size:12px;" data-id="${chat.id}"></i>
                        </div>
                    </div>
                `;
            }
            chatList.append(htmlBuffer);
        }

        // Hàm tiện ích phân tích và render Tool Calls thành HTML
        const parseToolCallsToHtml = (contentToParse: string, escapeText: boolean = false): string => {
            const toolCalls: string[] = [];
            let result = contentToParse.replace(
                /<tool_call name="([^"]+)">([\s\S]*?)<\/tool_call>/g,
                (match, name, content) => {
                    const cleanContent = content.trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const toolHtml = `<details class="kaiz-tool-call-block"><summary class="kaiz-tool-summary"><i class="fa-solid fa-bolt"></i> Tool Call: ${escapeHtml(name)}</summary><div class="kaiz-tool-content">${cleanContent}</div></details>`;
                    toolCalls.push(toolHtml);
                    return `__TOOL_CALL_${toolCalls.length - 1}__`;
                },
            );

            if (escapeText) {
                result = result.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
            }

            // KHÔNG escape < > ở đây, để dành cho marked.parse xử lý
            for (let i = 0; i < toolCalls.length; i++) {
                result = result.replace(`__TOOL_CALL_${i}__`, toolCalls[i]);
            }
            return result;
        };

        // Hàm render Mermaid (Lazy load)
        const renderMermaid = async () => {
            const mermaidBlocks = $('.kaiz-chat-history .language-mermaid');
            if (mermaidBlocks.length === 0) return;

            if (!(window as any).mermaid) {
                // Tải lười thư viện Mermaid từ CDN
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
                    script.onload = () => {
                        if ((window as any).mermaid) {
                            (window as any).mermaid.initialize({ startOnLoad: false, theme: 'dark' });
                        }
                        resolve();
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            mermaidBlocks.each(function (this: any) {
                const block = $(this);
                if (block.hasClass('mermaid-rendered')) return;

                const code = block.text();
                const id = 'mermaid-' + Date.now() + Math.floor(Math.random() * 1000);

                try {
                    if ((window as any).mermaid) {
                        (window as any).mermaid
                            .render(id, code)
                            .then((result: any) => {
                                const parentPre = block.parent('pre');
                                if (parentPre.length) {
                                    parentPre.replaceWith(
                                        `<div class="kaiz-mermaid-container" style="text-align:center; margin:10px 0; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; overflow-x:auto;">${result.svg}</div>`,
                                    );
                                }
                            })
                            .catch((e: any) => {
                                console.error('Mermaid render error', e);
                                block.addClass('mermaid-rendered');
                            });
                    }
                } catch (e) {
                    console.error('Mermaid error', e);
                    block.addClass('mermaid-rendered');
                }
            });
        };

        // Cấu hình marked để render break lines giống ST
        marked.setOptions({ breaks: true });

        // Hàm tiện ích format tin nhắn
        const formatMessage = (text: string, isFinal: boolean): string => {
            let html = text || '';

            const ctx = (window as any).SillyTavern?.getContext?.();
            const cotMode = ctx?.extensionSettings?.kaiz_agent?.cotDisplayMode || 'collapse_streaming';

            let closeTag = '';
            let closeIndex = html.indexOf('</agent_cot>');
            if (closeIndex !== -1) {
                closeTag = '</agent_cot>';
            } else {
                closeIndex = html.indexOf('</think>');
                if (closeIndex !== -1) {
                    closeTag = '</think>';
                } else {
                    closeIndex = html.indexOf('</thinking>');
                    if (closeIndex !== -1) {
                        closeTag = '</thinking>';
                    }
                }
            }

            if (closeIndex !== -1) {
                let cotContent = html.substring(0, closeIndex);
                cotContent = cotContent.replace(/<agent_cot>|<think>|<thinking>/gi, '').trim();
                cotContent = cotContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                let restContent = html.substring(closeIndex + closeTag.length).trim();

                restContent = parseToolCallsToHtml(restContent, !isFinal);

                const shouldOpen = cotMode === 'always_expanded';
                const detailsTag = `<details class="kaiz-cot-block"${shouldOpen ? ' open' : ''}>`;

                html = `${detailsTag}<summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Agent Thoughts</summary><div class="kaiz-cot-content">${cotContent}</div></details>`;
                if (restContent) {
                    const parsedMarkdown = isFinal ? marked.parse(restContent) : restContent;
                    html += `<div style="margin-top: 8px;" class="kaiz-markdown-body">${parsedMarkdown}</div>`;
                }
            } else if (!isFinal) {
                // Đang stream và chưa thấy thẻ đóng
                const shouldOpen = cotMode === 'auto_collapse' || cotMode === 'always_expanded';
                const detailsTag = `<details class="kaiz-cot-block"${shouldOpen ? ' open' : ''}>`;

                let cotContent = html.replace(/<agent_cot>|<think>|<thinking>/gi, '').trim();
                cotContent = cotContent.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                html = `${detailsTag}<summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Thinking...</summary><div class="kaiz-cot-content">${cotContent}</div></details>`;
            } else {
                // Message đã load xong không có thẻ đóng (lịch sử cũ hoặc LLM quên đóng thẻ)
                const parsedContent = parseToolCallsToHtml(html.trim(), false);
                html = `<div class="kaiz-markdown-body">${marked.parse(parsedContent)}</div>`;
            }

            return html;
        };

        // Hàm tiện ích format tin nhắn user (đặc biệt là Tool Result)
        const formatUserMessage = (text: string, attachments?: import('../core/db').ChatAttachment[]): string => {
            const safeText = text || '';

            const escapedText = escapeHtml(safeText).replace(/\n/g, '<br>');
            let finalHtml = escapedText;

            if (safeText.startsWith('[Tool Result')) {
                // ... logic Tool Result ...
                let color = '#a1a1aa'; // default
                let icon = 'fa-wrench';
                const firstLine = safeText.split('\n')[0];

                if (firstLine.includes('CÓ LỖI') || firstLine.includes('LỖI (ERROR)')) {
                    color = '#ef4444'; // red
                    icon = 'fa-circle-xmark';
                } else if (firstLine.includes('THÀNH CÔNG')) {
                    color = '#4ade80'; // green
                    icon = 'fa-circle-check';
                }

                finalHtml = `<details class="kaiz-system-result-block" style="border-left: 3px solid ${color};">
<summary class="kaiz-system-summary" style="color: ${color};"><i class="fa-solid ${icon}"></i> System: Tool Result</summary>
<div class="kaiz-system-content" style="font-family: monospace; white-space: pre-wrap; word-break: break-all;">${escapedText}</div>
</details>`;
            }

            if (attachments && attachments.length > 0) {
                let attachmentsHtml = '<div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">';
                for (const att of attachments) {
                    if (att.type === 'image') {
                        attachmentsHtml += `<img src="${att.data}" class="kaiz-msg-attachment-img" title="${escapeHtml(att.name)}" />`;
                    } else if (att.type === 'text') {
                        attachmentsHtml += `<div class="kaiz-msg-attachment-text"><i class="fa-solid fa-file-lines"></i> <b>${escapeHtml(att.name)}</b></div>`;
                    }
                }
                attachmentsHtml += '</div>';
                finalHtml += attachmentsHtml;
            }

            return finalHtml;
        };

        // Hàm tiện ích đếm token
        const refreshTokens = async () => {
            try {
                const counterSpan = $('#kaiz-chat-token-val');
                const counterContainer = $('#kaiz-chat-token-counter');

                if (!stateManager.currentChatId || stateManager.currentChatId === -1) {
                    counterContainer.hide();
                    return;
                }

                const msgs = await stateManager.db.getMessages(stateManager.currentChatId);
                const truncatedMsgs = await loop.applyTokenSafeLimit(msgs);
                let fullText = '';
                truncatedMsgs.forEach((m: any) => {
                    let content = m.content || '';
                    if (m.role === 'agent' || m.role === 'assistant') {
                        content = loop.stripCotAndPrefill(content) || '[Đã xử lý suy luận CoT]';
                    }
                    fullText += content + ' ';
                });

                if (!fullText.trim()) {
                    counterContainer.hide();
                    return;
                }

                let count = 0;
                if (typeof (window as any).getTokenCountAsync === 'function') {
                    count = await (window as any).getTokenCountAsync(fullText);
                } else if (typeof (window as any).getTokenCount === 'function') {
                    count = (window as any).getTokenCount(fullText);
                } else {
                    count = Math.ceil(fullText.split(/\s+/).length * 1.3);
                }

                const ctx = (window as any).SillyTavern.getContext();
                const settings = ctx.extensionSettings?.kaiz_agent || {};
                const maxLoops = settings.maxAgentLoops || 5;
                const baseTokens = await loop.getBaseTokens(maxLoops);
                count += baseTokens;

                counterSpan.text(count.toLocaleString());
                counterContainer.css('display', 'inline-block');
            } catch (e) {
                console.warn('Kaiz Agent: Failed to refresh tokens', e);
            }
        };

        // Lắng nghe StateManager
        stateManager.onChatsListUpdated = (chats) => {
            renderChatList(chats);
        };

        stateManager.onChatRenamed = (_id, _newName) => {
            // Do nothing
        };

        stateManager.onChatSwitched = (chatId, messages) => {
            history.empty();
            if (messages.length === 0 && chatId === -1) {
                addWelcomeMessage();
            } else if (messages.length === 0) {
                addWelcomeMessage();
            }

            // Dùng HTML buffer để tránh Reflow/Repaint liên tục
            let htmlBuffer = '';
            for (const msg of messages) {
                const formatted =
                    msg.role === 'agent'
                        ? formatMessage(msg.content, true)
                        : formatUserMessage(msg.content, msg.attachments);
                const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);

                const avatar =
                    msg.role === 'user'
                        ? '<i class="fa-solid fa-user"></i>'
                        : msg.role === 'agent'
                          ? '<i class="fa-solid fa-yin-yang"></i>'
                          : '<i class="fa-solid fa-gear"></i>';
                const extraClass = msg.role === 'user' ? 'kaiz-msg-user' : 'kaiz-msg-agent';
                const deleteBtnHtml = msg.id
                    ? `<button type="button" class="kaiz-msg-delete-btn" data-msg-id="${msg.id}" title="Xóa tin nhắn"><i class="fa-solid fa-trash-can"></i></button>`
                    : '';

                htmlBuffer += `
                    <div class="kaiz-msg ${extraClass}" id="container-${msgId}" data-msg-id="${msg.id || ''}">
                        <div class="kaiz-msg-avatar">${avatar}</div>
                        <div class="kaiz-msg-content" id="${msgId}">${formatted}</div>
                        ${deleteBtnHtml}
                    </div>
                `;
            }
            if (htmlBuffer) {
                history.append(htmlBuffer);
                history.scrollTop(history[0].scrollHeight);
            }
            updateContinueBtnVisibility();
            refreshTokens();
            requestUpdateMilestones();
            if (searchBar.is(':visible')) {
                const q = String(searchInput.val() || '');
                if (q) performSearch(q);
            }
        };

        const addWelcomeMessage = () => {
            const welcomeHtml = `
            <div class="kaiz-msg kaiz-msg-agent kaiz-msg-welcome">
                <div class="kaiz-msg-avatar"><i class="fa-solid fa-yin-yang"></i></div>
                <div class="kaiz-msg-content">Xin chào! Hãy ra lệnh cho tôi để thao tác với SillyTavern!</div>
            </div>`;
            history.append(welcomeHtml);
            updateContinueBtnVisibility();
            requestUpdateMilestones();
        };

        // Hàm tiện ích thêm tin nhắn DOM (không save DB)
        const addMessageToDOM = (
            role: 'user' | 'agent' | 'system',
            htmlContent: string,
            animate: boolean = true,
            dbMessageId?: number,
        ): string => {
            let avatar: string;
            let extraClass: string;
            if (role === 'user') {
                avatar = '<i class="fa-solid fa-user"></i>';
                extraClass = 'kaiz-msg-user';
            } else if (role === 'agent') {
                avatar = '<i class="fa-solid fa-yin-yang"></i>';
                extraClass = 'kaiz-msg-agent';
            } else {
                avatar = '<i class="fa-solid fa-gear"></i>';
                extraClass = 'kaiz-msg-agent';
            }

            const msgId = 'kaiz-msg-' + Date.now() + Math.floor(Math.random() * 1000);
            const deleteBtnHtml = dbMessageId
                ? `<button type="button" class="kaiz-msg-delete-btn" data-msg-id="${dbMessageId}" title="Xóa tin nhắn"><i class="fa-solid fa-trash-can"></i></button>`
                : `<button type="button" class="kaiz-msg-delete-btn" style="display:none;" title="Xóa tin nhắn"><i class="fa-solid fa-trash-can"></i></button>`;

            history.append(`
                <div class="kaiz-msg ${extraClass}" id="container-${msgId}" data-msg-id="${dbMessageId || ''}">
                    <div class="kaiz-msg-avatar">${avatar}</div>
                    <div class="kaiz-msg-content" id="${msgId}">${htmlContent}</div>
                    ${deleteBtnHtml}
                </div>
            `);
            if (animate) {
                history.scrollTop(history[0].scrollHeight);
            }
            updateContinueBtnVisibility();
            requestUpdateMilestones();
            if (searchBar.is(':visible')) {
                const q = String(searchInput.val() || '');
                if (q) performSearch(q);
            }
            return msgId;
        };

        // Lắng nghe sự kiện xóa tin nhắn
        history.on('click', '.kaiz-msg-delete-btn', async function (this: HTMLElement, e: any) {
            e.stopPropagation();
            const btn = $(this);
            const container = btn.closest('.kaiz-msg');
            const msgIdStr = btn.attr('data-msg-id') || container.attr('data-msg-id');
            const msgId = msgIdStr ? parseInt(msgIdStr, 10) : null;

            if (msgId && !isNaN(msgId)) {
                try {
                    await stateManager.deleteMessage(msgId);
                } catch (err) {
                    console.error('[KaizAgent] Failed to delete message from DB:', err);
                }
            }

            container.fadeOut(200, function () {
                container.remove();
                refreshTokens();
                updateContinueBtnVisibility();
                if (history.children('.kaiz-msg').length === 0) {
                    addWelcomeMessage();
                }
                requestUpdateMilestones();
                if (searchBar.is(':visible')) {
                    const q = String(searchInput.val() || '');
                    if (q) performSearch(q);
                }
            });

            toastr.info('Đã xóa tin nhắn', 'Kaiz Agent');
        });
        const startAgent = async (continueMode: boolean = false) => {
            sendBtn.find('i').removeClass('fa-paper-plane').addClass('fa-stop');
            sendBtn.prop('disabled', false); // Bật lại ngay để cho phép click Stop
            sendBtn.addClass('kaiz-stop-mode');
            updateContinueBtnVisibility();

            const ctx = (window as any).SillyTavern.getContext();
            const extSettings = ctx.extensionSettings['kaiz_agent'] || {};
            const maxLoops = extSettings.maxAgentLoops || 5;

            // Lấy toàn bộ lịch sử (hoặc tối đa N tin) từ DB để truyền cho AI
            const historyMsgs = stateManager.currentChatId
                ? await stateManager.db.getMessages(stateManager.currentChatId)
                : [];

            let agentMsgId = '';
            let agentContentBox: any = null;
            let currentStepResponse = '';

            let streamUpdatePending = false;
            let lastStreamEvent: any = null;

            const flushStreamUpdate = () => {
                if (!lastStreamEvent || !agentContentBox) {
                    streamUpdatePending = false;
                    return;
                }
                const event = lastStreamEvent;
                // event.text already includes the old text from loop.ts if continueMode && step === 1
                const fullText = event.text || '';
                let htmlToRender = fullText ? formatMessage(fullText, false) : '';
                if (event.reasoning && !event.text) {
                    const ctx = (window as any).SillyTavern?.getContext?.();
                    const cotMode = ctx?.extensionSettings?.kaiz_agent?.cotDisplayMode || 'collapse_streaming';
                    const shouldOpen = cotMode === 'auto_collapse' || cotMode === 'always_expanded';
                    const escapedReasoning = event.reasoning.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                    htmlToRender += `<details class="kaiz-cot-block"${shouldOpen ? ' open' : ''}><summary class="kaiz-cot-summary"><i class="fa-solid fa-brain"></i> Thinking...</summary><div class="kaiz-cot-content">${escapedReasoning}</div></details>`;
                }
                if (!htmlToRender) {
                    htmlToRender = `<div class="kaiz-spinner" style="font-size:12px;"><i class="fa-solid fa-circle-notch"></i> Generating...</div>`;
                }
                agentContentBox.html(htmlToRender);
                lastStreamEvent = null;

                // Giải phóng khóa sau khi browser render xong frame này
                requestAnimationFrame(() => {
                    streamUpdatePending = false;
                });
            };

            await loop.run(
                historyMsgs,
                maxLoops,
                async (event) => {
                    const btnIcon = $('#kaiz-floating-btn i');
                    const btnFloat = $('#kaiz-floating-btn');

                    if (event.type === 'step_start') {
                        btnIcon.addClass('kaiz-icon-spin');
                        btnFloat.removeClass('kaiz-btn-blink');
                        if (event.data?.isContinue) {
                            const agentMsgs = history.find('.kaiz-msg-agent .kaiz-msg-content');
                            agentContentBox = agentMsgs.last();
                            currentStepResponse =
                                historyMsgs.length > 0 ? historyMsgs[historyMsgs.length - 1].content : '';
                        } else {
                            agentMsgId = addMessageToDOM(
                                'agent',
                                '<div class="kaiz-spinner"><i class="fa-solid fa-circle-notch"></i> Processing...</div>',
                            );
                            agentContentBox = $(`#${agentMsgId}`);
                            currentStepResponse = '';
                        }
                    } else if (event.type === 'stream_chunk') {
                        if (!agentContentBox) return;
                        lastStreamEvent = event;
                        if (!streamUpdatePending) {
                            streamUpdatePending = true;
                            requestAnimationFrame(flushStreamUpdate);
                        }
                    } else if (event.type === 'step_end') {
                        lastStreamEvent = null;
                        streamUpdatePending = false;
                        if (!agentContentBox) return;
                        agentContentBox.html(formatMessage(event.text || '', true));
                        // Gọi render biểu đồ Mermaid
                        renderMermaid();

                        currentStepResponse = event.text || '';
                        if (event.data?.isContinue) {
                            const lastMsg = historyMsgs[historyMsgs.length - 1];
                            if (lastMsg && lastMsg.id) {
                                await stateManager.updateMessage(lastMsg.id, currentStepResponse);
                            }
                        } else {
                            const newAgentMsgId = await stateManager.addMessage('agent', currentStepResponse);
                            if (agentMsgId) {
                                const container = $(`#container-${agentMsgId}`);
                                container.attr('data-msg-id', newAgentMsgId);
                                container.find('.kaiz-msg-delete-btn').attr('data-msg-id', newAgentMsgId).show();
                            }
                        }
                        refreshTokens();
                        agentContentBox = null;
                        requestUpdateMilestones();
                    } else if (event.type === 'tool_result') {
                        const toolMsgId = await stateManager.addMessage('user', event.text || '');
                        const formatted = formatUserMessage(event.text || '');
                        addMessageToDOM('user', formatted, true, toolMsgId);
                        refreshTokens();
                    } else if (event.type === 'tool_confirm') {
                        btnIcon.removeClass('kaiz-icon-spin');
                        btnFloat.addClass('kaiz-btn-blink');

                        const call = event.data.call;
                        const resolveFn = event.data.resolve;

                        const confirmId = Date.now() + Math.floor(Math.random() * 1000);
                        const html = `
                        <div class="kaiz-safe-mode-pending" style="border-left: 3px solid #f39c12; padding: 10px; background: rgba(243,156,18,0.1); border-radius: 5px;">
                            <div style="color: #f39c12; font-weight: bold; margin-bottom: 5px;"><i class="fa-solid fa-triangle-exclamation"></i> Safe Mode Warning</div>
                            <div style="font-size: 13px;">Agent muốn tự động chạy công cụ: <b style="color:#fff;">${escapeHtml(call.name)}</b> nhưng công cụ này nằm trong Blacklist. Bạn có cho phép không?</div>
                            <div style="display: flex; gap: 10px; margin-top: 10px;">
                                <button id="kaiz-allow-${confirmId}" style="background: #2ecc71; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-check"></i> Allow</button>
                                <button id="kaiz-deny-${confirmId}" style="background: #e74c3c; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-xmark"></i> Deny</button>
                            </div>
                        </div>
                    `;

                        const domId = addMessageToDOM('agent', html);

                        $(`#kaiz-allow-${confirmId}`).on('click', () => {
                            if (!loop.isRunning) return;
                            $(`#${domId}`).find('.kaiz-safe-mode-pending').removeClass('kaiz-safe-mode-pending');
                            $(`#${domId}`).html(
                                `<div style="color: #2ecc71; font-style: italic;"><i class="fa-solid fa-check"></i> Đã cho phép chạy công cụ: ${escapeHtml(call.name)}</div>`,
                            );
                            btnIcon.addClass('kaiz-icon-spin');
                            btnFloat.removeClass('kaiz-btn-blink');
                            resolveFn(true);
                        });

                        $(`#kaiz-deny-${confirmId}`).on('click', () => {
                            if (!loop.isRunning) return;
                            $(`#${domId}`).find('.kaiz-safe-mode-pending').removeClass('kaiz-safe-mode-pending');
                            $(`#${domId}`).html(
                                `<div style="color: #e74c3c; font-style: italic;"><i class="fa-solid fa-xmark"></i> Đã từ chối công cụ: ${escapeHtml(call.name)}</div>`,
                            );
                            btnIcon.removeClass('kaiz-icon-spin');
                            btnFloat.removeClass('kaiz-btn-blink');
                            resolveFn(false);
                        });
                    } else if (event.type === 'retry') {
                        lastStreamEvent = null;
                        streamUpdatePending = false;
                        if (agentContentBox) {
                            agentContentBox.append(
                                `<div class="kaiz-spinner" style="color: #f39c12; font-style: italic; margin-top: 10px;"><i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(event.text || '')}</div>`,
                            );
                        } else {
                            agentMsgId = addMessageToDOM(
                                'agent',
                                `<div class="kaiz-spinner" style="color: #f39c12; font-style: italic;"><i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(event.text || '')}</div>`,
                            );
                            agentContentBox = $(`#${agentMsgId}`);
                        }
                    } else if (event.type === 'error') {
                        lastStreamEvent = null;
                        streamUpdatePending = false;

                        let errDomId: string | null = null;
                        if (agentContentBox) {
                            agentContentBox.append(
                                `<div style="margin-top: 10px; color:#e74c3c; border-left: 3px solid #e74c3c; padding: 10px; background: rgba(231,76,60,0.1); border-radius: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(event.text || '')}</div>`,
                            );
                            agentContentBox = null;
                        } else {
                            errDomId = addMessageToDOM(
                                'agent',
                                `<div style="color:#e74c3c; border-left: 3px solid #e74c3c; padding: 10px; background: rgba(231,76,60,0.1); border-radius: 4px;"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(event.text || '')}</div>`,
                            );
                        }
                        const errMsgId = await stateManager.addMessage('agent', `[Error] ${event.text}`);
                        if (errDomId) {
                            const container = $(`#container-${errDomId}`);
                            container.attr('data-msg-id', errMsgId);
                            container.find('.kaiz-msg-delete-btn').attr('data-msg-id', errMsgId).show();
                        } else if (agentMsgId) {
                            const container = $(`#container-${agentMsgId}`);
                            container.attr('data-msg-id', errMsgId);
                            container.find('.kaiz-msg-delete-btn').attr('data-msg-id', errMsgId).show();
                        }
                    } else if (event.type === 'debug') {
                        ChatWindowUI.lastLogSent = JSON.stringify(event.data.messages, null, 2);
                        ChatWindowUI.lastLogRecv = event.data.responseText;
                    }
                },
                continueMode,
            );

            // Dọn dẹp tất cả các hộp thoại safe mode bị treo (do abort hoặc lỗi)
            $('.kaiz-safe-mode-pending').each(function (this: any) {
                $(this).html(
                    `<div style="color: #95a5a6; font-style: italic;"><i class="fa-solid fa-ban"></i> Đã hủy xác nhận công cụ (Tiến trình bị ngắt).</div>`,
                );
                $(this).removeClass('kaiz-safe-mode-pending');
            });

            $('#kaiz-floating-btn i').removeClass('kaiz-icon-spin');
            $('#kaiz-floating-btn').removeClass('kaiz-btn-blink');

            if (!sendBtn.hasClass('kaiz-force-aborted')) {
                sendBtn.find('i').removeClass('fa-stop').addClass('fa-paper-plane');
            }
            sendBtn.removeClass('kaiz-stop-mode');
            sendBtn.prop('disabled', false);
            input.focus();
            updateContinueBtnVisibility();
            requestUpdateMilestones();
        };

        // --- XỬ LÝ KÉO THẢ CO GIÃN CHIỀU CAO THANH INPUT ---
        const inputResizer = $('#kaiz-input-resizer');
        const chatBodyWrapper = $('#kaiz-chat-body-wrapper');
        const DEFAULT_INPUT_HEIGHT = 44;
        const savedInputHeight = localStorage.getItem('kaiz_chat_input_height');
        if (savedInputHeight) {
            const h = parseInt(savedInputHeight, 10);
            if (!isNaN(h) && h >= DEFAULT_INPUT_HEIGHT) {
                input.css({ height: `${h}px`, maxHeight: 'none' });
            }
        }

        let isResizingInput = false;
        let startY = 0;
        let startHeight = 0;

        const onResizeMove = (clientY: number) => {
            if (!isResizingInput) return;
            const deltaY = startY - clientY; // Kéo lên trên -> tăng chiều cao
            let newHeight = startHeight + deltaY;
            const minHeight = DEFAULT_INPUT_HEIGHT;
            const maxHeight = Math.max(200, (chatBodyWrapper.height() || 500) * 0.7);

            if (newHeight < minHeight) newHeight = minHeight;
            if (newHeight > maxHeight) newHeight = maxHeight;

            input.css({ height: `${newHeight}px`, maxHeight: 'none' });
        };

        const onResizeEnd = () => {
            if (!isResizingInput) return;
            isResizingInput = false;
            inputResizer.removeClass('resizing');
            $(document).off('.kaizInputResize');
            const currentH = input.height();
            if (currentH && currentH >= DEFAULT_INPUT_HEIGHT) {
                localStorage.setItem('kaiz_chat_input_height', Math.round(currentH).toString());
            }
            requestUpdateMilestones();
        };

        inputResizer.on('mousedown', (e: any) => {
            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) return;
            e.preventDefault();
            isResizingInput = true;
            startY = e.clientY;
            startHeight = input.height() || DEFAULT_INPUT_HEIGHT;
            inputResizer.addClass('resizing');

            $(document).on('mousemove.kaizInputResize', (moveEvent: any) => {
                onResizeMove(moveEvent.clientY);
            });
            $(document).on('mouseup.kaizInputResize', () => {
                onResizeEnd();
            });
        });

        inputResizer.on('touchstart', (e: any) => {
            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) return;
            if (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches.length > 0) {
                isResizingInput = true;
                startY = e.originalEvent.touches[0].clientY;
                startHeight = input.height() || DEFAULT_INPUT_HEIGHT;
                inputResizer.addClass('resizing');

                $(document).on('touchmove.kaizInputResize', (moveEvent: any) => {
                    if (moveEvent.originalEvent && moveEvent.originalEvent.touches) {
                        onResizeMove(moveEvent.originalEvent.touches[0].clientY);
                    }
                });
                $(document).on('touchend.kaizInputResize touchcancel.kaizInputResize', () => {
                    onResizeEnd();
                });
            }
        });

        // Nhấp đúp vào thanh resizer để reset chiều cao về mặc định
        inputResizer.on('dblclick', () => {
            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) return;
            localStorage.removeItem('kaiz_chat_input_height');
            input.css({ height: `${DEFAULT_INPUT_HEIGHT}px`, maxHeight: '140px' });
            toastr.info('Đã khôi phục kích thước khung input về mặc định', 'Kaiz Agent');
        });

        // --- XỬ LÝ CHẾ ĐỘ MỞ FULL THANH INPUT (FULLSCREEN) ---
        const fullscreenBtn = $('#kaiz-input-fullscreen-btn');
        const exitFullscreenBtn = $('#kaiz-input-exit-fullscreen-btn');
        const fullscreenHeader = $('#kaiz-input-fullscreen-header');
        const charCounter = $('#kaiz-input-char-counter');

        let preFullscreenHeight: string | null = null;

        const updateCharCount = () => {
            const val = String(input.val() || '');
            charCounter.text(`${val.length.toLocaleString()} ký tự`);
        };

        const enterFullscreen = () => {
            preFullscreenHeight = input[0]?.style.height || '';
            chatBodyWrapper.addClass('kaiz-input-fullscreen');
            fullscreenHeader.show();
            fullscreenBtn.find('i').removeClass('fa-expand').addClass('fa-compress');
            fullscreenBtn.attr('title', 'Thu nhỏ (Thoát Fullscreen)');
            updateCharCount();
            input.focus();
        };

        const exitFullscreen = () => {
            chatBodyWrapper.removeClass('kaiz-input-fullscreen');
            fullscreenHeader.hide();
            fullscreenBtn.find('i').removeClass('fa-compress').addClass('fa-expand');
            fullscreenBtn.attr('title', 'Phóng to khung soạn thảo (Fullscreen)');

            if (preFullscreenHeight !== null) {
                if (preFullscreenHeight) {
                    input.css({ height: preFullscreenHeight, maxHeight: 'none' });
                } else {
                    input.css({ height: `${DEFAULT_INPUT_HEIGHT}px`, maxHeight: '140px' });
                }
            } else {
                const savedH = localStorage.getItem('kaiz_chat_input_height');
                if (savedH) {
                    const h = parseInt(savedH, 10);
                    if (!isNaN(h) && h >= DEFAULT_INPUT_HEIGHT) {
                        input.css({ height: `${h}px`, maxHeight: 'none' });
                    } else {
                        input.css({ height: `${DEFAULT_INPUT_HEIGHT}px`, maxHeight: '140px' });
                    }
                } else {
                    input.css({ height: `${DEFAULT_INPUT_HEIGHT}px`, maxHeight: '140px' });
                }
            }
            preFullscreenHeight = null;
            input.focus();
        };

        fullscreenBtn.on('click', () => {
            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) {
                exitFullscreen();
            } else {
                enterFullscreen();
            }
        });

        exitFullscreenBtn.on('click', () => {
            exitFullscreen();
        });

        input.on('input', () => {
            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) {
                updateCharCount();
            }
        });

        // Xử lý gửi tin nhắn UI
        const sendMessage = async () => {
            if (sendBtn.prop('disabled')) return;
            const text = String(input.val()).trim();
            const attachmentsToSend = [...ChatWindowUI.currentAttachments];

            if (!text && attachmentsToSend.length === 0) return;

            if (chatBodyWrapper.hasClass('kaiz-input-fullscreen')) {
                exitFullscreen();
            }

            sendBtn.prop('disabled', true);
            input.val('');
            ChatWindowUI.currentAttachments = [];
            renderAttachmentsPreview();

            // Lưu vào DB trước
            const userMsgId = await stateManager.addMessage('user', text, attachmentsToSend);
            refreshTokens();
            // In ra UI
            const formattedUI = formatUserMessage(text, attachmentsToSend);
            addMessageToDOM('user', formattedUI, true, userMsgId);

            // Title updates are removed

            startAgent(false);
        };

        continueBtn.on('click', async () => {
            if (loop.isRunning) return;
            const historyMsgs = stateManager.currentChatId
                ? await stateManager.db.getMessages(stateManager.currentChatId)
                : [];
            if (historyMsgs.length === 0 || historyMsgs[historyMsgs.length - 1].role !== 'agent') {
                toastr.warning('Tin nhắn cuối cùng không phải của Agent!', 'Kaiz Agent');
                return;
            }
            startAgent(true);
        });

        let forceAbortTimer: any = null;

        sendBtn.on('mousedown touchstart', (e: any) => {
            if (!sendBtn.hasClass('kaiz-stop-mode')) return;
            e.preventDefault();

            // Nhấn ngắn → gọi abort thường (chờ bước hiện tại xong)
            // Giữ 1s → force abort (dừng ngay lập tức)
            forceAbortTimer = setTimeout(() => {
                forceAbortTimer = null;
                sendBtn.addClass('kaiz-force-aborted');
                loop.forceAbort();
                // UI feedback
                sendBtn.find('i').removeClass('fa-stop fa-paper-plane').addClass('fa-skull');
                setTimeout(() => {
                    sendBtn.find('i').removeClass('fa-skull').addClass('fa-paper-plane');
                    sendBtn.removeClass('kaiz-force-aborted');
                }, 1500);
            }, 1000);
        });

        sendBtn.on('mouseup mouseleave touchend touchcancel', () => {
            if (forceAbortTimer) {
                clearTimeout(forceAbortTimer);
                forceAbortTimer = null;
                // Nhả sớm → abort thường
                if (sendBtn.hasClass('kaiz-stop-mode')) {
                    loop.abort();
                }
            }
        });

        sendBtn.on('click', () => {
            if (sendBtn.hasClass('kaiz-stop-mode')) {
                // Không làm gì thêm, mousedown/mouseup đã xử lý
                return;
            }
            sendMessage();
        });
        input.on('keydown', (e: any) => {
            if (e.key === 'Escape' && chatBodyWrapper.hasClass('kaiz-input-fullscreen')) {
                e.preventDefault();
                exitFullscreen();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                // Trong phone mode hoặc fullscreen, Enter dùng để xuống dòng
                if (
                    $('#kaiz-chat-window').hasClass('kaiz-phone-mode') ||
                    chatBodyWrapper.hasClass('kaiz-input-fullscreen')
                ) {
                    return;
                }
                e.preventDefault();
                sendMessage();
            }
        });
    }
}
