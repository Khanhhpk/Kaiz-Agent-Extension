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

| Event                                        | Listeners | Ghi chú                                      |
| -------------------------------------------- | --------- | -------------------------------------------- |
| `chat_id_changed`                            | 33        | Phổ biến nhất, load lại mọi thứ khi đổi chat |
| `character_message_rendered`                 | 15        | Sau khi AI render xong message               |
| `message_swiped`                             | 13        | User swipe message                           |
| `message_received`                           | 11        | Nhận được message mới từ AI                  |
| `user_message_rendered`                      | 11        | Sau khi user message render                  |
| `message_updated`                            | 11        | Message bị edit                              |
| `generate_after_combine_prompts`             | 9         | Sau khi gộp prompt                           |
| `message_deleted`                            | 8         | Xóa message                                  |
| `chat_completion_prompt_ready`               | 8         | Prompt đã sẵn sàng gửi (CC)                  |
| `generation_ended`                           | 8         | AI generate xong                             |
| `app_ready`                                  | 7         | App khởi động xong                           |
| `characterDeleted`                           | 7         | Xóa character                                |
| `chatLoaded`                                 | 5         | Chat đã load xong                            |
| `character_renamed`                          | 5         | Đổi tên character                            |
| `stream_token_received`                      | 5         | Nhận token stream                            |
| `generation_started`                         | 4         | Bắt đầu generate                             |
| `secret_written`                             | 4         | API key được lưu                             |
| `secret_deleted`                             | 4         | API key bị xóa                               |
| `secret_rotated`                             | 4         | API key được rotate                          |
| `GENERATION_AFTER_COMMANDS`                  | 4         | Sau slash commands                           |
| `generate_after_data`                        | 4         | Sau khi có data generate                     |
| `message_sent`                               | 4         | User gửi message                             |
| `text_completion_prompt_ready`               | 4         | Prompt sẵn sàng (TC)                         |
| `prompt_ready`                               | 4         | Prompt ready (generic)                       |
| `generation_stopped`                         | 4         | Generate bị dừng                             |
| `message_edited`                             | 3         | Message được edit                            |
| `oai_preset_changed_after`                   | 3         | OAI preset đổi xong                          |
| `impersonate_ready`                          | 3         | Impersonate sẵn sàng                         |
| `worldinfo_updated`                          | 3         | World Info cập nhật                          |
| `charManagementDropdown`                     | 3         | Dropdown quản lý char                        |
| `chat_deleted`                               | 3         | Xóa chat                                     |
| `group_chat_deleted`                         | 3         | Xóa group chat                               |
| `character_edited`                           | 2         | Character được edit                          |
| `worldinfo_settings_updated`                 | 2         | WI settings cập nhật                         |
| `chat_completion_settings_ready`             | 2         | CC settings ready                            |
| `message_swipe_deleted`                      | 2         | Swipe message bị xóa                         |
| `preset_renamed_before`                      | 2         | Trước khi rename preset                      |
| `preset_deleted`                             | 2         | Xóa preset                                   |
| `movable_panels_reset`                       | 2         | Reset movable panels                         |
| `group_updated`                              | 2         | Group được cập nhật                          |
| `character_selected`                         | 2         | Chọn character                               |
| `online_status_changed`                      | 2         | Trạng thái online đổi                        |
| `connection_profile_created`                 | 2         | Tạo connection profile                       |
| `connection_profile_updated`                 | 2         | Cập nhật connection profile                  |
| `connection_profile_deleted`                 | 2         | Xóa connection profile                       |
| `more_messages_loaded`                       | 2         | Load thêm messages                           |
| `character_group_overlay_state_change_after` | 1         |                                              |
| `settings_loaded_before`                     | 1         | Trước khi load settings                      |
| `oai_preset_changed_before`                  | 1         | Trước khi đổi OAI preset                     |
| `chatcompletion_source_changed`              | 1         | Đổi nguồn CC                                 |
| `chatcompletion_model_changed`               | 1         | Đổi model CC                                 |
| `groupSelected`                              | 1         | Chọn group                                   |
| `worldinfo_force_activate`                   | 1         | Force activate WI                            |
| `message_reasoning_edited`                   | 1         | Sửa reasoning                                |
| `message_reasoning_deleted`                  | 1         | Xóa reasoning                                |
| `worldinfo_entries_loaded`                   | 1         | WI entries đã load                           |
| `js_generation_before_end`                   | 1         |                                              |
| `settings_loaded`                            | 1         | Settings đã load xong                        |
| `settings_updated`                           | 1         | Settings cập nhật                            |
| `main_api_changed`                           | 1         | Đổi API chính                                |
| `preset_changed`                             | 1         | Preset đổi                                   |
| `message_file_embedded`                      | 1         | File được nhúng vào message                  |
| `character_editor_opened`                    | 1         | Mở editor character                          |
| `extras_connected`                           | 1         | Extras kết nối                               |
| `image_swiped`                               | 1         | Swipe image                                  |
| `group_member_drafted`                       | 1         | Group member drafted                         |
| `world_info_activated`                       | 1         | WI được kích hoạt                            |
| `chat_created`                               | 1         | Tạo chat mới                                 |
| `group_chat_created`                         | 1         | Tạo group chat                               |
| `open_character_library`                     | 1         | Mở thư viện character                        |
| `connection_profile_loaded`                  | 1         | Load connection profile                      |
| `file_attachment_deleted`                    | 1         | Xóa file đính kèm                            |
| `extension_settings_loaded`                  | 1         | Extension settings load xong                 |
| `oai_preset_export_ready`                    | 1         | OAI preset export ready                      |
| `character_export_ready`                     | 1         | Character export ready                       |
| `character_duplicated`                       | 1         | Nhân đôi character                           |
| `force_set_background`                       | 1         | Force set background                         |
| `character_page_loaded`                      | 1         | Trang character load xong                    |
| `chat_renamed`                               | 1         | Đổi tên chat                                 |
| `th_unique_check.压缩相邻消息`               | 1         | (Extension custom)                           |
| UUID-based events                            | ~13       | Events của các extension cụ thể              |

