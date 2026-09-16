import { ITool } from '../tool_registry';
import { WebImageBridge } from '../web_image_bridge';

export const generateWebImageTool: ITool = {
    schema: {
        name: 'generate_web_image',
        description:
            'CÔNG CỤ SINH ẢNH MINH HỌA WEB (Gemini Imagen 3 / ChatGPT DALL-E 3). Sử dụng công cụ này khi bạn muốn vẽ một bức ảnh minh họa sống động cho bối cảnh câu chuyện, chân dung nhân vật, hoặc cảnh hành động. Hãy viết prompt bằng tiếng Anh thật chi tiết, giàu tính mô tả (ánh sáng, phong cách nghệ thuật, góc máy, chi tiết nhân vật). Ảnh sau khi tạo sẽ được nhúng trực tiếp vào hội thoại.',
        parameters: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description:
                        'Câu lệnh prompt mô tả bức ảnh chi tiết bằng tiếng Anh (ví dụ: "cinematic anime illustration of a silver-haired knight resting under a blooming cherry blossom tree at sunset, soft volumetric lighting, highly detailed, 8k resolution").',
                },
                target: {
                    type: 'string',
                    enum: ['gemini', 'chatgpt', 'auto'],
                    description:
                        'Nền tảng sinh ảnh mong muốn: "gemini" (Imagen 3 - nhanh, miễn phí) hoặc "chatgpt" (DALL-E 3 / GPT-4o). Mặc định là "auto".',
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

            const target = args.target || 'auto';
            console.log(`[Tool: generate_web_image] Đang gửi yêu cầu vẽ sang ${target}:`, prompt);

            const base64 = await WebImageBridge.requestImage({
                prompt,
                target,
                timeoutMs: 80000,
            });

            const markdownImage = `\n\n![Generated Image](${base64})\n\n`;

            return {
                content: JSON.stringify({
                    success: true,
                    message: 'Đã sinh ảnh thành công từ Web.',
                    markdown: markdownImage,
                    preview_length: base64.length,
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
