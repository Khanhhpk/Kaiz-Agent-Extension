import { ITool } from '../tool_registry';

export const toggleVirtualCursorTool: ITool = {
    schema: {
        name: 'toggle_virtual_cursor',
        description: 'Bật hoặc tắt con trỏ chuột ảo trên màn hình. Dùng khi người dùng yêu cầu bật/tắt con trỏ ảo.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    execute: async (args: any) => {
        let cursor = document.getElementById('kaiz-virtual-cursor');
        if (cursor) {
            cursor.remove();
            return {
                content: 'Đã tắt con trỏ chuột ảo.'
            };
        } else {
            let extPath = 'third-party/Kaiz-Agent-Extension';
            try {
                const scripts = document.getElementsByTagName('script');
                for (let i = 0; i < scripts.length; i++) {
                    const src = scripts[i].src;
                    if (src && src.includes('index.js') && src.toLowerCase().includes('kaiz') && src.toLowerCase().includes('agent')) {
                        const parts = new URL(src).pathname.split('/');
                        const extIndex = parts.indexOf('extensions');
                        if (extIndex !== -1 && parts.length > extIndex + 1) {
                            extPath = parts[extIndex + 1];
                            if (extPath === 'third-party' && parts.length > extIndex + 2) {
                                extPath = parts[extIndex + 1] + '/' + parts[extIndex + 2];
                            }
                            break;
                        }
                    }
                }
            } catch(e) {}
            
            // Spawn mới
            cursor = document.createElement('div');
            cursor.id = 'kaiz-virtual-cursor';
            cursor.innerHTML = `<img src="/scripts/extensions/${extPath}/assets/gura_cursor.gif" style="width: 32px; height: 32px; pointer-events: none;" />`;
            cursor.style.position = 'fixed';
            cursor.style.top = '50%';
            cursor.style.left = '50%';
            cursor.style.transform = 'translate(-20%, -20%)';
            cursor.style.zIndex = '999999';
            cursor.style.pointerEvents = 'none';
            cursor.style.transition = 'top 0.3s, left 0.3s';
            document.body.appendChild(cursor);

            return {
                content: 'Đã bật con trỏ chuột ảo Gawr Gura ở giữa màn hình.'
            };
        }
    }
};
