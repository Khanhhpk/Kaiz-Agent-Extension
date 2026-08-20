# Tổng Hợp Tính Năng & Công Cụ Của Kaiz Agent Extension

Tài liệu này tóm tắt toàn bộ các tính năng cốt lõi (Core Features) và danh sách các Công cụ (Tools) mà Agent đang được trang bị để tự động hóa SillyTavern.

---

## 1. Các Tính Năng Cốt Lõi (Core Features)

### 1.1. Auto Task Scheduler (Lên Lịch Tự Động)
Hệ thống cho phép tạo các kịch bản chạy nền ngầm đằng sau lưng SillyTavern.
- **Trigger Mode (Điều kiện kích hoạt):**
  - `Turn (Theo lượt)`: Kích hoạt sau mỗi X lượt chat của người dùng.
  - `Time (Theo thời gian)`: Kích hoạt sau mỗi X giây (Đếm ngược).
- **Execution Mode (Chế độ thực thi):**
  - `Fresh`: Agent chạy dưới tư cách 1 tác vụ nền tĩnh, không làm bẩn đoạn chat hiện hành. Lịch sử không lưu.
  - `Persist`: Tiến trình được lưu thẳng vào một file chat mới và nối tiếp dài ra như một cuộc trò chuyện song song.
- **Auto-Allow Bypass (Vượt Rào):** Auto Task được đặc cách Bypass qua Safe Mode để tiến trình không bị kẹt.

### 1.2. Safe Mode & Tool Blacklist (Chế Độ An Toàn)
- Cung cấp tính năng "Danh sách đen" (Blacklist). Người dùng có thể đánh dấu các công cụ rủi ro cao (VD: sửa nhân vật, chạy code). 
- Khi Agent (bằng tay) cố gắng gọi các công cụ này, hệ thống sẽ tạm dừng và bật popup xác nhận (Allow/Deny).

### 1.3. Token Limit & Cắt Giảm Ngữ Cảnh
- Agent tự động cắt ngắn lịch sử trò chuyện khi vượt quá `tokenSafeLimit`. 
- Nó thông minh đến mức tự động cắt bỏ các chuỗi suy luận dài dòng (Chain-of-Thoughts / CoT) trong các tin nhắn cũ của Agent để tiết kiệm tối đa Token.

### 1.4. Continual Mode (Chế Độ Nối Tiếp)
- Khi AI bị ngắt quãng giữa chừng do hết Token (Max Output), hệ thống tự động tiêm một đoạn Prompt đặc biệt để định hướng AI viết tiếp tục nội dung bị cắt đứt mà không bị mất dấu hay lặp lại.

### 1.5. Hệ Thống Backup Tự Động (Auto-Backup)
- Tích hợp một IndexedDB ngầm để tự động sao lưu dữ liệu trước khi thực hiện bất cứ lệnh nguy hiểm nào (như xóa tin nhắn, sửa thẻ nhân vật).

---

## 2. Hệ Thống Công Cụ (Agent Tools)

Agent được chia thành các nhóm công cụ chuyên biệt để thao tác lên các phần khác nhau của ST.

### 2.1. Quản Lý Chat & Tin Nhắn
- **manage_chat_text**: Tìm kiếm, bôi sáng hoặc thay thế văn bản hàng loạt trong đoạn chat hiện hành.
- **delete_last_message**: Xóa tin nhắn cuối cùng (dùng khi lỗi gen).
- **delete_message_by_index**: Xóa tin nhắn cụ thể dựa vào `chatIndex`.
- **get_chat_history**: Xem lịch sử đoạn chat gần nhất. Có thể chỉnh `depth=0` để đếm tổng số tin nhắn.
- **quick_chat_preview**: Bật UI để xem lướt toàn bộ độ dài và cấu trúc đoạn chat.

