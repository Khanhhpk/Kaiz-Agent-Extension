# Thiết Kế: Cầu Nối Sinh Ảnh Web (Gemini Imagen 3 & ChatGPT DALL-E 3) Cho SillyTavern

**Ngày lập:** 2026-09-16  
**Dự án:** `Kaiz-Agent-Extension` (SillyTavern)  
**Mục tiêu:** Cho phép SillyTavern (và Kaiz Agent) gửi prompt tạo ảnh sang giao diện web của Gemini (Imagen 3) hoặc ChatGPT (DALL-E 3), chờ hoàn tất sinh ảnh, lấy dữ liệu ảnh dạng Base64 và chèn trực tiếp vào phiên chat SillyTavern.

---

## 1. Tổng Quan & Kiến Trúc Kỹ Thuật

Do hạn chế về CORS và các cơ chế bảo vệ bot phức tạp (Cloudflare Turnstile, Proof of Work của OpenAI, xác thực Google Account đa tầng), giải pháp sử dụng **Userscript Tampermonkey làm kênh truyền thông xuyên miền (Cross-Domain Bridge)** chạy trực tiếp trên phiên trình duyệt thật đã đăng nhập của người dùng.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TRÌNH DUYỆT (CHROME)                                 │
│                                                                                        │
│   [TAB 1: SillyTavern (Localhost)]             [TAB 2: Gemini Web / ChatGPT Web]       │
│                                                                                        │
│   ┌─────────────────────────────┐              ┌────────────────────────────────────┐  │
│   │    Kaiz-Agent-Extension     │              │    Giao diện Web AI (Đã đăng nhập) │  │
│   │ (Tool / Command / Settings) │              │ (gemini.google.com / chatgpt.com)  │  │
│   └──────────────┬──────────────┘              └─────────────────▲──────────────────┘  │
│                  │ window.postMessage                            │ Gõ prompt, Send    │
│                  ▼                                               │ Bắt ảnh mới        │
│   ┌─────────────────────────────┐   GM_setValue (Shared)        ┌┴──────────────────┐  │
│   │ Userscript: ST Context      │ ───────────────────────────►  │ Userscript:       │  │
│   │ (Lắng nghe & Forward Event) │ ◄───────────────────────────  │ Web Context       │  │
│   └─────────────────────────────┘  GM_addValueChangeListener    └───────────────────┘  │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Các Quyết Định Thiết Kế Quan Trọng (Design Decisions)

1. **Cơ chế truyền tin**:
    - Sử dụng một Userscript Tampermonkey duy nhất (`userscripts/kaiz-web-image-bridge.user.js`).
    - Tận dụng `@grant GM_setValue` và `@grant GM_addValueChangeListener` để đồng bộ dữ liệu giữa các tab khác domain mà không cần cài đặt thêm server phụ.
2. **Không tự động can thiệp New Chat (User-Managed Chat History)**:
    - Script không tự động click "New Chat" để tránh gây rác danh sách lịch sử trò chuyện trên web.
    - Người dùng tự quản lý tab (ví dụ: bật sẵn chế độ _Temporary Chat_ trên ChatGPT/Gemini hoặc mở 1 đoạn chat chuyên dụng cho SillyTavern).
3. **Cơ chế Khóa Kép chống bắt nhầm ảnh cũ (Double-Locking Image Detection)**:
    - **Pre-send Image Snapshot**: Lưu Set các URL ảnh hiện có trước khi bấm gửi. Chỉ chấp nhận ảnh có URL chưa từng tồn tại trước đó.
    - **Scope to Latest Response Turn**: Chỉ theo dõi khối tin nhắn phản hồi mới nhất (`<model-response>` trên Gemini, `div[data-message-author-role="assistant"]` trên ChatGPT).
    - **Complete Verification**: Đảm bảo thẻ `img` đã tải xong (`img.complete === true` và `img.naturalWidth > 100`).
4. **Bypass CORS khi lấy dữ liệu ảnh**:
    - Sử dụng `@grant GM_xmlhttpRequest` với `responseType: 'blob'` để tải dữ liệu nhị phân của ảnh từ domain CDN (`googleusercontent.com` hoặc `oaiusercontent.com`), sau đó mã hóa sang Base64 Data URL (`data:image/png;base64,...`).

---

## 3. Chi Tiết Các Thành Phần

### 3.1. Userscript: `userscripts/kaiz-web-image-bridge.user.js`

- **Metadata Block**:
    - `@match http://localhost:*/*`
    - `@match http://127.0.0.1:*/*`
    - `@match https://gemini.google.com/*`
    - `@match https://chatgpt.com/*`
    - `@grant GM_setValue`, `GM_getValue`, `GM_addValueChangeListener`, `GM_xmlhttpRequest`
