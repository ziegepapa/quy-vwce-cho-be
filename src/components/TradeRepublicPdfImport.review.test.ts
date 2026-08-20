// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LOCALE_KEY, LocaleProvider } from "../lib/locale";

const dbMocks = vi.hoisted(() => ({
  deleteDepotStatement: vi.fn(),
  findDepotStatementByStatementId: vi.fn(),
  findTransactionByExternalRef: vi.fn(),
  listDepotStatements: vi.fn(),
  saveDepotStatement: vi.fn(),
  uid: vi.fn(() => "tx-test"),
  upsertInstrument: vi.fn(),
  upsertTransaction: vi.fn(),
}));
const parserMocks = vi.hoisted(() => ({ parseTrDocumentPdf: vi.fn() }));

vi.mock("../lib/db", () => dbMocks);
vi.mock("../lib/tr/readPdf", () => parserMocks);

import TradeRepublicPdfImport from "./TradeRepublicPdfImport";

const execution = {
  date: "2026-08-20",
  side: "buy" as const,
  isin: "IE00BK5BQT80",
  amount: 100,
  unitPrice: 100,
  quantity: 1,
  fee: 0,
  docNumber: "TR-2026-42",
};

function renderImport(locale: "vi" | "de" = "vi") {
  window.localStorage.setItem(LOCALE_KEY, locale);
  return render(createElement(LocaleProvider, null, createElement(TradeRepublicPdfImport, { transactions: [], onTransactionImported: vi.fn().mockResolvedValue(undefined) })));
}

function uploadInvoice(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["fixture"], "statement.pdf", { type: "application/pdf" })] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.listDepotStatements.mockResolvedValue([]);
  dbMocks.findTransactionByExternalRef.mockResolvedValue(null);
  parserMocks.parseTrDocumentPdf.mockResolvedValue({ ok: true, kind: "execution_invoice", value: execution, warnings: ["source warning"] });
});

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(LOCALE_KEY);
});

describe("TradeRepublicPdfImport review workspace", () => {
  it("renders review and a clear dedupe preflight before enabling the save action", async () => {
    const { container } = renderImport();
    uploadInvoice(container);

    expect(await screen.findByRole("dialog", { name: "Rà soát hóa đơn" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Không có bản trùng")).toBeTruthy());
    expect(screen.getByText("Sẵn sàng xác nhận")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lưu giao dịch" }).hasAttribute("disabled")).toBe(false);
    expect(dbMocks.upsertTransaction).not.toHaveBeenCalled();
  });

  it("keeps confirmation disabled when the preflight finds an existing external reference", async () => {
    dbMocks.findTransactionByExternalRef.mockResolvedValue({ id: "existing" });
    const { container } = renderImport();
    uploadInvoice(container);

    expect(await screen.findByRole("dialog", { name: "Rà soát hóa đơn" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Đã nhập trước đó")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Lưu giao dịch" }).hasAttribute("disabled")).toBe(true);
  });

  it("uses German review copy without Vietnamese import labels", async () => {
    const { container } = renderImport("de");
    uploadInvoice(container);

    expect(await screen.findByRole("dialog", { name: "Abrechnung prüfen" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Kein Duplikat gefunden")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Transaktion speichern" }).hasAttribute("disabled")).toBe(false);
    expect(document.body.textContent).not.toMatch(/Rà soát hóa đơn|Không có bản trùng|Lưu giao dịch/);
  });
});
