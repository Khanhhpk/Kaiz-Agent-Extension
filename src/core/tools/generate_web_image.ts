import { ITool } from '../tool_registry';
import { WebImageBridge } from '../web_image_bridge';

export const generateWebImageTool: ITool = {
    schema: {
        name: 'generate_web_image',
        description:
            'CÔNG CỤ SINH ẢNH MINH HỌA WEB. Sử dụng công cụ này khi bạn muốn vẽ một bức ảnh minh họa sống động cho bối cảnh câu chuyện, chân dung nhân vật, hoặc cảnh hành động. Hãy viết prompt mô tả bức ảnh thật chi tiết, giàu tính tạo hình (bối cảnh, góc máy, ánh sáng, phong cách nghệ thuật, biểu cảm nhân vật). Ảnh sau khi tạo sẽ được nhúng trực tiếp vào hội thoại.',
        parameters: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Câu lệnh prompt mô tả chi tiết bức ảnh cần vẽ.',
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

            // Dán trực tiếp bức ảnh vào chính văn SillyTavern chat
            const { messageSent } = WebImageBridge.postImageToChat({
                base64,
                prompt: finalPrompt,
                durationMs,
                provider: actualProvider,
            });

            // QUAN TRỌNG: Tuyệt đối KHÔNG trả chuỗi Base64 hàng triệu ký tự về cho LLM
            // Trả chuỗi gọn nhẹ để LLM tiếp tục mạch hội thoại mà không bị lỗi tràn 1 triệu token (HTTP 400)
            return {
                content: JSON.stringify({
                    success: true,
                    message:
                        'Đã sinh ảnh thành công và nhúng trực tiếp bức ảnh vào khung chat chính cho người dùng xem.',
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
