# Tool Audit Notes — Kaiz Agent Extension

> Audit thực hiện: 2026-07-20  
> Reviewer: AI subagent (full code scan)  
> Trạng thái: Các mục bên dưới là **chưa fix, note để sau**

---

## ✅ Đã fix (2026-07-20)

| ID  | Tool                                        | Mô tả                                                                                       |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| C1  | `edit_user_persona`                         | Thêm null-guard cho `context.adapter` ở đầu `execute()`                                     |
| C2  | `edit_user_persona`                         | Validate `persona_description` không rỗng/whitespace trước khi gọi adapter                  |
| H1  | `manage_lorebook_entry`, `manage_worldbook` | Thêm `isError: true` vào tất cả validation error returns                                    |
| H3  | `getChatContext` (adapter)                  | Sửa `chatIndex` dùng raw index thật trong `ctx.chat`, không bị lệch bởi filter              |
| M1  | `getUserPersona` (adapter)                  | Phát hiện `{{persona}}` chưa resolve (no active persona) → báo rõ thay vì trả literal macro |
| M5  | `manage_worldbook list_all` (adapter)       | Trả JSON thay vì plain text để LLM dễ parse                                                 |

---

## 📝 Còn lại — Chưa cần / hơi thừa

### H2 — `get_chat_history`: Không validate `depth`

- **File:** `get_chat_history.ts` + adapter `getChatContext()`
- **Vấn đề:**
    - Không có upper-bound cap → LLM có thể pass `depth: 99999`, flood context
    - `args.depth || 10` coerce `0` thành `10` (logic bug nhỏ nếu ai cố tình pass 0)
    - Không validate negative hoặc non-numeric
- **Gợi ý fix:** Clamp depth vào khoảng `[1, 200]`

---

### H4 — `get_lorebook_info`: Query rỗng trong `search`/`simulate` match tất cả

- **File:** adapter `getLorebookInfo()`
- **Vấn đề:** Empty string `''` match mọi entry (`.includes('')` luôn true) → trả toàn bộ entries không lọc gì
- **Gợi ý fix:** Guard `if (!options.query?.trim()) return "[LỖI] Thiếu query..."`

---

### H5 — `get_lorebook_info`: Mode `by_uid` với uid undefined trả rỗng không có lỗi

- **File:** adapter `getLorebookInfo()`
- **Vấn đề:** Nếu `uid` không được truyền, iterate hết entries nhưng không match gì → kết quả rỗng, không báo lỗi
- **Gợi ý fix:** Guard đầu hàm: `if (options.mode === 'by_uid' && !options.uid) return "[LỖI]..."`

---

### H6 — `send_system_message`: Có thể lưu vào chat history

- **File:** `send_system_message.ts`, adapter `sendSystemMessage()`
- **Vấn đề:** ST's `sendSystemMessage('generic', ...)` trong một số version **có lưu vào chat file** — trái với mô tả "không thêm vào history"
- **Gợi ý:** Kiểm tra ST version behavior, hoặc cập nhật description cho chính xác hơn

---

### H7 — `manage_worldbook toggle`: `#world_info` select có thể không tồn tại

- **File:** adapter `manageWorldbook()` — toggle branch
- **Vấn đề:** `$('#world_info')` chỉ tồn tại khi user đã mở World Info panel trong session. Nếu chưa mở, `wiSelect.length === 0` → trigger change không chạy, UI "Active Worlds" không update ngay
- **Gợi ý:** Fallback bằng cách gọi `onWorldInfoChange('__notSlashCommand__')` từ module nếu jQuery select không tồn tại

---

### H8 — `manage_worldbook create`: Thiếu emit `WORLDINFO_SETTINGS_UPDATED`

- **File:** adapter `manageWorldbook()` — create branch
- **Vấn đề:** `toggle` emit `WORLDINFO_SETTINGS_UPDATED` để notify extensions. `create` không emit → "Active Worlds" panel và các extension khác không biết có WB mới
- **Gợi ý fix:** Thêm `ctx.eventSource.emit(ctx.eventTypes.WORLDINFO_SETTINGS_UPDATED)` sau `updateWorldInfoList()`

---

### M2 — `edit_user_persona`: `persona_description` không `.trim()`

- **File:** adapter `editUserPersona()`
- **Vấn đề:** `persona_name` được trim, `persona_description` thì không → có thể lưu description với leading/trailing whitespace
- **Gợi ý:** Trim description trong adapter

---

### M3 — `edit_user_persona`: `hasUpdates = true` dù description không đổi

- **File:** adapter `editUserPersona()`
- **Vấn đề:** Description path set `hasUpdates = true` ngay cả khi nội dung giống hệt cũ → unnecessary save và UI refresh
- **Gợi ý:** So sánh trước khi set flag

---

### M4 — `get_lorebook_info`: Không giới hạn size output ở `all_full`/`by_name`

- **File:** adapter `getLorebookInfo()`
- **Vấn đề:** Lorebook lớn có thể tạo ra string hàng MB → overflow LLM context
- **Gợi ý:** Thêm truncation warning nếu output > X ký tự

---

### M6 — `manage_lorebook_entry`: `keys` array không validate items

- **File:** adapter `manageLorebookEntry()`
- **Vấn đề:** LLM có thể pass `keys: ["", null, 123]` → được lưu thẳng vào entry không filter
- **Gợi ý:** Filter `keys.filter(k => typeof k === 'string' && k.trim())` trước khi assign

---

## Cross-cutting (ghi nhận, không ưu tiên)

| ID  | Affects                                                          | Ghi chú                                                                      |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A   | Tất cả                                                           | `args as any` passthrough — bypass TypeScript type safety                    |
| B   | `delete_message`, `send_system_message`                          | Fire-and-forget — luôn báo success dù ST API thiếu                           |
| D   | `edit_user_persona`, `manage_lorebook_entry`, `manage_worldbook` | `new Function("return import(...)")()` — CSP risk, no compile-time check     |
| E   | `get_lorebook_info`, `manage_lorebook_entry`                     | UID type inconsistency (string vs number), có thể sai nếu LLM synthesize UID |
| F   | Tất cả mutating tools                                            | Không có dry-run / undo mechanism cho destructive actions                    |
| G   | `get_lorebook_info`, `manage_lorebook_entry`                     | `world-info.js` import lại mỗi lần gọi — module cache phụ thuộc browser      |
