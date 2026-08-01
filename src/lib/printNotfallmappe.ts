/**
 * In hồ sơ khẩn cấp qua iframe độc lập.
 *
 * iOS Safari phóng bố cục màn hình lên A4. Ô input/textarea do trình duyệt
 * tự vẽ — CSS không kiểm soát được — nên khi phóng lớn (máy dọc) sinh vệt đen.
 * Cách đúng: không in giao diện app; dựng khung in riêng chỉ có chữ tĩnh.
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

/** CSS chỉ dùng trong iframe in — không lấy CSS app. */
const PRINT_CSS = `
  @page { size: A4 portrait; margin: 14mm; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
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
    border: 1px solid #999999;
    margin: 0 0 10pt;
    background: #ffffff;
    break-inside: auto;
    page-break-inside: auto;
  }

  .print-head,
  .nfm-sec-static > h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8pt 10pt;
    border-bottom: 1px solid #999999;
    font-size: 12pt;
    font-weight: 600;
    color: #000000;
    background: #ffffff;
    break-after: avoid;
    page-break-after: avoid;
  }

  .nfm-sec-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border: 1px solid #999999;
    font-size: 9pt;
    font-weight: 600;
  }

  .nfm-sec-title {
    flex: 1;
    font-size: 12pt;
    font-weight: 600;
  }

  .nfm-box {
    display: block;
  }

  .nfm-field {
    display: block;
    padding: 8pt 10pt;
    border-bottom: 1px solid #dddddd;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-field:last-child {
    border-bottom: none;
  }

  .nfm-field > span {
    display: block;
    font-size: 9pt;
    font-weight: 500;
    color: #333333;
    margin-bottom: 4pt;
  }

  .nfm-row-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .nfm-row-grid .nfm-field:first-child {
    border-right: 1px solid #dddddd;
  }

  .nfm-item {
    display: block;
    padding: 8pt 10pt;
    border-bottom: 1px solid #dddddd;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-item:last-child {
    border-bottom: none;
  }

  .nfm-item-top {
    display: block;
    margin-bottom: 4pt;
  }

  .print-value {
    display: block;
    white-space: pre-wrap;
    word-break: break-word;
    color: #000000;
    font-size: 11pt;
    min-height: 14pt;
    padding-bottom: 2pt;
    border-bottom: 1px dotted #bbbbbb;
  }

  .print-value.print-empty {
    min-height: 16pt;
    color: transparent;
  }

  .nfm-snap {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .nfm-snap-cell {
    padding: 8pt 10pt;
    border-bottom: 1px solid #dddddd;
  }

  .nfm-snap-cell:nth-child(odd) {
    border-right: 1px solid #dddddd;
  }

  .nfm-snap-k {
    display: block;
    font-size: 8pt;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #555555;
    margin-bottom: 2pt;
  }

  .nfm-snap-v {
    display: block;
    font-size: 12pt;
    font-weight: 600;
    color: #000000;
    font-variant-numeric: tabular-nums;
  }

  .nfm-goals {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .nfm-goals li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8pt 10pt;
    border-bottom: 1px solid #dddddd;
    font-size: 10pt;
    color: #000000;
  }

  .nfm-goals li:last-child {
    border-bottom: none;
  }

  .nfm-goals span {
    color: #333333;
    font-variant-numeric: tabular-nums;
  }
`;

/** Đổi input/textarea thành div chữ tĩnh; lấy value từ phần tử gốc tương ứng. */
function replaceFieldsWithStaticText(
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
): void {
  const sourceFields = Array.from(
    sourceRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  );
  const cloneFields = Array.from(
    cloneRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "input, textarea",
    ),
  );

  const count = Math.min(sourceFields.length, cloneFields.length);
  for (let i = 0; i < count; i++) {
    const src = sourceFields[i];
    const clone = cloneFields[i];
    const value = src.value;

    const div = cloneRoot.ownerDocument.createElement("div");
    div.className = value.trim() ? "print-value" : "print-value print-empty";
    if (value.trim()) {
      div.textContent = value;
    } else {
      // Ô trống: chỉ đường chấm (CSS border-bottom), không chữ
      div.textContent = "\u00a0";
    }
    clone.replaceWith(div);
  }

  // Phòng trường hợp số lượng không khớp: gỡ hết input còn sót trên bản sao
  cloneRoot
    .querySelectorAll("input, textarea")
    .forEach((el) => el.remove());
}

/** Đổi details thành div thường; chỉ giữ số thứ tự và tiêu đề. */
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
      wrapper.appendChild(box.cloneNode(true));
    }

    details.replaceWith(wrapper);
  }

  // Mục 6: chuẩn hóa h2 thành print-head cho đồng nhất
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
  const clone = sourceRoot.cloneNode(true) as HTMLElement;

  // 1) Gắn value từ gốc sang bản sao rồi thay input bằng div
  replaceFieldsWithStaticText(sourceRoot, clone);

  // 2) Đổi details → div (sau khi đã thay field, vì box nằm trong details)
  flattenDetails(clone);

  // 3) Gỡ nút, cảnh báo, tiến độ…
  stripChrome(clone);

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

  // Đưa bản sao vào body của iframe (không dùng innerHTML để giữ node đã xử lý)
  idoc.body.appendChild(idoc.importNode(clone, true));

  const cleanup = () => {
    iwin.removeEventListener("afterprint", onAfterPrint);
    if (iframe.parentNode) iframe.remove();
  };

  const onAfterPrint = () => {
    cleanup();
  };

  iwin.addEventListener("afterprint", onAfterPrint);

  // iOS đôi khi không phát afterprint — dọn sau vài giây
  window.setTimeout(cleanup, 60_000);

  // Cho layout iframe ổn định rồi in
  const runPrint = () => {
    try {
      iwin.focus();
      iwin.print();
    } catch {
      cleanup();
    }
  };

  // requestAnimationFrame kép: chờ style + layout trong iframe
  requestAnimationFrame(() => {
    requestAnimationFrame(runPrint);
  });
}