- **ST Context**:
    - Lắng nghe `window.postMessage` với type `KAIZ_BRIDGE_IMAGE_REQUEST`.
    - Đẩy vào `GM_setValue('KAIZ_PENDING_JOB', payload)`.
    - Lắng nghe `GM_addValueChangeListener('KAIZ_JOB_RESULT')` -> chuyển tiếp ngược về ST qua `window.postMessage({ type: 'KAIZ_BRIDGE_IMAGE_RESPONSE' })`.
    - Cập nhật trạng thái Heartbeat của tab Web.
- **Web Context (Gemini / ChatGPT)**:
    - Bắn Heartbeat định kỳ (mỗi 3 giây) qua `GM_setValue('KAIZ_WEB_HEARTBEAT', { target, lastSeen: Date.now() })`.
    - Lắng nghe Job:
        - Điền prompt vào ô input (`rich-textarea` / `#prompt-textarea`).
        - Kích hoạt sự kiện gõ phím / input event và click nút Send.
        - Dùng `MutationObserver` chờ khối phản hồi mới và ảnh xuất hiện.
        - Bắt lỗi vi phạm kiểm duyệt (Content Filter Refusal) nếu có.
        - Tải ảnh qua `GM_xmlhttpRequest` -> chuyển sang Base64 -> ghi vào `KAIZ_JOB_RESULT`.

### 3.2. Extension Core (`Kaiz-Agent-Extension`)

- **Bridge Client (`src/core/web_image_bridge.ts`)**:
    - Cung cấp hàm `requestWebImage({ prompt, target, timeoutMs })`.
    - Quản lý Promise, timeouts, và theo dõi trạng thái sẵn sàng của tab Web.
- **Tool `generate_web_image` (`src/core/tools/generate_web_image.ts`)**:
    - Schema:
        - `prompt` (string, required): Mô tả chi tiết cảnh vẽ bằng tiếng Anh.
        - `target` (string, optional: `'gemini'` | `'chatgpt'` | `'auto'`): Lựa chọn dịch vụ tạo ảnh.
    - Tích hợp vào `src/core/tools/index.ts`.
    - Khi hoàn thành, trả về Markdown image `![Generated Image](data:image/png;base64,...)`.
- **Quick Slash Command**:
    - Đăng ký lệnh `/draw <prompt>` trong SillyTavern để người chơi có thể tạo ảnh thủ công trực tiếp.
- **Settings Panel (`settings.html` & `src/ui/settings.ts`)**:
    - Toggle kích hoạt Web Image Bridge.
    - Chọn Provider mặc định (`Gemini Web (Imagen 3)` hoặc `ChatGPT Web (DALL-E 3)`).
    - Huy hiệu trạng thái kết nối thời gian thực: `🟢 Gemini: Sẵn sàng` | `🔴 Gemini: Chưa mở tab`.

---

## 4. Xử Lý Lỗi & Trường Hợp Ngoại Lệ (Edge Cases)

| Tình huống                                | Cách phát hiện                                                                  | Hành động xử lý                                                                                                 |
| :---------------------------------------- | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------- |
| Chưa mở tab Gemini/ChatGPT                | Heartbeat timestamp > 5000ms                                                    | Báo lỗi ngay lập tức: _"Chưa tìm thấy tab Web tương ứng, vui lòng mở 1 tab gemini.google.com hoặc chatgpt.com"_ |
| Vi phạm kiểm duyệt (NSFW / Safety Policy) | Bắt chuỗi từ chối trong tin nhắn ("I can't generate", "violates safety policy") | Trả về lỗi chi tiết cho Agent: _"Nội dung bị bộ lọc từ chối, hãy điều chỉnh lại prompt"_                        |
| Render quá lâu / Mạng lag                 | Quá thời gian timeout (mặc định 75s)                                            | Hủy Promise, thông báo timeout thân thiện                                                                       |
| Thẻ `img` đang load dở                    | `img.naturalWidth === 0` hoặc chưa `complete`                                   | Tiếp tục đợi cho đến khi ảnh tải xong hoàn toàn                                                                 |

---

## 5. Kế Hoạch Kiểm Thử (Verification Plan)

1. **Kiểm tra Userscript Heartbeat**:
    - Mở SillyTavern -> mở tab Gemini -> kiểm tra SillyTavern nhận được tín hiệu kết nối.
2. **Kiểm tra tạo ảnh thủ công qua lệnh `/draw`**:
    - Gõ `/draw a cute white cat playing with wool yarn`.
    - Kiểm tra tab Gemini tự động điền prompt, bấm gửi, và lấy được ảnh Base64 chèn vào chat.
3. **Kiểm tra tạo ảnh tự động qua Kaiz Agent Tool**:
    - Chat với nhân vật và yêu cầu nhân vật vẽ lại bối cảnh.
    - Kiểm tra Agent tự động gọi tool `generate_web_image` và hiển thị ảnh mượt mà.
4. **Kiểm tra tính năng chống bắt nhầm ảnh cũ**:
    - Thực hiện vẽ 3-5 ảnh liên tiếp trong cùng 1 tab Gemini/ChatGPT.
    - Xác nhận mỗi lần vẽ đều lấy chính xác ảnh mới nhất, không bao giờ trùng lặp ảnh cũ.
