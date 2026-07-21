import { KaizToolChecker } from "../core/tool_checker";
import { ToolRegistry } from "../core/tool_registry";
import { SillyTavernAdapter } from "../adapters/st_adapter";

declare const jQuery: any;

export class ToolCheckerUI {
    public static init(registry: ToolRegistry, adapter: SillyTavernAdapter) {
        const $ = jQuery;
        const btn = $('#kaiz-checker-btn');
        
        if ($('#kaiz-checker-modal').length === 0) {
            const modalHtml = `
            <div id="kaiz-checker-modal" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.6); z-index:99999; padding:5vh 5vw; box-sizing:border-box;">
                <div style="margin:auto; width:400px; max-width:100%; max-height:100%; display:flex; flex-direction:column; background:var(--SmartThemeBlurTintColor); border:1px solid var(--SmartThemeBorderColor); border-radius:10px; padding:20px; color:var(--SmartThemeBodyColor); backdrop-filter:blur(10px); box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px; flex-shrink:0;">
                        <h3 style="margin:0; font-size:16px;"><i class="fa-solid fa-wrench"></i> Tool Checker</h3>
                        <i id="kaiz-checker-close" class="fa-solid fa-xmark interactable" style="cursor:pointer; font-size:18px;"></i>
                    </div>
                    <div id="kaiz-checker-list" style="overflow-y:auto; flex:0 1 auto; min-height:0; display:flex; flex-direction:column; gap:8px;">
                    </div>
                    <div style="margin-top:15px; text-align:right; flex-shrink:0;">
                        <button id="kaiz-checker-run" class="menu_button interactable"><i class="fa-solid fa-play"></i> Run Tests</button>
                    </div>
                </div>
            </div>`;
            $('body').append(modalHtml);
        }

        const modal = $('#kaiz-checker-modal');
        const closeBtn = $('#kaiz-checker-close');
        const runBtn = $('#kaiz-checker-run');
        const list = $('#kaiz-checker-list');

        const checkerInstance = new KaizToolChecker(registry, adapter);

        // Mở modal
        btn.on('click', () => {
            modal.css('display', 'flex');
            renderToolList();
        });

        // Đóng modal
        closeBtn.on('click', () => {
            modal.css('display', 'none');
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
