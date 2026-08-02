import { describe, expect, it } from "vitest";
import { germanDateToIso, parseGermanNumber, parseTrText } from "./parseTr";

const HOA_DON_MAU = [
  "TRADE REPUBLIC BANK GMBH",
  "Brunnenstrasse 19-21, 10119 Berlin",
  "DATUM 02.07.2026",
  "ABRECHNUNGSNR. 2026070200483915",
  "DEPOT DE00 0000 0000 0000 0000 00",
  "WERTPAPIERABRECHNUNG",
  "Sparplanausfuehrung",
  "POSITION ANZAHL DURCHSCHNITTSKURS BETRAG",
  "Vanguard FTSE All-World UCITS ETF",
  "Registered Shares USD Acc. oN",
  "ISIN: IE00BK5BQT80",
  "1,047730 Stk. 128,85 EUR 135,00 EUR",
  "Fremdkostenzuschlag 0,00 EUR",
  "GESAMT 135,00 EUR",
  "Ausfuehrungstag 02.07.2026, Valuta 04.07.2026.",
  "Seite 1 von 1",
].join("\n");

describe("parseGermanNumber", () => {
  it("đọc đúng dấu phẩy thập phân", () => {
    expect(parseGermanNumber("135,00")).toBe(135);
    expect(parseGermanNumber("1.234,56")).toBe(1234.56);
    expect(parseGermanNumber("1,047730")).toBeCloseTo(1.04773, 6);
    expect(Number.isNaN(parseGermanNumber("abc"))).toBe(true);
  });
});

describe("germanDateToIso", () => {
  it("đổi dd.mm.yyyy sang ISO", () => {
    expect(germanDateToIso("02.07.2026")).toBe("2026-07-02");
    expect(germanDateToIso("31.12.2026")).toBe("2026-12-31");
    expect(germanDateToIso("2026-07-02")).toBe("");
  });
});

describe("parseTrText", () => {
  it("bóc đủ bốn trường từ hóa đơn mẫu", () => {
    const r = parseTrText(HOA_DON_MAU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.side).toBe("buy");
    expect(r.value.date).toBe("2026-07-02");
    expect(r.value.isin).toBe("IE00BK5BQT80");
    expect(r.value.quantity).toBeCloseTo(1.04773, 6);
    expect(r.value.unitPrice).toBeCloseTo(128.85, 2);
    expect(r.value.amount).toBe(135);
    expect(r.value.docNumber).toBe("2026070200483915");
  });

  it("KHÔNG nhặt nhầm 0,00 của dòng Fremdkostenzuschlag", () => {
    const r = parseTrText(HOA_DON_MAU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fee).toBe(0);
    expect(r.value.amount).not.toBe(0);
  });

  it("không cảnh báo khi số lượng nhân giá khớp số tiền", () => {
    const r = parseTrText(HOA_DON_MAU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });

  it("vẫn đúng khi PDF trả về mọi thứ trên một dòng", () => {
    const r = parseTrText(HOA_DON_MAU.replace(/\n/g, " "));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.quantity).toBeCloseTo(1.04773, 6);
    expect(r.value.amount).toBe(135);
  });

  it("đọc được ngày có chữ ü và số tiền hàng nghìn", () => {
    const text = HOA_DON_MAU.replace("Ausfuehrungstag 02.07.2026", "Ausführungstag 15.08.2026")
      .replace("GESAMT 135,00 EUR", "GESAMT 1.350,00 EUR")
      .replace("1,047730 Stk. 128,85 EUR 135,00 EUR", "10,477300 Stk. 128,85 EUR 1.350,00 EUR");
    const r = parseTrText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.date).toBe("2026-08-15");
    expect(r.value.amount).toBe(1350);
  });

  it("nhận ra lệnh bán", () => {
    const r = parseTrText(HOA_DON_MAU.replace("Sparplanausfuehrung", "Verkauf"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.side).toBe("sell");
  });

  it("báo lỗi khi tệp không phải hóa đơn Trade Republic", () => {
    const r = parseTrText("Rechnung Stadtwerke Berlin GESAMT 42,00 EUR am 02.07.2026");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Trade Republic");
  });

  it("báo lỗi khi PDF không có lớp chữ", () => {
    const r = parseTrText("   ");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("chữ");
  });

  it("cảnh báo khi số lượng nhân giá lệch quá nhiều", () => {
    const r = parseTrText(HOA_DON_MAU.replace("128,85 EUR 135,00 EUR", "99,00 EUR 135,00 EUR"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
