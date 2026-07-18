(function () {
    'use strict';

    /**
     * Tool Registry
     * Quản lý và đăng ký các công cụ (Tools) cho Agent.
     * Lấy cảm hứng từ kiến trúc Tool của LumiAgent nhưng tối giản hoá (không dùng Zod) để phù hợp extension Client-side.
     */
    class ToolRegistry {
        tools = new Map();
        /**
         * Đăng ký một tool mới
         */
        registerTool(tool) {
            if (this.tools.has(tool.schema.name)) {
                console.warn(`[ToolRegistry] Tool ${tool.schema.name} already registered. Overwriting.`);
            }
            this.tools.set(tool.schema.name, tool);
            console.log(`[ToolRegistry] Registered tool: ${tool.schema.name}`);
        }
        /**
         * Lấy schema của tất cả tools để gửi lên LLM
         */
        getAllSchemas() {
            return Array.from(this.tools.values()).map(t => t.schema);
        }
        /**
         * Thực thi một tool dựa trên tên và tham số
         */
        async executeTool(name, args, context) {
            const tool = this.tools.get(name);
            if (!tool) {
                return {
                    content: `Error: Tool '${name}' not found.`,
                    isError: true
                };
            }
            try {
                // Validate basic required fields
                if (tool.schema.parameters.required) {
                    for (const req of tool.schema.parameters.required) {
                        if (args[req] === undefined) {
                            return {
                                content: `Error: Missing required parameter '${req}' for tool '${name}'.`,
                                isError: true
                            };
                        }
                    }
                }
                console.log(`[ToolRegistry] Executing '${name}' with args:`, args);
                return await tool.execute(args, context);
            }
            catch (e) {
                console.error(`[ToolRegistry] Error executing tool '${name}':`, e);
                return {
                    content: `Error executing tool '${name}': ${e.message || String(e)}`,
                    isError: true
                };
            }
        }
    }

    const getCharInfoTool = {
        schema: {
            name: 'get_char_info',
            description: 'Lấy thông tin chi tiết về thẻ nhân vật hiện tại đang chat (tên, tính cách, bối cảnh, v.v.). Dùng khi cần hiểu rõ về nhân vật bạn đang đóng vai hoặc nói chuyện cùng.',
            parameters: {
                type: 'object',
                properties: {} // Không yêu cầu tham số
            }
        },
        execute: async (args, context) => {
            if (!context || !context.adapter) {
                return {
                    content: 'Error: Adapter not provided in context.',
                    isError: true
                };
            }
            const charInfo = context.adapter.getCharInfo();
            if (!charInfo) {
                return {
                    content: 'Error: No active character found. Are you in a group chat without a selected character, or not in a chat at all?',
                    isError: true
                };
            }
            // Trả về dữ liệu nhân vật dưới dạng JSON string (LLM sẽ parse được)
            return {
                content: JSON.stringify(charInfo, null, 2)
            };
        }
    };

    /**
     * Đăng ký tất cả các tools mặc định vào Registry
     */
    function registerDefaultTools(registry) {
        registry.registerTool(getCharInfoTool);
        // Sau này có thể thêm registerTool(searchChatTool), v.v.
    }

    console.log("[KaizAgent] Extension loaded into browser.");
    jQuery(async () => {
        console.log("[KaizAgent] Initializing extension core...");
        const registry = new ToolRegistry();
        // Đăng ký các công cụ
        registerDefaultTools(registry);
        console.log("[KaizAgent] Core initialized successfully.");
    });

})();
