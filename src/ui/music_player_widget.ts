/**
 * Floating Music Player Widget
 * Giao diện Mini Player mang phong cách Hi-Fi cổ điển (Classic Matte Charcoal & Amber Accent).
 * Thiết kế dịu mắt, trực quan, thân thiện, tôn trọng công năng và loại bỏ hoàn toàn AI/Neon slop.
 * Đồng bộ hai chiều với AudioManager: Play/Pause, Seek, Volume, Repeat, Shuffle, Favorite & Queue/Playlist Drawer.
 */

import { AudioManager, AudioState } from '../core/music/audio_manager';
import { DEFAULT_MUSIC_COVER } from '../core/music/music_engine';

declare const toastr: any;

export class MusicPlayerWidget {
    private static instance: MusicPlayerWidget;
    private container: HTMLElement | null = null;
    private isMinimized: boolean = false;
    private isDrawerOpen: boolean = false;
    private activeDrawerTab: 'queue' | 'playlists' = 'queue';
    private audioManager: AudioManager;
    private justDragged: boolean = false;

    private readonly WIDGET_ID = 'kaiz-music-player-widget';
    private readonly STYLE_ID = 'kaiz-music-player-style';

    private constructor() {
        this.audioManager = AudioManager.getInstance();
    }

    public static getInstance(): MusicPlayerWidget {
        if (!MusicPlayerWidget.instance) {
            MusicPlayerWidget.instance = new MusicPlayerWidget();
        }
        return MusicPlayerWidget.instance;
    }

    /**
     * Khởi tạo và gắn widget vào DOM
     */
    public init(): void {
        if (document.getElementById(this.WIDGET_ID)) return;

        this.injectStyles();
        this.createWidgetDOM();
        this.bindEvents();
        this.subscribeAudioEvents();
    }

