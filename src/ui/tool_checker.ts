import { KaizToolChecker } from '../core/tool_checker';
import { ToolRegistry } from '../core/tool_registry';
import { SillyTavernAdapter } from '../adapters/st_adapter';

declare const jQuery: any;

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export class ToolCheckerUI {
    public static init(registry: ToolRegistry, adapter: SillyTavernAdapter) {
        const $ = jQuery;
        const btn = $('#kaiz-checker-btn');

        if ($('#kaiz-checker-modal').length === 0) {
            const modalHtml = `
            <style>#kaiz-checker-modal::backdrop { background: rgba(0,0,0,0.6); }</style>
            <dialog id="kaiz-checker-modal" style="padding:0; border:none; border-radius:10px; background:transparent; width:90vw; max-width:400px; height:70vh; max-height:500px; overflow:hidden;">
                <div style="width:100%; height:100%; background:var(--SmartThemeBlurTintColor); border:1px solid var(--SmartThemeBorderColor); border-radius:10px; color:var(--SmartThemeBodyColor); backdrop-filter:blur(10px); display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                    <div style="height:50px; padding:0 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); box-sizing:border-box;">
                        <h3 style="margin:0; font-size:16px;"><i class="fa-solid fa-wrench"></i> Tool Checker</h3>
                        <i id="kaiz-checker-close" class="fa-solid fa-xmark interactable" style="cursor:pointer; font-size:18px;"></i>
                    </div>
                    <div id="kaiz-checker-list" style="height:calc(100% - 110px); padding:15px 20px; overflow-y:auto; box-sizing:border-box; display:flex; flex-direction:column; gap:8px;">
                    </div>
                    <div style="height:60px; padding:0 20px; display:flex; justify-content:flex-end; align-items:center; box-sizing:border-box;">
                        <button id="kaiz-checker-run" class="menu_button interactable"><i class="fa-solid fa-play"></i> Run Tests</button>
                    </div>
                </div>
            </dialog>`;
            $('body').append(modalHtml);
        }

        const modal = $('#kaiz-checker-modal');
        const closeBtn = $('#kaiz-checker-close');
        const runBtn = $('#kaiz-checker-run');
        const list = $('#kaiz-checker-list');

        const checkerInstance = new KaizToolChecker(registry, adapter);

        // Mở modal
        btn.on('click', () => {
            const dialog = document.getElementById('kaiz-checker-modal') as any;
            if (!dialog.open) dialog.showModal();
            renderToolList();
        });

        // Đóng modal
        closeBtn.on('click', () => {
            const dialog = document.getElementById('kaiz-checker-modal') as any;
            dialog.close();
        });

        function renderToolList() {
            const tools = registry.getAllTools();
            list.empty();
            for (const t of tools) {
                const name = escapeHtml(t.schema.name);
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
                    statusSpan
                        .html('<i class="fa-solid fa-spinner fa-spin" style="color:#f39c12"></i> Testing')
                        .css('color', '#f39c12');
                    msgItem.hide();
                } else if (status === 'ok') {
                    statusSpan
                        .html('<i class="fa-solid fa-check" style="color:#2ecc71"></i> OK')
                        .css('color', '#2ecc71');
                    if (message) {
                        msgItem.text(message).css('color', '#2ecc71').show();
                    }
                } else if (status === 'error') {
                    statusSpan
                        .html('<i class="fa-solid fa-times" style="color:#e74c3c"></i> Error')
                        .css('color', '#e74c3c');
                    if (message) {
                        msgItem.text(message).css('color', '#e74c3c').show();
                    }
                }
            });

            runBtn.prop('disabled', false).html('<i class="fa-solid fa-play"></i> Run Tests');
        });
    }
}
