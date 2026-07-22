import { ITool } from '../tool_registry';

export const manageUserInputTool: ITool = {
    schema: {
        name: 'manage_user_input',
        description: `Thao tác trực tiếp với khung nhập liệu (chat box) của người dùng trong SillyTavern. Bạn có thể tự động điền chữ, nối tiếp chữ, và tuỳ chọn nhấn nút Gửi (Send) thay cho người dùng.`,
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Văn bản muốn nhập vào khung chat.',
                },
                mode: {
                    type: 'string',
                    description: "Chế độ nhập: 'overwrite' (Xoá hết cũ, ghi đè mới) hoặc 'append' (Nối tiếp vào sau nội dung đang có).",
                },
                send: {
                    type: 'boolean',
                    description: 'True nếu muốn gửi tin nhắn đó đi luôn. False nếu chỉ điền vào để người dùng tự xem và gửi sau.',
                },
            },
            required: ['text', 'mode', 'send'],
        },
    },
    execute: async (args: Record<string, any>) => {
        const text = args.text as string;
        const mode = args.mode as string;
        const send = args.send as boolean;

        if (!text) {
            return { content: 'Lỗi: Tham số text không được để trống.' };
        }
        if (mode !== 'overwrite' && mode !== 'append') {
            return { content: "Lỗi: Tham số mode phải là 'overwrite' hoặc 'append'." };
        }

        const textarea = document.getElementById('send_textarea') as HTMLTextAreaElement;
        if (!textarea) {
            return { content: 'Lỗi: Không tìm thấy khung nhập văn bản (send_textarea) trên giao diện.' };
        }

        if (mode === 'overwrite') {
            textarea.value = text;
        } else if (mode === 'append') {
            const currentVal = textarea.value;
            textarea.value = currentVal + (currentVal && !currentVal.endsWith(' ') ? ' ' : '') + text;
        }

        // Bắn event để SillyTavern nhận diện có sự thay đổi text (dành cho bộ đếm ký tự hoặc state react)
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        if (send) {
            const sendBtn = document.getElementById('send_but') as HTMLElement;
            if (sendBtn) {
                // SillyTavern dùng div#send_but làm nút gửi
                sendBtn.click();
                return { content: `Đã ${mode === 'overwrite' ? 'ghi đè' : 'nối thêm'} nội dung và nhấn nút Gửi thành công.` };
            } else {
                return { content: `Đã điền nội dung nhưng không tìm thấy nút Gửi (send_but). Nội dung vẫn đang ở trong khung chat.` };
            }
        }

        return { content: `Đã ${mode === 'overwrite' ? 'ghi đè' : 'nối thêm'} nội dung vào khung chat (Không gửi).` };
    },
};
