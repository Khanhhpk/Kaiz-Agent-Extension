/**
 * App Icon Manager
 * Quản lý biểu tượng của Extension (Bóng nổi Floating Button & Avatar Agent trong tin nhắn).
 * Hỗ trợ icon Âm Dương mặc định, 4 biến thể Thạch Triskelion Slime Orbs, và ảnh tùy chỉnh người dùng tải lên.
 */

declare const SillyTavern: any;
declare const jQuery: any;

export type AppIconType =
    'default' | 'orb_ocean_emerald' | 'orb_sunset_azure' | 'orb_cosmic_gold' | 'orb_sakura_mint' | 'custom';

export interface AppIconPreset {
    id: AppIconType;
    name: string;
    subtitle: string;
    type: 'font-awesome' | 'image';
    faClass?: string;
    fileName?: string;
    previewGlow?: string;
    badgeEmoji?: string;
}

export const APP_ICON_PRESETS: AppIconPreset[] = [
    {
        id: 'default',
        name: 'Âm Dương Cổ Điển',
        subtitle: 'Thái Cực Đạo (FontAwesome)',
        type: 'font-awesome',
        faClass: 'fa-solid fa-yin-yang',
        previewGlow: 'rgba(255, 255, 255, 0.35)',
        badgeEmoji: '☯️',
    },
    {
        id: 'orb_ocean_emerald',
        name: 'Thạch Lam & Lục Bảo',
        subtitle: 'Ocean & Emerald Swirl',
        type: 'image',
        fileName: 'assets/icons/orb_ocean_emerald.png',
        previewGlow: 'rgba(46, 204, 113, 0.45)',
        badgeEmoji: '🌊',
    },
    {
        id: 'orb_sunset_azure',
        name: 'Thạch Hoàng Hôn & Lam Biển',
        subtitle: 'Sunset & Azure Swirl',
        type: 'image',
        fileName: 'assets/icons/orb_sunset_azure.png',
        previewGlow: 'rgba(255, 118, 117, 0.45)',
        badgeEmoji: '🌅',
    },
    {
        id: 'orb_cosmic_gold',
        name: 'Tinh Vân & Ánh Sao Vàng',
        subtitle: 'Cosmic Astral & Gold Swirl',
        type: 'image',
        fileName: 'assets/icons/orb_cosmic_gold.png',
        previewGlow: 'rgba(241, 196, 15, 0.45)',
        badgeEmoji: '✨',
    },
    {
        id: 'orb_sakura_mint',
        name: 'Hoa Anh Đào & Bạc Hà',
        subtitle: 'Sakura & Mint Swirl',
        type: 'image',
        fileName: 'assets/icons/orb_sakura_mint.png',
        previewGlow: 'rgba(253, 121, 168, 0.45)',
        badgeEmoji: '🌸',
    },
    {
        id: 'custom',
        name: 'Ảnh Tùy Chỉnh',
        subtitle: 'Tải lên từ thiết bị',
        type: 'image',
        previewGlow: 'rgba(155, 89, 182, 0.45)',
        badgeEmoji: '📁',
    },
];

export class AppIconManager {
    private static instance: AppIconManager;
    private extPath: string = 'Kaiz-Agent-Extension';
    private listeners: Array<() => void> = [];

    private constructor() {}

    public static getInstance(): AppIconManager {
        if (!AppIconManager.instance) {
            AppIconManager.instance = new AppIconManager();
        }
        return AppIconManager.instance;
    }

    public init(extPath: string): void {
        this.extPath = extPath || this.extPath;
        this.applyCurrentIcon();
    }

    public getExtPath(): string {
        return this.extPath;
    }

    public getSettings(): { appIconType: AppIconType; customIconUrl: string } {
        const ctx = (window as any).SillyTavern?.getContext();
        const extSettings = ctx?.extensionSettings?.['kaiz_agent'] || {};
        return {
            appIconType: (extSettings.appIconType as AppIconType) || 'default',
            customIconUrl: extSettings.customIconUrl || '',
        };
    }

    /**
     * Lấy URL ảnh hoặc null (nếu là default fontawesome)
     */
    public getIconUrl(type?: AppIconType, customUrl?: string): string | null {
        const current = this.getSettings();
        const targetType = type || current.appIconType;
        const targetCustom = customUrl !== undefined ? customUrl : current.customIconUrl;

        if (targetType === 'default') {
            return null;
        }

        if (targetType === 'custom') {
            return targetCustom || null;
        }

        const preset = APP_ICON_PRESETS.find((p) => p.id === targetType);
        if (preset && preset.fileName) {
            return `/scripts/extensions/${this.extPath}/${preset.fileName}`;
        }
        return null;
    }

    /**
     * Trả về HTML bên trong nút Floating Button
     */
    public getFloatingBtnInnerHtml(type?: AppIconType, customUrl?: string): string {
        const imgUrl = this.getIconUrl(type, customUrl);
        if (imgUrl) {
            return `<img class="kaiz-app-icon" src="${imgUrl}" alt="Kaiz" draggable="false" />`;
        }
        return `<i class="fa-solid fa-yin-yang kaiz-app-icon"></i>`;
    }

    /**
     * Trả về HTML avatar của Agent trong khung Chat
     */
    public getAvatarHtml(type?: AppIconType, customUrl?: string): string {
        const imgUrl = this.getIconUrl(type, customUrl);
        if (imgUrl) {
            return `<img class="kaiz-app-icon kaiz-msg-avatar-img" src="${imgUrl}" alt="Kaiz" draggable="false" />`;
        }
        return `<i class="fa-solid fa-yin-yang kaiz-app-icon"></i>`;
    }

    /**
     * Cập nhật ngay lập tức DOM của nút Floating Button và thông báo các thành phần giao diện
     */
    public applyCurrentIcon(): void {
        const $ = (window as any).jQuery;
        if (!$) return;

        const floatBtn = $('#kaiz-floating-btn');
        if (floatBtn.length > 0) {
            // Giữ lại trạng thái quay nếu đang chạy
            const existingIcon = floatBtn.find('.kaiz-app-icon, i, img');
            const isSpinning = existingIcon.hasClass('kaiz-icon-spin');

            floatBtn.empty();
            const newElement = $(this.getFloatingBtnInnerHtml());
            if (isSpinning) {
                newElement.addClass('kaiz-icon-spin');
            }
            floatBtn.append(newElement);
        }

        // Cập nhật các avatar tin nhắn của Agent hiện có trên màn hình (nếu có)
        const agentAvatars = $('.kaiz-msg-agent .kaiz-msg-avatar');
        if (agentAvatars.length > 0) {
            agentAvatars.each((_: number, el: HTMLElement) => {
                $(el).html(this.getAvatarHtml());
            });
        }

        // Kích hoạt listeners
        this.listeners.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.error('[AppIconManager] Listener error:', e);
            }
        });
    }

    public onIconChanged(listener: () => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== listener);
        };
    }
}
