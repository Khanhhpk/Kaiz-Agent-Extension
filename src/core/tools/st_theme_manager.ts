import { ITool } from '../tool_registry';
import { UICustomizationEngine } from '../ui_customization_engine';
import { KaizDB, ThemeReference } from '../db';

// Default theme JSONs được nhúng sẵn — sẽ được nạp vào IndexedDB khi cần
import catppuccinTheme from './catppuccin';
import redesignTheme from './redesign';

let engineInstance: UICustomizationEngine | null = null;
let dbInstance: KaizDB | null = null;

export function initThemeManagerTool(engine: UICustomizationEngine, db: KaizDB) {
    engineInstance = engine;
    dbInstance = db;
}

/**
 * Đảm bảo theme library đã có các theme mặc định
 */
async function ensureDefaultThemes(db: KaizDB): Promise<void> {
    const existing = await db.getAllThemeReferences();
    if (existing.length === 0) {
        await loadDefaultThemes(db);
    }
}

async function loadDefaultThemes(db: KaizDB): Promise<void> {
    const defaults = [
        { name: 'Catppuccin Nights', json: catppuccinTheme },
        { name: 'SillyTavern Redesign', json: redesignTheme },
    ];
    for (const d of defaults) {
        const theme: ThemeReference = {
            name: d.name,
            themeJson: JSON.stringify(d.json),
            isDefault: true,
            addedAt: Date.now(),
        };
        await db.addThemeReference(theme);
    }
}

export const stThemeManagerTool: ITool = {
    schema: {
        name: 'st_theme_manager',
        description:
            'Quản lý theme và CSS variables của SillyTavern. Sử dụng để đọc/đổi màu sắc, font chữ, blur, shadow và các cài đặt giao diện. Mỗi thay đổi đều được snapshot vào IndexedDB để rollback. Dùng action "get_reference_themes" để xem các theme mẫu và học cấu trúc.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description:
                        'Hành động cần thực hiện: "get_current_theme" (đọc cấu hình hiện tại), "set_variables" (đặt CSS variables), "apply_theme_json" (áp dụng theme JSON đầy đủ), "get_reference_themes" (xem theme mẫu trong library)',
                    enum: ['get_current_theme', 'set_variables', 'apply_theme_json', 'get_reference_themes'],
                },
                variables: {
                    type: 'string',
                    description:
                        'JSON string chứa object { variableName: value }. Dùng cho action "set_variables". Ví dụ: \'{"--SmartThemeBodyColor": "rgba(200, 200, 255, 1)"}\'',
                },
                theme_json: {
                    type: 'string',
                    description:
                        'JSON string chứa đối tượng theme đầy đủ (theo format ST theme file). Dùng cho action "apply_theme_json".',
                },
                mode: {
                    type: 'string',
                    description:
                        'Chế độ trả dữ liệu cho "get_reference_themes": "full" (đầy đủ gồm custom_css, tốn token) hoặc "structure_only" (chỉ JSON keys, tiết kiệm token). Mặc định: "structure_only".',
                    enum: ['full', 'structure_only'],
                },
            },
            required: ['action'],
        },
    },

    execute: async (args: any) => {
        try {
            if (!engineInstance || !dbInstance) {
                return { content: 'Lỗi: UI Customization Engine chưa được khởi tạo.', isError: true };
            }

            const action = args.action;

            switch (action) {
                case 'get_current_theme': {
                    const info = engineInstance.getCurrentThemeInfo();
                    return { content: JSON.stringify(info, null, 2) };
                }

                case 'set_variables': {
                    if (!args.variables) {
                        return { content: 'Lỗi: Thiếu tham số "variables".', isError: true };
                    }
                    let variables: Record<string, string>;
                    try {
                        variables = JSON.parse(args.variables);
                    } catch {
                        return { content: 'Lỗi: "variables" không phải JSON hợp lệ.', isError: true };
                    }

                    await engineInstance.setThemeVariables(variables);
                    const changedKeys = Object.keys(variables);
                    return {
                        content: `Đã cập nhật ${changedKeys.length} CSS variable(s): ${changedKeys.join(', ')}. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'apply_theme_json': {
                    if (!args.theme_json) {
                        return { content: 'Lỗi: Thiếu tham số "theme_json".', isError: true };
                    }
                    let themeJson: Record<string, any>;
                    try {
                        themeJson = JSON.parse(args.theme_json);
                    } catch {
                        return { content: 'Lỗi: "theme_json" không phải JSON hợp lệ.', isError: true };
                    }

                    await engineInstance.applyThemeJSON(themeJson);
                    return {
                        content: `Đã áp dụng theme "${themeJson.name || 'Custom'}" thành công. Đã tạo snapshot để rollback.`,
                    };
                }

                case 'get_reference_themes': {
                    await ensureDefaultThemes(dbInstance);
                    const themes = await dbInstance.getAllThemeReferences();
                    const mode = args.mode || 'structure_only';

                    if (themes.length === 0) {
                        return { content: 'Theme Library trống. Chưa có theme tham khảo nào.' };
                    }

                    if (mode === 'full') {
                        const result = themes.map((t) => ({
                            id: t.id,
                            name: t.name,
                            isDefault: t.isDefault,
                            theme: JSON.parse(t.themeJson),
                        }));
                        return { content: JSON.stringify(result, null, 2) };
                    } else {
                        // structure_only: chỉ trả keys và giá trị ngắn, bỏ custom_css
                        const result = themes.map((t) => {
                            const parsed = JSON.parse(t.themeJson);
                            const summary: Record<string, any> = {};
                            for (const [key, value] of Object.entries(parsed)) {
                                if (key === 'custom_css') {
                                    const cssStr = value as string;
                                    summary[key] = `[${cssStr.length} chars — dùng mode "full" để xem chi tiết]`;
                                } else {
                                    summary[key] = value;
                                }
                            }
                            return { id: t.id, name: t.name, isDefault: t.isDefault, theme: summary };
                        });
                        return { content: JSON.stringify(result, null, 2) };
                    }
                }

                default:
                    return { content: `Lỗi: Action "${action}" không hợp lệ.`, isError: true };
            }
        } catch (e: any) {
            return { content: `Lỗi khi thực thi st_theme_manager: ${e.message}`, isError: true };
        }
    },
};
