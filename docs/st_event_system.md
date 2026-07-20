# SillyTavern Event System — Research Notes

> Được tạo bằng cách scan `ctx.eventSource.events` trực tiếp trong browser console.  
> Scope: **eventSource listeners only** (không bao gồm jQuery `.on()` hay DOM `addEventListener`).

---

## 🔑 Kết luận quan trọng về Persona UI

**`persona_changed`, `persona_updated`, `persona_renamed`, `persona_created`, `persona_deleted` — KHÔNG CÓ BẤT KỲ LISTENER UI NÀO.**

ST cập nhật UI Persona bằng cách gọi **trực tiếp** (không qua event):
- `reloadUserAvatar()` — cập nhật avatar trong chat bubbles
- `updatePersonaUIStates()` — re-render panel danh sách Persona (highlight active, tên...)
- `loadPersonaForCurrentChat()` — load persona khi đổi chat

Cả hai hàm này được gắn vào **`chat_id_changed`** (listener #29, #30), tức chỉ tự chạy khi đổi chat.

**→ Để sync UI Persona sau khi thay đổi programmatically: phải gọi trực tiếp các hàm trên từ dynamic import `personas.js`.**

```js
const personasModule = await import('/scripts/personas.js');
personasModule.reloadUserAvatar();
personasModule.updatePersonaUIStates();
```

---

## 📋 Toàn bộ Events đã đăng ký (93 events, sort theo số listener)

| Event | Listeners | Ghi chú |
|-------|-----------|---------|
| `chat_id_changed` | 33 | Phổ biến nhất, load lại mọi thứ khi đổi chat |
| `character_message_rendered` | 15 | Sau khi AI render xong message |
| `message_swiped` | 13 | User swipe message |
| `message_received` | 11 | Nhận được message mới từ AI |
| `user_message_rendered` | 11 | Sau khi user message render |
| `message_updated` | 11 | Message bị edit |
| `generate_after_combine_prompts` | 9 | Sau khi gộp prompt |
| `message_deleted` | 8 | Xóa message |
| `chat_completion_prompt_ready` | 8 | Prompt đã sẵn sàng gửi (CC) |
| `generation_ended` | 8 | AI generate xong |
| `app_ready` | 7 | App khởi động xong |
| `characterDeleted` | 7 | Xóa character |
| `chatLoaded` | 5 | Chat đã load xong |
| `character_renamed` | 5 | Đổi tên character |
| `stream_token_received` | 5 | Nhận token stream |
| `generation_started` | 4 | Bắt đầu generate |
| `secret_written` | 4 | API key được lưu |
| `secret_deleted` | 4 | API key bị xóa |
| `secret_rotated` | 4 | API key được rotate |
| `GENERATION_AFTER_COMMANDS` | 4 | Sau slash commands |
| `generate_after_data` | 4 | Sau khi có data generate |
| `message_sent` | 4 | User gửi message |
| `text_completion_prompt_ready` | 4 | Prompt sẵn sàng (TC) |
| `prompt_ready` | 4 | Prompt ready (generic) |
| `generation_stopped` | 4 | Generate bị dừng |
| `message_edited` | 3 | Message được edit |
| `oai_preset_changed_after` | 3 | OAI preset đổi xong |
| `impersonate_ready` | 3 | Impersonate sẵn sàng |
| `worldinfo_updated` | 3 | World Info cập nhật |
| `charManagementDropdown` | 3 | Dropdown quản lý char |
| `chat_deleted` | 3 | Xóa chat |
| `group_chat_deleted` | 3 | Xóa group chat |
| `character_edited` | 2 | Character được edit |
| `worldinfo_settings_updated` | 2 | WI settings cập nhật |
| `chat_completion_settings_ready` | 2 | CC settings ready |
| `message_swipe_deleted` | 2 | Swipe message bị xóa |
| `preset_renamed_before` | 2 | Trước khi rename preset |
| `preset_deleted` | 2 | Xóa preset |
| `movable_panels_reset` | 2 | Reset movable panels |
| `group_updated` | 2 | Group được cập nhật |
| `character_selected` | 2 | Chọn character |
| `online_status_changed` | 2 | Trạng thái online đổi |
| `connection_profile_created` | 2 | Tạo connection profile |
| `connection_profile_updated` | 2 | Cập nhật connection profile |
| `connection_profile_deleted` | 2 | Xóa connection profile |
| `more_messages_loaded` | 2 | Load thêm messages |
| `character_group_overlay_state_change_after` | 1 | |
| `settings_loaded_before` | 1 | Trước khi load settings |
| `oai_preset_changed_before` | 1 | Trước khi đổi OAI preset |
| `chatcompletion_source_changed` | 1 | Đổi nguồn CC |
| `chatcompletion_model_changed` | 1 | Đổi model CC |
| `groupSelected` | 1 | Chọn group |
| `worldinfo_force_activate` | 1 | Force activate WI |
| `message_reasoning_edited` | 1 | Sửa reasoning |
| `message_reasoning_deleted` | 1 | Xóa reasoning |
| `worldinfo_entries_loaded` | 1 | WI entries đã load |
| `js_generation_before_end` | 1 | |
| `settings_loaded` | 1 | Settings đã load xong |
| `settings_updated` | 1 | Settings cập nhật |
| `main_api_changed` | 1 | Đổi API chính |
| `preset_changed` | 1 | Preset đổi |
| `message_file_embedded` | 1 | File được nhúng vào message |
| `character_editor_opened` | 1 | Mở editor character |
| `extras_connected` | 1 | Extras kết nối |
| `image_swiped` | 1 | Swipe image |
| `group_member_drafted` | 1 | Group member drafted |
| `world_info_activated` | 1 | WI được kích hoạt |
| `chat_created` | 1 | Tạo chat mới |
| `group_chat_created` | 1 | Tạo group chat |
| `open_character_library` | 1 | Mở thư viện character |
| `connection_profile_loaded` | 1 | Load connection profile |
| `file_attachment_deleted` | 1 | Xóa file đính kèm |
| `extension_settings_loaded` | 1 | Extension settings load xong |
| `oai_preset_export_ready` | 1 | OAI preset export ready |
| `character_export_ready` | 1 | Character export ready |
| `character_duplicated` | 1 | Nhân đôi character |
| `force_set_background` | 1 | Force set background |
| `character_page_loaded` | 1 | Trang character load xong |
| `chat_renamed` | 1 | Đổi tên chat |
| `th_unique_check.压缩相邻消息` | 1 | (Extension custom) |
| UUID-based events | ~13 | Events của các extension cụ thể |

---

## 🔍 Events liên quan đến Persona (từ event_types enum)

Các events này **TỒN TẠI trong enum** nhưng **KHÔNG CÓ listener UI** nào đang lắng nghe:

| Event | Mục đích | Listener UI? |
|-------|----------|-------------|
| `persona_changed` | Đổi persona active | ❌ Không |
| `persona_updated` | Cập nhật persona data | ❌ Không |
| `persona_renamed` | Đổi tên persona | ❌ Không |
| `persona_created` | Tạo persona mới | ❌ Không |
| `persona_deleted` | Xóa persona | ❌ Không |
| `impersonate_ready` | Impersonate xong | ✅ 3 listeners (reasoning, translate, debounce) |

---

## 🧠 Pattern chung khi debug ST features

### 1. Tìm event nào đang dùng
```js
const events = SillyTavern.getContext().eventSource.events;
console.table(Object.entries(events).map(([e,l]) => ({event: e, count: l.length})).sort((a,b)=>b.count-a.count));
```

### 2. Tìm listener nào chứa keyword
```js
const events = SillyTavern.getContext().eventSource.events;
const KEYWORDS = ['your_keyword'];
for (const [name, listeners] of Object.entries(events)) {
    listeners.forEach((fn, i) => {
        if (KEYWORDS.some(k => fn.toString().includes(k))) {
            console.log(`EVENT: ${name} — Listener #${i+1}`);
            console.log(fn.toString().slice(0, 300));
        }
    });
}
```

### 3. Khi feature không có event listener → gọi trực tiếp từ module
```js
// Pattern: dynamic import module JS của ST
const module = await new Function("return import('/scripts/MODULE_NAME.js')")();
// Gọi hàm cần thiết
module.someFunctionName();
```

### 4. Các modules quan trọng hay dùng
| File | Exports quan trọng |
|------|-------------------|
| `/scripts/personas.js` | `user_avatar`, `reloadUserAvatar`, `updatePersonaUIStates`, `setUserAvatar`, `getUserAvatars` |
| `/scripts/world-info.js` | `getWorldInfoPrompt`, `saveWorldInfo`, `loadWorldInfo` |
| `/scripts/power-user.js` | `power_user` (settings object) |
| `/scripts/st-context.js` | `getContext()` |
| `/scripts/macros.js` | `substituteParams` |

---

## 📌 Scope của scan này

| Phương pháp | Bao gồm? |
|-------------|----------|
| `eventSource.events` (ST internal event bus) | ✅ |
| jQuery `.on()` handlers | ❌ |
| DOM `addEventListener` | ❌ |
| Direct function calls (không qua event) | ❌ |

> Để scan jQuery: `jQuery._data(document, 'events')` hoặc inspect từng element.
