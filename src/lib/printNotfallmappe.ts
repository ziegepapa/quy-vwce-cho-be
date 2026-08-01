/**
 * In hồ sơ khẩn cấp qua iframe độc lập.
 *
 * iOS Safari phóng bố cục màn hình lên A4. Ô input/textarea do trình duyệt
 * tự vẽ — CSS không kiểm soát được — nên khi phóng lớn (máy dọc) sinh vệt đen.
 * Cách đúng: không in giao diện app; dựng khung in riêng chỉ có chữ tĩnh.
 *
 * Giá trị ô: cloneNode không mang value. Phải ghi data-print-value lên bản sao
 * NGAY sau clone, khi hai cây còn giống hệt — không ghép theo chỉ số sau khi
 * đã xóa nút/lọc phần tử (sẽ lệch và trượt giá trị sang ô kế).
 */

const REMOVE_SELECTORS = [
  "button",
  ".nfm-actions",
  ".nfm-status",
  ".nfm-add",
  ".nfm-del",
  ".nfm-warn",
  ".nfm-risk",
  ".nfm-progress",
  ".nfm-print-note",
  ".nfm-sec-state",
  ".nfm-chev",
] as const;

const FIELD_SELECTOR = "input, textarea, select";

/**
 * CSS chỉ dùng trong iframe in — không lấy CSS app.
 * Ưu tiên dễ đọc (tiếng Việt có dấu, người lớn tuổi) hơn trang trí.
 * Cấm border-left / border-right — đường dọc bị cắt khi chẻ trang.
 * Cấm text-transform: uppercase — dấu thanh bị ép, 7pt gần như không đọc được.
 */
const PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1a1a1a;
    font-family: -apple-system, "SF Pro Text", system-ui, "Segoe UI", sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .nfm {
    display: block;
    width: 100%;
  }

  .nfm-sec,
  .nfm-sec-static {
    display: block;
    margin: 0 0 20pt;
    padding: 0;
    background: #ffffff;
    border: none;
    border-radius: 0;
    break-inside: auto;
    page-break-inside: auto;
  }

  .print-head,
  .sheet-sec-head,
  .nfm-sec-static > h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 6pt;
    padding: 0 0 6pt;
    border: none;
    border-bottom: 0.75pt solid #1a1a1a;
    font-size: 12pt;
    font-weight: 600;
    color: #1a1a1a;
    background: transparent;
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-sec-num {
    display: inline;
    min-width: 0;
    height: auto;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 11pt;
    font-weight: 600;
    color: #8a8a8a;
    font-variant-numeric: tabular-nums;
  }

  .nfm-sec-title {
    flex: 1;
    font-size: 12pt;
    font-weight: 600;
    color: #1a1a1a;
  }

  .nfm-box {
    display: block;
    border: none;
  }

  .nfm-field {
    display: block;
    padding: 8pt 0 15pt;
    border: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-field:last-child {
    border: none;
  }

  .nfm-field > span,
  .nfm-field > span:first-child,
  .pv-label,
  .nfm-snap-k {
    display: block;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.1pt;
    text-transform: none;
    color: #6b6b6b;
    margin-bottom: 3pt;
  }

  /* Hai cột — phải còn sau khi làm phẳng, không chồng dọc */
  .nfm-row-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 18pt;
    border: none;
  }

  .nfm-row-grid .nfm-field,
  .nfm-row-grid .nfm-field:first-child {
    border: none;
  }

  .nfm-item {
    display: block;
    padding: 6pt 0 10pt;
    border: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-item:last-child {
    border: none;
  }

  /* Hàng tiêu đề giấy tờ: tên đậm, không kiểu nhãn */
  .nfm-item-top {
    display: block;
    margin: 0 0 4pt;
    padding: 0;
    border: none;
  }

  /* Tên giấy tờ in đậm — tiêu đề khối, không phải giá trị ô */
  .print-doc-title {
    display: block;
    font-size: 11pt;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 2pt;
    padding: 0;
    border: none;
  }

  .print-value,
  .pv,
  .pv-multi {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
    color: #1a1a1a;
    font-size: 11pt;
    min-height: 14pt;
    padding: 0 0 3pt;
    margin: 0 0 2pt;
    border: none;
    border-bottom: 0.5pt solid #dcdcdc;
    font-variant-numeric: tabular-nums;
  }

  .print-value.print-empty,
  .pv-empty {
    min-height: 16pt;
    color: transparent;
  }

  .nfm-snap {
    display: flex;
    flex-wrap: wrap;
    gap: 10pt 24pt;
    border: none;
    padding: 4pt 0 0;
  }

  .nfm-snap-cell {
    flex: 1 1 40%;
    min-width: 35%;
    padding: 4pt 0;
    border: none;
  }

  .nfm-snap-cell:nth-child(odd) {
    border: none;
  }

  .nfm-snap-v {
    display: block;
    font-size: 13pt;
    font-weight: 600;
    color: #1a1a1a;
    font-variant-numeric: tabular-nums;
  }

  .nfm-goals {
    list-style: none;
    margin: 8pt 0 0;
    padding: 0;
    border: none;
  }

  .nfm-goals li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 5pt 0;
    border: none;
    border-bottom: 0.5pt solid #dcdcdc;
    font-size: 10pt;
    color: #1a1a1a;
  }

  .nfm-goals li:last-child {
    border-bottom: none;
  }

  .nfm-goals span {
    color: #5a5a5a;
    font-variant-numeric: tabular-nums;
  }

  .sheet-head,
  .sheet-foot {
    border: none;
    color: #6b6b6b;
    font-size: 8pt;
  }
