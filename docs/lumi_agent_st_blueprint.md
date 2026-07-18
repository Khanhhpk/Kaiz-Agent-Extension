# Bản Thiết Kế Lumi Agent: Cẩm Nang Tích Hợp Sâu SillyTavern

Đây là bản thiết kế tối thượng đúc kết từ việc đọc mã nguồn `main` của SillyTavern. Tài liệu này cung cấp toàn bộ nền tảng để xây dựng một AI Agent hoàn toàn tự trị (như Lumi) có khả năng thao túng ST như một con người thực sự, từ việc tự chat, tự chọn nhân vật, cho đến tự tìm kiếm web và quản lý bộ nhớ.

---

## 1. Cơ Chế Thao Tác Bằng "Lệnh Chữ" (Slash Commands)
Đây là cách **sạch sẽ và an toàn nhất** để Agent tương tác với ST mà không sợ lỗi khi ST cập nhật giao diện.
Agent chỉ cần truyền chuỗi văn bản vào hàm: `SillyTavern.getContext().executeSlashCommandsWithOptions(command)`

**Các nhóm lệnh quyền lực nhất:**
- **Thao túng tin nhắn:** `/send` (gửi), `/swipe` (vuốt tin cuối), `/del [số]` (xóa), `/edit` (sửa), `/sys [text]` (gửi tin hệ thống).
- **Thao túng luồng sinh LLM:** `/stop` (ngắt tạo text), `/go [prompt]` (mớm lời ép AI nói), `/abort` (dừng mọi API).
- **Thao tác phòng Chat:** `/char [tên]` (Mở chat với nhân vật), `/group [tên]` (Mở chat nhóm), `/close` (Đóng chat).
- **Thay đổi UI & Settings:** `/bg [url]` (Đổi hình nền), `/zoom [số]`, `/tts` (Bật/tắt giọng nói).
- **Bắt sự kiện (Trigger):** `/trigger [tên]` (Chạy script hoặc quick reply có sẵn).

## 2. Hệ Thống Đăng Ký Công Cụ Natively (Tool Calling)
ST 1.18+ đã có module `ToolManager` nội tại. Bạn không cần phải code luồng Tool Calling riêng cho LLM nữa, mà có thể "cắm" thẳng Tool của Kaiz Agent vào hệ thống của ST.

**Cách Agent đăng ký Tool:**
```javascript
SillyTavern.getContext().registerFunctionTool({
    name: "kaiz_search_web",
    description: "Tìm kiếm thông tin trên internet cho Kaiz Agent",
    parameters: { type: "object", properties: { query: { type: "string" } } },
    action: async (args) => {
        // Xử lý tìm kiếm web ở đây
        return "Kết quả tìm kiếm..."; 
    }
});
```
*Lưu ý: Khi dùng cách này, ST sẽ tự lo việc thông báo lên màn hình UI "AI đang dùng công cụ..." rất đẹp mắt.*

## 3. Hệ Thống Thần Kinh: Đón Đầu Sự Kiện (EventSource)
Để Agent biết khi nào nên hành động mà không cần dùng vòng lặp (while/setInterval) quét liên tục màn hình, hãy dùng `eventSource.on('TÊN_SỰ_KIỆN', callback)`.

**Các Sự kiện cốt lõi (Trích từ `events.js`):**
- `MESSAGE_RECEIVED`: Kích hoạt khi có tin nhắn mới (Cả User lẫn Bot).
- `USER_MESSAGE_RENDERED`: Kích hoạt sau khi người dùng gửi tin và ST đã vẽ lên màn hình.
- `GENERATION_STARTED` & `GENERATION_ENDED`: Tuyệt vời để Agent biết ST đang "bận" và ngắt luồng.
- `CHAT_CHANGED`: Kích hoạt khi người dùng nhảy sang phòng chat khác.
- `CHARACTER_EDITED`: Phát hiện khi thông số thẻ nhân vật bị sửa.
- `WORLDINFO_FORCE_ACTIVATE`: Nhận biết khi một thẻ từ điển/Lorebook được kích hoạt.
- `TOOL_CALLS_PERFORMED`: Bắt được khi một Tool vừa chạy xong.

## 4. Kiểm Soát Bộ Nhớ & Dữ Liệu (RAG & Context)
Agent có thể nhồi nhét kiến thức vào ST bằng các API nâng cao:

- **Data Bank Scraper:** `registerDataBankScraper(scraper_object)` - Đăng ký một công cụ chuyên bóc tách dữ liệu file/web và tự động vectorize (RAG) vào bộ nhớ của ST.
- **World Info API:** 
  - `loadWorldInfo(tên)`: Kích hoạt một quyển sách thế giới.
  - `getWorldInfoPrompt()`: Lấy prompt bí mật đang ẩn bên trong Lorebook.
- **Reasoning UI:** 
  - `updateReasoningUI(messageId, text)`: Agent có thể tạo ra các luồng "suy nghĩ ngầm" (Chain-of-Thought) hiển thị riêng biệt với tin nhắn chat giống như Claude 3.5.

## 5. Thao Tác Cưỡng Chế Bằng Giao Diện (jQuery DOM)
Khi tất cả API và Slash Command đều vô hiệu, Agent bắt buộc phải thao túng trực tiếp HTML (Dùng cho các chức năng chưa có API chuẩn):
- Bấm nút gửi: `$('#send_but').click()`
- Sửa/Xóa tin gần nhất: `$('#chat .mes').last().find('.mes_edit').click()`
- Đổi Avatar nhanh: `$('#avatar_url_input').val('url_mới').trigger('input')`
- Mở danh sách nhân vật: `$('#character_popup').show()`

---
**TÓM LẠI:** Một "Lumi Agent" hoàn chỉnh trên SillyTavern sẽ là một thực thể kết hợp:
1. Dùng **EventSource** làm *Đôi mắt và Lỗ tai* để đón sự kiện.
2. Dùng **Slash Commands** làm *Tay chân* để thao túng ST.
3. Dùng **ToolManager** làm *Bộ công cụ* để mở rộng khả năng (Tìm web, đọc file, chạy code).
4. Dùng **DOM jQuery** làm *Băng dính* để chắp vá các tính năng thiếu hụt API.
