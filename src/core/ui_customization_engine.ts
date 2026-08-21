/**
 * UI Customization Engine
 * Module trung tâm quản lý mọi thay đổi giao diện SillyTavern do AI tạo ra.
 * Hỗ trợ: CSS injection, Element injection, Theme variables, Snapshot/Rollback.
 */

import { KaizDB, UISnapshot } from './db';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

const STYLE_PREFIX = 'kaiz-custom-';
const ELEMENT_PREFIX = 'kaiz-injected-';

export class UICustomizationEngine {
    constructor(private db: KaizDB) {}

    // ========================================================================
    // CSS Management
    // ========================================================================

    public async injectCSS(styleId: string, cssContent: string): Promise<void> {
        const fullId = STYLE_PREFIX + styleId;
        const existing = document.getElementById(fullId) as HTMLStyleElement | null;

        // Snapshot trạng thái cũ
        await this.createSnapshot({
            label: `inject CSS: ${styleId}`,
            type: 'css',
            cssData: {
                styleId: fullId,
                previousContent: existing ? existing.textContent : null,
            },
        });

        if (existing) {
            existing.textContent = cssContent;
        } else {
            const style = document.createElement('style');
            style.id = fullId;
            style.textContent = cssContent;
            document.head.appendChild(style);
        }
    }

    public async updateCSS(styleId: string, newContent: string): Promise<void> {
        const fullId = STYLE_PREFIX + styleId;
        const existing = document.getElementById(fullId) as HTMLStyleElement | null;
        if (!existing) {
            throw new Error(`Style '${styleId}' không tồn tại. Hãy dùng action 'inject' trước.`);
        }

        await this.createSnapshot({
            label: `update CSS: ${styleId}`,
            type: 'css',
            cssData: {
                styleId: fullId,
                previousContent: existing.textContent,
            },
        });

        existing.textContent = newContent;
    }

    public async removeCSS(styleId: string): Promise<void> {
        const fullId = STYLE_PREFIX + styleId;
        const existing = document.getElementById(fullId) as HTMLStyleElement | null;
        if (!existing) {
            throw new Error(`Style '${styleId}' không tồn tại.`);
        }

        await this.createSnapshot({
            label: `remove CSS: ${styleId}`,
            type: 'css',
            cssData: {
                styleId: fullId,
                previousContent: existing.textContent,
            },
        });

        existing.remove();
    }

    public listCSS(): { id: string; preview: string }[] {
        const results: { id: string; preview: string }[] = [];
        const styles = document.querySelectorAll(`style[id^="${STYLE_PREFIX}"]`);
        styles.forEach((style) => {
            const rawId = style.id.replace(STYLE_PREFIX, '');
            const content = style.textContent || '';
            const preview = content.length > 150 ? content.substring(0, 147) + '...' : content;
            results.push({ id: rawId, preview: preview.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() });
        });
        return results;
    }

    // ========================================================================
    // Element Management (KHÔNG sanitize HTML)
    // ========================================================================

    public async injectElement(
        elementId: string,
        htmlContent: string,
        parentSelector: string,
        position: string = 'beforeend',
    ): Promise<void> {
        const fullId = ELEMENT_PREFIX + elementId;
        const parent = document.querySelector(parentSelector);
        if (!parent) {
            throw new Error(`Không tìm thấy phần tử cha với selector '${parentSelector}'.`);
        }

        // Kiểm tra element đã tồn tại chưa
        const existing = document.getElementById(fullId);

        await this.createSnapshot({
            label: `inject element: ${elementId}`,
            type: 'element',
            elementData: {
                elementId: fullId,
                previousOuterHTML: existing ? existing.outerHTML : null,
                parentSelector,
                position,
            },
        });

        // Tạo wrapper tạm để parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = htmlContent;

        // Lấy phần tử đầu tiên hoặc wrap toàn bộ nội dung
        let newElement: HTMLElement;
        if (temp.children.length === 1) {
            newElement = temp.children[0] as HTMLElement;
        } else {
            // Nhiều phần tử hoặc chỉ có text → wrap trong div
            newElement = temp;
            newElement.style.display = 'contents'; // Không ảnh hưởng layout
        }

        newElement.id = fullId;
        newElement.setAttribute('data-kaiz-injected', 'true');

        if (existing) {
            existing.replaceWith(newElement);
        } else {
            switch (position) {
                case 'afterbegin':
                    parent.insertBefore(newElement, parent.firstChild);
                    break;
                case 'before':
                    parent.parentNode?.insertBefore(newElement, parent);
                    break;
                case 'after':
                    parent.parentNode?.insertBefore(newElement, parent.nextSibling);
                    break;
                case 'beforeend':
                default:
                    parent.appendChild(newElement);
                    break;
            }
        }
    }

