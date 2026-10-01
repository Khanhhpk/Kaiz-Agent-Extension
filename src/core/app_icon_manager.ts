/**
 * App Icon & Avatar Manager
 * Quản lý biểu tượng của Extension (Bóng nổi Floating Button & Avatar Agent trong tin nhắn).
 * Quản lý màu nền biểu tượng (thay vì chỉ màu đen) và Avatar người dùng (User Avatar).
 */

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

export interface AvatarBgPreset {
    id: string;
    name: string;
    bgValue: string;
    previewColor: string;
    isTransparent?: boolean;
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
        subtitle: 'Tải lên & Cắt từ thiết bị',
        type: 'image',
        previewGlow: 'rgba(155, 89, 182, 0.45)',
        badgeEmoji: '📁',
    },
];

export const AVATAR_BG_PRESETS: AvatarBgPreset[] = [
    {
        id: 'dark',
        name: 'Đen Huyền Bí',
        bgValue: 'linear-gradient(135deg, #2b2b2b 0%, #000000 100%)',
        previewColor: '#1a1a1a',
    },
    {
        id: 'transparent',
        name: 'Trong Suốt (Không nền)',
        bgValue: 'transparent',
        previewColor: 'rgba(255, 255, 255, 0.08)',
        isTransparent: true,
    },
    {
        id: 'glass',
        name: 'Kính Mờ (Glass)',
        bgValue: 'rgba(255, 255, 255, 0.12)',
        previewColor: 'rgba(255, 255, 255, 0.25)',
    },
    {
        id: 'ocean',
        name: 'Đại Dương Xanh',
        bgValue: 'linear-gradient(135deg, #0984e3 0%, #00cec9 100%)',
        previewColor: '#0984e3',
    },
    {
        id: 'cosmic',
        name: 'Tím Vũ Trụ',
        bgValue: 'linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)',
        previewColor: '#6c5ce7',
    },
    {
        id: 'sakura',
        name: 'Hồng Sakura',
        bgValue: 'linear-gradient(135deg, #fd79a8 0%, #e84393 100%)',
        previewColor: '#fd79a8',
    },
    {
        id: 'sunset',
        name: 'Hoàng Hôn',
        bgValue: 'linear-gradient(135deg, #e17055 0%, #f0932b 100%)',
        previewColor: '#e17055',
    },
    {
        id: 'emerald',
        name: 'Ngọc Lục Bảo',
        bgValue: 'linear-gradient(135deg, #00b894 0%, #55efc4 100%)',
        previewColor: '#00b894',
    },
    {
        id: 'white',
        name: 'Trắng Tinh Khôi',
        bgValue: 'linear-gradient(135deg, #ffffff 0%, #dfe6e9 100%)',
        previewColor: '#f1f2f6',
    },
    {
        id: 'custom',
        name: 'Màu Tự Chọn',
        bgValue: '#1e272e',
        previewColor: '#ffa801',
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
        this.applyAvatarBg();
        this.applyUserAvatar();
    }

    public getExtPath(): string {
        return this.extPath;
    }

    public getSettings(): {
        appIconType: AppIconType;
        customIconUrl: string;
        avatarBgType: string;
        avatarBgValue: string;
        userAvatarUrl: string;
    } {
        const ctx = (window as any).SillyTavern?.getContext();
        const extSettings = ctx?.extensionSettings?.['kaiz_agent'] || {};
        return {
            appIconType: (extSettings.appIconType as AppIconType) || 'default',
            customIconUrl: extSettings.customIconUrl || '',
            avatarBgType: extSettings.avatarBgType || 'dark',
            avatarBgValue: extSettings.avatarBgValue || 'linear-gradient(135deg, #2b2b2b 0%, #000000 100%)',
            userAvatarUrl: extSettings.userAvatarUrl || '',
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
     * Trả về HTML avatar của User trong khung Chat
     */
    public getUserAvatarHtml(): string {
        const { userAvatarUrl } = this.getSettings();
        if (userAvatarUrl) {
            return `<img class="kaiz-app-icon kaiz-user-avatar-img" src="${userAvatarUrl}" alt="User" draggable="false" />`;
        }
        return `<i class="fa-solid fa-user"></i>`;
    }

    /**
     * Lấy giá trị màu nền avatar hiện tại
     */
    public getAvatarBg(): string {
        return this.getSettings().avatarBgValue;
    }

    /**
     * Áp dụng màu nền cho Floating Button, Avatar Agent trong chat và Live Preview
     */
    public applyAvatarBg(bgValue?: string): void {
        const $ = (window as any).jQuery;
        const currentBg = bgValue || this.getAvatarBg();

        // 1. Gán CSS variable trên :root
        document.documentElement.style.setProperty('--kaiz-avatar-bg', currentBg);

        if (!$) return;

        const isTransparent = currentBg === 'transparent';

        // 2. Cập nhật floating button
        const floatBtn = $('#kaiz-floating-btn');
        if (floatBtn.length > 0) {
            floatBtn.css('background', currentBg);
            if (isTransparent) {
                floatBtn.addClass('kaiz-bg-transparent');
            } else {
                floatBtn.removeClass('kaiz-bg-transparent');
            }
        }

        // 3. Cập nhật live preview trong bảng cài đặt
        const previewBtn = $('#kaiz-icon-live-preview-btn');
        if (previewBtn.length > 0) {
            previewBtn.css('background', currentBg);
            if (isTransparent) {
                previewBtn.addClass('kaiz-bg-transparent');
            } else {
                previewBtn.removeClass('kaiz-bg-transparent');
            }
        }

        // 4. Cập nhật tất cả avatar của Agent trong khung chat
        $('.kaiz-msg-agent .kaiz-msg-avatar').css('background', currentBg);
    }

    /**
     * Cập nhật avatar User cho toàn bộ tin nhắn trong khung chat
     */
    public applyUserAvatar(): void {
        const $ = (window as any).jQuery;
        if (!$) return;

        const userAvatars = $('.kaiz-msg-user .kaiz-msg-avatar');
        if (userAvatars.length > 0) {
            userAvatars.each((_: number, el: HTMLElement) => {
                $(el).html(this.getUserAvatarHtml());
            });
        }
    }

    /**
     * Cập nhật ngay lập tức DOM của nút Floating Button và thông báo các thành phần giao diện
     */
    public applyCurrentIcon(): void {
        const $ = (window as any).jQuery;
        if (!$) return;

        const floatBtn = $('#kaiz-floating-btn');
        if (floatBtn.length > 0) {
            const existingIcon = floatBtn.find('.kaiz-app-icon, i, img');
            const isSpinning = existingIcon.hasClass('kaiz-icon-spin');

            floatBtn.empty();
            const newElement = $(this.getFloatingBtnInnerHtml());
            if (isSpinning) {
                newElement.addClass('kaiz-icon-spin');
            }
            floatBtn.append(newElement);
        }

        // Cập nhật các avatar tin nhắn của Agent hiện có trên màn hình
        const agentAvatars = $('.kaiz-msg-agent .kaiz-msg-avatar');
        if (agentAvatars.length > 0) {
            agentAvatars.each((_: number, el: HTMLElement) => {
                $(el).html(this.getAvatarHtml());
            });
        }

        // Đồng bộ lại màu nền
        this.applyAvatarBg();

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
