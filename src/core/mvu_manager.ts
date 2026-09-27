import YAML from 'yaml';
import { SillyTavernAdapter } from '../adapters/st_adapter';

export interface MvuVariableDescriptor {
    path: string;
    name: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'object' | 'record' | 'unknown';
    min?: number;
    max?: number;
    defaultValue?: any;
    description?: string;
    children?: MvuVariableDescriptor[];
}

export interface MvuInspectionResult {
    hasMvu: boolean;
    characterName: string;
    zodScriptName?: string;
    zodSchemaCode?: string;
    parsedSchema: MvuVariableDescriptor[];
    liveVariables: any;
    initvarVariables: any;
    updateRulesSummary: string;
    healthWarnings: string[];
    inconsistencies?: string[];
}

export interface MvuMutationOptions {
    action: 'add' | 'rename' | 'delete' | 'modify';
    variablePath: string; // e.g. "Người_chơi.Tu_vi.Chân_nguyên" or "stat_data.Người_chơi..."
    type?: 'number' | 'string' | 'boolean' | 'array' | 'object';
    min?: number;
    max?: number;
    defaultValue?: any;
    description?: string;
    ruleCheck?: string; // Natural language rule for Quy_tắc_cập_nhật (Update rules)
    newName?: string; // For rename action
}

export interface MvuVariableInput {
    path: string;
    type: 'number' | 'string' | 'boolean' | 'array' | 'object';
    defaultValue?: any;
    min?: number;
    max?: number;
    ruleCheck?: string;
    description?: string;
}

export interface MvuScaffoldOptions {
    variables?: MvuVariableInput[];
    customZodSchema?: string;
    customInitvarYaml?: string | Record<string, any>;
    customRulesYaml?: string | Record<string, any>;
    title?: string;
    characterName?: string;
}

export class MvuManager {
    /**
     * Lấy SillyTavern Context
     */
    public static getContext(): any {
        return typeof (globalThis as any).SillyTavern !== 'undefined'
            ? (globalThis as any).SillyTavern.getContext()
            : (globalThis as any).window?.SillyTavern?.getContext?.() || null;
    }

    /**
     * Lấy nhân vật đang hoạt động hiện tại
     */
    public static getActiveCharacter(): any {
        const ctx = this.getContext();
        return ctx?.characters?.[ctx?.characterId] || null;
    }

    /**
     * Kiểm tra xem nhân vật hiện tại có hệ thống MVU hay không
     */
    public static hasMvu(char: any): boolean {
        if (!char) return false;
        const scripts = char.data?.extensions?.tavern_helper?.scripts;
        if (!scripts || typeof scripts !== 'object') return false;

        for (const [key, script] of Object.entries(scripts)) {
            const s = script as any;
            const content = s?.content || '';
            const scriptName = s?.name || key;
            if (
                scriptName.toLowerCase().includes('mvu') ||
                scriptName.toLowerCase().includes('zod') ||
                scriptName.includes('Cấu trúc biến') ||
                content.includes('registerMvuSchema') ||
                content.includes('MagVarUpdate') ||
                content.includes('mvu_zod.js')
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * Tìm script Zod Schema của nhân vật
     */
    public static getZodScript(char: any): { key: string; name: string; content: string; script: any } | null {
        if (!char) return null;
        const scripts = char.data?.extensions?.tavern_helper?.scripts;
        if (!scripts || typeof scripts !== 'object') return null;

        for (const [key, script] of Object.entries(scripts)) {
            const s = script as any;
            const content = s?.content || '';
            const scriptName = s?.name || key;

            if (
                content.includes('registerMvuSchema') ||
                scriptName.toLowerCase().includes('zod') ||
                scriptName.includes('Cấu trúc biến')
            ) {
                return {
                    key,
                    name: scriptName,
                    content,
                    script: s,
                };
            }
        }
        return null;
    }

    /**
     * Lấy toàn bộ biến thời gian thực qua TavernHelper API
     */
    public static getLiveVariables(subPath?: string): any {
        const th = (window as any).TavernHelper;
        if (!th) return null;

        let data: any = null;
        try {
            if (typeof th.getVariables === 'function') {
                data = th.getVariables('stat_data');
                if (!data) data = th.getVariables();
            }
        } catch (e) {
            console.warn('[MvuManager] Failed to get live variables via TavernHelper:', e);
        }

        if (subPath && data) {
            const cleanPath = subPath.replace(/^stat_data\./, '');
            const parts = cleanPath.split('.');
            let curr = data;
            for (const p of parts) {
                if (curr && typeof curr === 'object' && p in curr) {
                    curr = curr[p];
                } else {
                    return undefined;
                }
            }
            return curr;
        }

        return data;
    }

    /**
     * Cập nhật trực tiếp biến ở Runtime qua TavernHelper API
     */
    public static async setLiveVariable(
        path: string,
        value: any,
    ): Promise<{ success: boolean; oldValue: any; newValue: any }> {
        const th = (window as any).TavernHelper;
        if (!th) {
            throw new Error('TavernHelper API chưa được tải trong SillyTavern.');
        }

        // Chuẩn hóa path: đảm bảo có prefix stat_data nếu cần
        const fullPath = path.startsWith('stat_data.') ? path : `stat_data.${path}`;
        const cleanPath = path.replace(/^stat_data\./, '');
        const oldValue = this.getLiveVariables(cleanPath);

        // Tự động ép kiểu thông minh nếu truyền vào dạng chuỗi
        let parsedValue = value;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed === 'true') {
                parsedValue = true;
            } else if (trimmed === 'false') {
                parsedValue = false;
            } else if (trimmed !== '' && !isNaN(Number(trimmed)) && !trimmed.startsWith('0x')) {
                parsedValue = Number(trimmed);
            } else if (
                (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))
            ) {
                try {
                    parsedValue = JSON.parse(trimmed);
                } catch {
                    parsedValue = value;
                }
            }
        }

        if (typeof th.setVariable === 'function') {
            await th.setVariable(fullPath, parsedValue);
        } else if (typeof th.updateVariable === 'function') {
            await th.updateVariable(fullPath, parsedValue);
        } else {
            throw new Error('TavernHelper không hỗ trợ setVariable/updateVariable API.');
        }

        const newValue = this.getLiveVariables(cleanPath);
        return { success: true, oldValue, newValue };
    }