    public async removeElement(elementId: string): Promise<void> {
        const fullId = ELEMENT_PREFIX + elementId;
        const existing = document.getElementById(fullId);
        if (!existing) {
            throw new Error(`Element '${elementId}' không tồn tại.`);
        }

        const parentSelector = this.getParentSelector(existing);

        await this.createSnapshot({
            label: `remove element: ${elementId}`,
            type: 'element',
            elementData: {
                elementId: fullId,
                previousOuterHTML: existing.outerHTML,
                parentSelector,
                position: 'beforeend',
            },
        });

        existing.remove();
    }

    public listElements(): { id: string; tag: string; parent: string; preview: string }[] {
        const results: { id: string; tag: string; parent: string; preview: string }[] = [];
        const elements = document.querySelectorAll('[data-kaiz-injected="true"]');
        elements.forEach((el) => {
            const rawId = el.id.replace(ELEMENT_PREFIX, '');
            const tag = el.tagName.toLowerCase();
            const parent = this.getParentSelector(el as HTMLElement);
            const text = (el as HTMLElement).innerText || '';
            const preview = text.length > 80 ? text.substring(0, 77) + '...' : text;
            results.push({ id: rawId, tag, parent, preview: preview.replace(/\n/g, ' ').trim() });
        });
        return results;
    }

    // ========================================================================
    // Theme Variables
    // ========================================================================

    public async setThemeVariables(variables: Record<string, string>): Promise<void> {
        const root = document.documentElement;
        const previousValues: Record<string, string> = {};

        for (const [name, _value] of Object.entries(variables)) {
            previousValues[name] = getComputedStyle(root).getPropertyValue(name).trim();
        }

        await this.createSnapshot({
            label: `set_variables: ${Object.keys(variables).join(', ')}`,
            type: 'theme',
            themeData: { previousValues },
        });

        for (const [name, value] of Object.entries(variables)) {
            root.style.setProperty(name, value);
        }
    }

    public getThemeVariables(variableNames?: string[]): Record<string, string> {
        const root = document.documentElement;
        const result: Record<string, string> = {};

        if (variableNames && variableNames.length > 0) {
            for (const name of variableNames) {
                result[name] = getComputedStyle(root).getPropertyValue(name).trim();
            }
        } else {
            // Trả về các biến theme cốt lõi của ST
            const coreVars = [
                '--SmartThemeBodyColor',
                '--SmartThemeEmColor',
                '--SmartThemeQuoteColor',
                '--SmartThemeChatTintColor',
                '--SmartThemeBlurTintColor',
                '--SmartThemeBorderColor',
                '--SmartThemeShadowColor',
                '--SmartThemeUnderlineColor',
                '--SmartThemeBlurStrength',
                '--SmartThemeFontScale',
            ];
            for (const name of coreVars) {
                const val = getComputedStyle(root).getPropertyValue(name).trim();
                if (val) result[name] = val;
            }
        }

        return result;
    }

