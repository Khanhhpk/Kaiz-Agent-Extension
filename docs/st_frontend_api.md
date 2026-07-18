# SillyTavern Frontend API (ST Context)
*Trích xuất thông qua `SillyTavern.getContext()` ở bản 1.18.0*

Đây là danh sách các hàm và thuộc tính cốt lõi mà SillyTavern mở ra cho các Extension. Agent có thể sử dụng các hàm này để thao túng trực tiếp giao diện và logic của ST.

## 1. Quản lý Trò chuyện (Chat Management)
- `getCurrentChatId()`: Lấy ID của đoạn chat hiện tại.
- `reloadCurrentChat()`: Tải lại khung chat hiện tại.
- `renameChat()`: Đổi tên đoạn chat.
- `addOneMessage()`: Thêm 1 tin nhắn vào giao diện.
- `deleteLastMessage()`: Xóa tin nhắn cuối cùng.
- `deleteMessage()`: Xóa tin nhắn bất kỳ.
- `updateChatMetadata()`: Cập nhật siêu dữ liệu chat.
- `saveChat()`: Lưu lại nội dung đoạn chat.
- `clearChat()`: Xóa trắng đoạn chat.
- `printMessages()`: In/Render lại toàn bộ tin nhắn ra màn hình.
- `updateMessageBlock()`: Cập nhật nội dung một khối tin nhắn.
- `scrollChatToBottom()`: Cuộn khung chat xuống dưới cùng.

## 2. Quản lý Nhân vật & Nhóm (Characters & Groups)
- `openCharacterChat()`: Mở chat với một nhân vật cụ thể.
- `openGroupChat()`: Mở chat với một nhóm.
- `getCharacters()`: Lấy danh sách toàn bộ nhân vật.
- `getOneCharacter()`: Lấy data của 1 nhân vật.
- `selectCharacterById()`: Chọn nhân vật dựa theo ID.
- `getCharacterCardFields()`: Lấy các trường thông tin trong thẻ nhân vật.
- `getCharacterSource()`: Lấy nguồn tải thẻ nhân vật.
- `importTags()`: Nhập danh sách thẻ tag (tags).
- `unshallowCharacter()` / `unshallowGroupMembers()`: Tải đầy đủ thông tin nhân vật/nhóm từ bộ nhớ sâu.

## 3. Khởi tạo Nội dung & LLM (Generation)
- `generate()`: Ra lệnh cho ST bắt đầu sinh tin nhắn phản hồi (như bấm nút Send).
- `sendGenerationRequest()` / `sendStreamingRequest()`: Gửi request sinh chữ (thường / streaming).
- `stopGeneration()`: Dừng ngay việc sinh chữ.
- `generateQuietPrompt()`: Gửi một prompt "ẩn" (không hiện lên màn hình chat) và lấy kết quả.
- `generateRaw()` / `generateRawData()`: Sinh chữ thô không qua các lớp filter của ST.
- `getTextTokens()` / `getTokenCount()` / `getTokenCountAsync()`: Tính toán số lượng token.
- `getTokenizerModel()` / `getChatCompletionModel()` / `getTextGenServer()`: Lấy thông tin model và server hiện hành.
- `ChatCompletionService` / `TextCompletionService` / `ConnectionManagerRequestService`: Các service lõi kết nối AI.

## 4. Giao diện & Tương tác (UI / Popups)
- `sendSystemMessage()`: Gửi một thông báo hệ thống lên khung chat.
- `activateSendButtons()` / `deactivateSendButtons()`: Bật/Tắt nút gửi tin nhắn.
- `callPopup()` / `callGenericPopup()`: Gọi bảng thông báo popup.
- `showLoader()` / `hideLoader()`: Hiển thị/Ẩn biểu tượng loading.
- `openThirdPartyExtensionMenu()`: Mở menu của extension bên thứ 3.
- `openCharacterCreatorPopup()`: Mở bảng tạo nhân vật.

## 5. Slash Commands & Macros
- `registerSlashCommand()`: Đăng ký một lệnh `/` mới.
- `executeSlashCommands()` / `executeSlashCommandsWithOptions()`: Kích hoạt chạy một Slash Command.
- `registerMacro()` / `unregisterMacro()`: Đăng ký/Hủy Macro (như `{{user}}`, `{{char}}`).
- Các class hỗ trợ: `SlashCommandParser`, `SlashCommand`, `SlashCommandArgument`, v.v.

## 6. Trợ thủ & Công cụ (Tools & Data Bank)
- `registerFunctionTool()` / `unregisterFunctionTool()`: Đăng ký một công cụ cho AI gọi.
- `ToolManager`: Trình quản lý toàn bộ các Tool.
- `canPerformToolCalls()` / `isToolCallingSupported()`: Kiểm tra model có hỗ trợ xài tool không.
- `registerDataBankScraper()`: Đăng ký trình quét dữ liệu Data Bank (RAG).

## 7. Cài đặt & Dữ liệu mở rộng (Settings & Extensions)
- `saveSettingsDebounced()`: Lưu cài đặt (chống dội - debounced).
- `saveMetadata()` / `saveMetadataDebounced()`: Lưu siêu dữ liệu (metadata).
- `setExtensionPrompt()`: Cài đặt Prompt chèn thêm từ extension.
- `writeExtensionField()` / `writeExtensionFieldBulk()`: Ghi dữ liệu riêng tư của extension vào file nhân vật/chat.
- `getPresetManager()`: Lấy trình quản lý preset AI.
- `getExtensionManifest()`: Lấy cấu trúc của extension.

## 8. Sổ tay Thế giới (World Info)
- `loadWorldInfo()` / `saveWorldInfo()`: Tải/Lưu sổ tay thế giới (Lorebooks).
- `updateWorldInfoList()`: Cập nhật danh sách World Info.
- `reloadWorldInfoEditor()`: Tải lại UI trình chỉnh sửa WI.
- `getWorldInfoPrompt()`: Trích xuất Prompt từ WI đang kích hoạt.

## 9. Khác / Tiện ích (Misc)
- `uuidv4()`: Tạo ID ngẫu nhiên định dạng UUID.
- `substituteParams()` / `substituteParamsExtended()`: Thay thế các macro (như `{{char}}`) thành tên thật.
- `t()` / `translate()` / `getCurrentLocale()`: Đa ngôn ngữ (i18n).
- `timestampToMoment()` / `humanizedDateTime()`: Tiện ích xử lý ngày tháng.