`;

/** Đọc giá trị đang hiển thị từ ô gốc (value / checked / option text). */
function readFieldDisplayValue(el: Element): string {
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    if (type === "checkbox" || type === "radio") {
      return el.checked ? "x" : "";
    }
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return opt ? opt.textContent ?? "" : el.value;
  }
  return "";
}

/**
 * Bước 2 — ghi data-print-value lên từng ô bản sao.
 * Hai cây còn giống hệt (chưa xóa nút, chưa làm phẳng).
 */
function stampPrintValues(sourceRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const sourceFields = Array.from(
    sourceRoot.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
  );
  const cloneFields = Array.from(
    cloneRoot.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
  );

  const count = Math.min(sourceFields.length, cloneFields.length);
  for (let i = 0; i < count; i++) {
    const text = readFieldDisplayValue(sourceFields[i]);
    cloneFields[i].dataset.printValue = text;
  }
}

/**
 * Bước 4 — thay ô nhập bằng div tĩnh, lấy chữ từ data-print-value
 * của CHÍNH phần tử đó (không ghép lại theo chỉ số).
 *
 * Ô trong .nfm-item-top (tên giấy tờ, không nhãn) → tiêu đề đậm.
 * Các ô khác → .print-value dưới nhãn span của label.nfm-field.
 */
function replaceFieldsFromDataAttr(cloneRoot: HTMLElement): void {
  const fields = Array.from(
    cloneRoot.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
  );

  for (const el of fields) {
    const raw = el.dataset.printValue ?? "";
    const value = raw.trim();
    const inItemTop = Boolean(el.closest(".nfm-item-top"));

    const div = cloneRoot.ownerDocument.createElement("div");

    if (inItemTop) {
      // Tên giấy tờ: tiêu đề khối, không phải giá trị dưới nhãn
      div.className = "print-doc-title";
      div.textContent = value || "\u00a0";
    } else {
      div.className = value ? "print-value" : "print-value print-empty";
      div.textContent = value || "\u00a0";
    }

    el.replaceWith(div);
  }
}

/** Đổi details thành div; giữ nguyên .nfm-box (và .nfm-row-grid bên trong). */
function flattenDetails(cloneRoot: HTMLElement): void {
  const detailsList = Array.from(
    cloneRoot.querySelectorAll<HTMLDetailsElement>("details.nfm-sec"),
  );

  for (const details of detailsList) {
    const wrapper = cloneRoot.ownerDocument.createElement("div");
    wrapper.className = "nfm-sec";

    const summary = details.querySelector("summary");
    if (summary) {
      const head = cloneRoot.ownerDocument.createElement("div");
      head.className = "print-head";

      const num = summary.querySelector(".nfm-sec-num");
      const title = summary.querySelector(".nfm-sec-title");
      if (num) head.appendChild(num.cloneNode(true));
      if (title) head.appendChild(title.cloneNode(true));
      wrapper.appendChild(head);
    }

    const box = details.querySelector(".nfm-box");
    if (box) {
      // moveNode — không clone lại, giữ data-print-value đã ghi
      wrapper.appendChild(box);
    }

    details.replaceWith(wrapper);
  }

  cloneRoot.querySelectorAll(".nfm-sec-static > h2").forEach((h2) => {
    const head = cloneRoot.ownerDocument.createElement("div");
    head.className = "print-head";
    const num = h2.querySelector(".nfm-sec-num");
    const title = h2.querySelector(".nfm-sec-title");
    if (num) head.appendChild(num.cloneNode(true));
    if (title) head.appendChild(title.cloneNode(true));
    h2.replaceWith(head);
  });
}

function stripChrome(cloneRoot: HTMLElement): void {
  for (const sel of REMOVE_SELECTORS) {
    cloneRoot.querySelectorAll(sel).forEach((el) => el.remove());
  }
}

/**
 * Dựng iframe ẩn, chép nội dung hồ sơ dạng chữ tĩnh, in iframe, rồi dọn DOM.
 * Không đụng trạng thái gấp/mở của trang gốc.
 */
export function printNotfallmappe(sourceRoot: HTMLElement): void {
  // 1) Clone khi cây còn nguyên
  const clone = sourceRoot.cloneNode(true) as HTMLElement;

  // 2) Ghi data-print-value ngay — hai danh sách còn khớp chỉ số
  stampPrintValues(sourceRoot, clone);

  // 3) Chỉ sau khi đã ghi xong mới được xóa / làm phẳng
  stripChrome(clone);
  flattenDetails(clone);

  // 4) Thay ô bằng div, đọc data-print-value trên chính phần tử
  replaceFieldsFromDataAttr(clone);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  document.body.appendChild(iframe);

  const idoc = iframe.contentDocument;
  const iwin = iframe.contentWindow;
  if (!idoc || !iwin) {
    iframe.remove();
    return;
  }

  idoc.open();
  idoc.write(
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/><title>Hồ sơ khẩn cấp</title><style>${PRINT_CSS}</style></head><body></body></html>`,
  );
  idoc.close();

  idoc.body.appendChild(idoc.importNode(clone, true));

  const cleanup = () => {
    iwin.removeEventListener("afterprint", onAfterPrint);
    if (iframe.parentNode) iframe.remove();
  };

  const onAfterPrint = () => {
    cleanup();
  };

  iwin.addEventListener("afterprint", onAfterPrint);
  window.setTimeout(cleanup, 60_000);

  const runPrint = () => {
    try {
      iwin.focus();
      iwin.print();
    } catch {
      cleanup();
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(runPrint);
  });
}