---

## 🔍 Events liên quan đến Persona (từ event_types enum)

Các events này **TỒN TẠI trong enum** nhưng **KHÔNG CÓ listener UI** nào đang lắng nghe:

| Event               | Mục đích              | Listener UI?                                    |
| ------------------- | --------------------- | ----------------------------------------------- |
| `persona_changed`   | Đổi persona active    | ❌ Không                                        |
| `persona_updated`   | Cập nhật persona data | ❌ Không                                        |
| `persona_renamed`   | Đổi tên persona       | ❌ Không                                        |
| `persona_created`   | Tạo persona mới       | ❌ Không                                        |
| `persona_deleted`   | Xóa persona           | ❌ Không                                        |
| `impersonate_ready` | Impersonate xong      | ✅ 3 listeners (reasoning, translate, debounce) |

---

## 🧠 Pattern chung khi debug ST features

### 1. Tìm event nào đang dùng

```js
const events = SillyTavern.getContext().eventSource.events;
console.table(
    Object.entries(events)
        .map(([e, l]) => ({ event: e, count: l.length }))
        .sort((a, b) => b.count - a.count),
);
```

### 2. Tìm listener nào chứa keyword

```js
const events = SillyTavern.getContext().eventSource.events;
const KEYWORDS = ['your_keyword'];
for (const [name, listeners] of Object.entries(events)) {
    listeners.forEach((fn, i) => {
        if (KEYWORDS.some((k) => fn.toString().includes(k))) {
            console.log(`EVENT: ${name} — Listener #${i + 1}`);
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

| File                     | Exports quan trọng                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `/scripts/personas.js`   | `user_avatar`, `reloadUserAvatar`, `updatePersonaUIStates`, `setUserAvatar`, `getUserAvatars` |
| `/scripts/world-info.js` | `getWorldInfoPrompt`, `saveWorldInfo`, `loadWorldInfo`                                        |
| `/scripts/power-user.js` | `power_user` (settings object)                                                                |
| `/scripts/st-context.js` | `getContext()`                                                                                |
| `/scripts/macros.js`     | `substituteParams`                                                                            |

