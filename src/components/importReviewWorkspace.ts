import type { TrImportDraft, TrImportValidation } from "../lib/tr/toTransaction";

export type ImportDuplicateStatus = "idle" | "checking" | "duplicate" | "clear";

export type ImportReviewWorkspace = {
  documentRef: string | null;
  isValidationReady: boolean;
  duplicateStatus: ImportDuplicateStatus;
  warningCount: number;
  canConfirm: boolean;
};

/**
 * Presentation-only import review state. It never parses a file, writes a
 * transaction, or replaces the final validation/dedupe checks at save time.
 */
export function buildImportReviewWorkspace(input: {
  draft: TrImportDraft | null;
  validation: TrImportValidation | null;
  duplicateStatus: ImportDuplicateStatus;
  warningCount: number;
}): ImportReviewWorkspace {
  const warningCount = Math.max(0, Math.trunc(input.warningCount));
  const isValidationReady = input.validation?.ok === true;
  const documentRef = input.draft?.docNumber.trim() || null;
  return {
    documentRef,
    isValidationReady,
    duplicateStatus: input.duplicateStatus,
    warningCount,
    canConfirm: Boolean(documentRef) && isValidationReady && input.duplicateStatus === "clear",
  };
}
