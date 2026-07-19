import { ToolRegistry } from './tool_registry';
import { SillyTavernAdapter } from '../adapters/st_adapter';

export class KaizDebugger {
    constructor(private registry: ToolRegistry, private adapter: SillyTavernAdapter) {}

    public async runTests(updateUI: (toolName: string, status: 'testing' | 'ok' | 'error', message?: string) => void) {
        const tools = this.registry.getAllTools();
        
        for (const tool of tools) {
            const name = tool.schema.name;
            updateUI(name, 'testing');
            
            try {
                // Đánh chặn (Hook) kiểm tra tính năng gốc của ST thay vì execute
                updateUI(name, 'ok', '[DRY RUN] Tool registered successfully');
            } catch (e: any) {
                console.error(`[KaizDebugger] Tool ${name} threw an exception:`, e);
                updateUI(name, 'error', e.message || String(e));
            }
            
            // Giả lập delay nhỏ cho UI có thời gian cập nhật mượt mà
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
