import { ToolRegistry } from './tool_registry';
import { SillyTavernAdapter } from '../adapters/st_adapter';

export class KaizToolChecker {
    constructor(
        private registry: ToolRegistry,
        private adapter: SillyTavernAdapter,
    ) {}

    public async runTests(updateUI: (toolName: string, status: 'testing' | 'ok' | 'error', message?: string) => void) {
        const tools = this.registry.getAllTools();

        for (const tool of tools) {
            const name = tool.schema.name;
            updateUI(name, 'testing');

            try {
                let msg = 'Dependencies verified';

                if (tool.validate) {
                    await tool.validate({ adapter: this.adapter });
                } else {
                    msg = 'Tool registered (no specific check)';
                }

                updateUI(name, 'ok', msg);
            } catch (e: any) {
                console.error(`[KaizToolChecker] Tool ${name} failed check:`, e);
                updateUI(name, 'error', e.message || String(e));
            }
        }
    }
}
