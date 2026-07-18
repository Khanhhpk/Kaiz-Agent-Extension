/**
 * Tool Registry
 * Quản lý và đăng ký các công cụ (Tools) cho Agent, dựa trên kiến trúc của LumiAgent.
 */

export interface ToolSchema {
    name: string;
    description: string;
    parameters: any;
}

export class ToolRegistry {
    private tools: Map<string, any> = new Map();

    public registerTool(schema: ToolSchema, executeFn: Function) {
        this.tools.set(schema.name, { schema, executeFn });
        console.log(`[ToolRegistry] Registered tool: ${schema.name}`);
    }

    public getTool(name: string) {
        return this.tools.get(name);
    }
    
    public getAllSchemas(): ToolSchema[] {
        return Array.from(this.tools.values()).map(t => t.schema);
    }
}
