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
                let allPassed = true;
                let missingFeatures: string[] = [];

                if (tool.requiredFeatures && tool.requiredFeatures.length > 0) {
                    for (const feature of tool.requiredFeatures) {
                        if (!this.adapter.hasFeature(feature)) {
                            allPassed = false;
                            missingFeatures.push(feature);
                        }
                    }
                }

                if (allPassed) {
                    updateUI(name, 'ok', '[DRY RUN] Passed (ST features found)');
                } else {
                    updateUI(name, 'error', `[DRY RUN] Missing ST API features: ${missingFeatures.join(', ')}`);
                }
            } catch (e: any) {
                console.error(`[KaizDebugger] Tool ${name} threw an exception:`, e);
                updateUI(name, 'error', e.message || String(e));
            }
            
            // Giả lập delay nhỏ cho UI có thời gian cập nhật mượt mà
            await new Promise(r => setTimeout(r, 200));
        }
    }
}