    public async applyThemeJSON(themeJson: Record<string, any>): Promise<void> {
        // Mapping từ theme JSON fields sang CSS variables của ST
        const fieldToVar: Record<string, string> = {
            main_text_color: '--SmartThemeBodyColor',
            italics_text_color: '--SmartThemeEmColor',
            underline_text_color: '--SmartThemeUnderlineColor',
            quote_text_color: '--SmartThemeQuoteColor',
            blur_tint_color: '--SmartThemeBlurTintColor',
            chat_tint_color: '--SmartThemeChatTintColor',
            user_mes_blur_tint_color: '--SmartThemeUserMesBlurTintColor',
            bot_mes_blur_tint_color: '--SmartThemeBotMesBlurTintColor',
            shadow_color: '--SmartThemeShadowColor',
            border_color: '--SmartThemeBorderColor',
        };

        const variables: Record<string, string> = {};

        for (const [field, cssVar] of Object.entries(fieldToVar)) {
            if (themeJson[field] !== undefined) {
                variables[cssVar] = themeJson[field];
            }
        }

        if (themeJson.blur_strength !== undefined) {
            variables['--SmartThemeBlurStrength'] = themeJson.blur_strength + 'px';
        }
        if (themeJson.font_scale !== undefined) {
            variables['--SmartThemeFontScale'] = String(themeJson.font_scale);
        }
        if (themeJson.shadow_width !== undefined) {
            variables['--SmartThemeShadowWidth'] = themeJson.shadow_width + 'px';
        }
        if (themeJson.chat_width !== undefined) {
            variables['--sheldWidth'] = themeJson.chat_width + '%';
        }

        // Áp dụng CSS variables
        if (Object.keys(variables).length > 0) {
            await this.setThemeVariables(variables);
        }

        // Áp dụng custom_css nếu có
        if (themeJson.custom_css) {
            await this.injectCSS('theme-custom-css', themeJson.custom_css);
        }
    }

    public getCurrentThemeInfo(): Record<string, any> {
        const root = document.documentElement;
        const computedStyle = getComputedStyle(root);

        const info: Record<string, any> = {
            // Màu sắc cốt lõi
            main_text_color: computedStyle.getPropertyValue('--SmartThemeBodyColor').trim(),
            italics_text_color: computedStyle.getPropertyValue('--SmartThemeEmColor').trim(),
            underline_text_color: computedStyle.getPropertyValue('--SmartThemeUnderlineColor').trim(),
            quote_text_color: computedStyle.getPropertyValue('--SmartThemeQuoteColor').trim(),
            blur_tint_color: computedStyle.getPropertyValue('--SmartThemeBlurTintColor').trim(),
            chat_tint_color: computedStyle.getPropertyValue('--SmartThemeChatTintColor').trim(),
            user_mes_blur_tint_color: computedStyle.getPropertyValue('--SmartThemeUserMesBlurTintColor').trim(),
            bot_mes_blur_tint_color: computedStyle.getPropertyValue('--SmartThemeBotMesBlurTintColor').trim(),
            shadow_color: computedStyle.getPropertyValue('--SmartThemeShadowColor').trim(),
            border_color: computedStyle.getPropertyValue('--SmartThemeBorderColor').trim(),
            // Layout & effects
            blur_strength: computedStyle.getPropertyValue('--SmartThemeBlurStrength').trim(),
            font_scale: computedStyle.getPropertyValue('--SmartThemeFontScale').trim(),
            chat_width: computedStyle.getPropertyValue('--sheldWidth').trim(),
            // Font
            font_family: computedStyle.getPropertyValue('--mainFontFamily').trim() || computedStyle.fontFamily,
            // Body background
            body_background: getComputedStyle(document.body).backgroundColor,
            // Trạng thái customization hiện tại
            active_custom_styles: this.listCSS(),
            active_injected_elements: this.listElements(),
        };

        return info;
    }

    // ========================================================================
    // Rollback System
    // ========================================================================

    public async undo(): Promise<UISnapshot | null> {
        const activeSnapshots = await this.db.getActiveSnapshots();
        if (activeSnapshots.length === 0) return null;

        // Lấy snapshot mới nhất (đã sort desc by timestamp)
        const snapshot = activeSnapshots[0];
        await this.applyRollback(snapshot);
        await this.db.markSnapshotRolledBack(snapshot.snapshotId);

        return snapshot;
    }

    public async rollbackAll(): Promise<number> {
        const activeSnapshots = await this.db.getActiveSnapshots();
        if (activeSnapshots.length === 0) return 0;

        // Rollback từ mới nhất đến cũ nhất
        for (const snapshot of activeSnapshots) {
            await this.applyRollback(snapshot);
        }

        await this.db.markAllSnapshotsRolledBack();
        return activeSnapshots.length;
    }

