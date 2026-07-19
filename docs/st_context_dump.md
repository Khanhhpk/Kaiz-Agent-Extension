# Tham Khảo: SillyTavern Context API Dump

Dữ liệu dưới đây được trích xuất trực tiếp từ console trình duyệt khi gọi lệnh `SillyTavern.getContext()`. Tài liệu này liệt kê các thuộc tính (properties) và hàm (functions) có sẵn để các Extension (như Kaiz Agent) có thể gọi trực tiếp.

## 1. Các Biến Trạng Thái & Dữ Liệu (Properties)
- `chat`: Mảng chứa lịch sử tin nhắn của phòng chat hiện tại.
- `characters`: Mảng chứa danh sách toàn bộ thẻ nhân vật (Character Cards) đã tải.
- `groups`: Mảng chứa danh sách các nhóm chat (Group Chats).
- `name1`: Tên của người dùng (User Persona Name) - Ví dụ: `'Itsuki Natsume'`.
- `name2`: Tên của hệ thống hoặc nhân vật đang chat.
- `accountStorage`: Chứa thông tin lưu trữ tài khoản của người dùng (nếu có hệ thống đăng nhập).

## 2. Các Dịch Vụ Cốt Lõi (Core Services)

### `ChatCompletionService` (Dành cho OpenAI / Chat API)
Đây là service phụ trách gọi các API dạng Chat Completions (như OpenAI, Claude, OpenRouter...).
- `createRequestData()`: Tạo dữ liệu payload trước khi gửi request.
- `presetToGeneratePayload()`: Chuyển đổi preset cài đặt thành payload.
- `processRequest()`: Hàm chính để gửi prompt lên LLM và nhận stream về.
- `sendRequest()`: Gửi request thông thường.

### `TextCompletionService` (Dành cho TextGen / Completion API)
Đây là service phụ trách gọi các API dạng Text Completions (như Text-Generation-WebUI, KoboldCpp...).
- `createGenerationParameters()`: Tạo tham số khởi tạo text.
- `createTextGenGenerationData()`: Tạo data để gửi cho TextGen.
- `extractJsonFromData()`: Bóc tách JSON từ chuỗi trả về.
- `extractMessageFromData()` / `extractReasoningFromData()`: Bóc tách tin nhắn và đoạn "suy nghĩ" (reasoning/thinking) của AI từ kết quả.
- `formatInstructModeChat()` / `formatInstructModePrompt()`: Format prompt theo chuẩn Instruct Mode (như Alpaca, ChatML, Llama-3...).
- `getGenerateUrl()`: Lấy URL của backend AI đang kết nối.
- `getStreamingReply()`: Nhận phản hồi dạng luồng (stream).
- `tryParseStreamingError()`: Xử lý lỗi khi stream bị đứt.

## 3. Các Cài Đặt (Settings)
- `oai_settings`: Object chứa cài đặt của OpenAI/OpenRouter (ví dụ: `temp_openai`, `top_p_openai`, `preset_settings_openai`).
- `textgenerationwebui_settings`: Object chứa cài đặt của TextGen (như `temp`, `top_k`, `top_p`).
- `setting_names`: Danh sách tên của các thông số AI (để tạo giao diện trượt).
- `settingsToUpdate`: Map chứa các cấu hình cần cập nhật.

## 4. Các Kết Nối API Hiện Có (API Map)
Hệ thống lưu sẵn cấu hình để nhận diện backend nào đang được sử dụng, ví dụ:
- `openai`, `openrouter`, `claude`, `google` (Makersuite), `groq`, `mistralai`, `cohere`...
- `textgenerationwebui`, `koboldcpp`, `llamacpp`, `ollama`, `vllm`, `aphrodite`...

## 5. Các Hàm Global Khác (stFunctions & Window)
Một số hàm được gắn ở dạng Global (có thể gọi thẳng từ `window`):
- `executeQuickReplyByName()`: Gọi chạy một Quick Reply đã cài sẵn.
- `openCharacterCreatorPopup()`: Mở bảng tạo nhân vật.
- `openPersonaWeaver()`: Mở bảng chỉnh sửa Persona Weaver.
- `openWorldInfoRecommenderPopup()`: Mở bảng AI gợi ý Sổ tay Thế giới.
- `playFullConversation()`: Phát âm thanh TTS toàn bộ cuộc hội thoại.
- `translate()`: Gọi Google Dịch (nếu có).
- Hệ thống UI nội bộ của Lorebook: `_loreShowDetail`, `_loreNavJump`, `_loreLoadSavedMap`, v.v...

---
> [!NOTE]
> *Dữ liệu này được dump tự động. Nếu cần thao tác chi tiết, Kaiz Agent có thể gọi thẳng `SillyTavern.getContext().[Tên_Service].[Tên_Hàm]()`.*
