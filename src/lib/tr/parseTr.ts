/**
 * V10-B1 — Bóc số từ hóa đơn Trade Republic (Wertpapierabrechnung).
 *
 * QUY TẮC: tệp này KHÔNG import pdfjs và KHÔNG chạm DOM.
 * Đầu vào là chuỗi văn bản đã bóc sẵn từ PDF, nhờ vậy chạy được trong Vitest.
 * Chỉ nhặt đúng những thứ cần: chiều lệnh, ngày, ISIN, số lượng, giá, số tiền, phí.
 */

export type TrSide = "buy" | "sell";

export type TrExecution = {
  side: TrSide;
  /** ISO yyyy-mm-dd */
  date: string;
  isin: string;
  quantity: number;
  unitPrice: number;
  /** Tổng tiền ghi nợ/ghi có, đã gồm phí. */
  amount: number;
  fee: number;
  docNumber: string;
};

export type TrParseResult =
  | { ok: true; value: TrExecution; warnings: string[] }
  | { ok: false; error: string };

/** Tiền kiểu Đức: 135,00 hoặc 1.234,56. Chặn nuốt nhầm 1,047730 nhờ (?!\d). */
const MONEY_SRC = String.raw`\d+(?:\.\d{3})*,\d{2}(?!\d)`;
const ISIN_SRC = String.raw`[A-Z]{2}[A-Z0-9]{9}\d`;

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

  const flat = normalize(rawText);
  const line = flat.replace(/\n/g, " ");
  const warnings: string[] = [];

  const looksLikeTr =
    /TRADE\s+REPUBLIC/i.test(line) || /WERTPAPIERABRECHNUNG/i.test(line);
  if (!looksLikeTr) {
    return { ok: false, error: "Không nhận ra đây là hóa đơn Trade Republic." };
  }

  // Chiều lệnh
  const side: TrSide = /\bVerkauf/i.test(line) ? "sell" : "buy";

  // Ngày: ưu tiên ngày khớp lệnh, sau đó tới DATUM, cuối cùng là ngày đầu tiên gặp.
  const dateRaw =
    grab(/Ausf(?:ue|ü|u)hrungstag\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i, line) ||
    grab(/DATUM\s*:?\s*(\d{2}\.\d{2}\.\d{4})/i, line) ||
    grab(/(\d{2}\.\d{2}\.\d{4})/, line);
  const date = germanDateToIso(dateRaw);
  if (!date) return { ok: false, error: "Không tìm thấy ngày giao dịch." };

  // ISIN
  const isin = (
    grab(new RegExp("ISIN\\s*:?\\s*(" + ISIN_SRC + ")", "i"), line) ||
    grab(new RegExp("\\b(" + ISIN_SRC + ")\\b"), line)
  ).toUpperCase();
  if (!isin) return { ok: false, error: "Không tìm thấy mã ISIN." };

  // Số lượng
  const qtyRaw = grab(/(\d+(?:\.\d{3})*,\d+)\s*(?:St(?:k|ück|ueck)\.?)/i, line);
  const quantity = round(parseGermanNumber(qtyRaw), 6);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: "Không tìm thấy số lượng chứng chỉ quỹ." };
  }

  // Phí — đọc TRƯỚC để không lẫn vào tổng tiền.
  const feeRaw = grab(
    new RegExp("Fremd\\w*{0,40}?(" + MONEY_SRC + ")\\s*EUR", "i"),
    line
  );
  const fee = Number.isFinite(parseGermanNumber(feeRaw)) ? parseGermanNumber(feeRaw) : 0;

  // Tổng tiền — luôn lấy sau chữ GESAMT.
  let amountRaw = grab(
    new RegExp("GESAMT{0,40}?(" + MONEY_SRC + ")\\s*EUR", "i"),
    line
  );
  if (!amountRaw) {
    const all = line.match(new RegExp("(" + MONEY_SRC + ")\\s*EUR", "gi")) || [];
    const nums = all
      .map((s) => parseGermanNumber(s.replace(/\s*EUR/i, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (nums.length > 0) {
      amountRaw = "";
      warnings.push("Không thấy dòng GESAMT — đã lấy số tiền lớn nhất trên hóa đơn.");
      const amountFallback = Math.max.apply(null, nums);
      return finish(amountFallback);
    }
  }
  const amount = parseGermanNumber(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Không tìm thấy tổng số tiền (GESAMT)." };
  }
  return finish(amount);

  function finish(amountValue: number): TrParseResult {
    const net = round(amountValue - fee, 2);

    // Giá mỗi chứng chỉ: lấy số EUR đầu tiên nằm giữa "Stk." và "GESAMT".
    let unitPrice = NaN;
    const stkIdx = line.search(/St(?:k|ück|ueck)\.?/i);
    const gesIdx = line.search(/GESAMT/i);
    if (stkIdx >= 0) {
      const seg = gesIdx > stkIdx ? line.slice(stkIdx, gesIdx) : line.slice(stkIdx);
      const priceRaw = grab(new RegExp("(" + MONEY_SRC + ")\\s*EUR", "i"), seg);
      unitPrice = parseGermanNumber(priceRaw);
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

    const docNumber = grab(/ABRECHNUNGSNR\.?\s*:?\s*([A-Z0-9-]{6,})/i, line);

    return {
      ok: true,
      warnings,
      value: {
        side,
        date,
        isin,
        quantity,
        unitPrice: round(unitPrice, 4),
        amount: round(amountValue, 2),
        fee: round(fee, 2),
        docNumber,
      },
    };
  }
}
