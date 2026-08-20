export type LotEvidenceKind = "purchase" | "sale" | "transfer" | "split" | "partial_sale";
export type LotEvidenceSourceStatus = "known" | "missing" | "conflict";
export type LotEvidenceStatus = "known" | "incomplete" | "unknown";
export type LotEvidenceReviewState = "reviewable" | "not_ready";

/**
 * P11.1 fixture-only input. This type must never be populated from Dexie,
 * Supabase, sync, backup or auth data. Values are intentionally synthetic.
 */
export type LotEvidenceFixtureInput = {
  evidenceId: string;
  eventKind: LotEvidenceKind;
  eventDate: string;
  instrumentLabel: string;
  lotId?: string;
  sourceStatus: LotEvidenceSourceStatus;
  transferSource?: string;
  splitReference?: string;
  quantityStatus: "known" | "missing" | "conflict";
};

export type LotEvidenceRow = {
  evidenceId: string;
  eventKind: LotEvidenceKind;
  eventDate: string;
  instrumentLabel: string;
  lotStatus: LotEvidenceStatus;
  sourceStatus: LotEvidenceSourceStatus;
  quantityStatus: "known" | "missing" | "conflict";
  reviewState: LotEvidenceReviewState;
  reasonCode: "ready" | "missing_lot" | "missing_transfer_source" | "missing_split_reference" | "conflicting_source" | "missing_quantity";
};

export type LotEvidenceSummary = {
  rows: LotEvidenceRow[];
  total: number;
  ready: number;
  notReady: number;
};

function validDate(value: string): boolean {
  const parsed = new Date(value);
  return value.trim().length > 0 && Number.isFinite(parsed.getTime());
}

function classify(input: LotEvidenceFixtureInput): LotEvidenceRow {
  const base = {
    evidenceId: input.evidenceId,
    eventKind: input.eventKind,
    eventDate: input.eventDate,
    instrumentLabel: input.instrumentLabel,
    sourceStatus: input.sourceStatus,
    quantityStatus: input.quantityStatus,
  } as const;

  if (input.sourceStatus === "conflict") {
    return { ...base, lotStatus: "unknown", reviewState: "not_ready", reasonCode: "conflicting_source" };
  }
  if (!input.lotId) {
    return { ...base, lotStatus: "unknown", reviewState: "not_ready", reasonCode: "missing_lot" };
  }
  if (input.eventKind === "transfer" && !input.transferSource) {
    return { ...base, lotStatus: "unknown", reviewState: "not_ready", reasonCode: "missing_transfer_source" };
  }
  if (input.eventKind === "split" && !input.splitReference) {
    return { ...base, lotStatus: "incomplete", reviewState: "not_ready", reasonCode: "missing_split_reference" };
  }
  if (input.quantityStatus !== "known") {
    return { ...base, lotStatus: "unknown", reviewState: "not_ready", reasonCode: "missing_quantity" };
  }
  return { ...base, lotStatus: "known", reviewState: "reviewable", reasonCode: "ready" };
}

export function buildLotEvidenceSummary(fixtures: LotEvidenceFixtureInput[]): LotEvidenceSummary {
  const rows = fixtures
    .filter((fixture) => validDate(fixture.eventDate) && fixture.evidenceId.trim().length > 0)
    .map(classify)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  return {
    rows,
    total: rows.length,
    ready: rows.filter((row) => row.reviewState === "reviewable").length,
    notReady: rows.filter((row) => row.reviewState === "not_ready").length,
  };
}
