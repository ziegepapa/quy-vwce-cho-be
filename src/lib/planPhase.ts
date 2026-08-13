import type { PlanPhase, PlanStatus, PlanTarget } from "./types";

/**
 * Số năm còn lại đến targetIso tính từ now (floor, dùng phép trừ năm chính xác).
 * Trả về 0 nếu đã qua mốc (đã căt — không âm).
 */
export function yearsUntil(targetIso: string, now: Date = new Date()): number {
  const target = new Date(targetIso);
  let years = target.getFullYear() - now.getFullYear();
  const anniversary = new Date(
    now.getFullYear() + years,
    now.getMonth(),
    now.getDate(),
  );
  if (anniversary > target) years -= 1;
  return Math.max(years, 0);
}

type PhaseRow = {
  minYears: number;
  status: PlanStatus;
  equityPct: number;
  title: string;
  summary: string;
  actions: string[];
};

/**
 * Bảng phase theo số năm còn lại — nội dung chính xác theo spec.
 * Sắp xếp giảm dần minYears để find() trả kết quả đúng.
 */
const PHASE_TABLE: PhaseRow[] = [
  {
    minYears: 6,
    status: "GIỮ",
    equityPct: 100,
    title: "Giai đoạn tăng trưởng",
    summary:
      "Còn nhiều thời gian. Giữ nguyên Sparplan cổ phiếu, không phản ứng theo biến động ngắn hạn.",
    actions: [
      "Giữ mức góp hiện tại vào VWCE (và EIMI nếu có).",
      "Mỗi năm chỉ rà soát 1 lần (sinh nhật hoặc tháng 01).",
      "Không bán vì thị trường tăng/giảm.",
    ],
  },
  {
    minYears: 5,
    status: "GIẢM",
    equityPct: 90,
    title: "Bắt đầu giảm rủi ro",
    summary:
      "Còn khoảng 5 năm. Bắt đầu chuyển một phần nhỏ sang phần an toàn, vẫn giữ phần lớn cổ phiếu.",
    actions: [
      "Giảm tiền mới vào cổ phiếu xuống khoảng 80\u201390% mức hiện tại.",
      "Chuyển khoảng 10% giá trị danh mục sang phần an toàn trong tháng này.",
      "Không dừng hẳn Sparplan cổ phiếu.",
    ],
  },
  {
    minYears: 4,
    status: "GIẢM",
    equityPct: 75,
    title: "Giảm rủi ro tiếp",
    summary: "Còn 4 năm. Tăng dần phần an toàn lên khoảng 25%.",
    actions: [
      "Giảm tiếp tiền mới vào cổ phiếu.",
      "Chuyển thêm một phần danh mục sang phần an toàn (mục tiêu khoảng 25%).",
      "Kiểm tra lại ngày cần tiền và số tiền thật sự cần.",
    ],
  },
  {
    minYears: 3,
    status: "GIẢM",
    equityPct: 55,
    title: "Giảm sâu hơn",
    summary: "Còn 3 năm. Ưu tiên bảo toàn phần sẽ dùng trong 1\u20133 năm đầu.",
    actions: [
      "Đưa phần an toàn lên khoảng 40\u201350%.",
      "Chỉ giữ cổ phiếu với phần tiền chưa chắc cần sớm.",
      "Rà soát Freistellungsauftrag và thuế nếu có.",
    ],
  },
  {
    minYears: 2,
    status: "GIẢM",
    equityPct: 30,
    title: "Ưu tiên bảo toàn vốn",
    summary: "Còn 2 năm. Phần lớn tiền cần dùng nên đã ở dạng an toàn.",
    actions: [
      "Đưa phần an toàn lên khoảng 70%.",
      "Giảm mạnh tiền mới vào cổ phiếu.",
      "Chuẩn bị kế hoạch rút tiền cụ thể (không bán hết một lần).",
    ],
  },
  {
    minYears: 1,
    status: "DỮNG",
    equityPct: 10,
    title: "Dừng góp cổ phiếu",
    summary:
      "Còn khoảng 1 năm. Dừng Sparplan cổ phiếu, chuyển gần như toàn bộ phần cần dùng sang an toàn.",
    actions: [
      "Dừng Savings Plan cổ phiếu.",
      "Chuyển phần còn lại cần dùng sang tiền mặt / Tagesgeld / money-market.",
      "Chỉ giữ lại phần tiền chắc chắn không dùng trong 12\u201318 tháng tới.",
    ],
  },
  {
    minYears: 0,
    status: "SỬ DỤNG",
    equityPct: 0,
    title: "Giai đoạn sử dụng",
    summary:
      "Đã đến thời điểm cần tiền. Rút theo nhu cầu thật, không bán hết mặc định.",
    actions: [
      "Rút đúng số tiền đã xác nhận cần dùng.",
      "Phần chưa dùng có thể giữ tiếp hoặc đặt kế hoạch mới.",
      "Không bán toàn bộ chỉ vì đến hạn.",
    ],
  },
];

/**
 * Trả về PlanPhase theo số năm còn lại đến target, hoặc null nếu target không hợp lệ.
 * Pure function — không có side effect, dễ test.
 */
export function getPlanPhase(
  target: PlanTarget | null | undefined,
  now: Date = new Date(),
): PlanPhase | null {
  if (!target?.targetUseDate) return null;

  const yearsLeft = yearsUntil(target.targetUseDate, now);

  // PHASE_TABLE sắp xếp giảm dần minYears: tìm row đầu tiên có yearsLeft >= minYears
  const row =
    PHASE_TABLE.find((r) => yearsLeft >= r.minYears) ??
    PHASE_TABLE[PHASE_TABLE.length - 1];

  const currentYear = now.getFullYear();
  const alreadyReminded = target.lastGlideReminderYear === currentYear;
  // Spec G.1: nhắc khi chưa nhắc năm này VÀ (≤ 6 năm hoặc đã chuyển phase)
  const showReminder = !alreadyReminded && (yearsLeft <= 6 || row.status !== "GIỮ");

  return {
    status: row.status,
    yearsLeft,
    equityPct: row.equityPct,
    title: row.title,
    summary: row.summary,
    actions: row.actions,
    showReminder,
  };
}

/**
 * Tạo PlanTarget mặc định từ ngày sinh bé (ISO date).
 * Ngày sử dụng = ngày sinh + 18 năm.
 */
export function defaultPlanTarget(birthDateIso: string): PlanTarget {
  const birth = new Date(birthDateIso);
  const target = new Date(birth);
  target.setFullYear(birth.getFullYear() + 18);
  return {
    targetUseDate: target.toISOString().slice(0, 10),
    needFullAmount: true,
  };
}
