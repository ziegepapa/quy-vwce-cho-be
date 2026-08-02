/**
 * V10-B2 — Lớp mỏng chuyển PDF thành chữ, rồi giao cho parseTr bóc số.
 *
 * Đây là tệp DUY NHẤT phụ thuộc pdfjs. Mọi logic bóc số nằm ở parseTr.ts
 * và được kiểm bằng test, nên tệp này càng mỏng càng tốt.
 */

import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { parseTrText } from "./parseTr";
import type { TrParseResult } from "./parseTr";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

/** Đọc toàn bộ chữ trong PDF. Giữ nguyên cách xuống dòng theo tọa độ y. */
export async function readPdfText(file: Blob): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const out: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(Number(item.transform?.[5] ?? 0) * 10) / 10;
        if (lastY !== null && Math.abs(y - lastY) > 1) out.push("\n");
        out.push(item.str);
        out.push(" ");
        lastY = y;
      }
      out.push("\n");
      page.cleanup();
    }
    return out.join("");
  } finally {
    await doc.destroy();
  }
}

/** Đọc một tệp PDF hóa đơn Trade Republic và bóc ra các con số. */
export async function parseTrPdf(file: Blob): Promise<TrParseResult> {
  let text = "";
  try {
    text = await readPdfText(file);
  } catch {
    return { ok: false, error: "Không mở được tệp PDF. Tệp có thể hỏng hoặc đặt mật khẩu." };
  }
  return parseTrText(text);
}