### 2.2. Quản Lý Agent Chat (Đoạn chat nội bộ của Agent)
- **list_agent_chats**: Xem danh sách các cuộc trò chuyện nội bộ bạn đã tạo với Agent.
- **open_new_agent_chat**: Mở một phiên trò chuyện mới tinh với Agent (Không dính líu tới nhân vật ST).
- **rename_agent_chat**: Đổi tên một phiên trò chuyện Agent để dễ nhớ.
- **delete_agent_chat**: Xoá một cuộc trò chuyện với Agent.

### 2.3. Quản Lý Nhân Vật (Characters)
- **list_characters**: Lấy danh sách toàn bộ thẻ nhân vật trong ST.
- **get_char_info**: Đọc toàn bộ lore, tính cách, bối cảnh của nhân vật đang chat.
- **create_character_card**: Tạo một thẻ nhân vật mới hoàn toàn.
- **edit_character_card**: Chỉnh sửa mọi trường của thẻ nhân vật (description, mes_example...).
- **switch_character_chat**: Chuyển cửa sổ chat sang một nhân vật khác.

### 2.4. Quản Lý Persona (Người Dùng) & Agent Memory
- **get_user_persona**: Đọc thông tin Persona của User (tên, mô tả).
- **edit_user_persona**: Cập nhật lại thông tin Persona của User.
- **manage_agent_memory**: Ghi chú lại thông tin người dùng yêu cầu Agent nhớ (luật, thói quen). Dữ liệu này được tiêm cứng vào System Prompt mãi mãi.

### 2.5. Tương Tác Giao Diện (UI & Browser)
- **scan_ui**: Quét giao diện SillyTavern để tìm các cấu trúc HTML, input và các nút bấm có thể tương tác.
- **interact_with_ui**: Tương tác click, type, cuộn lên các phần tử DOM đã quét.
- **toggle_virtual_cursor**: Hiển thị con trỏ chuột ảo trên màn hình để User biết Agent đang thao tác ở đâu.
- **browser_tools_manage**: Chạy các thao tác phức tạp trên tab trình duyệt.
- **manage_user_input**: Gõ chữ giùm User vào thanh khung chat.
- **send_system_message**: Hiển thị thông báo (toast/popup) nổi lên màn hình để báo cáo.

### 2.6. Lorebook & Worldbook (Sổ Tay Thế Giới)
- **manage_worldbook**: Bật, tắt, liệt kê toàn bộ các quyển Worldbook trong ST.
- **get_lorebook_info**: Đọc nội dung Lorebook (Tìm kiếm entry, Lọc mục lục, Đọc chi tiết, Giả lập mô phỏng trigger cờ).
- **manage_lorebook_entry**: Tạo, chỉnh sửa, hoặc xoá các Entry cụ thể.

### 2.7. Scripting (Tavern Helper / Regex)
- **get_regex_list** / **get_regex_info** / **manage_regex**: Liệt kê, đọc chi tiết, và tạo/xoá/sửa/bật tắt các Regex Script.
- **get_tavern_helper_scripts** / **get_tavern_helper_script_info** / **manage_tavern_helper_script**: Quản lý kho kịch bản JavaScript (Slash-Runner) của SillyTavern.

### 2.8. Công Cụ Hỗ Trợ Mạng & Hệ Thống
- **search_google**: Cào tìm kiếm web để tra cứu thông tin Internet (DuckDuckGo/Google).
- **scrape_webpage**: Cào nội dung của một đường link (URL) để đọc văn bản.
- **list_agent_workspaces**: Liệt kê các Agent Workspace đang có và xem Workspace nào đang kích hoạt.
- **switch_agent_workspace**: Chuyển đổi qua lại giữa các Workspace để thay đổi cấu hình/nhân cách của Agent.
- **create_agent_workspace**: Tạo một Workspace hoàn toàn mới.
- **update_agent_extension**: Tự động lấy bản cập nhật mới nhất từ Extension Manager.
- **manage_backup**: Kích hoạt việc tạo bản sao lưu an toàn vào IndexedDB.