    /**
     * Tìm các entry Worldbook liên quan đến MVU
     */
    public static async getLorebookMvuEntries(
        adapter: SillyTavernAdapter,
        char: any,
    ): Promise<{
        initvarEntry?: any;
        updateRulesEntry?: any;
        formatEntry?: any;
        varListEntry?: any;
    }> {
        const result: {
            initvarEntry?: any;
            updateRulesEntry?: any;
            formatEntry?: any;
            varListEntry?: any;
        } = {};

        // 1. Kiểm tra embedded character_book
        const embeddedEntries = char?.data?.character_book?.entries || [];
        for (const entry of embeddedEntries) {
            const comment = (entry.comment || '').toLowerCase();
            if (comment.includes('initvar') || comment.includes('khởi tạo biến') || comment.includes('[initvar]')) {
                result.initvarEntry = entry;
            } else if (comment.includes('mvu_update') || comment.includes('quy tắc cập nhật')) {
                result.updateRulesEntry = entry;
            } else if (
                comment.includes('mvu_format') ||
                comment.includes('định dạng đầu ra') ||
                comment.includes('output_format')
            ) {
                result.formatEntry = entry;
            } else if (comment.includes('biến') && comment.includes('danh sách')) {
                result.varListEntry = entry;
            }
        }

        // 2. Nếu chưa tìm thấy, tìm trong global / active lorebook của SillyTavern
        if (!result.initvarEntry || !result.updateRulesEntry) {
            try {
                const worldInfo = (window as any).world_info;
                const entries = Array.isArray(worldInfo?.entries)
                    ? worldInfo.entries
                    : worldInfo?.entries && typeof worldInfo.entries === 'object'
                      ? Object.values(worldInfo.entries)
                      : [];
                for (const entry of entries as any[]) {
                    const comment = (entry?.comment || '').toLowerCase();
                    if (!result.initvarEntry && (comment.includes('initvar') || comment.includes('khởi tạo biến'))) {
                        result.initvarEntry = entry;
                    }
                    if (
                        !result.updateRulesEntry &&
                        (comment.includes('mvu_update') || comment.includes('quy tắc cập nhật'))
                    ) {
                        result.updateRulesEntry = entry;
                    }
                }
            } catch {
                // Ignore lorebook search errors
            }
        }

        return result;
    }

