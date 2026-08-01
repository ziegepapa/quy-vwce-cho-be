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

  /* Mục: không khung — chỉ khoảng trắng giữa các mục */
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

  /* Tiêu đề: đúng một đường kẻ dưới; không nền xám */
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

  /* Số mục: đủ đậm để nhìn thấy, không ô viền */
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

  /*
   * Ô: padding-bottom lớn hơn margin nhãn,
   * để mắt phân biệt rõ khoảng trong ô và khoảng giữa hai ô.
   */
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

  /*
   * Nhãn tiếng Việt: không viết hoa (dấu thanh bị ép),
   * cỡ 8pt, màu đủ đậm để in ra giấy.
   */
  .nfm-field > span,
  .nfm-field > span:first-child,
  .nfm-item-top,
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

  /* Hai cột: khoảng trống, không viền */
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
    padding: 8pt 0 15pt;
    border: none;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .nfm-item:last-child {
    border: none;
  }

  .nfm-item-top {
    margin-bottom: 3pt;
    border: none;
  }

  /* Đúng một đường viết tay dưới giá trị */
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

  /* Mục 6: flex hai cột, số liệu nổi */
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
      // Ô trống: chỉ đường kẻ để viết tay, không chữ
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
