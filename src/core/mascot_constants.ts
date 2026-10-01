/**
 * Virtual Assistance Pet (Crystal Slime Mascot) Constants & Types
 */

export type PetState = 'idle' | 'thinking' | 'working' | 'success' | 'error' | 'sleeping' | 'bounce';

export interface PetConfig {
    enabled: boolean;
    scale: number; // 48 to 180 (px)
    opacity: number; // 40 to 100 (%)
    bubbleEnabled: boolean;
    soundEnabled: boolean;
}

export const DEFAULT_PET_CONFIG: PetConfig = {
    enabled: true,
    scale: 96,
    opacity: 100,
    bubbleEnabled: true,
    soundEnabled: false,
};

export const PET_ASSETS: Record<PetState, string> = {
    idle: 'assets/pet/slime_idle_20f.webp',
    thinking: 'assets/pet/slime_thinking_20f.webp',
    working: 'assets/pet/slime_working_20f.webp',
    success: 'assets/pet/slime_hurray_20f.webp',
    error: 'assets/pet/slime_worry_20f.webp',
    sleeping: 'assets/pet/slime_sleeping_20f.webp',
    bounce: 'assets/pet/slime_bounce_20f.webp',
};

export const PET_QUOTES: Record<PetState | 'click', string[]> = {
    idle: [
        'Bé Slime đang sẵn sàng giúp bạn nè! ✨',
        'Bồng bềnh bồng bềnh... Hôm nay chúng ta làm gì thế?',
        'Pha lê phát sáng lung linh! Cần gì cứ gọi Kaiz nhé!',
        'Chủ nhân ơi, bé đang trực đây!',
    ],
    thinking: [
        'Đang suy ngẫm giải pháp tối ưu...',
        'Chờ xíu nhé, đang tính toán CoT...',
        'Hmm... Ý tưởng này thú vị đấy!',
        'Đang kết nối luồng tư duy ma thuật...',
    ],
    working: [
        'Đang thi hành công cụ...',
        'Thao tác dữ liệu SillyTavern...',
        'Gõ phím lách cách, chạy tool vèo vèo! ⚡',
        'Đang xử lý tác vụ cho bạn nè!',
    ],
    success: [
        'Xong xuôi rồi nè, yay! 🎉',
        'Nhiệm vụ hoàn thành xuất sắc! ✨',
        'Pha lê rực sáng ăn mừng nào! 🌟',
        'Tác vụ đã hoàn tất trọn vẹn!',
    ],
    error: [
        'Ối, có gì đó sai sai rồi... 💦',
        'Gặp trục trặc rồi, để bé gỡ lỗi nhé!',
        'Ui da, tan chảy xẹp lép luôn... 🌀',
        'Đang thử lại nè, đừng lo lắng!',
    ],
    sleeping: ['Khò khò... Zzz... 💤', 'Bé chợp mắt tí xíu nha... Zzz', 'Bong bóng ngủ bồng bềnh... 🫧'],
    bounce: ['Vèo vèo... Đang bay lượn nè! 🎈', 'Nảy tưng tưng khắp màn hình! ✨', 'Ú òa, đổi chỗ ở mới thôi nào!'],
    click: [
        'Nhột quá hihi! 😄',
        'Nảy nảy tưng tưng nè! ✨',
        'Chủ nhân gọi bé có việc gì thế ạ?',
        'Bé Slime tinh thể luôn bên bạn! 💙',
        'Double click vào bé để mở nhanh Kaiz Chat nha!',
    ],
};
