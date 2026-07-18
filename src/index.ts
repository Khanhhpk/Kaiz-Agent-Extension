import { AgentLoop } from "./core/loop";
import { ToolRegistry } from "./core/tool_registry";
import { SillyTavernAdapter } from "./adapters/st_adapter";

console.log("[KaizAgent] Extension loaded into browser.");

declare const jQuery: any;

jQuery(async () => {
    console.log("[KaizAgent] Initializing extension core...");
    
    const adapter = new SillyTavernAdapter();
    const registry = new ToolRegistry();
    const loop = new AgentLoop(adapter, registry);

    console.log("[KaizAgent] Core initialized successfully.");
});

