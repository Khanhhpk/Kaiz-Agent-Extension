# Kaiz Agent Extension - Technical Debt & Optimization Notes

Tài liệu này ghi nhận lại các vấn đề về tối ưu hóa hiệu năng (Performance Optimization) có thể thực hiện trong tương lai nếu dự án mở rộng, hoặc người dùng có nhu cầu lưu trữ lịch sử chat rất dài. Hiện tại, với số lượng chat dưới mức 200, các vấn đề này không gây ảnh hưởng đáng kể đến trải nghiệm người dùng và đã được quyết định giữ nguyên để ưu tiên tính đơn giản của logic.

## 1. Rò rỉ và lãng phí Event Listener (Chưa dùng Event Delegation)
**Vị trí:** `chat_window.ts` -> hàm `renderChatList`
- **Vấn đề:** Mỗi khi danh sách chat thay đổi, gọi `.empty()` và dùng vòng lặp gắn sự kiện click trực tiếp lên từng `.kaiz-chat-item` và `.kaiz-chat-delete`. Nếu có quá nhiều lịch sử chat, việc tạo ra hàng ngàn Event Listeners mới mỗi lần refresh sẽ gây tốn RAM và làm chậm quá trình Garbage Collection.
- **Hướng khắc phục:** Chuyển sang sử dụng **Event Delegation** bằng cách gắn một sự kiện click duy nhất lên thẻ container cha (`#kaiz-chat-list`), sau đó kiểm tra target của thẻ con bên trong hàm callback.

## 2. Reflow/Repaint liên tục khi Append DOM
**Vị trí:** `chat_window.ts` -> hàm `renderChatList` và `onChatSwitched`
- **Vấn đề:** Đang sử dụng lệnh `history.append()` và `chatList.append()` nằm bên trong vòng lặp `for`. Mỗi lần chèn trực tiếp 1 thẻ vào DOM, trình duyệt sẽ phải tính toán kích thước và vẽ lại màn hình (Reflow/Repaint). Vòng lặp chứa 100 tin nhắn sẽ kích hoạt quá trình vẽ 100 lần, gây giật lag (frame drop) trên máy tính yếu.
- **Hướng khắc phục:** Có 2 cách:
  1. Build sẵn 1 chuỗi HTML string khổng lồ rồi `.append(chuỗi_html)` một lần duy nhất.
  2. Tạo một `DocumentFragment`, nối tất cả các DOM node vào đó, rồi `.append(fragment)` vào giao diện.

## 3. Parse JSON và nối chuỗi lặp lại ở Agent Loop
**Vị trí:** `loop.ts` -> hàm `generateSystemPrompt()`
- **Vấn đề:** Hàm này lặp qua toàn bộ Tool Schemas, gọi `JSON.stringify()` và nối chuỗi để tạo System Prompt. Do hàm này chạy ở *mỗi step* của Agent Loop, CPU phải tốn thời gian parse và xây dựng lại đoạn string cực dài dù Schema là cố định trong suốt vòng đời hoạt động.
- **Hướng khắc phục:** Áp dụng **Caching (Bộ đệm)**: Lưu sẵn (cache) phần định nghĩa của Tool Schemas vào một biến bộ nhớ khi Extension mới khởi động (hoặc ngay vòng lặp đầu tiên). Các vòng lặp sau chỉ cần gắn thêm tham số cần thiết mà không phải serialize/parse lại toàn bộ hệ thống tools.
