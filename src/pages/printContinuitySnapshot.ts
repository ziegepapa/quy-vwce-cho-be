import type { ContinuitySnapshot } from "./continuitySnapshot";

export type ContinuitySnapshotPrintLabels = {
  title: string;
  generatedAt: string;
  localOnly: string;
  plan: string;
  useDate: string;
  planStatus: string;
  yearsLeft: string;
  readiness: string;
  sync: string;
  pending: string;
  notConfigured: string;
};

const PRINT_CSS = `
  @page { size: A4 portrait; margin: 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; color: #18181b; background: #fff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 11pt; line-height: 1.45; }
  main { display: grid; gap: 16pt; }
  header { padding-bottom: 10pt; border-bottom: 1pt solid #18181b; }
  h1 { margin: 0 0 4pt; font-size: 18pt; }
  header p, .note { margin: 0; color: #52525b; font-size: 9pt; }
  dl { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); margin: 0; border-top: .5pt solid #d4d4d8; }
  dt, dd { margin: 0; padding: 9pt 0; border-bottom: .5pt solid #d4d4d8; }
  dt { padding-right: 12pt; color: #52525b; font-size: 9pt; font-weight: 700; }
  dd { font-weight: 600; font-variant-numeric: tabular-nums; }
  footer { padding-top: 2pt; color: #71717a; font-size: 8pt; }
`;

export function printContinuitySnapshot(input: {
  locale: "vi" | "de";
  snapshot: ContinuitySnapshot;
  labels: ContinuitySnapshotPrintLabels;
  formatted: {
    generatedAt: string;
    useDate: string | null;
    yearsLeft: string | null;
    readiness: string;
    sync: string;
    pending: string | null;
  };
}): void {
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

  const documentForPrint = iframe.contentDocument;
  const windowForPrint = iframe.contentWindow;
  if (!documentForPrint || !windowForPrint) {
    iframe.remove();
    return;
  }

  documentForPrint.open();
  documentForPrint.write(`<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><title>${input.labels.title}</title><style>${PRINT_CSS}</style></head><body></body></html>`);
  documentForPrint.close();

  const main = documentForPrint.createElement("main");
  const header = documentForPrint.createElement("header");
  const heading = documentForPrint.createElement("h1");
  heading.textContent = input.labels.title;
  const generated = documentForPrint.createElement("p");
  generated.textContent = `${input.labels.generatedAt}: ${input.formatted.generatedAt}`;
  header.append(heading, generated);
  main.appendChild(header);

  const fields: Array<[string, string]> = [
    [input.labels.plan, input.snapshot.planName],
    [input.labels.useDate, input.formatted.useDate ?? input.labels.notConfigured],
    [input.labels.planStatus, input.snapshot.planStatus ?? input.labels.notConfigured],
    [input.labels.yearsLeft, input.formatted.yearsLeft ?? input.labels.notConfigured],
    [input.labels.readiness, input.formatted.readiness],
    [input.labels.sync, input.formatted.sync],
  ];
  if (input.formatted.pending) fields.push([input.labels.pending, input.formatted.pending]);

  const definitionList = documentForPrint.createElement("dl");
  for (const [label, value] of fields) {
    const term = documentForPrint.createElement("dt");
    term.textContent = label;
    const description = documentForPrint.createElement("dd");
    description.textContent = value;
    definitionList.append(term, description);
  }
  main.appendChild(definitionList);

  const note = documentForPrint.createElement("p");
  note.className = "note";
  note.textContent = input.labels.localOnly;
  main.appendChild(note);

  const footer = documentForPrint.createElement("footer");
  footer.textContent = input.labels.localOnly;
  main.appendChild(footer);
  documentForPrint.body.appendChild(main);

  const cleanup = () => {
    windowForPrint.removeEventListener("afterprint", afterPrint);
    iframe.remove();
  };
  const afterPrint = () => cleanup();
  windowForPrint.addEventListener("afterprint", afterPrint);
  window.setTimeout(cleanup, 60_000);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      windowForPrint.focus();
      windowForPrint.print();
    } catch {
      cleanup();
    }
  }));
}