    public async getSnapshotHistory(): Promise<UISnapshot[]> {
        return this.db.getAllSnapshots();
    }

    public async removeAllCustomizations(): Promise<void> {
        // Gỡ tất cả custom CSS
        const styles = document.querySelectorAll(`style[id^="${STYLE_PREFIX}"]`);
        styles.forEach((s) => s.remove());

        // Gỡ tất cả injected elements
        const elements = document.querySelectorAll('[data-kaiz-injected="true"]');
        elements.forEach((el) => el.remove());

        // Gỡ tất cả theme variables đã được set trên :root
        const snapshots = await this.db.getAllSnapshots();
        const root = document.documentElement;
        for (const snap of snapshots) {
            if (snap.type === 'theme' && snap.themeData) {
                for (const name of Object.keys(snap.themeData.previousValues)) {
                    root.style.removeProperty(name);
                }
            }
        }

        // Xoá tất cả snapshots
        await this.db.clearAllSnapshots();
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private async createSnapshot(
        data: Omit<UISnapshot, 'id' | 'snapshotId' | 'timestamp' | 'applied'>,
    ): Promise<void> {
        const snapshot: UISnapshot = {
            snapshotId: generateUUID(),
            timestamp: Date.now(),
            applied: true,
            ...data,
        };

        await this.db.addSnapshot(snapshot);
    }

    private async applyRollback(snapshot: UISnapshot): Promise<void> {
        switch (snapshot.type) {
            case 'css':
                if (snapshot.cssData) {
                    const el = document.getElementById(snapshot.cssData.styleId) as HTMLStyleElement | null;
                    if (snapshot.cssData.previousContent === null) {
                        // Style chưa tồn tại trước đó → xoá nó
                        if (el) el.remove();
                    } else {
                        // Khôi phục nội dung cũ
                        if (el) {
                            el.textContent = snapshot.cssData.previousContent;
                        } else {
                            // Style đã bị xoá → tạo lại với nội dung cũ
                            const style = document.createElement('style');
                            style.id = snapshot.cssData.styleId;
                            style.textContent = snapshot.cssData.previousContent;
                            document.head.appendChild(style);
                        }
                    }
                }
                break;

            case 'element':
                if (snapshot.elementData) {
                    const el = document.getElementById(snapshot.elementData.elementId);
                    if (snapshot.elementData.previousOuterHTML === null) {
                        // Element chưa tồn tại trước đó → xoá nó
                        if (el) el.remove();
                    } else {
                        // Khôi phục element cũ
                        if (el) {
                            const temp = document.createElement('div');
                            temp.innerHTML = snapshot.elementData.previousOuterHTML;
                            if (temp.firstElementChild) {
                                el.replaceWith(temp.firstElementChild);
                            }
                        }
                        // Nếu element đã bị xoá (remove action), cần chèn lại
                        else {
                            const parent = document.querySelector(snapshot.elementData.parentSelector);
                            if (parent) {
                                const temp = document.createElement('div');
                                temp.innerHTML = snapshot.elementData.previousOuterHTML;
                                if (temp.firstElementChild) {
                                    parent.appendChild(temp.firstElementChild);
                                }
                            }
                        }
                    }
                }
                break;

            case 'theme':
                if (snapshot.themeData) {
                    const root = document.documentElement;
                    for (const [name, value] of Object.entries(snapshot.themeData.previousValues)) {
                        if (value) {
                            root.style.setProperty(name, value);
                        } else {
                            root.style.removeProperty(name);
                        }
                    }
                }
                break;
        }
    }

    private getParentSelector(el: HTMLElement): string {
        const parent = el.parentElement;
        if (!parent) return 'body';
        if (parent.id) return '#' + parent.id;
        if (parent.className && typeof parent.className === 'string') {
            const classes = parent.className.trim().split(/\s+/).slice(0, 2).join('.');
            if (classes) return parent.tagName.toLowerCase() + '.' + classes;
        }
        return parent.tagName.toLowerCase();
    }
}