    /**
     * Bóc tách cây Schema từ code Zod JavaScript (hỗ trợ nested z.object đệ quy)
     */
    public static parseZodCode(code: string): MvuVariableDescriptor[] {
        if (!code) return [];

        const match = code.match(/Schema\s*=\s*z\.object\s*\(\s*\{/i) || code.match(/z\.object\s*\(\s*\{/i);
        if (!match || match.index === undefined) return [];

        const startIdx = match.index + match[0].length - 1; // vị trí ký tự '{'
        const innerContent = this.extractMatchingBraceContent(code, startIdx);
        if (!innerContent) return [];

        return this.parseZodObjectContent(innerContent, '');
    }

    /**
     * Trích xuất nội dung bên trong cặp ngoặc nhọn { ... } tương ứng
     */
    private static extractMatchingBraceContent(str: string, openBraceIdx: number): string | null {
        let depth = 0;
        let start = -1;
        let inString: string | null = null;

        for (let i = openBraceIdx; i < str.length; i++) {
            const ch = str[i];
            const prev = i > 0 ? str[i - 1] : '';

            if (inString) {
                if (ch === inString && prev !== '\\') {
                    inString = null;
                }
                continue;
            }

            if (ch === '"' || ch === "'" || ch === '`') {
                inString = ch;
                continue;
            }

            if (ch === '{') {
                if (depth === 0) start = i + 1;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return str.substring(start, i);
                }
            }
        }
        return null;
    }

    /**
     * Parse nội dung bên trong z.object({ ... }) thành danh sách descriptor
     */
    private static parseZodObjectContent(content: string, parentPath: string): MvuVariableDescriptor[] {
        const descriptors: MvuVariableDescriptor[] = [];
        let i = 0;
        const len = content.length;

        while (i < len) {
            // Bỏ qua khoảng trắng và comment
            while (i < len && /\s/.test(content[i])) i++;
            if (i >= len) break;

            if (content.startsWith('//', i)) {
                const nextNl = content.indexOf('\n', i);
                i = nextNl === -1 ? len : nextNl + 1;
                continue;
            }
            if (content.startsWith('/*', i)) {
                const nextClose = content.indexOf('*/', i);
                i = nextClose === -1 ? len : nextClose + 2;
                continue;
            }

            // Đọc key
            let key: string;
            if (content[i] === "'" || content[i] === '"') {
                const quote = content[i++];
                const keyStart = i;
                while (i < len && content[i] !== quote) {
                    if (content[i] === '\\') i++;
                    i++;
                }
                key = content.substring(keyStart, i);
                if (i < len && content[i] === quote) i++;
            } else {
                const keyStart = i;
                while (i < len && /[a-zA-Z0-9_$\u00C0-\u024F\u1EA0-\u1EF9\u4E00-\u9FFF]/.test(content[i])) {
                    i++;
                }
                key = content.substring(keyStart, i);
            }

            if (!key) {
                i++;
                continue;
            }

            // Tìm dấu ':'
            while (i < len && content[i] !== ':') i++;
            if (i >= len) break;
            i++; // qua ':'

            // Bỏ qua khoảng trắng
            while (i < len && /\s/.test(content[i])) i++;
            if (i >= len) break;

            // Đọc biểu thức giá trị
            const exprStart = i;
            let parenDepth = 0;
            let braceDepth = 0;
            let bracketDepth = 0;
            let inStr: string | null = null;

            while (i < len) {
                const c = content[i];
                const prev = i > 0 ? content[i - 1] : '';

                if (inStr) {
                    if (c === inStr && prev !== '\\') inStr = null;
                } else if (c === '"' || c === "'" || c === '`') {
                    inStr = c;
                } else if (c === '(') {
                    parenDepth++;
                } else if (c === ')') {
                    parenDepth--;
                } else if (c === '{') {
                    braceDepth++;
                } else if (c === '}') {
                    if (braceDepth === 0) break;
                    braceDepth--;
                } else if (c === '[') {
                    bracketDepth++;
                } else if (c === ']') {
                    bracketDepth--;
                } else if (c === ',' && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
                    break;
                }
                i++;
            }

            const expr = content.substring(exprStart, i).trim();
            if (i < len && content[i] === ',') i++;

            const currentPath = parentPath ? `${parentPath}.${key}` : key;

            // Phân tích biểu thức
            let type: MvuVariableDescriptor['type'] = 'unknown';
            let children: MvuVariableDescriptor[] | undefined;

            if (expr.includes('z.object')) {
                type = 'object';
                const openIdx = expr.indexOf('{');
                if (openIdx !== -1) {
                    const inner = this.extractMatchingBraceContent(expr, openIdx);
                    if (inner) {
                        children = this.parseZodObjectContent(inner, currentPath);
                    }
                }
            } else if (expr.includes('z.number()') || expr.includes('z.coerce.number()')) {
                type = 'number';
            } else if (expr.includes('z.string()')) {
                type = 'string';
            } else if (expr.includes('z.boolean()')) {
                type = 'boolean';
            } else if (expr.includes('z.array(')) {
                type = 'array';
            } else if (expr.includes('z.record(')) {
                type = 'record';
            }

            let min: number | undefined;
            let max: number | undefined;
            const clampMatch = expr.match(/clamp\s*\([^,]+,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/i);
            if (clampMatch) {
                min = Number(clampMatch[1]);
                max = Number(clampMatch[2]);
            } else {
                const minMatch = expr.match(/\.min\s*\(\s*(-?\d+)\s*\)/);
                if (minMatch) min = Number(minMatch[1]);
                const maxMatch = expr.match(/\.max\s*\(\s*(-?\d+)\s*\)/);
                if (maxMatch) max = Number(maxMatch[1]);
            }

            let defaultValue: any;
            const prefaultMatch = expr.match(
                /\.prefault\s*\(\s*(['"][^'"]*['"]|-?\d+(?:\.\d+)?|true|false|\{\}|\[\])\s*\)/,
            );
            if (prefaultMatch) {
                try {
                    defaultValue = JSON.parse(prefaultMatch[1].replace(/'/g, '"'));
                } catch {
                    defaultValue = prefaultMatch[1];
                }
            }

            descriptors.push({
                path: currentPath,
                name: key,
                type,
                min,
                max,
                defaultValue,
                children,
            });
        }

        return descriptors;
    }

    /**
     * Báo cáo toàn diện hệ thống MVU của nhân vật hiện hành
     */
    public static async inspectMvu(adapter: SillyTavernAdapter, filterPath?: string): Promise<MvuInspectionResult> {
        const liveChar = this.getActiveCharacter();
        const charName = liveChar?.name || 'Unknown Character';

        if (!liveChar) {
            return {
                hasMvu: false,
                characterName: charName,
                parsedSchema: [],
                liveVariables: null,
                initvarVariables: null,
                updateRulesSummary: '',
                healthWarnings: ['Không tìm thấy nhân vật nào đang được chọn.'],
            };
        }

        const isMvu = this.hasMvu(liveChar);
        const zodScript = this.getZodScript(liveChar);
        const liveVars = this.getLiveVariables(filterPath);
        const lorebookMvu = await this.getLorebookMvuEntries(adapter, liveChar);

        let initvarParsed: any = null;
        if (lorebookMvu.initvarEntry?.content) {
            try {
                initvarParsed = YAML.parse(lorebookMvu.initvarEntry.content);
            } catch (e) {
                console.warn('[MvuManager] Failed to parse YAML of initvar:', e);
            }
        }

        const warnings: string[] = [];
        const inconsistencies: string[] = [];
        if (!isMvu) {
            warnings.push('Nhân vật này chưa kích hoạt hệ thống MVU.');
        } else {
            if (!zodScript) {
                warnings.push('Có dấu hiệu MVU nhưng không tìm thấy kịch bản Zod Schema trong tavern_helper.scripts.');
            }
            if (!lorebookMvu.initvarEntry) {
                warnings.push('Thiếu mục [InitVar] trong Worldbook để khởi tạo giá trị ban đầu.');
            }
            if (!lorebookMvu.updateRulesEntry) {
                warnings.push('Thiếu mục [mvu_update] trong Worldbook để hướng dẫn AI quy tắc cập nhật biến.');
            }
            if (!liveVars) {
                warnings.push('TavernHelper chưa trả về dữ liệu stat_data (có thể cuộc hội thoại chưa bắt đầu).');
            }
        }

        const parsedSchema = zodScript ? this.parseZodCode(zodScript.content) : [];

        // Kiểm tra tính nhất quán giữa Schema và InitVar
        if (parsedSchema.length > 0 && initvarParsed) {
            for (const desc of parsedSchema) {
                const parts = desc.path.split('.');
                let curr = initvarParsed;
                let found = true;
                for (const p of parts) {
                    if (curr && typeof curr === 'object' && p in curr) {
                        curr = curr[p];
                    } else {
                        found = false;
                        break;
                    }
                }
                if (!found && desc.type !== 'object') {
                    inconsistencies.push(
                        `Biến "${desc.path}" có trong Zod Schema nhưng thiếu trong Worldbook [InitVar].`,
                    );
                }
            }
        }

        return {
            hasMvu: isMvu,
            characterName: charName,
            zodScriptName: zodScript?.name,
            zodSchemaCode: zodScript?.content,
            parsedSchema,
            liveVariables: liveVars,
            initvarVariables: initvarParsed,
            updateRulesSummary: lorebookMvu.updateRulesEntry?.content || '',
            healthWarnings: warnings,
            inconsistencies,
        };
    }

    /**
     * Lan truyền thay đổi biến (Change Propagation Matrix)
     * Đồng bộ sửa: 1. Zod Script -> 2. [InitVar] YAML -> 3. [mvu_update] YAML -> 4. Ghi đè vào ST backend
     */
    public static async mutateMvuSchema(
        adapter: SillyTavernAdapter,
        options: MvuMutationOptions,
    ): Promise<{
        success: boolean;
        modifiedFiles: string[];
        details: string;
    }> {
        const liveChar = this.getActiveCharacter();
        if (!liveChar) throw new Error('Không có nhân vật nào đang hoạt động.');

        const zodScriptInfo = this.getZodScript(liveChar);
        if (!zodScriptInfo) throw new Error('Không tìm thấy kịch bản Zod Schema trong nhân vật.');

        const lorebookMvu = await this.getLorebookMvuEntries(adapter, liveChar);
        const modifiedFiles: string[] = [];

        // 1. Cập nhật Zod Script
        let zodCode = zodScriptInfo.content;
        const varPath = options.variablePath.replace(/^stat_data\./, '');
        const parts = varPath.split('.');
        const leafName = parts[parts.length - 1];

        const buildZodLine = () => {
            let zodLine = `z.string()`;
            if (
                options.type === 'number' ||
                (options.type === undefined && (options.min !== undefined || options.max !== undefined))
            ) {
                if (options.min !== undefined && options.max !== undefined) {
                    zodLine = `z.coerce.number().transform(v => _.clamp(v, ${options.min}, ${options.max}))`;
                } else {
                    zodLine = `z.coerce.number()`;
                }
            } else if (options.type === 'boolean') {
                zodLine = `z.boolean()`;
            } else if (options.type === 'array') {
                zodLine = `z.array(z.string())`;
            } else if (options.type === 'object') {
                zodLine = `z.record(z.string(), z.any())`;
            }

            if (options.defaultValue !== undefined) {
                zodLine += `.prefault(${JSON.stringify(options.defaultValue)})`;
            }
            return zodLine;
        };

        if (options.action === 'add') {
            const zodLine = buildZodLine();

            // Nếu là biến lồng nhau, thử chèn vào object cha
            let inserted = false;
            if (parts.length > 1) {
                const parentName = parts[parts.length - 2];
                const parentPattern = new RegExp(`(['"])?${parentName}\\1?\\s*:\\s*z\\.object\\s*\\(\\s*\\{`, 'i');
                if (parentPattern.test(zodCode)) {
                    zodCode = zodCode.replace(parentPattern, `$&\n    '${leafName}': ${zodLine},`);
                    inserted = true;
                }
            }

            if (!inserted) {
                const insertPattern = /(export\s+const\s+Schema\s*=\s*z\.object\s*\(\s*\{)/i;
                if (insertPattern.test(zodCode)) {
                    zodCode = zodCode.replace(insertPattern, `$1\n  '${leafName}': ${zodLine},`);
                } else {
                    const objMatch = zodCode.match(/(z\.object\s*\(\s*\{)/);
                    if (objMatch) {
                        zodCode = zodCode.replace(objMatch[1], `${objMatch[1]}\n  '${leafName}': ${zodLine},`);
                    }
                }
            }
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        } else if (options.action === 'modify') {
            const zodLine = buildZodLine();
            const modifyRegex = new RegExp(`(['"])?${leafName}\\1?\\s*:\\s*z\\.[^,\\n]+`, 'g');
            if (modifyRegex.test(zodCode)) {
                zodCode = zodCode.replace(modifyRegex, `'${leafName}': ${zodLine}`);
                modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
            }
        } else if (options.action === 'rename') {
            if (!options.newName) {
                throw new Error('Cần cung cấp "newName" khi thực hiện đổi tên biến.');
            }
            const renameRegex = new RegExp(`(['"])?${leafName}\\1?\\s*:`, 'g');
            zodCode = zodCode.replace(renameRegex, `'${options.newName}':`);
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        } else if (options.action === 'delete') {
            const removeRegex = new RegExp(`['"]?${leafName}['"]?\\s*:\\s*z\\.[^,\\n]+,?\\n?`, 'g');
            zodCode = zodCode.replace(removeRegex, '');
            modifiedFiles.push(`TavernHelper Script: ${zodScriptInfo.name}`);
        }

        // Cập nhật script trong bộ nhớ của nhân vật
        liveChar.data.extensions.tavern_helper.scripts[zodScriptInfo.key].content = zodCode;

        // 2. Cập nhật [InitVar] YAML
        if (lorebookMvu.initvarEntry?.content) {
            try {
                const yamlData = YAML.parse(lorebookMvu.initvarEntry.content) || {};
                if (options.action === 'add' || options.action === 'modify') {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!curr[parts[i]]) curr[parts[i]] = {};
                        curr = curr[parts[i]];
                    }
                    curr[leafName] =
                        options.defaultValue !== undefined ? options.defaultValue : options.type === 'number' ? 0 : '';
                } else if (options.action === 'rename' && options.newName) {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (curr[parts[i]]) curr = curr[parts[i]];
                    }
                    if (leafName in curr) {
                        curr[options.newName] = curr[leafName];
                        delete curr[leafName];
                    }
                } else if (options.action === 'delete') {
                    let curr = yamlData;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (curr[parts[i]]) curr = curr[parts[i]];
                    }
                    delete curr[leafName];
                }
                lorebookMvu.initvarEntry.content = YAML.stringify(yamlData);
                modifiedFiles.push(`Worldbook: ${lorebookMvu.initvarEntry.comment || '[InitVar]'}`);
            } catch (e) {
                console.warn('[MvuManager] Error modifying initvar YAML:', e);
            }
        }

        // 3. Cập nhật [mvu_update] Quy tắc
        if (lorebookMvu.updateRulesEntry?.content) {
            try {
                const ruleData = YAML.parse(lorebookMvu.updateRulesEntry.content) || {};
                const keys = Object.keys(ruleData);
                let rootKey: string | undefined = keys.find((k) => k === 'Quy_tắc_cập_nhật' || k === 'Update_Rules');
                if (!rootKey && keys.length > 0) {
                    rootKey = keys[0];
                }
                if (!rootKey) {
                    rootKey = 'Quy_tắc_cập_nhật';
                    ruleData[rootKey] = {};
                }

                if (options.action === 'add' || options.action === 'modify') {
                    if (options.ruleCheck) {
                        ruleData[rootKey][varPath] = {
                            type: options.type || 'string',
                            range:
                                options.min !== undefined && options.max !== undefined
                                    ? `${options.min}~${options.max}`
                                    : undefined,
                            check: [options.ruleCheck],
                        };
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                } else if (options.action === 'rename' && options.newName) {
                    const newPath = varPath.replace(new RegExp(`${leafName}$`), options.newName);
                    if (ruleData[rootKey][varPath]) {
                        ruleData[rootKey][newPath] = ruleData[rootKey][varPath];
                        delete ruleData[rootKey][varPath];
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                } else if (options.action === 'delete') {
                    if (ruleData[rootKey][varPath]) {
                        delete ruleData[rootKey][varPath];
                        modifiedFiles.push(`Worldbook: ${lorebookMvu.updateRulesEntry.comment || '[mvu_update]'}`);
                    }
                }
                lorebookMvu.updateRulesEntry.content = YAML.stringify(ruleData);
            } catch (e) {
                console.warn('[MvuManager] Error modifying update rules:', e);
            }
        }

        // 4. Lưu lại toàn bộ vào SillyTavern Backend qua merge-attributes
        const mergePayload = {
            avatar_url: liveChar.avatar,
            ch_name: liveChar.name,
            data: {
                extensions: liveChar.data.extensions,
                character_book: liveChar.data.character_book,
            },
        };

        const ctx = this.getContext();
        const res = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(mergePayload),
        });

        if (!res.ok) {
            throw new Error(`Lỗi khi lưu vào SillyTavern Backend: HTTP ${res.status}`);
        }

        return {
            success: true,
            modifiedFiles,
            details: `Đã thực hiện hành động "${options.action}" trên biến "${varPath}" đồng bộ trên toàn bộ chuỗi mắt xích Zod và Worldbook.`,
        };
    }

    /**
     * Chuyển đổi mảng biến linh hoạt thành cây phân cấp lồng nhau
     */
    private static buildVariableTree(variables: MvuVariableInput[]): any {
        const root: any = {};
        for (const v of variables) {
            const cleanPath = v.path.replace(/^stat_data\./, '').trim();
            if (!cleanPath) continue;
            const parts = cleanPath.split('.');
            let curr = root;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!curr[part] || typeof curr[part] !== 'object' || curr[part]._isLeaf) {
                    curr[part] = { _isNode: true, _children: {} };
                }
                curr = curr[part]._children;
            }
            const leafName = parts[parts.length - 1];
            curr[leafName] = {
                _isLeaf: true,
                def: v,
            };
        }
        return root;
    }

    /**
     * Sinh mã Zod 4 Schema đệ quy theo cây biến
     */
    private static renderTreeToZod(tree: any, indentLevel = 1): string {
        const indent = '  '.repeat(indentLevel);
        const lines: string[] = [];

        for (const key of Object.keys(tree)) {
            const item = tree[key];
            if (item._isLeaf) {
                const def: MvuVariableInput = item.def;
                let zodTypeStr = 'z.string()';

                if (def.type === 'number') {
                    if (def.min !== undefined && def.max !== undefined) {
                        zodTypeStr = `z.coerce.number().transform(v => _.clamp(v, ${def.min}, ${def.max}))`;
                    } else if (def.min !== undefined) {
                        zodTypeStr = `z.coerce.number().min(${def.min})`;
                    } else if (def.max !== undefined) {
                        zodTypeStr = `z.coerce.number().max(${def.max})`;
                    } else {
                        zodTypeStr = `z.coerce.number()`;
                    }
                } else if (def.type === 'boolean') {
                    zodTypeStr = `z.boolean()`;
                } else if (def.type === 'array') {
                    zodTypeStr = `z.array(z.string())`;
                } else if (def.type === 'object') {
                    zodTypeStr = `z.record(z.string(), z.any())`;
                }

                if (def.defaultValue !== undefined) {
                    zodTypeStr += `.prefault(${JSON.stringify(def.defaultValue)})`;
                } else {
                    if (def.type === 'number') {
                        const fallbackNum = def.min !== undefined ? def.min : 0;
                        zodTypeStr += `.prefault(${fallbackNum})`;
                    } else if (def.type === 'boolean') {
                        zodTypeStr += `.prefault(false)`;
                    } else if (def.type === 'array') {
                        zodTypeStr += `.prefault([])`;
                    } else if (def.type === 'object') {
                        zodTypeStr += `.prefault({})`;
                    } else {
                        zodTypeStr += `.prefault('')`;
                    }
                }

                lines.push(`${indent}'${key}': ${zodTypeStr},`);
            } else if (item._isNode) {
                const inner = this.renderTreeToZod(item._children, indentLevel + 1);
                lines.push(`${indent}'${key}': z.object({\n${inner}\n${indent}}),`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Sinh cấu trúc dữ liệu khởi tạo InitVar (JavaScript Object)
     */
    private static renderTreeToInitvar(tree: any): any {
        const result: any = {};
        for (const key of Object.keys(tree)) {
            const item = tree[key];
            if (item._isLeaf) {
                const def: MvuVariableInput = item.def;
                if (def.defaultValue !== undefined) {
                    result[key] = def.defaultValue;
                } else if (def.type === 'number') {
                    result[key] = def.min !== undefined ? def.min : 0;
                } else if (def.type === 'boolean') {
                    result[key] = false;
                } else if (def.type === 'array') {
                    result[key] = [];
                } else if (def.type === 'object') {
                    result[key] = {};
                } else {
                    result[key] = '';
                }
            } else if (item._isNode) {
                result[key] = this.renderTreeToInitvar(item._children);
            }
        }
        return result;
    }

    /**
     * Sinh cấu trúc Quy tắc cập nhật biến ([mvu_update])
     */
    private static renderRulesFromVariables(variables: MvuVariableInput[]): any {
        const rules: Record<string, any> = {};
        for (const v of variables) {
            const cleanPath = v.path.replace(/^stat_data\./, '').trim();
            if (!cleanPath) continue;

            const parts = cleanPath.split('.');
            const leafName = parts[parts.length - 1];
            if (leafName.startsWith('_') || leafName.startsWith('$')) continue;

            const ruleObj: any = {
                type: v.type,
            };
            if (v.min !== undefined && v.max !== undefined) {
                ruleObj.range = `${v.min}~${v.max}`;
            } else if (v.min !== undefined) {
                ruleObj.range = `>=${v.min}`;
            } else if (v.max !== undefined) {
                ruleObj.range = `<=${v.max}`;
            }
            if (v.ruleCheck) {
                ruleObj.check = [v.ruleCheck];
            } else if (v.description) {
                ruleObj.check = [v.description];
            }

            rules[cleanPath] = ruleObj;
        }
        return { Quy_tắc_cập_nhật: rules };
    }

    /**
     * Nạp toàn bộ hạ tầng kỹ thuật MVU (Substrate Platform) vào một Card
     * Hoàn toàn linh hoạt, không giới hạn, không hardcode bất kỳ template nào.
     */
    public static async scaffoldMvuCard(
        adapter: SillyTavernAdapter,
        options: MvuScaffoldOptions = {},
    ): Promise<{
        success: boolean;
        injectedScripts: string[];
        injectedRegexes: string[];
        injectedLorebookEntries: string[];
    }> {
        const liveChar = this.getActiveCharacter();
        if (!liveChar) throw new Error('Không có nhân vật nào đang hoạt động để nạp MVU.');

        if (!liveChar.data) liveChar.data = {};
        if (!liveChar.data.extensions) liveChar.data.extensions = {};
        if (!liveChar.data.extensions.tavern_helper) liveChar.data.extensions.tavern_helper = { scripts: {} };
        if (!liveChar.data.extensions.regex_scripts) liveChar.data.extensions.regex_scripts = [];
        if (!liveChar.data.character_book) liveChar.data.character_book = { entries: [] };

        let zodCode = '';
        let initvarData: any = {};
        let updateRulesData: any = { Quy_tắc_cập_nhật: {} };

        // 1. Phân giải Schema & Dữ liệu
        if (options.customZodSchema && options.customZodSchema.trim()) {
            zodCode = options.customZodSchema.trim();
            if (!zodCode.includes('registerMvuSchema')) {
                if (!zodCode.includes('export const Schema')) {
                    zodCode = `export const Schema = z.object({\n${zodCode}\n});`;
                }
                zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\n${zodCode}\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            }
        }

        if (options.customInitvarYaml) {
            if (typeof options.customInitvarYaml === 'string') {
                try {
                    initvarData = YAML.parse(options.customInitvarYaml);
                } catch {
                    initvarData = { raw: options.customInitvarYaml };
                }
            } else {
                initvarData = options.customInitvarYaml;
            }
        }

        if (options.customRulesYaml) {
            if (typeof options.customRulesYaml === 'string') {
                try {
                    updateRulesData = YAML.parse(options.customRulesYaml);
                } catch {
                    updateRulesData = { Quy_tắc_cập_nhật: { raw: options.customRulesYaml } };
                }
            } else {
                updateRulesData = options.customRulesYaml;
            }
        }

        // Nếu có danh sách biến cụ thể
        if (options.variables && options.variables.length > 0) {
            const tree = this.buildVariableTree(options.variables);
            if (!zodCode) {
                const schemaInner = this.renderTreeToZod(tree, 1);
                zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\nexport const Schema = z.object({\n${schemaInner}\n});\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            }
            if (!options.customInitvarYaml) {
                initvarData = this.renderTreeToInitvar(tree);
            }
            if (!options.customRulesYaml) {
                updateRulesData = this.renderRulesFromVariables(options.variables);
            }
        } else if (!zodCode) {
            // Không có biến nào truyền vào và không có custom code: Cung cấp sàn trống linh hoạt sẵn sàng mở rộng
            zodCode = `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';\n\nexport const Schema = z.object({\n  'Trạng_thái': z.record(z.string(), z.any()).prefault({}),\n});\n\n$(() => {\n  registerMvuSchema(Schema);\n});\n`;
            if (!options.customInitvarYaml) {
                initvarData = { Trạng_thái: {} };
            }
        }

        // 2. Tiêm Scripts Tửu quán trợ thủ (TavernHelper)
        const mvuBundleCode = `import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate/artifact/bundle.js';`;

        liveChar.data.extensions.tavern_helper.scripts['MVU'] = {
            type: 'script',
            name: 'MVU',
            content: mvuBundleCode,
            enabled: true,
            id: 'mvu-core-' + Date.now(),
        };

        liveChar.data.extensions.tavern_helper.scripts['Cấu trúc biến'] = {
            type: 'script',
            name: 'Cấu trúc biến',
            content: zodCode,
            enabled: true,
            id: 'zod-schema-' + Date.now(),
        };

        // 3. Tiêm Regex Scripts chuẩn (Tiếng Việt / English)
        const regexes = [
            {
                scriptName: '[MVU] Ẩn cập nhật biến khỏi AI',
                findRegex: '/<(update(?:variable)?)>(?:(?!.*<\\/\\1>)(?:(?!<\\1>).)*$|(?:(?!<\\1>).)*<\\/\\1?>)/gsi',
                replaceString: '',
                placement: [1, 2],
                promptOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Làm đẹp cập nhật biến',
                findRegex: '/<(update(?:variable)?)>\\s*((?:(?!<\\1>).)*)\\s*<\\/\\1>/gsi',
                replaceString:
                    '<div class="mvu-update-box" style="border:1px solid #4a5568;padding:8px;border-radius:6px;margin:8px 0;background:rgba(0,0,0,0.2);"><strong>📊 Cập nhật trạng thái:</strong><pre style="font-size:12px;margin:4px 0;">$2</pre></div>',
                placement: [1, 2],
                markdownOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Giao diện thanh trạng thái',
                findRegex: '<StatusPlaceHolderImpl/>',
                replaceString:
                    '<div class="mvu-status-bar" style="padding:6px;border-bottom:1px solid rgba(255,255,255,0.1);margin-bottom:8px;font-size:12px;">{{format_message_variable::stat_data}}</div>',
                placement: [2],
                markdownOnly: true,
                disabled: false,
            },
            {
                scriptName: '[MVU] Ẩn thanh trạng thái khỏi AI',
                findRegex: '<StatusPlaceHolderImpl/>',
                replaceString: '',
                placement: [2],
                promptOnly: true,
                disabled: false,
            },
        ];

        const existingRegexes = liveChar.data.extensions.regex_scripts || [];
        for (const reg of regexes) {
            const isPresent = existingRegexes.some((r: any) => {
                if (r.scriptName === reg.scriptName) return true;
                if (
                    r.findRegex === reg.findRegex &&
                    Boolean(r.promptOnly) === Boolean(reg.promptOnly) &&
                    Boolean(r.markdownOnly) === Boolean(reg.markdownOnly)
                ) {
                    return true;
                }
                return false;
            });
            if (!isPresent) {
                existingRegexes.push(reg);
            }
        }

        // 4. Tiêm Worldbook Entries chuẩn
        const outputFormatContent = `---
<update_variable_rules>
rule:
  - you must output the update analysis and the actual update commands at once in the end of the next reply
  - the update commands must strictly follow the **JSON Patch (RFC 6902)** standard, but can only use the following operations: replace (replace existing paths), delta (numeric increments), insert (new keys into object or array), remove; that is, the output must be a valid JSON array containing operation objects
format: |-
  <UpdateVariable>
  <Analysis>$(IN ENGLISH, no more than 80 words)
  - \${calculate time passed: ...}
  - \${decide whether dramatic updates are allowed as it's in a special case or the time passed is more than usual: yes/no}
  - \${analyze every variable based on its corresponding \`check\`, according only to current reply instead of previous plots: ...}
  </Analysis>
  <JSONPatch>
  [
    { "op": "replace", "path": "\${/path/to/variable}", "value": \${new_value} },
    { "op": "delta", "path": "\${/path/to/number}", "value": \${delta_value} },
    { "op": "insert", "path": "\${/path/to/object/newKey}", "value": \${content} },
    { "op": "remove", "path": "\${/path/to/array/0}" }
  ]
  </JSONPatch>
  </UpdateVariable>
</update_variable_rules>`;

        const newEntries = [
            {
                comment: '[InitVar] Khởi tạo biến cấm bật',
                content: YAML.stringify(initvarData),
                enabled: false, // Bắt buộc vô hiệu hóa: MVU chỉ đọc các mục initvar bị vô hiệu hóa để không tốn token prompt
                constant: false,
                selective: false,
                keys: [],
                position: 'before_char',
                insertion_order: 100,
            },
            {
                comment: '[mvu_update] Quy tắc cập nhật biến',
                content: YAML.stringify(updateRulesData),
                enabled: true,
                constant: true,
                selective: false,
                keys: [],
                position: 'before_char',
                insertion_order: 101,
            },
            {
                comment: '[mvu_update] Định dạng đầu ra của biến',
                content: outputFormatContent,
                enabled: true,
                constant: true,
                selective: false,
                keys: [],
                position: 'before_char',
                insertion_order: 102,
            },
            {
                comment: 'Danh sách biến',
                content: `<status_current_variable>\n{{format_message_variable::stat_data}}\n</status_current_variable>`,
                enabled: true,
                constant: true,
                selective: false,
                keys: [],
                position: 'before_char',
                insertion_order: 103,
            },
        ];

        const existingComments = new Set((liveChar.data.character_book.entries || []).map((e: any) => e.comment));
        for (const ne of newEntries) {
            if (!existingComments.has(ne.comment)) {
                liveChar.data.character_book.entries.push(ne);
            } else {
                const found = liveChar.data.character_book.entries.find((e: any) => e.comment === ne.comment);
                if (found) {
                    found.content = ne.content;
                }
            }
        }

        // 5. Lưu lại vào SillyTavern Backend
        const ctx = this.getContext();
        const res = await fetch('/api/characters/merge-attributes', {
            method: 'POST',
            headers: { ...ctx.getRequestHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
                avatar_url: liveChar.avatar,
                ch_name: liveChar.name,
                data: {
                    extensions: liveChar.data.extensions,
                    character_book: liveChar.data.character_book,
                },
            }),
        });

        if (!res.ok) {
            throw new Error(`Lưu MVU vào SillyTavern thất bại: HTTP ${res.status}`);
        }

        return {
            success: true,
            injectedScripts: ['MVU', 'Cấu trúc biến'],
            injectedRegexes: [
                '[MVU] Ẩn cập nhật biến khỏi AI',
                '[MVU] Làm đẹp cập nhật biến',
                '[MVU] Giao diện thanh trạng thái',
                '[MVU] Ẩn thanh trạng thái khỏi AI',
            ],
            injectedLorebookEntries: [
                '[InitVar] Khởi tạo biến cấm bật',
                '[mvu_update] Quy tắc cập nhật biến',
                '[mvu_update] Định dạng đầu ra của biến',
                'Danh sách biến',
            ],
        };
    }
}