---

## 📌 Scope của scan này

| Phương pháp                                  | Bao gồm? |
| -------------------------------------------- | -------- |
| `eventSource.events` (ST internal event bus) | ✅       |
| jQuery `.on()` handlers                      | ❌       |
| DOM `addEventListener`                       | ❌       |
| Direct function calls (không qua event)      | ❌       |

> Để scan jQuery: `jQuery._data(document, 'events')` hoặc inspect từng element.

---

## 📖 Bảng tra cứu `ctx.eventTypes` (Cập nhật trực tiếp từ Runtime)

Bảng mapping chuẩn từ object `ctx.eventTypes` (cực kỳ hữu ích để tránh gọi nhầm string name khi code extension):

```javascript
{
    APP_INITIALIZED: "app_initialized",
    APP_READY: "app_ready",
    CHARACTER_DELETED: "characterDeleted",
    CHARACTER_DUPLICATED: "character_duplicated",
    CHARACTER_EDITED: "character_edited",
    CHARACTER_EDITOR_OPENED: "character_editor_opened",
    CHARACTER_FIRST_MESSAGE_SELECTED: "character_first_message_selected",
    CHARACTER_GROUP_OVERLAY_STATE_CHANGE_AFTER: "character_group_overlay_state_change_after",
    CHARACTER_GROUP_OVERLAY_STATE_CHANGE_BEFORE: "character_group_overlay_state_change_before",
    CHARACTER_MANAGEMENT_DROPDOWN: "charManagementDropdown",
    CHARACTER_MESSAGE_RENDERED: "character_message_rendered",
    CHARACTER_PAGE_LOADED: "character_page_loaded",
    CHARACTER_RENAMED: "character_renamed",
    CHARACTER_RENAMED_IN_PAST_CHAT: "character_renamed_in_past_chat",
    CHATCOMPLETION_MODEL_CHANGED: "chatcompletion_model_changed",
    CHATCOMPLETION_SOURCE_CHANGED: "chatcompletion_source_changed",
    CHAT_CHANGED: "chat_id_changed",
    CHAT_COMPLETION_PROMPT_READY: "chat_completion_prompt_ready",
    CHAT_COMPLETION_SETTINGS_READY: "chat_completion_settings_ready",
    CHAT_CREATED: "chat_created",
    CHAT_DELETED: "chat_deleted",
    CHAT_LOADED: "chatLoaded",
    CHAT_RENAMED: "chat_renamed",
    CONNECTION_PROFILE_CREATED: "connection_profile_created",
    CONNECTION_PROFILE_DELETED: "connection_profile_deleted",
    CONNECTION_PROFILE_LOADED: "connection_profile_loaded",
    CONNECTION_PROFILE_UPDATED: "connection_profile_updated",
    EXTENSIONS_FIRST_LOAD: "extensions_first_load",
    EXTENSION_SETTINGS_LOADED: "extension_settings_loaded",
    EXTRAS_CONNECTED: "extras_connected",
    FILE_ATTACHMENT_DELETED: "file_attachment_deleted",
    FORCE_SET_BACKGROUND: "force_set_background",
    GENERATE_AFTER_COMBINE_PROMPTS: "generate_after_combine_prompts",
    GENERATE_AFTER_DATA: "generate_after_data",
    GENERATE_BEFORE_COMBINE_PROMPTS: "generate_before_combine_prompts",
    GENERATION_AFTER_COMMANDS: "GENERATION_AFTER_COMMANDS",
    GENERATION_ENDED: "generation_ended",
    GENERATION_STARTED: "generation_started",
    GENERATION_STOPPED: "generation_stopped",
    GROUP_CHAT_CREATED: "group_chat_created",
    GROUP_CHAT_DELETED: "group_chat_deleted",
    GROUP_MEMBER_DRAFTED: "group_member_drafted",
    GROUP_UPDATED: "group_updated",
    GROUP_WRAPPER_FINISHED: "group_wrapper_finished",
    GROUP_WRAPPER_STARTED: "group_wrapper_started",
    IMAGE_SWIPED: "image_swiped",
    IMPERSONATE_READY: "impersonate_ready",
    ITEMIZED_PROMPTS_DELETED: "itemized_prompts_deleted",
    ITEMIZED_PROMPTS_LOADED: "itemized_prompts_loaded",
    ITEMIZED_PROMPTS_SAVED: "itemized_prompts_saved",
    MAIN_API_CHANGED: "main_api_changed",
    MEDIA_ATTACHMENT_DELETED: "media_attachment_deleted",
    MESSAGE_DELETED: "message_deleted",
    MESSAGE_EDITED: "message_edited",
    MESSAGE_FILE_EMBEDDED: "message_file_embedded",
    MESSAGE_REASONING_DELETED: "message_reasoning_deleted",
    MESSAGE_REASONING_EDITED: "message_reasoning_edited",
    MESSAGE_RECEIVED: "message_received",
    MESSAGE_SENT: "message_sent",
    MESSAGE_SWIPED: "message_swiped",
    MESSAGE_SWIPE_DELETED: "message_swipe_deleted",
    MESSAGE_UPDATED: "message_updated",
    MORE_MESSAGES_LOADED: "more_messages_loaded",
    MOVABLE_PANELS_RESET: "movable_panels_reset",
    OAI_PRESET_CHANGED_AFTER: "oai_preset_changed_after",
    OAI_PRESET_CHANGED_BEFORE: "oai_preset_changed_before",
    OAI_PRESET_EXPORT_READY: "oai_preset_export_ready",
    OAI_PRESET_IMPORT_READY: "oai_preset_import_ready",
    ONLINE_STATUS_CHANGED: "online_status_changed",
    OPEN_CHARACTER_LIBRARY: "open_character_library",
    PERSONA_CHANGED: "persona_changed",
    PERSONA_CREATED: "persona_created",
    PERSONA_DELETED: "persona_deleted",
    PERSONA_RENAMED: "persona_renamed",
    PERSONA_UPDATED: "persona_updated",
    PRESET_CHANGED: "preset_changed",
    PRESET_DELETED: "preset_deleted",
    PRESET_RENAMED: "preset_renamed",
    PRESET_RENAMED_BEFORE: "preset_renamed_before",
    SD_PROMPT_PROCESSING: "sd_prompt_processing",
    SECRET_DELETED: "secret_deleted",
    SECRET_EDITED: "secret_edited",
    SECRET_ROTATED: "secret_rotated",
    SECRET_WRITTEN: "secret_written",
    SETTINGS_LOADED: "settings_loaded",
    SETTINGS_LOADED_AFTER: "settings_loaded_after",
    SETTINGS_LOADED_BEFORE: "settings_loaded_before",
    SETTINGS_UPDATED: "settings_updated",
    SMOOTH_STREAM_TOKEN_RECEIVED: "stream_token_received",
    STREAM_REASONING_DONE: "stream_reasoning_done",
    STREAM_TOKEN_RECEIVED: "stream_token_received",
    TEXT_COMPLETION_SETTINGS_READY: "text_completion_settings_ready",
    TOOL_CALLS_PERFORMED: "tool_calls_performed",
    TOOL_CALLS_RENDERED: "tool_calls_rendered",
    TTS_AUDIO_READY: "tts_audio_ready",
    TTS_JOB_COMPLETE: "tts_job_complete",
    TTS_JOB_STARTED: "tts_job_started",
    USER_MESSAGE_RENDERED: "user_message_rendered",
    WORLDINFO_ENTRIES_LOADED: "worldinfo_entries_loaded",
    WORLDINFO_FORCE_ACTIVATE: "worldinfo_force_activate",
    WORLDINFO_SCAN_DONE: "worldinfo_scan_done",
    WORLDINFO_SETTINGS_UPDATED: "worldinfo_settings_updated",
    WORLDINFO_UPDATED: "worldinfo_updated",
    WORLD_INFO_ACTIVATED: "world_info_activated"
}
```
