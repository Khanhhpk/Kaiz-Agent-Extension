import { ITool } from '../tool_registry';
import { WebImageBridge } from '../web_image_bridge';

export const generateWebImageTool: ITool = {
    schema: {
        name: 'generate_web_image',
        description:
            'CÔNG CỤ SINH ẢNH MINH HỌA WEB. Sử dụng công cụ này khi bạn muốn vẽ một bức ảnh minh họa sống động cho bối cảnh câu chuyện, chân dung nhân vật, hoặc cảnh hành động. Hãy viết prompt bằng tiếng Anh thật chi tiết, giàu tính mô tả (ánh sáng, phong cách nghệ thuật, góc máy, chi tiết nhân vật). Ảnh sau khi tạo sẽ được nhúng trực tiếp vào hội thoại.',
        parameters: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description:
                        'Câu lệnh prompt mô tả bức ảnh chi tiết bằng tiếng Anh (ví dụ: "cinematic anime illustration of a silver-haired knight resting under a blooming cherry blossom tree at sunset, soft volumetric lighting, highly detailed, 8k resolution").',
                },
            },
            required: ['prompt'],
        },
    },
    execute: async (args: any) => {
        try {
            const prompt = args.prompt;
            if (!prompt || typeof prompt !== 'string') {
                return {
                    content: JSON.stringify({ error: "Tham số 'prompt' là bắt buộc." }),
                    isError: true,
                };
            }

            const target = WebImageBridge.getConfiguredProvider();
            const finalPrompt = WebImageBridge.mergeCustomPrompt(prompt);
            console.log(`[Tool: generate_web_image] Đang gửi yêu cầu vẽ sang ${target}:`, finalPrompt);

            const startGen = Date.now();
            const base64 = await WebImageBridge.requestImage({
                prompt: finalPrompt,
                target,
                timeoutMs: 150000,
            });
            const durationMs = Date.now() - startGen;
            const actualProvider = WebImageBridge.getLastDeliveredProvider();

            // Tự động lưu vào Image Gallery
            await WebImageBridge.saveImageToGallery({
                prompt: finalPrompt,
                base64,
                provider: actualProvider,
                durationMs,
            });

            const safePrompt = finalPrompt
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const durationText = `${(durationMs / 1000).toFixed(1)}s`;
            const markdownImage = `<div class="kaiz-draw-result" style="margin: 10px 0; text-align: center;"><img src="${base64}" alt="${safePrompt.replace(/\n+/g, ' ')}" style="max-width: 100%; max-height: 520px; border-radius: 10px; box-shadow: 0 4px 18px rgba(0,0,0,0.45); object-fit: contain; cursor: pointer; display: inline-block;" onclick="window.open(this.src)" /><div style="margin-top: 6px; font-size: 12px; opacity: 0.85; font-style: italic; white-space: pre-wrap; line-height: 1.4; text-align: left; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); max-width: 520px; margin-left: auto; margin-right: auto;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 11px; opacity: 0.85;"><span>🎨 <b>PROMPT</b></span><span><i class="fa-solid fa-stopwatch"></i> ${durationText} • ${actualProvider.toUpperCase()}</span></div>${safePrompt}</div></div>`;

            // Dán trực tiếp bức ảnh vào chính văn SillyTavern chat
            let messageSent = false;
            try {
                const ctx =
                    typeof (globalThis as any).SillyTavern !== 'undefined'
                        ? (globalThis as any).SillyTavern.getContext()
                        : ((globalThis as any).window?.SillyTavern?.getContext?.() || null);

                if (ctx) {
                    if (typeof ctx.sendSystemMessage === 'function') {
                        try {
                            ctx.sendSystemMessage('generic', markdownImage);
                            messageSent = true;
                        } catch (err) {
                            try {
                                ctx.sendSystemMessage(markdownImage);
                                messageSent = true;
                            } catch (e2) {
                                /* ignore */
                            }
                        }
                    }

                    if (!messageSent && typeof ctx.addOneMessage === 'function') {
                        ctx.addOneMessage({
                            is_user: false,
                            is_system: true,
                            name: 'Web Image Bridge',
                            mes: markdownImage,
                            send_date: Date.now(),
                        });
                        if (typeof ctx.saveChat === 'function') {
                            ctx.saveChat();
                        }
                        if (typeof ctx.scrollChatToBottom === 'function') {
                            ctx.scrollChatToBottom();
                        }
                        messageSent = true;
                    }
                }
            } catch (postErr) {
                console.warn('[Tool: generate_web_image] Lỗi khi dán ảnh vào chính văn chat:', postErr);
            }

            // QUAN TRỌNG: Tuyệt đối KHÔNG trả chuỗi Base64 hàng triệu ký tự về cho LLM
            // Trả chuỗi gọn nhẹ để LLM tiếp tục mạch hội thoại mà không bị lỗi tràn 1 triệu token (HTTP 400)
            return {
                content: JSON.stringify({
                    success: true,
                    message: 'Đã sinh ảnh thành công và nhúng trực tiếp bức ảnh vào khung chat chính cho người dùng xem.',
                    prompt: finalPrompt,
                    posted_to_chat: messageSent,
                }),
                isError: false,
            };
        } catch (err: any) {
            console.error('[Tool: generate_web_image] Thất bại:', err);
            return {
                content: JSON.stringify({
                    error: err.message || 'Lỗi không xác định khi sinh ảnh từ Web.',
                }),
                isError: true,
            };
        }
    },
};
