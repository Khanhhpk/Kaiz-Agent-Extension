import { ITool, ToolResult } from '../tool_registry';

export const mvuInstructTool: ITool = {
    schema: {
        name: 'mvu_instruct',
        description:
            'Cẩm nang kiến thức chuyên sâu và hướng dẫn kỹ thuật toàn diện về hệ sinh thái MVU (MagVarUpdate) & Zod 4 trong SillyTavern.\n' +
            'Khai thác trực tiếp từ toàn bộ kho tài liệu kỹ thuật chuẩn của Tavern Cards Forge & Hướng dẫn MVU ZOD.\n' +
            'DÙNG CÔNG CỤ NÀY KHI: Bạn cần hiểu rõ kiến trúc MVU, cú pháp Zod 4 chuẩn, cách cấu hình Worldbook [InitVar]/[mvu_update], cơ chế JSON Patch RFC 6902, quy tắc Regex, EJS Template Prompt đa giai đoạn, TavernHelper Script API, hoặc khi người dùng yêu cầu thiết kế hệ thống biến cho Card.',
        userDescription: 'Tra cứu cẩm nang kỹ thuật toàn diện và chuẩn mực kiến trúc biến MVU Zod 4.',
        parameters: {
            type: 'object',
            properties: {
                topic: {
                    type: 'string',
                    enum: [
                        'all',
                        'architecture',
                        'zod_rules',
                        'worldbook_structure',
                        'json_patch',
                        'regex_scripts',
                        'variable_naming',
                        'change_propagation',
                        'ejs_integration',
                        'tavern_helper_scripting',
                        'troubleshooting',
                        'tools_guide',
                    ],
                    description:
                        'Chủ đề kiến thức cần tra cứu:\n' +
                        '- "all": Toàn bộ cẩm nang MVU ZOD bách khoa toàn thư.\n' +
                        '- "architecture": Kiến trúc 3 tầng cốt lõi, nguyên lý sàn linh hoạt (Zero Hardcoding), và cơ chế định tuyến mô hình kép (Dual-AI Routing [mvu_plot]/[mvu_update]).\n' +
                        '- "zod_rules": Cú pháp Zod 4, clamp, transform, prefault, idempotent rule, clearable objects, intersection, và các hàm bị cấm.\n' +
                        '- "worldbook_structure": Cấu trúc 4 mục Worldbook chuẩn ([InitVar] vô hiệu hóa, [mvu_update] rules/format, danh sách biến D0/D1), cơ chế nạp biến có chọn lọc và ghi đè tin nhắn mở đầu (Multi-greeting initvar overrides).\n' +
                        '- "json_patch": Tiêu chuẩn JSON Patch RFC 6902, quy trình suy luận 3 bước CoT <Analysis>, các toán tử replace/delta/insert/remove/move.\n' +
                        '- "regex_scripts": Nguyên lý ghép cặp Regex (ẩn prompt và làm đẹp giao diện hiển thị HTML <StatusPlaceHolderImpl/>).\n' +
                        '- "variable_naming": Quy ước đặt tên biến (cấm macro trong key), bảng so sánh cú pháp đường dẫn, tiền tố chỉ đọc "_" và tiền tố ẩn "$".\n' +
                        '- "change_propagation": Ma trận lan truyền thay đổi 3 tầng khi Thêm/Sửa/Đổi tên/Xóa biến.\n' +
                        '- "ejs_integration": Tích hợp Template Prompt EJS (ST-Prompt-Template), đọc biến getvar(), phân tầng tính cách/cốt truyện đa giai đoạn.\n' +
                        '- "tavern_helper_scripting": Script Tửu quán trợ thủ can thiệp biến dưới nền, lắng nghe sự kiện MVU (COMMAND_PARSED, VARIABLE_UPDATE_ENDED), API get/replace/parse.\n' +
                        '- "troubleshooting": Hướng dẫn xác minh nhật ký, khắc phục lỗi vàng/đỏ thường gặp, và chế độ bật/tắt macro khi biên soạn card.\n' +
                        '- "tools_guide": Hướng dẫn sử dụng phối hợp bộ 4 công cụ (inspect, scaffold, mutate, set) của Agent.',
                },
            },
        },
    },
    execute: async (args: Record<string, any>): Promise<ToolResult> => {
        const topic = args.topic || 'all';

        const sections: Record<string, string> = {
            architecture: `## 1. KIẾN TRÚC 3 TẦNG CỐT LÕI, NGUYÊN LÝ SÀN LINH HOẠT & ĐỊNH TUYẾN MÔ HÌNH KÉP

### 1.1. Bản chất MVU (MagVarUpdate)
MVU là framework theo dõi trạng thái nhân vật theo thời gian thực (Live Status Tracking) tiên tiến nhất trong SillyTavern. Toàn bộ hệ sinh thái kết hợp 3 tầng liên hoàn:
1. **TavernHelper Script (Kịch bản cấu trúc biến)**: Script Zod 4 Schema chạy nền để định nghĩa kiểu dữ liệu, ràng buộc và tự động kiểm tra/sửa chữa giá trị (Validation & Sanitization) sau mỗi lượt cập nhật.
2. **Worldbook Entries (4 mục chuyên dụng)**: Khởi tạo giá trị ban đầu ([InitVar]), quy định quy tắc cập nhật ([mvu_update]), hướng dẫn định dạng lệnh đầu ra JSON Patch ([mvu_update]), và đưa biến vào ngữ cảnh câu hỏi (Danh sách biến).
3. **Regex Scripts**: Các bộ lọc chính quy chạy song song để ẩn lệnh cập nhật khỏi AI prompt (tiết kiệm token) và làm đẹp kết quả hiển thị cho người chơi.

### 1.2. Nguyên lý Sàn Linh Hoạt (Zero Hardcoding & Anti-Template)
- **TUYỆT ĐỐI KHÔNG DÙNG TEMPLATE RẬP KHUÔN**: Không bao giờ ép một card vào các chủ đề mẫu định sẵn (như tu tiên, rpg hay tình cảm). Mỗi nhân vật có Lore, thế giới, tính cách và quy tắc riêng biệt.
- **Tự do kiến tạo biến**: Phân tích kỹ lưỡng thông tin nhân vật để tạo ra bộ biến tối ưu:
  - Thế giới Sinh tồn / Hậu tận thế: \`Thể_lực\`, \`Độ_đói\`, \`Cơn_khát\`, \`Nhiễm_xạ\`, \`Độ_bền_trang_bị\`.
  - Trinh thám / Huyền bí: \`Độ_khả_nghi\`, \`Tâm_lý_bất_an\`, \`Manh_mối_nắm_giữ\`, \`Mức_độ_tỉnh_táo_Sanity\`.
  - Khoa học viễn tưởng: \`Năng_lượng_lõi\`, \`Nhiệt_độ_hệ_thống\`, \`Tải_trọng_CPU\`, \`Tình_trạng_khiên\`.
  - Cổ trang / Kiếm hiệp: \`Tu_vi\`, \`Chân_nguyên\`, \`Cảnh_giới\`, \`Thiện_cảm\`, \`Bảo_vật\`.

### 1.3. Định tuyến mô hình kép (Dual-AI Routing)
MVU hỗ trợ 2 cơ chế vận hành:
- **Xuất cùng AI (Single AI)**: Một AI vừa viết cốt truyện vừa xuất lệnh cập nhật ở cuối phản hồi.
- **Phân tích mô hình bổ sung (Dual AI)**: Một AI chuyên viết cốt truyện, một AI khác độc lập phân tích cốt truyện để cập nhật biến.

**Quy tắc tiền tố tên mục Worldbook để điều phối routing:**
- Tên chứa \`[mvu_plot]\`: Chỉ gửi cho AI phụ trách cốt truyện.
- Tên chứa \`[mvu_update]\`: Chỉ gửi cho AI phụ trách cập nhật biến (bắt buộc gắn cho Quy tắc cập nhật & Định dạng đầu ra).
- Tên không chứa cả hai (như \`Danh sách biến\`): Tự động gửi cho CẢ HAI AI.
Cách đặt tên này giúp card tự động tương thích 100% với cả môi trường Single-AI lẫn Dual-AI.`,

            zod_rules: `## 2. CÚ PHÁP ZOD 4 SCHEMA CHUẨN MVU (ZOD 4 RULES)

### 2.1. Môi trường thực thi & Import
- Thư viện \`z\` (Zod 4.x) và \`_\` (Lodash) đã được SillyTavern và TavernHelper nạp toàn cục. **TUYỆT ĐỐI KHÔNG import z hay lodash trong mã Schema**.
- Kịch bản Zod Schema luôn có định dạng bọc chuẩn:
\`\`\`javascript
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  // Định nghĩa cấu trúc biến ở đây
});

$(() => {
  registerMvuSchema(Schema);
});
\`\`\`

### 2.2. Tính Lũy Đẳng (Idempotent Operation)
Schema được thiết kế để phân tích các bản cập nhật gia tăng của thế giới. Do đó, kết quả đầu ra của \`Schema.parse(input)\` bắt buộc phải là một đầu vào hợp lệ của chính \`Schema.parse\`:
\`\`\`text
Schema.parse(Schema.parse(input)) === Schema.parse(input)
\`\`\`
Phải hết sức thận trọng khi sử dụng \`z.transform\`, bảo đảm hàm chuyển đổi không làm biến đổi cấu trúc theo cách gây lỗi ở lần parse kế tiếp.

### 2.3. Cú pháp các kiểu dữ liệu
1. **Kiểu Số (Number)**:
   - Luôn ưu tiên dùng \`z.coerce.number()\` thay vì \`z.number()\` để tự động ép kiểu chuỗi số từ LLM.
   - **Kẹp khoảng (Clamp) bằng transform**: Khi có giới hạn Min - Max, luôn dùng Lodash \`_.clamp\` trong \`transform\`:
     \`z.coerce.number().transform(v => _.clamp(v, 0, 100)).prefault(100)\`
     *Lý do*: Nếu dùng \`.min(0).max(100)\`, khi AI xuất giá trị 105, toàn bộ cập nhật sẽ bị từ chối/báo lỗi. Dùng \`transform\` giúp tự động nắn giá trị về 100 một cách êm ái.
2. **Kiểu Chuỗi (String)**:
   - \`z.string().prefault('Giá trị mặc định')\`
3. **Kiểu Logic (Boolean)**:
   - Dùng \`z.boolean().prefault(false)\`. **KHÔNG dùng \`z.coerce.boolean()\`**.
4. **Kiểu Đối tượng & Mảng (Object/Record vs Array)**:
   - **ƯU TIÊN DÙNG \`z.record\` THAY VÌ \`z.array\`**: Chỉ số mảng (index 0, 1, 2) rất khó duy trì và dễ lệch khi AI thực hiện JSON Patch chèn/xóa. Do đó:
     - Khóa cố định bắt buộc + cùng loại: \`z.record(z.enum(['Khóa1', 'Khóa2']), type)\`
     - Khóa cố định tùy chọn + cùng loại: \`z.partialRecord(z.enum(['Khóa1', 'Khóa2']), type)\`
     - Khóa động tùy chọn + cùng loại (Túi đồ, Nhiệm vụ): \`z.record(z.string().describe('Tên_vật_phẩm'), z.object({ Mô_tả: z.string(), Số_lượng: z.coerce.number().prefault(1) }))\`
     - Khóa cố định + khác loại: \`z.object({ Khóa1: type1, Khóa2: type2 })\`
     - Khóa động nhưng có một số khóa bắt buộc: \`z.intersection(z.object({ Bắt_buộc: type1 }), z.record(z.string(), type2))\`
5. **Đối tượng có thể xóa sạch (Clearable Objects)**:
   - Nếu một đối tượng có thể bị xóa bằng JSON Patch \`{ "op": "remove", "path": "/path/to/object" }\`, hãy dùng \`z.object({ ... }).prefault({})\` thay vì \`z.object({ ... }).optional()\` để tương thích tốt nhất với cập nhật gia tăng.
6. **Giá trị mặc định (.prefault)**:
   - Trong Zod 4, **luôn ưu tiên \`.prefault(...)\` thay vì \`.default(...)\`**.
   - Nếu một đối tượng phức hợp có \`.prefault({})\`, **TẤT CẢ các trường con bên trong nó cũng phải có \`.prefault(...)\`**.
7. **Quy tắc về hàm**:
   - \`z.transform\`: Hàm chỉ nhận duy nhất 1 tham số \`(value) => NewOutput\`. **TUYỆT ĐỐI KHÔNG dùng \`(value, context) => ...\`**.
   - \`z.extend\`: Chỉ dùng được trên \`z.object\`. Không thể gọi \`.extend()\` sau khi đã gắn \`.prefault({})\`.
   - **Cấm kỵ**: KHÔNG dùng \`z.passthrough()\` hay \`z.strict()\` (không tồn tại trong Zod 4).
8. **Duy trì thứ tự khóa chèn vào**:
   - Nếu cần thao tác với thời gian chèn của khóa (như giới hạn 10 danh hiệu mới nhất), dùng \`_(data).entries().takeRight(10).fromPairs().value()\`.`,

            worldbook_structure: `## 3. CẤU TRÚC 4 MỤC WORLDBOOK CHUẨN MVU & KHỞI TẠO ĐA BỐI CẢNH

Bốn mục Worldbook tạo nên chuỗi mắt xích cung cấp dữ liệu cho LLM:

### 3.1. Mục 1: \`[InitVar] Khởi tạo biến cấm bật\`
- **Nội dung**: Định dạng YAML của toàn bộ trạng thái khởi tạo ban đầu, khớp cấu trúc 1-1 với Zod Schema.
- **Trạng thái**: **BẮT BUỘC VÔ HIỆU HÓA (\`enabled: false\`)**!
  > *Nguyên lý sống còn*: MVU engine của TavernHelper chỉ quét và nạp các mục InitVar bị tắt (\`enabled: false\`). Việc vô hiệu hóa mục này ngăn không cho toàn bộ YAML khởi tạo bị gửi thô vào prompt của AI ở mọi tin nhắn, tiết kiệm hàng trăm token mỗi lượt chat.
- **Vị trí**: \`position: 'before_char'\`, \`insertion_order: 100\`.

### 3.2. Mục 2: \`[mvu_update] Quy tắc cập nhật biến\`
- **Nội dung**: YAML hướng dẫn AI khi nào và cách thức biến thay đổi:
\`\`\`yaml
---
Quy_tắc_cập_nhật_biến:
  Thế_giới:
    Thời_gian_hiện_tại:
      format: YYYY/MM/DD HH:MM
      check:
        - Cập nhật sau mỗi biến cố, nghỉ ngơi hoặc di chuyển
  Nhân_vật:
    Độ_hảo_cảm:
      type: number
      range: 0~100
      category:
        0~30: Lạnh lùng, đề phòng
        31~70: Thân thiện, tin cậy
        71~100: Gắn bó sâu sắc
      check:
        - Điều chỉnh ±(1~5) dựa trên hành động và lời nói của <user>
    Trang_phục.\${Áo|Quần|Giày}:
      check:
        - Cập nhật khi thay đổi y phục hoặc rách hỏng
\`\`\`
- **Nguyên tắc viết tối ưu**:
  - Bỏ qua các biến tự minh (biến đã rõ nghĩa như \`Địa_điểm_hiện_tại\` không cần viết \`check\`).
  - Gộp các biến cùng loại bằng cú pháp \`\${Khóa1|Khóa2|...}\`.
  - Không viết quy tắc cho biến chỉ đọc (tiền tố \`_\`) và biến ẩn (tiền tố \`$\`).
- **Trạng thái**: \`enabled: true\`, \`constant: true\`, \`position: 'before_char'\`, \`insertion_order: 101\`.

### 3.3. Mục 3: \`[mvu_update] Định dạng đầu ra của biến\`
- **Nội dung**: Hướng dẫn chuẩn JSON Patch RFC 6902 kèm chuỗi suy nghĩ (CoT Analysis) để AI xuất lệnh cập nhật ở cuối phản hồi.
- **Trạng thái**: \`enabled: true\`, \`constant: true\`, \`position: 'before_char'\`, \`insertion_order: 102\`.

### 3.4. Mục 4: \`Danh sách biến\`
- **Nội dung**:
\`\`\`yaml
---
<status_current_variable>
{{format_message_variable::stat_data}}
</status_current_variable>
\`\`\`
- **Vị trí**: Đặt tại **Độ sâu 0 hoặc 1 (Depth 0 hoặc 1)** để AI đọc được trạng thái biến mới nhất ngay cạnh phản hồi gần nhất.
- **Lưu ý**: Tuyệt đối **KHÔNG** thêm tiền tố \`[mvu_update]\` vào mục này để cả AI viết truyện lẫn AI cập nhật biến đều đọc được.

---

### 3.5. Khởi tạo biến cho nhiều bối cảnh mở đầu (Multi-greeting Initvar Overrides)
Mỗi card nhân vật thường có nhiều tin nhắn mở đầu (Alternate Greetings) ứng với các cốt truyện khác nhau. MVU cung cấp 2 phương án xử lý:

1. **Phương án toàn bộ (Khối \`<initvar>\`)**:
   - Trong tin nhắn mở đầu, bọc toàn bộ giá trị YAML khởi tạo bằng \`<UpdateVariable><initvar>...</initvar></UpdateVariable>\`.
   - **Quy tắc**: Khi tin nhắn mở đầu chứa khối \`<initvar>\`, hệ thống sẽ **BỎ QUA HOÀN TOÀN** mục \`[InitVar]\` trong Worldbook và dùng trực tiếp dữ liệu này.
2. **Phương án tăng giảm (Khối \`<JSONPatch>\`)**:
   - Nếu các bối cảnh mở đầu chỉ khác nhau 1-2 biến, dùng \`<UpdateVariable><JSONPatch>[{ "op": "replace", "path": "/...", "value": ... }]</JSONPatch></UpdateVariable>\` trong tin nhắn mở đầu.
   - Hệ thống sẽ nạp \`[InitVar]\` trước, sau đó áp bản patch đè lên ở Tầng 0.`,

            json_patch: `## 4. TIÊU CHUẨN JSON PATCH (RFC 6902) & OUTPUT FORMAT

### 4.1. Cấu trúc phản hồi AI
Khi có thay đổi trạng thái, AI xuất khối \`<UpdateVariable>\` ở cuối câu trả lời:
\`\`\`text
Phần dẫn truyện và lời thoại...

<UpdateVariable>
<Analysis>
- Thời gian trôi qua: Khoảng 15 phút.
- Tình huống đặc biệt: Giao tranh bất ngờ, cho phép biến động mạnh.
- Phân tích từng biến theo rule check:
  + Nhân_vật.HP: Bị trúng kiếm chém, trừ 25 HP.
  + Nhân_vật.Tâm_trạng: Đổi thành 'Cảnh giác cao độ'.
  + Túi_đồ: Đã dùng 1 Bình thuốc hồi phục, giảm số lượng về 0 (xóa).
</Analysis>
<JSONPatch>
[
  { "op": "delta", "path": "/Nhân_vật/HP", "value": -25 },
  { "op": "replace", "path": "/Nhân_vật/Tâm_trạng", "value": "Cảnh giác cao độ" },
  { "op": "remove", "path": "/Nhân_vật/Túi_đồ/Bình_thuốc_hồi_phục" }
]
</JSONPatch>
</UpdateVariable>
\`\`\`

### 4.2. Tác dụng cốt tử của thẻ \`<Analysis>\` (Chain-of-Thought)
Thẻ \`<Analysis>\` là chuỗi suy nghĩ chuyên dụng buộc AI phải tự vấn trước khi thao tác số liệu:
1. **Tính toán thời gian trôi qua**: Ngăn chặn tình trạng nhảy cóc thời gian phi logic.
2. **Phán đoán biến động kịch tính**: Kiểm tra xem tình tiết có đủ đột biến để cho phép số liệu thay đổi mạnh hay không.
3. **Gọi lại quy tắc \`check\`**: Phân tích từng biến dựa trên hành động cụ thể ở tin nhắn hiện tại, tránh cập nhật theo cảm tính.

### 4.3. Bảng tra cứu toán tử JSON Patch
| Toán tử | Mô tả hành động | Ví dụ đường dẫn |
| :--- | :--- | :--- |
| \`replace\` | Thay thế giá trị của đường dẫn đã tồn tại | \`/Nhân_vật/Tâm_trạng\` |
| \`delta\` | Tăng/giảm biến số học (Số dương là tăng, số âm là giảm) | \`/Nhân_vật/HP\` với value: \`-15\` |
| \`insert\` | Thêm khóa mới vào Object, hoặc thêm vào cuối Mảng (\`-\`) | \`/Nhân_vật/Túi_đồ/Bảo_kiếm\` hoặc \`/Nhật_ký/-\` |
| \`remove\` | Xóa hoàn toàn một khóa khỏi Object hoặc phần tử khỏi Mảng | \`/Nhân_vật/Túi_đồ/Vật_phẩm_cũ\` |
| \`move\` | Di chuyển/đổi vị trí từ đường dẫn nguồn sang đích | \`from: "/a", to: "/b"\` |

*Quy tắc đường dẫn*: Phân tách bằng dấu gạch chéo \`/\`, bắt đầu từ gốc của biến (**TUYỆT ĐỐI KHÔNG có tiền tố \`stat_data\`**).`,

            regex_scripts: `## 5. NGUYÊN LÝ GHÉP CẶP REGEX SCRIPTS & HIỂN THỊ GIAO DIỆN

### 5.1. Nguyên tắc Ghép Cặp (Paired Scripts)
Mỗi phần tử hiển thị/xử lý trong SillyTavern cần 2 Regex hoạt động phối hợp:
1. **Script Ẩn (\`promptOnly: true, markdownOnly: false\`)**: Chạy trước khi gửi prompt cho AI, biến đoạn thẻ thành rỗng để AI không thấy -> Tiết kiệm token, tránh AI bị phân tâm.
2. **Script Hiển thị (\`promptOnly: false, markdownOnly: true\`)**: Chạy khi render tin nhắn trên trình duyệt của người chơi -> Thay thế placeholder thành giao diện HTML đẹp mắt.

### 5.2. Bộ 4 Regex Scripts Chuẩn của Hệ Thống MVU
1. **\`[MVU] Ẩn cập nhật biến khỏi AI\` (Hide Variable Update from AI)**:
   - \`findRegex\`: \`/<(update(?:variable)?)>(?:(?!.*<\\/\\1>)(?:(?!<\\1>).)*$|(?:(?!<\\1>).)*<\\/\\1?>)/gsi\`
   - \`replaceString\`: \`""\`
   - \`promptOnly\`: \`true\`, \`markdownOnly\`: \`false\`, \`placement\`: \`[1, 2]\` (áp dụng cả tin nhắn user và AI).
2. **\`[MVU] Làm đẹp cập nhật biến\` (Beautify Variable Update)**:
   - \`findRegex\`: \`/<(update(?:variable)?)>\\s*((?:(?!<\\1>).)*)\\s*<\\/\\1>/gsi\`
   - \`replaceString\`: HTML collapsible/card đẹp mắt hiển thị trạng thái cập nhật cho người dùng.
   - \`promptOnly\`: \`false\`, \`markdownOnly\`: \`true\`, \`placement\`: \`[1, 2]\`.
3. **\`[MVU] Giao diện thanh trạng thái\` (Status Bar UI)**:
   - \`findRegex\`: \`<StatusPlaceHolderImpl/>\`
   - \`replaceString\`: Mã HTML/CSS giao diện trạng thái hiển thị qua \`{{format_message_variable::stat_data}}\`.
   - \`promptOnly\`: \`false\`, \`markdownOnly\`: \`true\`, \`placement\`: \`[2]\`, \`runOnEdit\`: \`true\`.
4. **\`[MVU] Ẩn thanh trạng thái khỏi AI\` (Hide Status Bar from AI)**:
   - \`findRegex\`: \`<StatusPlaceHolderImpl/>\`
   - \`replaceString\`: \`""\`
   - \`promptOnly\`: \`true\`, \`markdownOnly\`: \`false\`, \`placement\`: \`[2]\`.

*Mẹo nâng cao*: Nếu AI hay bị quên và cập nhật lặp lại nội dung cũ, có thể đặt \`minDepth: 4\` cho regex ẩn cập nhật biến, để AI vẫn thấy khối cập nhật của 1-2 tin nhắn gần nhất.`,

            variable_naming: `## 6. QUY ƯỚC ĐẶT TÊN BIẾN & SO SÁNH CÚ PHÁP ĐƯỜNG DẪN

### 6.1. Quy tắc đặt tên biến
- **CẤM DÙNG MACRO SILLYTAVERN TRONG TÊN BIẾN**: Tuyệt đối không dùng \`{{user}}\` hay \`{{char}}\` làm khóa biến JSON/YAML (ví dụ \`{{user}}.HP\` là SAI). Khi người chơi đổi tên persona, cấu trúc biến sẽ bị vỡ. Hãy dùng tên định danh cố định như \`Nhân_vật_chính\`, \`Người_chơi\`, hoặc tên riêng của nhân vật.
- **Dùng danh từ rõ nghĩa, chuẩn UTF-8**: Khuyến khích đặt tên có dấu hoặc không dấu nhất quán (ví dụ: \`Độ_hảo_cảm\`, \`HP\`, \`Túi_đồ\`).

### 6.2. Tiền tố đặc biệt
| Tiền tố | AI nhìn thấy? | AI được cập nhật qua JSONPatch? | Mục đích & Công dụng |
| :--- | :---: | :---: | :--- |
| **Không tiền tố** | Có | Có | Biến thông thường (HP, Mana, Tâm trạng, Túi đồ, Nhiệm vụ...). |
| **\`_\` (Gạch dưới)** | Có | **KHÔNG** | **Biến chỉ đọc (Readonly)**. AI nhìn thấy để nhập vai nhưng bị cấm sửa đổi (Ví dụ: \`_Giới_hạn_HP\`, \`_Đặc_tính_cố_định\`, \`_Thân_phận\`). |
| **\`$\` (Dollar)** | **KHÔNG** | **KHÔNG** | **Biến ẩn nội bộ (Hidden)**. AI hoàn toàn không thấy trong prompt, chỉ dùng cho EJS/TavernHelper script tính toán (Ví dụ: \`$timestamp\`, \`$retry_count\`, \`$debug_flag\`). |

### 6.3. Bảng so sánh định dạng đường dẫn qua các tầng
| Ngữ cảnh thao tác | Cú pháp đường dẫn | Ví dụ cụ thể |
| :--- | :--- | :--- |
| **EJS / Thanh trạng thái / Script** | Dấu chấm phân cấp, bắt đầu bằng \`stat_data\` | \`stat_data.Bạch_Á.Độ_hảo_cảm\` |
| **AI xuất JSON Patch** | Phân tách \`/\`, không có \`stat_data\` | \`/Bạch_Á/Độ_hảo_cảm\` |
| **YAML InitVar / Worldbook** | Thụt lề lồng nhau phân cấp | \`Bạch_Á:\` thụt lề \`Độ_hảo_cảm: 35\` |`,

            change_propagation: `## 7. MA TRẬN LAN TRUYỀN THAY ĐỔI (CHANGE PROPAGATION MATRIX)

Khi thêm mới, đổi tên, sửa kiểu dữ liệu hoặc xóa một biến trong hệ thống MVU, bắt buộc phải cập nhật đồng bộ toàn bộ 3 tầng để tránh lỗi lệch pha:

| Thao tác | 1. Zod Script (TavernHelper) | 2. [InitVar] YAML | 3. [mvu_update] Rules YAML |
| :--- | :--- | :--- | :--- |
| **Thêm biến (Add)** | Chèn định nghĩa \`z.coerce...\` vào Schema | Thêm giá trị khởi tạo tương ứng | Thêm rule \`check\` và \`range\` |
| **Sửa biến (Modify)** | Cập nhật hàm clamp/prefault/type | Cập nhật giá trị khởi tạo mới | Cập nhật \`range\` hoặc \`check\` |
| **Đổi tên (Rename)** | Đổi tên thuộc tính trong object | Đổi key trong YAML | Đổi đường dẫn target trong rule |
| **Xóa biến (Delete)** | Xóa dòng khai báo Zod | Xóa khóa khỏi YAML | Xóa quy tắc kiểm tra |

*Lưu ý*: Công cụ \`mutate_mvu_schema\` của Agent đã tự động hóa 100% quy trình đồng bộ 3 tầng này trong một bước duy nhất.`,

            ejs_integration: `## 8. TÍCH HỢP TEMPLATE PROMPT EJS (ST-PROMPT-TEMPLATE) & THIẾT LẬP ĐA GIAI ĐOẠN

### 8.1. Nguyên lý phân tầng prompt động (Dynamic Prompt Staging)
Trong thẻ truyền thống, AI đọc toàn bộ thiết lập ở mọi thời điểm, dẫn đến việc phân bổ chú ý hỗn loạn và nhầm lẫn trạng thái (ví dụ: bối cảnh ban đầu là thù địch nhưng AI lại cư xử như lúc đã thân mật).
**Giải pháp EJS**: Dùng biến MVU làm điều kiện để chỉ gửi prompt của giai đoạn hiện tại vào context của LLM.

### 8.2. Cú pháp đọc biến chuẩn trong EJS
\`\`\`javascript
<%_
if (typeof gw === 'undefined') var gw = getvar('stat_data.Nhân_vật.Độ_hảo_cảm', { defaults: 0 });
if (typeof rel === 'undefined') var rel = getvar('stat_data.Nhân_vật.Mối_quan_hệ', { defaults: 'Người_lạ' });
_%>
\`\`\`
**Quy tắc an toàn EJS**:
- Luôn kiểm tra \`typeof ... === 'undefined'\` để tránh lỗi khai báo đè khi chạy qua nhiều mục.
- Bắt buộc dùng \`var\` (không dùng \`const\`/\`let\` vì phạm vi block scope trong EJS).
- Đường dẫn đọc biến luôn bắt đầu bằng \`stat_data.\`.

### 8.3. Thực chiến hệ thống thiết lập đa giai đoạn
\`\`\`text
<%_ if (gw < 30) { _%>
[Thái độ hiện tại]: Nhân vật giữ khoảng cách thận trọng, lời lẽ lạnh nhạt, cảnh giác trước mọi đề nghị.
<%_ } else if (gw < 70) { _%>
[Thái độ hiện tại]: Nhân vật cởi mở, xem bạn là đồng đội đáng tin cậy, sẵn sàng hỗ trợ khi cần.
<%_ } else { _%>
[Thái độ hiện tại]: Nhân vật tuyệt đối tin tưởng, sẵn sàng hy sinh và bộc lộ những tâm sự sâu kín nhất.
<%_ } _%>
\`\`\`
AI chỉ nhìn thấy duy nhất 1 đoạn miêu tả tương ứng với mức hảo cảm hiện tại, tiết kiệm token tối đa và triệt tiêu hoàn toàn mâu thuẫn tính cách.`,

            tavern_helper_scripting: `## 9. SCRIPT TỬU QUÁN TRỢ THỦ: ĐIỀU KHIỂN BIẾN DƯỚI NỀN

Khi cần can thiệp logic phức tạp vượt ngoài khả năng của Zod validation (như so sánh giá trị cũ - mới, kích hoạt sự kiện âm thanh/thông báo, ràng buộc chéo nhiều nhân vật), sử dụng Script Tửu quán trợ thủ (TavernHelper Script).

### 9.1. Khởi tạo bắt buộc
Phần đầu script luôn phải chờ MVU sẵn sàng:
\`\`\`javascript
await waitGlobalInitialized('Mvu');
\`\`\`

### 9.2. Lắng nghe sự kiện MVU
1. **Lắng nghe \`Mvu.events.COMMAND_PARSED\`**:
   Sửa chữa lệnh cập nhật trước khi áp dụng:
\`\`\`javascript
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.COMMAND_PARSED, commands => {
  commands.forEach(cmd => {
    // Sửa lỗi model chèn ký tự lạ vào đường dẫn
    if (cmd.path) cmd.path = cmd.path.replace(/\\s+/g, '_');
  });
});
\`\`\`

2. **Lắng nghe \`Mvu.events.VARIABLE_UPDATE_ENDED\`**:
   Lấy giá trị biến trước và sau khi cập nhật để kích hoạt phản hồi:
\`\`\`javascript
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (newVars, oldVars) => {
  const oldVal = _.get(oldVars, 'stat_data.Nhân_vật.HP');
  const newVal = _.get(newVars, 'stat_data.Nhân_vật.HP');
  if (oldVal > 0 && newVal <= 0) {
    toastr.error('Nhân vật đã gục ngã trong giao tranh!');
  }
});
\`\`\`

### 9.3. Đọc và ghi biến bằng mã JavaScript
\`\`\`javascript
await waitGlobalInitialized('Mvu');

// Lấy dữ liệu biến của tin nhắn mới nhất
const currentData = Mvu.getMvuData({ type: 'message', message_id: -1 });

// Sửa đổi biến qua Lodash
_.update(currentData, 'stat_data.Nhân_vật.Thể_lực', val => _.clamp(val - 10, 0, 100));

// Ghi đè trở lại tin nhắn
await Mvu.replaceMvuData(currentData, { type: 'message', message_id: -1 });
\`\`\``,

            troubleshooting: `## 10. HƯỚNG DẪN KIỂM TRA, XÁC MINH & KHẮC PHỤC SỰ CỐ THƯỜNG GẶP

### 10.1. Kiểm tra xác minh biến đã hoạt động chưa
1. Đảm bảo API kết nối đang chọn chế độ **Chat Completion**.
2. Thẻ nhân vật bắt buộc phải có **Tin nhắn mở đầu (First Mesage)**.
3. Mở một phiên chat mới. Nhấp vào **Biểu tượng Cây đũa thần bên trái khung chat -> Trình xem nhật ký (Log Viewer)**:
   - Nếu thấy dòng: \`[Script|Cấu trúc biến]: Cấu trúc biến đã đăng ký thành công\` -> Schema Zod hợp lệ 100%.
   - Nhấp vào **Cây đũa thần -> Trình quản lý biến -> Tầng tin nhắn** để xem cây thư mục biến thực tế.

### 10.2. Chẩn đoán và sửa lỗi màu thông báo
- **Không có log đăng ký hoặc xuất hiện thông báo màu vàng \`[Script|MVU] Đã xảy ra lỗi cập nhật biến\`**:
  -> Lỗi cú pháp trong kịch bản Zod Schema (như import sai, dùng hàm cấm \`passthrough\`, hoặc thiếu dấu đóng ngoặc).
- **Xuất hiện thông báo màu đỏ \`[Script|Cấu trúc biến] Khởi tạo biến thất bại\`**:
  -> Lỗi định dạng YAML trong mục Worldbook \`[InitVar]\` hoặc cấu trúc YAML không khớp với Schema Zod.

### 10.3. Nút công tắc Macro khi biên soạn thẻ
Phía trên khung nhập liệu của SillyTavern có nút **Bật/Tắt template prompt và macro**:
- **Khi tạo / chỉnh sửa Card**: TẮT -> Để AI nhìn thấy mã nguồn thô (raw macros/EJS) phục vụ biên soạn.
- **Khi test / trò chuyện**: BẬT -> Để các macro và biến render thành dữ liệu thực tế.`,

            tools_guide: `## 11. HƯỚNG DẪN PHỐI HỢP BỘ 5 CÔNG CỤ MVU CỦA AGENT

1. **Khi cần kiểm tra/đánh giá hiện trạng Card**:
   - Gọi \`inspect_mvu\` -> Trả về tình trạng Zod Schema, cây biến thực tế trong chat, nội dung Worldbook, và cảnh báo sai lệch.
2. **Khi cần khởi tạo hệ thống MVU cho Card mới/Card thường**:
   - Phân tích bối cảnh, lore của nhân vật để đề xuất bộ biến phù hợp.
   - Gọi \`scaffold_mvu_card\` với danh sách \`variables\` tùy biến (hoặc schema Zod/YAML riêng). **Tuyệt đối không dùng template cứng!**
   - Nếu card đã có MVU từ trước, hệ thống sẽ cảnh báo về việc ghi đè.
3. **Khi cần thêm/sửa/đổi tên/xóa biến**:
   - Gọi \`mutate_mvu_schema\` với các hành động (\`add\`, \`modify\`, \`rename\`, \`delete\`). Công cụ này tự động đồng bộ hóa toàn bộ 3 tầng (Zod Script, [InitVar] YAML, [mvu_update] Rules YAML).
4. **Khi cần điều chỉnh nhanh giá trị biến trong phiên chat**:
   - Gọi \`set_mvu_variable\` với đường dẫn \`path\` và giá trị \`value\` mới.
5. **Khi cần tra cứu kiến trúc và cú pháp chuẩn**:
   - Gọi \`mvu_instruct\` với các chủ đề cần tìm hiểu.

**Nguyên tắc an toàn**: Trước khi thực hiện scaffold, mutate đa biến, hoặc bất kỳ chỉnh sửa sâu nào đối với Card, hãy luôn nhắc người dùng chủ động sử dụng tính năng **Export** của SillyTavern để lưu lại thẻ gốc về máy tính. Điều này bảo đảm an toàn dữ liệu 100% và người dùng luôn có đường lui vững chắc.`,
        };

        if (topic === 'all') {
            const allContent = Object.values(sections).join('\n\n---\n\n');
            return {
                content: allContent,
            };
        }

        const selectedSection = sections[topic];
        if (!selectedSection) {
            return {
                isError: true,
                content: `Chủ đề "${topic}" không hợp lệ. Các chủ đề khả dụng: ${Object.keys(sections).join(', ')}`,
            };
        }

        return {
            content: selectedSection,
        };
    },
};
