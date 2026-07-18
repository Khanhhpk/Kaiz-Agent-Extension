/**
 * Planner
 * Trách nhiệm: Lên kế hoạch thực hiện đa bước trước khi gọi tool, lấy cảm hứng từ kiến trúc agent hiện đại.
 */

export class Planner {
    public plan(objective: string): string[] {
        console.log(`[Planner] Creating plan for objective: ${objective}`);
        // TODO: Phân tích mục tiêu và trả về các bước cần làm
        return ["Step 1: Understand user request", "Step 2: Execute tool"];
    }
}
