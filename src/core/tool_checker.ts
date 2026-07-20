import { ToolRegistry } from './tool_registry';
import { SillyTavernAdapter } from '../adapters/st_adapter';

export class KaizToolChecker {
    constructor(private registry: ToolRegistry, private adapter: SillyTavernAdapter) {}

    public async runTests(updateUI: (toolName: string, status: 'testing' | 'ok' | 'error', message?: string) => void) {
        const tools = this.registry.getAllTools();
        
        for (const tool of tools) {
            const name = tool.schema.name;
            updateUI(name, 'testing');
            
            try {
                let ok = true;
                let msg = 'Dependencies verified';

                switch (name) {
                    case 'delete_last_message':
                        if (!this.adapter.hasFeature('deleteLastMessage')) {
                            throw new Error('ST API deleteLastMessage is missing');
                        }
                        break;
                    case 'get_char_info':
                        if (!this.adapter.hasFeature('characters')) {
                            throw new Error('ST Context characters object is missing');
                        }
                        break;
                    case 'get_chat_history':
                        if (!this.adapter.hasFeature('chat')) {
                            throw new Error('ST Context chat array is missing');
                        }
                        break;
                    case 'send_system_message':
                        if (!this.adapter.hasFeature('sendSystemMessage')) {
                            throw new Error('ST API sendSystemMessage is missing');
                        }
                        break;
                    case 'get_user_persona':
                    case 'edit_user_persona':
                        if (!this.adapter.hasFeature('substituteParams')) {
                            throw new Error('ST API substituteParams is missing');
                        }
                        break;
                    case 'get_lorebook_info':
                    case 'manage_lorebook_entry':
                    case 'manage_worldbook':
                        try {
                            const ST_WorldInfo = await new Function('return import("/scripts/world-info.js")')();
                            if (!ST_WorldInfo) throw new Error('Module loaded but empty');
                        } catch (e: any) {
                            throw new Error('Failed to load /scripts/world-info.js - ' + e.message);
                        }
                        break;
                    default:
                        msg = 'Tool registered (no specific check)';
                        break;
                }

                updateUI(name, 'ok', msg);
            } catch (e: any) {
                console.error(`[KaizToolChecker] Tool ${name} failed check:`, e);
                updateUI(name, 'error', e.message || String(e));
            }
            
            // Giả lập delay nhỏ cho UI có thời gian cập nhật mượt mà
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
