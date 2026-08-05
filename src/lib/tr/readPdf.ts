/** Thin PDF-to-text adapter. All parsing stays in pure, testable modules. */
import * as pdfjs from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { parseTrDocumentText } from "./depotStatement";
import type { TrDocumentParseResult } from "./depotStatement";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export async function readPdfText(file: Blob): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const out: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      let lastY: number | null = null;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(Number(item.transform?.[5] ?? 0) * 10) / 10;
        if (lastY !== null && Math.abs(y - lastY) > 1) out.push("\n");
        out.push(item.str, " ");
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

/** Reads and classifies either an execution invoice or a depot statement. */
export async function parseTrDocumentPdf(file: Blob): Promise<TrDocumentParseResult> {
  let text = "";
  try {
    text = await readPdfText(file);
  } catch {
    return {
      ok: false,
      kind: "unsupported",
      error: "Không mở được tệp PDF. Tệp có thể hỏng hoặc đặt mật khẩu.",
    };
  }
  return parseTrDocumentText(text);
}