    private injectStyles(): void {
        if (document.getElementById(this.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = `
            /* Reset box-sizing toàn bộ widget để tránh lệch tâm giao diện */
            #${this.WIDGET_ID},
            #${this.WIDGET_ID} *,
            #${this.WIDGET_ID} *::before,
            #${this.WIDGET_ID} *::after {
                box-sizing: border-box;
            }

            /* Container chính: Phong cách Classic Hi-Fi Charcoal */
            #${this.WIDGET_ID} {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99998;
                width: 380px;
                background: #181a20;
                border: 1px solid rgba(255, 255, 255, 0.09);
                border-radius: 16px;
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04);
                color: #e2e8f0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                user-select: none;
                transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, width 0.25s ease, height 0.25s ease;
                display: none;
                flex-direction: column;
                overflow: hidden;
            }

            #${this.WIDGET_ID}.is-active {
                display: flex;
            }

            /* Chế độ thu gọn thành Đĩa than Mini (Pill Mode) */
            #${this.WIDGET_ID}.is-minimized {
                width: 56px;
                height: 56px;
                border-radius: 28px;
                padding: 0;
                cursor: grab;
                border: 1px solid rgba(245, 158, 11, 0.4);
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
            }

            #${this.WIDGET_ID}.is-minimized:active {
                cursor: grabbing;
            }

            #${this.WIDGET_ID}.is-minimized .kaiz-mp-main-card,
            #${this.WIDGET_ID}.is-minimized .kaiz-mp-drawer {
                display: none !important;
            }

            #${this.WIDGET_ID}.is-minimized .kaiz-mp-pill-card {
                display: flex;
                width: 100%;
                height: 100%;
                align-items: center;
                justify-content: center;
                background: #181a20;
                border-radius: 28px;
                cursor: grab;
                position: relative;
            }

            #${this.WIDGET_ID}.is-minimized .kaiz-mp-pill-card:active {
                cursor: grabbing;
            }

            .kaiz-mp-pill-card {
                display: none;
                position: relative;
                width: 100%;
                height: 100%;
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
            }

            .kaiz-mp-pill-cover {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid #d97706;
                display: block;
                flex-shrink: 0;
                margin: 0;
                transform-origin: center center;
                user-select: none;
                -webkit-user-select: none;
                -webkit-user-drag: none;
                pointer-events: none; /* Tránh hoàn toàn việc kéo thả bị bắt nhầm vào ảnh */
                animation: kaiz-vinyl-rotate 16s linear infinite;
                animation-play-state: paused;
                will-change: transform;
            }

            /* Trục tâm của đĩa than thu gọn (Spindle Hole) */
            .kaiz-mp-pill-spindle {
                position: absolute;
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #14161b;
                border: 1.5px solid #f59e0b;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 2;
                box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
            }

            .kaiz-mp-main-card {
                padding: 14px 16px 12px;
                display: flex;
                flex-direction: column;
                gap: 11px;
            }

            /* Header: Thanh tiêu đề & Kéo thả */
            .kaiz-mp-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: grab;
                padding-bottom: 2px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .kaiz-mp-header:active {
                cursor: grabbing;
            }

            .kaiz-mp-brand {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11.5px;
                font-weight: 600;
                letter-spacing: 0.04em;
                color: #94a3b8;
                text-transform: uppercase;
            }

            .kaiz-mp-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #64748b;
                transition: background 0.3s ease;
            }

            .kaiz-mp-status-dot.is-playing {
                background: #f59e0b;
                box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
            }

            .kaiz-mp-actions {
                display: flex;
                align-items: center;
                gap: 2px;
            }

            .kaiz-mp-header-btn {
                background: transparent;
                border: none;
                color: #64748b;
                cursor: pointer;
                width: 24px;
                height: 24px;
                padding: 0;
                border-radius: 6px;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }

            .kaiz-mp-header-btn svg {
                display: block;
                transition: transform 0.15s ease, stroke 0.15s ease;
            }

            .kaiz-mp-header-btn:hover {
                color: #e2e8f0;
                background: rgba(255, 255, 255, 0.08);
            }

            .kaiz-mp-header-btn:active {
                transform: scale(0.92);
            }

            .kaiz-mp-header-btn.btn-close {
                position: relative;
            }

            .kaiz-mp-close-ring {
                position: absolute;
                inset: 0;
                width: 24px;
                height: 24px;
                transform: rotate(-90deg);
                pointer-events: none;
                display: none;
            }

            .kaiz-mp-header-btn.btn-close:hover .kaiz-mp-close-ring,
            .kaiz-mp-header-btn.btn-close.is-holding .kaiz-mp-close-ring {
                display: block;
            }

            .kaiz-mp-ring-fill {
                stroke-dasharray: 56.55;
                stroke-dashoffset: 56.55;
                transition: stroke-dashoffset 0.15s ease-out;
            }

            .kaiz-mp-header-btn.btn-close.is-holding .kaiz-mp-ring-fill {
                stroke-dashoffset: 0;
                transition: stroke-dashoffset 1.2s linear;
            }

            .kaiz-mp-header-btn.btn-close.is-holding {
                background: rgba(239, 68, 68, 0.22);
                color: #f87171;
                transform: scale(0.95);
            }

            .kaiz-mp-header-btn.btn-close.is-shake {
                animation: kaiz-btn-shake 0.3s ease;
            }

            @keyframes kaiz-btn-shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-3px); }
                50% { transform: translateX(3px); }
                75% { transform: translateX(-2px); }
            }

            .kaiz-mp-header-btn.btn-close:hover {
                color: #f87171;
                background: rgba(239, 68, 68, 0.14);
            }

            /* Body: Đĩa than & Thông tin bài hát */
            .kaiz-mp-body {
                display: flex;
                align-items: center;
                gap: 14px;
            }

            .kaiz-mp-cover-wrap {
                position: relative;
                width: 58px;
                height: 58px;
                flex-shrink: 0;
            }

            .kaiz-mp-cover {
                width: 58px;
                height: 58px;
                border-radius: 50%;
                object-fit: cover;
                border: 2px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
                display: block;
                flex-shrink: 0;
                transform-origin: center center;
                user-select: none;
                -webkit-user-select: none;
                -webkit-user-drag: none;
                pointer-events: none;
                animation: kaiz-vinyl-rotate 16s linear infinite;
                animation-play-state: paused;
                will-change: transform;
            }

            .kaiz-mp-cover-groove {
                position: absolute;
                inset: 0;
                border-radius: 50%;
                box-shadow: inset 0 0 0 3px rgba(0,0,0,0.5), inset 0 0 0 8px rgba(255,255,255,0.04);
                pointer-events: none;
            }

            .kaiz-mp-cover-groove::after {
                content: '';
                position: absolute;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #14161b;
                border: 1.5px solid #f59e0b;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
            }

            .kaiz-mp-cover.is-spinning,
            .kaiz-mp-pill-cover.is-spinning {
                animation-play-state: running;
            }

            @keyframes kaiz-vinyl-rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .kaiz-mp-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
                flex: 1;
            }

            .kaiz-mp-title-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }

            .kaiz-mp-title {
                font-size: 13.5px;
                font-weight: 600;
                color: #f1f5f9;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                letter-spacing: -0.01em;
            }

            .kaiz-mp-source-tag {
                font-size: 9.5px;
                font-weight: 600;
                padding: 1px 5px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.08);
                color: #94a3b8;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                flex-shrink: 0;
            }

            .kaiz-mp-singer {
                font-size: 12px;
                color: #94a3b8;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .kaiz-mp-lyric {
                font-size: 11.5px;
                color: #d1d5db;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-style: italic;
                opacity: 0.85;
                margin-top: 2px;
            }

            /* Progress Bar */
            .kaiz-mp-progress-container {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .kaiz-mp-progress-bar {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                cursor: pointer;
                position: relative;
                overflow: hidden;
            }

            .kaiz-mp-progress-fill {
                height: 100%;
                width: 0%;
                background: #f59e0b;
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            .kaiz-mp-time-row {
                display: flex;
                justify-content: space-between;
                font-size: 10.5px;
                color: #64748b;
                font-variant-numeric: tabular-nums;
            }

            /* Thanh điều khiển: Cổ điển, Đầy đủ & Cân bằng */
            .kaiz-mp-controls-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
                padding-top: 2px;
            }

            .kaiz-mp-btn-group {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .kaiz-mp-btn {
                background: transparent;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                width: 30px;
                height: 30px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                position: relative;
            }

            .kaiz-mp-btn:hover {
                color: #f1f5f9;
                background: rgba(255, 255, 255, 0.06);
            }

            .kaiz-mp-btn:active {
                transform: scale(0.95);
            }

            .kaiz-mp-btn.is-active {
                color: #f59e0b;
            }

            .kaiz-mp-btn.btn-fav.is-favorite {
                color: #e11d48;
            }

            .kaiz-mp-btn-badge {
                position: absolute;
                top: 3px;
                right: 3px;
                font-size: 8px;
                font-weight: 700;
                background: #f59e0b;
                color: #181a20;
                border-radius: 50%;
                width: 11px;
                height: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                line-height: 1;
            }

            .kaiz-mp-play-btn {
                background: #23262f;
                border: 1px solid rgba(255, 255, 255, 0.12);
                color: #f8fafc;
                cursor: pointer;
                width: 36px;
                height: 36px;
                border-radius: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
            }

            .kaiz-mp-play-btn:hover {
                background: #2a2d37;
                border-color: rgba(245, 158, 11, 0.4);
                color: #f59e0b;
            }

            .kaiz-mp-play-btn:active {
                transform: scale(0.94);
            }

            /* Volume slider */
            .kaiz-mp-vol-wrap {
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .kaiz-mp-vol-slider {
                width: 52px;
                height: 4px;
                -webkit-appearance: none;
                appearance: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                outline: none;
                cursor: pointer;
            }

            .kaiz-mp-vol-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: #f59e0b;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
                cursor: pointer;
            }

            /* Queue / Playlist Drawer (Bung danh sách mượt mà) */
            .kaiz-mp-drawer {
                display: none;
                flex-direction: column;
                border-top: 1px solid rgba(255, 255, 255, 0.07);
                background: #14151b;
                border-radius: 0 0 16px 16px;
                overflow: hidden;
                transition: max-height 0.25s ease;
                max-height: 230px;
            }

            .kaiz-mp-drawer.is-open {
                display: flex;
            }

            .kaiz-mp-drawer-tabs {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 14px;
                background: rgba(0, 0, 0, 0.25);
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            .kaiz-mp-tab-group {
                display: flex;
                gap: 6px;
            }

            .kaiz-mp-tab-btn {
                background: transparent;
                border: none;
                color: #64748b;
                font-size: 11.5px;
                font-weight: 600;
                cursor: pointer;
                padding: 3px 8px;
                border-radius: 5px;
                transition: all 0.15s ease;
            }

            .kaiz-mp-tab-btn:hover {
                color: #94a3b8;
            }

            .kaiz-mp-tab-btn.is-active {
                color: #f1f5f9;
                background: rgba(255, 255, 255, 0.08);
            }

            .kaiz-mp-drawer-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .kaiz-mp-drawer-text-btn {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #94a3b8;
                font-size: 10.5px;
                padding: 2px 7px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.15s ease;
            }

            .kaiz-mp-drawer-text-btn:hover {
                color: #f59e0b;
                border-color: rgba(245, 158, 11, 0.3);
            }

            .kaiz-mp-drawer-list {
                display: flex;
                flex-direction: column;
                overflow-y: auto;
                max-height: 180px;
                padding: 4px 6px;
                gap: 2px;
            }

            .kaiz-mp-drawer-list::-webkit-scrollbar {
                width: 4px;
            }

            .kaiz-mp-drawer-list::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 2px;
            }

            .kaiz-mp-list-item {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 8px;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.15s ease;
                gap: 8px;
            }

            .kaiz-mp-list-item:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            .kaiz-mp-list-item.is-current {
                background: rgba(245, 158, 11, 0.12);
            }

            .kaiz-mp-item-left {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
                flex: 1;
            }

            .kaiz-mp-item-index {
                font-size: 10px;
                color: #64748b;
                width: 14px;
                text-align: right;
                font-variant-numeric: tabular-nums;
            }

            .kaiz-mp-list-item.is-current .kaiz-mp-item-index {
                color: #f59e0b;
                font-weight: 700;
            }

            .kaiz-mp-item-details {
                display: flex;
                flex-direction: column;
                min-width: 0;
            }

            .kaiz-mp-item-name {
                font-size: 12px;
                color: #f1f5f9;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .kaiz-mp-list-item.is-current .kaiz-mp-item-name {
                color: #f59e0b;
                font-weight: 600;
            }

            .kaiz-mp-item-sub {
                font-size: 10.5px;
                color: #94a3b8;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .kaiz-mp-item-del-btn {
                background: transparent;
                border: none;
                color: #64748b;
                cursor: pointer;
                padding: 2px 5px;
                font-size: 11px;
                border-radius: 4px;
                opacity: 0.6;
                transition: all 0.15s ease;
            }

            .kaiz-mp-item-del-btn:hover {
                color: #f87171;
                opacity: 1;
                background: rgba(239, 68, 68, 0.1);
            }

            .kaiz-mp-empty-drawer {
                padding: 20px 10px;
                text-align: center;
                color: #64748b;
                font-size: 11.5px;
            }

            /* Tối ưu hóa giao diện cho Mobile & Màn hình hẹp */
            @media (max-width: 440px) {
                #${this.WIDGET_ID} {
                    width: calc(100vw - 20px) !important;
                    right: 10px !important;
                    bottom: 16px !important;
                }
                #${this.WIDGET_ID}.is-minimized {
                    width: 56px !important;
                    height: 56px !important;
                    right: 16px !important;
                    bottom: 16px !important;
                }
                .kaiz-mp-title {
                    font-size: 13px !important;
                }
                .kaiz-mp-btn {
                    width: 32px !important;
                    height: 32px !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    private createWidgetDOM(): void {
        const div = document.createElement('div');
        div.id = this.WIDGET_ID;

        div.innerHTML = `
            <!-- Pill Mode khi thu gọn: hỗ trợ vừa click mở rộng vừa kéo thả di chuyển -->
            <div class="kaiz-mp-pill-card" id="kaiz-mp-pill" title="Mở rộng hoặc kéo di chuyển trình phát nhạc">
                <img src="${DEFAULT_MUSIC_COVER}" class="kaiz-mp-pill-cover" id="kaiz-mp-pill-cover" alt="cover" draggable="false">
                <div class="kaiz-mp-pill-spindle"></div>
            </div>

            <!-- Main Full Card -->
            <div class="kaiz-mp-main-card">
                <!-- Header -->
                <div class="kaiz-mp-header" id="kaiz-mp-drag-header">
                    <div class="kaiz-mp-brand">
                        <span class="kaiz-mp-status-dot" id="kaiz-mp-status-dot"></span>
                        <span>Kaiz Hi-Fi</span>
                    </div>
                    <div class="kaiz-mp-actions">
                        <button class="kaiz-mp-header-btn" id="kaiz-mp-btn-minimize" title="Thu gọn thành đĩa than mini">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button class="kaiz-mp-header-btn" id="kaiz-mp-btn-hide" title="Ẩn giao diện (nhạc vẫn tiếp tục phát)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                        <button class="kaiz-mp-header-btn btn-close" id="kaiz-mp-btn-close" title="Nhấn giữ 1.2s để tắt nhạc và xóa hàng đợi">
                            <svg class="kaiz-mp-close-ring" width="24" height="24" viewBox="0 0 24 24">
                                <circle class="kaiz-mp-ring-bg" cx="12" cy="12" r="9" fill="none" stroke="rgba(255, 255, 255, 0.12)" stroke-width="2"/>
                                <circle class="kaiz-mp-ring-fill" cx="12" cy="12" r="9" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round"
                                    stroke-dasharray="56.55" stroke-dashoffset="56.55"/>
                            </svg>
                            <svg class="kaiz-mp-close-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Body: Vinyl & Info -->
                <div class="kaiz-mp-body">
                    <div class="kaiz-mp-cover-wrap">
                        <img src="${DEFAULT_MUSIC_COVER}" class="kaiz-mp-cover" id="kaiz-mp-cover" alt="album cover" draggable="false">
                        <div class="kaiz-mp-cover-groove"></div>
                    </div>
                    <div class="kaiz-mp-info">
                        <div class="kaiz-mp-title-row">
                            <span class="kaiz-mp-title" id="kaiz-mp-title">Chưa có bài hát</span>
                            <span class="kaiz-mp-source-tag" id="kaiz-mp-source">STREAM</span>
                        </div>
                        <span class="kaiz-mp-singer" id="kaiz-mp-singer">Kaiz Music</span>
                        <div class="kaiz-mp-lyric" id="kaiz-mp-lyric">♪ Sẵn sàng phát nhạc</div>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="kaiz-mp-progress-container">
                    <div class="kaiz-mp-progress-bar" id="kaiz-mp-progress-bar">
                        <div class="kaiz-mp-progress-fill" id="kaiz-mp-progress-fill"></div>
                    </div>
                    <div class="kaiz-mp-time-row">
                        <span id="kaiz-mp-time-cur">0:00</span>
                        <span id="kaiz-mp-time-dur">0:00</span>
                    </div>
                </div>

                <!-- Controls Row: Đầy đủ Shuffle, Prev, Play, Next, Repeat, Favorite, Drawer, Volume -->
                <div class="kaiz-mp-controls-row">
                    <!-- Nhóm điều hướng -->
                    <div class="kaiz-mp-btn-group">
                        <button class="kaiz-mp-btn" id="kaiz-mp-btn-shuffle" title="Bật/Tắt phát ngẫu nhiên">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                            </svg>
                        </button>
                        <button class="kaiz-mp-btn" id="kaiz-mp-btn-prev" title="Bài trước">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                        </button>
                        <button class="kaiz-mp-play-btn" id="kaiz-mp-btn-play" title="Phát / Tạm dừng">
                            <svg id="kaiz-mp-icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            <svg id="kaiz-mp-icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        </button>
                        <button class="kaiz-mp-btn" id="kaiz-mp-btn-next" title="Bài kế tiếp">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                        </button>
                        <button class="kaiz-mp-btn" id="kaiz-mp-btn-repeat" title="Chế độ lặp lại: Lặp danh sách / Lặp 1 bài / Tắt lặp">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
                            </svg>
                            <span class="kaiz-mp-btn-badge" id="kaiz-mp-repeat-badge" style="display:none;">1</span>
                        </button>
                    </div>

                    <!-- Nhóm tiện ích: Favorite, Drawer, Volume -->
                    <div class="kaiz-mp-btn-group">
                        <button class="kaiz-mp-btn btn-fav" id="kaiz-mp-btn-fav" title="Yêu thích bài hát này">
                            <svg id="kaiz-mp-icon-heart" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                        </button>
                        <button class="kaiz-mp-btn" id="kaiz-mp-btn-drawer" title="Danh sách hàng đợi & Playlist">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
                            </svg>
                        </button>
                        <div class="kaiz-mp-vol-wrap">
                            <input type="range" min="0" max="1" step="0.01" value="0.8" class="kaiz-mp-vol-slider" id="kaiz-mp-vol-slider" title="Âm lượng">
                        </div>
                    </div>
                </div>
            </div>

            <!-- Queue & Playlist Drawer -->
            <div class="kaiz-mp-drawer" id="kaiz-mp-drawer">
                <div class="kaiz-mp-drawer-tabs">
                    <div class="kaiz-mp-tab-group">
                        <button class="kaiz-mp-tab-btn is-active" id="kaiz-mp-tab-queue">Hàng đợi (<span id="kaiz-mp-queue-count">0</span>)</button>
                        <button class="kaiz-mp-tab-btn" id="kaiz-mp-tab-playlists">Playlists</button>
                    </div>
                    <div class="kaiz-mp-drawer-actions">
                        <button class="kaiz-mp-drawer-text-btn" id="kaiz-mp-drawer-action-btn">Lưu Playlist</button>
                    </div>
                </div>
                <div class="kaiz-mp-drawer-list" id="kaiz-mp-drawer-list">
                    <!-- Danh sách bài hát / playlists sẽ được render ở đây -->
                </div>
            </div>
        `;

        document.body.appendChild(div);
        this.container = div;
    }

    private formatTime(seconds: number): string {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    private bindEvents(): void {
        if (!this.container) return;

        // Click Pill để phóng to (bỏ qua nếu vừa thực hiện kéo thả)
        const pill = this.container.querySelector('#kaiz-mp-pill');
        if (pill) {
            pill.addEventListener('click', (e) => {
                if (this.justDragged) {
                    this.justDragged = false;
                    e.stopPropagation();
                    return;
                }
                this.toggleMinimize(false);
            });
        }

        // Thu gọn thành đĩa than mini
        const minBtn = this.container.querySelector('#kaiz-mp-btn-minimize');
        if (minBtn) {
            minBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleMinimize(true);
            });
        }

        // Ẩn giao diện tạm thời (nhạc vẫn tiếp tục phát)
        const hideBtn = this.container.querySelector('#kaiz-mp-btn-hide');
        if (hideBtn) {
            hideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide();
            });
        }

        // Nút Đóng: Bấm giữ 1.2s để shutdown hoàn toàn & clear queue (tránh bấm nhầm khi đang nghe nhạc)
        const closeBtn = this.container.querySelector('#kaiz-mp-btn-close') as HTMLElement | null;
        if (closeBtn) {
            let holdTimer: number | null = null;
            let isHoldComplete = false;
            let holdStartTime = 0;

            const startHold = (e: Event) => {
                if ((e as MouseEvent).button !== undefined && (e as MouseEvent).button !== 0) return;
                e.stopPropagation();
                isHoldComplete = false;
                holdStartTime = Date.now();
                closeBtn.classList.add('is-holding');

                holdTimer = window.setTimeout(() => {
                    isHoldComplete = true;
                    closeBtn.classList.remove('is-holding');
                    this.shutdownAndClear();
                }, 1200);
            };

            const cancelHold = () => {
                if (holdTimer !== null) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }
                const elapsed = Date.now() - holdStartTime;
                closeBtn.classList.remove('is-holding');

                // Nếu người dùng chỉ click nhanh (< 350ms) thay vì nhấn giữ
                if (!isHoldComplete && elapsed < 350 && elapsed > 20) {
                    closeBtn.classList.add('is-shake');
                    setTimeout(() => closeBtn.classList.remove('is-shake'), 400);

                    // Hiển thị gợi ý thân thiện
                    if (typeof toastr !== 'undefined') {
                        toastr.info('Nhấn giữ nút ✕ (1.2 giây) để tắt nhạc hoàn toàn và xóa hàng đợi.', 'Kaiz Hi-Fi');
                    }
                }
                isHoldComplete = false;
            };

            closeBtn.addEventListener('mousedown', startHold);
            closeBtn.addEventListener('touchstart', startHold, { passive: true });

            closeBtn.addEventListener('mouseup', cancelHold);
            closeBtn.addEventListener('mouseleave', cancelHold);
            closeBtn.addEventListener('touchend', cancelHold);
            closeBtn.addEventListener('touchcancel', cancelHold);

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
        }

        // Play / Pause
        const playBtn = this.container.querySelector('#kaiz-mp-btn-play');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.audioManager.togglePlay();
            });
        }

        // Prev & Next
        const prevBtn = this.container.querySelector('#kaiz-mp-btn-prev');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.audioManager.playPrev();
            });
        }

        const nextBtn = this.container.querySelector('#kaiz-mp-btn-next');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.audioManager.playNext();
            });
        }

        // Shuffle Toggle
        const shuffleBtn = this.container.querySelector('#kaiz-mp-btn-shuffle');
        if (shuffleBtn) {
            shuffleBtn.addEventListener('click', () => {
                this.audioManager.toggleShuffleMode();
            });
        }

        // Repeat Toggle
        const repeatBtn = this.container.querySelector('#kaiz-mp-btn-repeat');
        if (repeatBtn) {
            repeatBtn.addEventListener('click', () => {
                this.audioManager.toggleRepeatMode();
            });
        }

        // Favorite Toggle
        const favBtn = this.container.querySelector('#kaiz-mp-btn-fav');
        if (favBtn) {
            favBtn.addEventListener('click', () => {
                const current = this.audioManager.getState().currentSong;
                if (current) {
                    this.audioManager.toggleFavorite(current);
                }
            });
        }

        // Drawer Toggle
        const drawerBtn = this.container.querySelector('#kaiz-mp-btn-drawer');
        if (drawerBtn) {
            drawerBtn.addEventListener('click', () => {
                this.toggleDrawer();
            });
        }

        // Drawer Tabs
        const tabQueue = this.container.querySelector('#kaiz-mp-tab-queue');
        const tabPlaylists = this.container.querySelector('#kaiz-mp-tab-playlists');
        if (tabQueue && tabPlaylists) {
            tabQueue.addEventListener('click', () => {
                this.activeDrawerTab = 'queue';
                tabQueue.classList.add('is-active');
                tabPlaylists.classList.remove('is-active');
                this.updateDrawerContent();
            });

            tabPlaylists.addEventListener('click', () => {
                this.activeDrawerTab = 'playlists';
                tabPlaylists.classList.add('is-active');
                tabQueue.classList.remove('is-active');
                this.updateDrawerContent();
            });
        }

        // Drawer Action Button ("Lưu Playlist" hoặc "Tạo mới")
        const drawerActionBtn = this.container.querySelector('#kaiz-mp-drawer-action-btn');
        if (drawerActionBtn) {
            drawerActionBtn.addEventListener('click', () => {
                if (this.activeDrawerTab === 'queue') {
                    const plName = prompt('Nhập tên danh sách phát để lưu hàng đợi hiện tại:');
                    if (plName && plName.trim()) {
                        this.audioManager.saveQueueAsPlaylist(plName.trim());
                        this.activeDrawerTab = 'playlists';
                        if (tabPlaylists && tabQueue) {
                            tabPlaylists.classList.add('is-active');
                            tabQueue.classList.remove('is-active');
                        }
                        this.updateDrawerContent();
                    }
                } else {
                    const plName = prompt('Nhập tên danh sách phát mới:');
                    if (plName && plName.trim()) {
                        this.audioManager.createPlaylist(plName.trim());
                        this.updateDrawerContent();
                    }
                }
            });
        }

        // Tua nhạc trên progress bar
        const progBar = this.container.querySelector('#kaiz-mp-progress-bar') as HTMLElement;
        if (progBar) {
            progBar.addEventListener('click', (e: MouseEvent) => {
                const rect = progBar.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
                this.audioManager.seekPercent(pct);
            });
        }

        // Điều chỉnh âm lượng
        const volSlider = this.container.querySelector('#kaiz-mp-vol-slider') as HTMLInputElement | null;
        if (volSlider) {
            volSlider.addEventListener('input', () => {
                const val = parseFloat(volSlider.value);
                this.audioManager.setVolume(val);
            });
        }

        // Kéo thả di chuyển Widget
        this.setupDragging();
    }

    private setupDragging(): void {
        const header = this.container?.querySelector('#kaiz-mp-drag-header') as HTMLElement | null;
        const pill = this.container?.querySelector('#kaiz-mp-pill') as HTMLElement | null;
        if (!this.container) return;

        // Ngăn chặn hoàn toàn sự kiện native drag của trình duyệt trên toàn bộ widget
        this.container.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });

        let isDragging = false;
        let hasMoved = false;
        let startX = 0;
        let startY = 0;
        let origRight = 24;
        let origBottom = 24;
        let activeHandle: HTMLElement | null = null;

        const onMouseDown = (e: MouseEvent, handle: HTMLElement) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            if (e.button !== 0) return; // Chỉ nhận chuột trái

            isDragging = true;
            hasMoved = false;
            activeHandle = handle;
            startX = e.clientX;
            startY = e.clientY;

            const rect = this.container!.getBoundingClientRect();
            origRight = window.innerWidth - rect.right;
            origBottom = window.innerHeight - rect.bottom;
            handle.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onTouchStart = (e: TouchEvent, handle: HTMLElement) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON') return;
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];

            isDragging = true;
            hasMoved = false;
            activeHandle = handle;
            startX = touch.clientX;
            startY = touch.clientY;

            const rect = this.container!.getBoundingClientRect();
            origRight = window.innerWidth - rect.right;
            origBottom = window.innerHeight - rect.bottom;
            handle.style.cursor = 'grabbing';
        };

        if (header) {
            header.addEventListener('mousedown', (e) => onMouseDown(e, header));
            header.addEventListener('touchstart', (e) => onTouchStart(e, header), { passive: true });
        }

        if (pill) {
            pill.addEventListener('mousedown', (e) => onMouseDown(e, pill));
            pill.addEventListener('touchstart', (e) => onTouchStart(e, pill), { passive: true });
        }

        const handleMove = (clientX: number, clientY: number, preventScrollFn?: () => void) => {
            if (!isDragging || !this.container) return;

            const deltaX = clientX - startX;
            const deltaY = clientY - startY;

            if (!hasMoved) {
                if (Math.hypot(deltaX, deltaY) > 5) {
                    hasMoved = true;
                    this.justDragged = true;
                } else {
                    return;
                }
            }

            if (preventScrollFn) preventScrollFn();

            const w = this.container.offsetWidth || 56;
            const h = this.container.offsetHeight || 56;
            const maxRight = Math.max(10, window.innerWidth - w - 10);
            const maxBottom = Math.max(10, window.innerHeight - h - 10);

            const newRight = Math.max(10, Math.min(maxRight, origRight - deltaX));
            const newBottom = Math.max(10, Math.min(maxBottom, origBottom - deltaY));

            this.container.style.right = `${newRight}px`;
            this.container.style.bottom = `${newBottom}px`;
        };

        document.addEventListener('mousemove', (e: MouseEvent) => {
            handleMove(e.clientX, e.clientY);
        });

        document.addEventListener(
            'touchmove',
            (e: TouchEvent) => {
                if (e.touches.length !== 1) return;
                handleMove(e.touches[0].clientX, e.touches[0].clientY, () => {
                    if (e.cancelable) e.preventDefault();
                });
            },
            { passive: false },
        );

        const handleDragEnd = () => {
            if (isDragging) {
                isDragging = false;
                if (activeHandle) {
                    activeHandle.style.cursor = 'grab';
                    activeHandle = null;
                }
                if (hasMoved) {
                    this.justDragged = true;
                    setTimeout(() => {
                        this.justDragged = false;
                    }, 150);
                }
            }
        };

        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('touchcancel', handleDragEnd);

        // Tự động giữ widget nằm trong vùng nhìn thấy khi xoay màn hình hoặc co giãn cửa sổ
        window.addEventListener('resize', () => {
            if (!this.container) return;
            const w = this.container.offsetWidth || 56;
            const h = this.container.offsetHeight || 56;
            const currentRight = parseFloat(this.container.style.right || '24');
            const currentBottom = parseFloat(this.container.style.bottom || '24');

            const maxRight = Math.max(10, window.innerWidth - w - 10);
            const maxBottom = Math.max(10, window.innerHeight - h - 10);

            if (currentRight > maxRight) {
                this.container.style.right = `${maxRight}px`;
            }
            if (currentBottom > maxBottom) {
                this.container.style.bottom = `${maxBottom}px`;
            }
        });
    }

    private subscribeAudioEvents(): void {
        // Đồng bộ trạng thái bài hát
        this.audioManager.onStateChange((state: AudioState) => {
            if (!this.container) return;

            if (state.currentSong) {
                this.show();
                const titleEl = this.container.querySelector('#kaiz-mp-title');
                const singerEl = this.container.querySelector('#kaiz-mp-singer');
                const sourceEl = this.container.querySelector('#kaiz-mp-source');
                const coverEl = this.container.querySelector('#kaiz-mp-cover') as HTMLImageElement | null;
                const pillCoverEl = this.container.querySelector('#kaiz-mp-pill-cover') as HTMLImageElement | null;
                const lyricEl = this.container.querySelector('#kaiz-mp-lyric');
                const dotEl = this.container.querySelector('#kaiz-mp-status-dot');

                if (titleEl) titleEl.textContent = state.currentSong.name;
                if (singerEl) singerEl.textContent = state.currentSong.singer;
                if (sourceEl) sourceEl.textContent = state.currentSong.source.toUpperCase();

                const coverSrc = state.currentSong.cover || DEFAULT_MUSIC_COVER;
                if (coverEl) {
                    coverEl.src = coverSrc;
                    if (state.isPlaying) {
                        coverEl.classList.add('is-spinning');
                    } else {
                        coverEl.classList.remove('is-spinning');
                    }
                }
                if (pillCoverEl) {
                    pillCoverEl.src = coverSrc;
                    if (state.isPlaying) {
                        pillCoverEl.classList.add('is-spinning');
                    } else {
                        pillCoverEl.classList.remove('is-spinning');
                    }
                }
                if (lyricEl) lyricEl.textContent = state.currentLyric || '♪ Sẵn sàng phát nhạc';

                if (dotEl) {
                    if (state.isPlaying) {
                        dotEl.classList.add('is-playing');
                    } else {
                        dotEl.classList.remove('is-playing');
                    }
                }

                // Play / Pause Icon
                const playIcon = this.container.querySelector('#kaiz-mp-icon-play') as HTMLElement;
                const pauseIcon = this.container.querySelector('#kaiz-mp-icon-pause') as HTMLElement;
                if (playIcon && pauseIcon) {
                    playIcon.style.display = state.isPlaying ? 'none' : 'block';
                    pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
                }

                // Volume slider
                const volSlider = this.container.querySelector('#kaiz-mp-vol-slider') as HTMLInputElement | null;
                if (volSlider && document.activeElement !== volSlider) {
                    volSlider.value = String(state.volume);
                }

                // Favorite Button
                const favBtn = this.container.querySelector('#kaiz-mp-btn-fav');
                const isFav = this.audioManager.isFavorite(state.currentSong.id);
                if (favBtn) {
                    if (isFav) {
                        favBtn.classList.add('is-favorite');
                    } else {
                        favBtn.classList.remove('is-favorite');
                    }
                }

                // Repeat Mode Button
                const repeatBtn = this.container.querySelector('#kaiz-mp-btn-repeat');
                const repeatBadge = this.container.querySelector('#kaiz-mp-repeat-badge') as HTMLElement | null;
                if (repeatBtn && repeatBadge) {
                    if (state.repeatMode === 'one') {
                        repeatBtn.classList.add('is-active');
                        repeatBadge.style.display = 'flex';
                    } else if (state.repeatMode === 'all') {
                        repeatBtn.classList.add('is-active');
                        repeatBadge.style.display = 'none';
                    } else {
                        repeatBtn.classList.remove('is-active');
                        repeatBadge.style.display = 'none';
                    }
                }

                // Shuffle Mode Button
                const shuffleBtn = this.container.querySelector('#kaiz-mp-btn-shuffle');
                if (shuffleBtn) {
                    if (state.shuffleMode) {
                        shuffleBtn.classList.add('is-active');
                    } else {
                        shuffleBtn.classList.remove('is-active');
                    }
                }

                // Queue Count in Drawer Tab
                const queueCountEl = this.container.querySelector('#kaiz-mp-queue-count');
                if (queueCountEl) {
                    queueCountEl.textContent = String(state.queue.length);
                }

                if (this.isDrawerOpen) {
                    this.updateDrawerContent();
                }
            } else {
                this.hide();
            }
        });

        // Đồng bộ tiến độ thời gian & Lyric (Tối ưu hóa DOM cache & bỏ qua khi thu gọn)
        let cachedFill: HTMLElement | null = null;
        let cachedCurTime: HTMLElement | null = null;
        let cachedDurTime: HTMLElement | null = null;
        let cachedLyric: HTMLElement | null = null;

        this.audioManager.onTimeUpdate((curTime: number, duration: number, lyric: string) => {
            if (!this.container || !this.isVisible() || this.isMinimized) return;

            if (!cachedFill) cachedFill = this.container.querySelector('#kaiz-mp-progress-fill');
            if (!cachedCurTime) cachedCurTime = this.container.querySelector('#kaiz-mp-time-cur');
            if (!cachedDurTime) cachedDurTime = this.container.querySelector('#kaiz-mp-time-dur');
            if (!cachedLyric) cachedLyric = this.container.querySelector('#kaiz-mp-lyric');

            const pct = duration > 0 ? (curTime / duration) * 100 : 0;
            if (cachedFill) cachedFill.style.width = `${pct}%`;
            if (cachedCurTime) cachedCurTime.textContent = this.formatTime(curTime);
            if (cachedDurTime) cachedDurTime.textContent = this.formatTime(duration);
            if (cachedLyric && lyric && cachedLyric.textContent !== lyric) {
                cachedLyric.textContent = lyric;
            }
        });
    }

    public toggleDrawer(open?: boolean): void {
        this.isDrawerOpen = open !== undefined ? open : !this.isDrawerOpen;
        const drawer = this.container?.querySelector('#kaiz-mp-drawer');
        const drawerBtn = this.container?.querySelector('#kaiz-mp-btn-drawer');

        if (drawer) {
            if (this.isDrawerOpen) {
                drawer.classList.add('is-open');
                drawerBtn?.classList.add('is-active');
                this.updateDrawerContent();
            } else {
                drawer.classList.remove('is-open');
                drawerBtn?.classList.remove('is-active');
            }
        }
    }

    private updateDrawerContent(): void {
        if (!this.container) return;
        const listEl = this.container.querySelector('#kaiz-mp-drawer-list');
        const actionBtn = this.container.querySelector('#kaiz-mp-drawer-action-btn');
        if (!listEl) return;

        const state = this.audioManager.getState();

        if (this.activeDrawerTab === 'queue') {
            if (actionBtn) actionBtn.textContent = 'Lưu Playlist';

            if (state.queue.length === 0) {
                listEl.innerHTML = `<div class="kaiz-mp-empty-drawer">Hàng đợi đang trống.</div>`;
                return;
            }

            listEl.innerHTML = '';
            state.queue.forEach((song, idx) => {
                const isCurrent = state.currentSong?.id === song.id;
                const item = document.createElement('div');
                item.className = `kaiz-mp-list-item ${isCurrent ? 'is-current' : ''}`;

                item.innerHTML = `
                    <div class="kaiz-mp-item-left">
                        <span class="kaiz-mp-item-index">${idx + 1}</span>
                        <div class="kaiz-mp-item-details">
                            <span class="kaiz-mp-item-name">${song.name}</span>
                            <span class="kaiz-mp-item-sub">${song.singer} · ${song.source.toUpperCase()}</span>
                        </div>
                    </div>
                    <button class="kaiz-mp-item-del-btn" title="Xóa khỏi hàng đợi">✕</button>
                `;

                // Click bài hát để phát
                item.querySelector('.kaiz-mp-item-left')?.addEventListener('click', () => {
                    this.audioManager.playSong(song);
                });

                // Click nút xóa
                item.querySelector('.kaiz-mp-item-del-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.audioManager.removeFromQueue(song.id);
                });

                listEl.appendChild(item);
            });
        } else {
            // Tab Playlists
            if (actionBtn) actionBtn.textContent = '+ Tạo mới';

            const playlists = this.audioManager.getPlaylists();
            if (playlists.length === 0) {
                listEl.innerHTML = `<div class="kaiz-mp-empty-drawer">Chưa có playlist nào được lưu.</div>`;
                return;
            }

            listEl.innerHTML = '';
            playlists.forEach((pl, idx) => {
                const item = document.createElement('div');
                item.className = 'kaiz-mp-list-item';

                item.innerHTML = `
                    <div class="kaiz-mp-item-left">
                        <span class="kaiz-mp-item-index">${idx + 1}</span>
                        <div class="kaiz-mp-item-details">
                            <span class="kaiz-mp-item-name">${pl.name}</span>
                            <span class="kaiz-mp-item-sub">${pl.songs.length} bài hát</span>
                        </div>
                    </div>
                    <button class="kaiz-mp-item-del-btn" title="Xóa playlist này">✕</button>
                `;

                // Click để phát playlist
                item.querySelector('.kaiz-mp-item-left')?.addEventListener('click', () => {
                    this.audioManager.playPlaylist(pl.id);
                });

                // Xóa playlist
                item.querySelector('.kaiz-mp-item-del-btn')?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm(`Bạn có chắc muốn xóa playlist "${pl.name}"?`)) {
                        this.audioManager.deletePlaylist(pl.id);
                        this.updateDrawerContent();
                    }
                });

                listEl.appendChild(item);
            });
        }
    }

    public isVisible(): boolean {
        return !!this.container?.classList.contains('is-active');
    }

    public toggle(): void {
        if (this.isVisible()) {
            this.hide();
        } else {
            this.show();
        }
    }

    public show(): void {
        if (this.container) {
            this.container.classList.add('is-active');
        }
    }

    public hide(): void {
        if (this.container) {
            this.container.classList.remove('is-active');
        }
    }

    public toggleMinimize(minimized?: boolean): void {
        this.isMinimized = minimized !== undefined ? minimized : !this.isMinimized;
        if (this.container) {
            if (this.isMinimized) {
                this.container.classList.add('is-minimized');
                // Tự động đóng drawer nếu đang mở dở khi thu gọn để tránh xung đột layout
                if (this.isDrawerOpen) {
                    this.toggleDrawer(false);
                }
            } else {
                this.container.classList.remove('is-minimized');
                // Đảm bảo không bị tràn mép trái màn hình khi phóng to ra 380px
                const currentRight = parseFloat(this.container.style.right || '24');
                const maxRightAllowed = window.innerWidth - 390;
                if (currentRight > maxRightAllowed) {
                    this.container.style.right = `${Math.max(10, maxRightAllowed)}px`;
                }
            }
        }
    }

    public shutdownAndClear(): void {
        this.audioManager.stop();
        this.audioManager.clearQueue();
        this.hide();
        if (typeof toastr !== 'undefined') {
            toastr.success('Đã tắt trình phát nhạc và xóa toàn bộ hàng đợi.', 'Kaiz Hi-Fi');
        }
    }
}
