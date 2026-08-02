/**
 * V10-B1 — Bóc số từ hóa đơn Trade Republic (Wertpapierabrechnung).
 *
 * QUY TẮC: tệp này KHÔNG import pdfjs và KHÔNG chạm DOM.
 * Đầu vào là chuỗi văn bản đã bóc sẵn từ PDF, nhờ vậy chạy được trong Vitest.
 *
 * QUY TẮC 2: mọi biểu thức tìm kiếm đều viết thẳng, KHÔNG ghép chuỗi.
 * Bản trước ghép chuỗi nên bị rụng mất đoạn  khi truyền qua chat.
 */

export type TrSide = "buy" | "sell";

export type TrExecution = {
  side: TrSide;
  /** ISO yyyy-mm-dd */
  date: string;
  isin: string;
  quantity: number;
  unitPrice: number;
  /** Tổng tiền, đã gồm phí. */
  amount: number;
  fee: number;
  docNumber: string;
};

export type TrParseResult =
  | { ok: true; value: TrExecution; warnings: string[] }
  | { ok: false; error: string };

export function parseGermanNumber(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function germanDateToIso(raw: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!m) return "";
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return "";
  return m[3] + "-" + m[2] + "-" + m[1];
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function grab(re: RegExp, s: string): string {
  const m = re.exec(s);
  return m && m[1] ? m[1] : "";
}

export function parseTrText(rawText: string): TrParseResult {
  if (!rawText || rawText.trim().length < 20) {
    return { ok: false, error: "Tệp không có chữ đọc được. Có thể đây là PDF ảnh chụp." };
  }

  const line = normalize(rawText).replace(/\n/g, " ");
  const warnings: string[] = [];

  if (!/TRADE\s+REPUBLIC/i.test(line) && !/WERTPAPIERABRECHNUNG/i.test(line)) {
    return { ok: false, error: "Không nhận ra đây là hóa đơn Trade Republic." };
  }

  const side: TrSide = /\bVerkauf/i.test(line) ? "sell" : "buy";

  // Ngày: ưu tiên ngày khớp lệnh, rồi tới DATUM, cuối cùng là ngày đầu tiên gặp.
  const dateRaw =
    grab(/Ausf(?:ue|ü|u)hrungstag\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i, line) ||
    grab(/DATUM\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i, line) ||
    grab(/(\d{2}\.\d{2}\.\d{4})/, line);
  const date = germanDateToIso(dateRaw);
  if (!date) return { ok: false, error: "Không tìm thấy ngày giao dịch." };

  const isin = (
    grab(/ISIN\s*:?\s*([A-Z]{2}[A-Z0-9]{9}\d)/i, line) ||
    grab(/\b([A-Z]{2}[A-Z0-9]{9}\d)\b/, line)
  ).toUpperCase();
  if (!isin) return { ok: false, error: "Không tìm thấy mã ISIN." };

  // Số lượng. Dấu (?!\d) ở các mẫu tiền bên dưới ngăn nuốt nhầm "1,04" của "1,047730".
  const quantity = round(
    parseGermanNumber(grab(/(\d+(?:\.\d{3})*,\d+)\s*St(?:k|ück|ueck)\.?/i, line)),
    6
  );
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Không tìm thấy số lượng chứng chỉ quỹ." };
  }

  // Phí — đọc trước, để chắc chắn không lẫn vào tổng tiền.
  const feeParsed = parseGermanNumber(
    grab(/Fremd\w*[\s\S]{0,40}?(\d+(?:\.\d{3})*,\d{2}(?!\d))\s*EUR/i, line)
  );
  const fee = Number.isFinite(feeParsed) ? feeParsed : 0;

  // Tổng tiền — luôn lấy con số đứng sau chữ GESAMT.
  let amount = parseGermanNumber(
    grab(/GESAMT[\s\S]{0,40}?(\d+(?:\.\d{3})*,\d{2}(?!\d))\s*EUR/i, line)
  );
  if (!Number.isFinite(amount) || amount <= 0) {
    const all = line.match(/\d+(?:\.\d{3})*,\d{2}(?!\d)\s*EUR/gi) || [];
    const nums = all
      .map((s) => parseGermanNumber(s.replace(/\s*EUR/i, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length === 0) {
      return { ok: false, error: "Không tìm thấy tổng số tiền (GESAMT)." };
    }
    amount = Math.max.apply(null, nums);
    warnings.push("Không thấy dòng GESAMT — đã lấy số tiền lớn nhất trên hóa đơn.");
  }

  const net = round(amount - fee, 2);

  // Giá mỗi chứng chỉ: số EUR đầu tiên nằm giữa "Stk." và "GESAMT".
  let unitPrice = NaN;
  const stkIdx = line.search(/St(?:k|ück|ueck)\.?/i);
  const gesIdx = line.search(/GESAMT/i);
  if (stkIdx >= 0) {
    const seg = gesIdx > stkIdx ? line.slice(stkIdx, gesIdx) : line.slice(stkIdx);
    unitPrice = parseGermanNumber(
      grab(/(\d+(?:\.\d{3})*,\d{2}(?!\d))\s*EUR/i, seg)
    );
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    unitPrice = round(net / quantity, 4);
    warnings.push("Không đọc được giá mỗi chứng chỉ — đã tự tính từ số tiền chia số lượng.");
  }

  const expected = quantity * unitPrice;
  const tolerance = Math.max(0.05, net * 0.005);
  if (Math.abs(expected - net) > tolerance) {
    warnings.push(
      "Số lượng nhân giá (" +
        round(expected, 2) +
        ") lệch so với số tiền (" +
        net +
        "). Hãy kiểm tra lại trước khi lưu."
    );
  }

  return {
    ok: true,
    warnings,
    value: {
      side,
      date,
      isin,
      quantity,
      unitPrice: round(unitPrice, 4),
      amount: round(amount, 2),
      fee: round(fee, 2),
      docNumber: grab(/ABRECHNUNGSNR\.?\s*:?\s*([A-Z0-9-]{6,})/i, line),
    },
  };
}
