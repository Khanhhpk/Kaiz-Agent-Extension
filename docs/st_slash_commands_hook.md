# Cẩm Nang Tối Thượng: Điều Khiển Bằng Slash Commands

Thay vì phải mò mẫm dùng jQuery để click chuột hay tìm các hàm ẩn trong bộ nhớ, SillyTavern cung cấp một vũ khí tối thượng, an toàn và uy lực nhất dành cho Agent: **Hệ thống Lệnh Chéo (Slash Commands)**.

Đây là cơ chế nội tại mạnh mẽ nhất, cho phép bạn truyền vào một chuỗi văn bản (ví dụ: `/swipe` hoặc `/send`) và hệ thống sẽ tự động phân giải, thực thi chuẩn xác 100%.

## 1. Cách Agent Kích Hoạt Slash Command
Thay vì gõ vào ô chat, Agent có thể gọi trực tiếp thông qua ST Context API:

```javascript
// Gọi hàm thực thi Slash Command (Đồng bộ)
const result = await SillyTavern.getContext().executeSlashCommandsWithOptions("/tên_lệnh [tham số]");

// Ví dụ: Bắt ST tự vuốt tin nhắn
await SillyTavern.getContext().executeSlashCommandsWithOptions("/swipe");
```

## 2. Các Lệnh Thao Túng Giao Diện (Vô cùng hữu ích)
Thay vì dùng jQuery `$('#send_but').click()`, Agent chỉ cần gọi:
- `/send` : Kích hoạt gửi tin nhắn.
- `/swipe` : Vuốt (thay thế) tin nhắn cuối cùng.
- `/del` : Xóa tin nhắn cuối cùng (hoặc `/del [số lượng]`).
- `/stop` : Dừng việc AI đang sinh chữ.
- `/abort` : Dừng mọi quá trình (kể cả TTS, Image Gen).
- `/sys [Nội dung]` : Gửi một tin nhắn hệ thống vào chat (rất tốt để Agent báo cáo kết quả cho người dùng).
- `/bg [url]` : Đổi hình nền giao diện ngay lập tức.
- `/zoom [số]` : Phóng to / Thu nhỏ giao diện.

## 3. Các Lệnh Thao Túng Nhân Vật & Trò Chuyện
- `/char [tên]` : Đổi sang chat với nhân vật khác (Mở phòng chat mới).
- `/group [tên]` : Mở chat nhóm.
- `/rename [tên mới]` : Đổi tên nhân vật/đoạn chat hiện tại.
- `/trigger [tên trigger]` : Kích hoạt một sự kiện (Lorebook, Quick Reply).
- `/go [câu prompt]` : Bắt nhân vật nói tiếp dựa trên câu lệnh mớm.
- `/echo [nội dung]` : In ra màn hình nhưng không lưu vào lịch sử (rất tốt để Agent in log debug).

## 4. Cách Agent Đăng Ký Lệnh Mới Cho Riêng Mình
Kaiz Agent không chỉ dùng lệnh có sẵn, mà còn có thể **tạo ra lệnh mới** để người dùng (hoặc chính nó) gõ vào.

```javascript
// Đăng ký lệnh /kaiz
SillyTavern.getContext().registerSlashCommand("kaiz", 
    (args, value) => {
        console.log("Kaiz Agent nhận lệnh:", value);
        // Code xử lý ở đây
        return "Xong!"; // Kết quả trả về
    }, 
    [], 
    "<Nội dung>", 
    "Gọi Kaiz Agent thực thi yêu cầu nhanh", 
    true
);
```
*Lưu ý: Đoạn mã này có thể chạy trực tiếp trong plugin Kaiz.*

---
**Kết luận:** 
Thay vì cố gắng "hack" DOM, việc dạy Kaiz Agent biết cách tạo ra một chuỗi Slash Command và đẩy vào hàm `executeSlashCommandsWithOptions` là phương án **Sạch sẽ nhất, Chống lỗi tốt nhất, và Mạnh mẽ nhất**. SillyTavern bản chất là một Text-Based Interface, mọi thứ đều có thể giải quyết bằng lệnh chữ!
