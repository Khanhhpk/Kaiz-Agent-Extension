/**
 * Tool Registry
 * Quản lý và đăng ký các công cụ (Tools) cho Agent.
 * Lấy cảm hứng từ kiến trúc Tool của LumiAgent nhưng tối giản hoá (không dùng Zod) để phù hợp extension Client-side.
 */

export interface ToolParameterProperty {
    type: string;
    description: string;
    enum?: string[];
    items?: { type: string };
}

export interface ToolParameters {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
}

export interface ToolSchema {
    name: string;
    description: string;
    parameters: ToolParameters;
}

export interface ToolResult {
    content: string;
    isError?: boolean;
}

export interface ITool {
    schema: ToolSchema;
    validate?: (context?: any) => Promise<void> | void;
    execute: (args: Record<string, any>, context?: any) => Promise<ToolResult>;
}

export class ToolRegistry {
    private tools: Map<string, ITool> = new Map();

    /**
     * Đăng ký một tool mới
     */
    public registerTool(tool: ITool) {
        if (this.tools.has(tool.schema.name)) {
            console.warn(`[ToolRegistry] Tool ${tool.schema.name} already registered. Overwriting.`);
        }
        this.tools.set(tool.schema.name, tool);
        console.log(`[ToolRegistry] Registered tool: ${tool.schema.name}`);
    }

    /**
     * Lấy schema của tất cả tools để gửi lên LLM
     */
    public getAllSchemas(): ToolSchema[] {
        return Array.from(this.tools.values()).map((t) => t.schema);
    }

    /**
     * Lấy danh sách tất cả các tools (phục vụ Tool Check)
     * @returns Array chứa thông tin các tool
     */
    public getAllTools(): ITool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Thực thi một tool dựa trên tên và tham số
     */
    public async executeTool(name: string, args: Record<string, any>, context?: any): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return {
                content: `Error: Tool '${name}' not found.`,
                isError: true,
            };
        }

        try {
            // Validate basic required fields
            if (tool.schema.parameters.required) {
                for (const req of tool.schema.parameters.required) {
                    if (args[req] === undefined) {
                        return {
                            content: `Error: Missing required parameter '${req}' for tool '${name}'.`,
                            isError: true,
                        };
                    }
                }
            }

            console.log(`[ToolRegistry] Executing '${name}' with args:`, args);
            return await tool.execute(args, context);
        } catch (e: any) {
            console.error(`[ToolRegistry] Error executing tool '${name}':`, e);
            return {
                content: `Error executing tool '${name}': ${e.message || String(e)}`,
                isError: true,
            };
        }
    }
}
