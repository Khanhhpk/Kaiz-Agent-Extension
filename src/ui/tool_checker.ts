import { KaizToolChecker } from "../core/tool_checker";
import { ToolRegistry } from "../core/tool_registry";
import { SillyTavernAdapter } from "../adapters/st_adapter";

declare const jQuery: any;

export class ToolCheckerUI {
    public static init(registry: ToolRegistry, adapter: SillyTavernAdapter) {
        const $ = jQuery;
        const btn = $('#kaiz-checker-btn');
        const modal = $('#kaiz-checker-modal');
        const closeBtn = $('#kaiz-checker-close');
        const runBtn = $('#kaiz-checker-run');
        const list = $('#kaiz-checker-list');

        const checkerInstance = new KaizToolChecker(registry, adapter);

        // Mở modal
        btn.on('click', () => {
            modal.show();
            renderToolList();
        });

        // Đóng modal
        closeBtn.on('click', () => {
            modal.hide();
        });

        function renderToolList() {
            const tools = registry.getAllTools();
            list.empty();
            for (const t of tools) {
                const name = t.schema.name;
                list.append(`
                    <div id="checker-tool-${name}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:5px;">
                        <span><i class="fa-solid fa-wrench" style="margin-right:8px; opacity:0.7"></i>${name}</span>
                        <span class="status-icon" style="color:#aaa;"><i class="fa-solid fa-circle-question"></i> Pending</span>
                    </div>
                    <div id="checker-tool-msg-${name}" style="font-size:11px; color:#aaa; margin-left:12px; margin-top:-4px; margin-bottom:4px; display:none;"></div>
                `);
            }
        }

        // Chạy test
        runBtn.on('click', async () => {
            runBtn.prop('disabled', true).html('<i class="fa-solid fa-spinner fa-spin"></i> Running...');
            renderToolList(); // Reset list
            
            await checkerInstance.runTests((toolName, status, message) => {
                const item = $(`#checker-tool-${toolName}`);
                const msgItem = $(`#checker-tool-msg-${toolName}`);
                const statusSpan = item.find('.status-icon');
                
                if (status === 'testing') {
                    statusSpan.html('<i class="fa-solid fa-spinner fa-spin" style="color:#f39c12"></i> Testing').css('color', '#f39c12');
                    msgItem.hide();
                } else if (status === 'ok') {
                    statusSpan.html('<i class="fa-solid fa-check" style="color:#2ecc71"></i> OK').css('color', '#2ecc71');
                    if (message) {
                        msgItem.text(message).css('color', '#2ecc71').show();
                    }
                } else if (status === 'error') {
                    statusSpan.html('<i class="fa-solid fa-times" style="color:#e74c3c"></i> Error').css('color', '#e74c3c');
                    if (message) {
                        msgItem.text(message).css('color', '#e74c3c').show();
                    }
                }
            });
            
            runBtn.prop('disabled', false).html('<i class="fa-solid fa-play"></i> Run Tests');
        });
    }
}
