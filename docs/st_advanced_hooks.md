# Cẩm Nang Cấp Cao: Thao Túng SillyTavern (Advanced Hooks & Logic)

Tài liệu này tổng hợp các phương thức can thiệp sâu vào SillyTavern ngoài các hàm API tiêu chuẩn. Đây là những "lỗ hổng" và cơ chế nội tại mà một Agent (như Kaiz Agent) có thể sử dụng để thao tác giao diện, chặn sự kiện và đọc dữ liệu ngầm.

## 1. Tầng Sự Kiện (EventSource Hooks)
SillyTavern sử dụng một đối tượng EventEmitter có tên là `eventSource` (thường được gắn ở `SillyTavern.getContext().eventSource` hoặc truy cập toàn cục trong một số phiên bản). Bạn có thể dùng `eventSource.on(...)` để lắng nghe hoặc `eventSource.emit(...)` để kích hoạt.

> [!TIP]
> Agent có thể chèn script lắng nghe sự kiện để biết khi nào AI trả lời xong, thay vì phải liên tục kiểm tra (polling).

### Các sự kiện quan trọng (Event Types):
- `MESSAGE_RECEIVED`: Kích hoạt khi có tin nhắn mới (cả người dùng lẫn AI). **Cực kỳ quan trọng để Agent đọc tin.**
- `GENERATION_STARTED` / `GENERATION_ENDED`: Kích hoạt khi AI bắt đầu/kết thúc quá trình gõ chữ (stream).
- `CHAT_CHANGED`: Kích hoạt khi chuyển sang một đoạn chat khác.
- `CHARACTER_EDITED`: Kích hoạt khi có ai đó sửa thông tin nhân vật.
- `USER_MESSAGE_RENDERED`: Kích hoạt ngay sau khi tin nhắn của user được vẽ lên giao diện.
- `SETTINGS_UPDATED`: Kích hoạt khi người dùng thay đổi cài đặt hệ thống.
- `WORLDINFO_FORCE_ACTIVATE`: Ép kích hoạt một thẻ Lorebook (Sổ tay thế giới).
- `TTS_JOB_STARTED` / `TTS_JOB_COMPLETE`: Các sự kiện của hệ thống tạo giọng nói.

## 2. Tầng Giao Diện & Thao Tác Chuột (DOM & jQuery)
SillyTavern phụ thuộc rất nặng vào jQuery. Khi không có API nội bộ, Agent phải dùng jQuery để "giả lập" hành động của con người. Hầu hết giao diện ST đều có các ID/Class cố định.

> [!WARNING]
> Các thao tác DOM có thể bị lỗi nếu SillyTavern cập nhật thay đổi giao diện. Hãy ưu tiên dùng ST Context API nếu có.

### Các Selector thần thánh:
- **Khung Chat & Tin Nhắn:**
  - `$('#chat')`: Vùng chứa toàn bộ các khối tin nhắn (Message blocks).
  - `$('#chat .mes')`: Một khối tin nhắn bất kỳ.
  - `$('#chat .mes').last()`: Lấy tin nhắn cuối cùng (thường dùng để sửa hoặc xóa tin gần nhất).
  - `$('#send_textarea')`: Khung nhập liệu của người dùng. Agent có thể set text bằng `$('#send_textarea').val('Nội dung')`.
  - `$('#send_but')`: Nút Gửi tin nhắn. Gọi `$('#send_but').click()` để kích hoạt việc gửi.
  
- **Thao tác nhanh trên tin nhắn (Quick Actions):**
  - `.swipe_left` / `.swipe_right`: Nút vuốt tin nhắn (nằm trong mỗi block `.mes`).
  - `.mes_edit`: Nút chỉnh sửa tin nhắn.
  - `.mes_delete`: Nút xóa tin nhắn.
  
- **Quản lý Nhân vật (Character Management):**
  - `$('#character_popup')`: Bảng chọn nhân vật.
  - `$('#dialogue_popup')`: Bảng hội thoại hệ thống (popups).
  - `.character_select`: Class của các thẻ nhân vật trong danh sách. Click vào thẻ này sẽ mở chat.

## 3. Kho Dữ Liệu Ngầm (Global Data Stores)
Ngoại trừ các hàm bị giấu vào ES Modules, dữ liệu trạng thái của ST vẫn bị phơi bày ở một số biến toàn cục. Agent có thể đọc/ghi trực tiếp vào đây để ép hệ thống thay đổi trạng thái.

> [!IMPORTANT]
> Việc sửa trực tiếp vào biến toàn cục đòi hỏi bạn phải gọi thêm một hàm lưu (như `saveSettingsDebounced()`) hoặc kích hoạt một event để ST cập nhật giao diện, nếu không sẽ bị lỗi bất đồng bộ.

- `extension_settings`: Object khổng lồ chứa cài đặt của TOÀN BỘ các Extension (kể cả Kaiz Collection). Agent có thể đọc để lấy token, api key, hoặc thay đổi thiết lập của extension khác.
- `this_chid`: Chứa ID của nhân vật đang được chat hiện tại.
- `characters`: Mảng chứa toàn bộ dữ liệu của tất cả nhân vật đã tải vào bộ nhớ.
- `chat`: Mảng chứa toàn bộ lịch sử tin nhắn của đoạn hội thoại đang mở. Ghi đè vào mảng này và gọi `SillyTavern.getContext().updateChat()` sẽ làm biến đổi lịch sử ngay lập tức.
- `power_user`: Object chứa các thông số nâng cao (thường bị giấu khỏi giao diện cài đặt thường).

## 4. Tóm tắt "Luồng Hack" dành cho Agent
Nếu muốn Kaiz Agent tự động hóa một quy trình (Ví dụ: Đổi ảnh nền, vuốt tin nhắn, sửa prompt), luồng suy nghĩ nên là:
1. **Ưu tiên 1:** Tìm hàm trong `SillyTavern.getContext()` (ví dụ `generate()`).
2. **Ưu tiên 2:** Không có hàm? Thử tìm nút bấm trên DOM và dùng jQuery `$('#id').click()`.
3. **Ưu tiên 3:** Muốn lắng nghe kết quả? Đăng ký hàm qua `eventSource.on(...)`.
4. **Ưu tiên 4:** Can thiệp sâu? Đọc/Sửa file thẳng ở API Backend (Node.js) qua các `/api/*` endpoints.
