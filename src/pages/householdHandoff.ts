import { getPlanPhase } from "../lib/planPhase";

export type HouseholdHandoff = {
  planName: string;
  childName: string | null;
  targetUseDate: string | null;
  planStatus: string | null;
  yearsLeft: number | null;
  emergency: {
    completeSections: number;
    totalSections: number;
    contactCount: number;
    documentLocationCount: number;
    lastPrintedAt: string | null;
  };
  readiness: {
    complete: number;
    total: number;
    planReady: boolean;
    emergencyReady: boolean;
    printedReady: boolean;
  };
};

/**
 * Local, privacy-preserving caregiver summary. It intentionally excludes all
 * contact values, document locations, broker identifiers, account details and
 * wishes. Those remain available only in the existing Notfallmappe page.
 */
export function buildHouseholdHandoff(input: {
  planName: string;
  childName: string;
  planTarget?: { targetUseDate: string; needFullAmount: boolean };
  notfallmappe?: {
    purpose: string;
    custodyNote: string;
    contacts: Array<{ name: string; phone: string; email: string }>;
    documents: Array<{ location: string }>;
    wishes: string;
    lastPrintedAt?: string;
  };
  today: Date;
}): HouseholdHandoff {
  const target = input.planTarget;
  const phase = target ? getPlanPhase(target, input.today) : null;
  const emergency = input.notfallmappe;
  const purposeReady = Boolean(emergency?.purpose.trim() || emergency?.custodyNote.trim());
  const contacts = (emergency?.contacts ?? []).filter((contact) => contact.name.trim() && (contact.phone.trim() || contact.email.trim()));
  const documents = (emergency?.documents ?? []).filter((document) => document.location.trim());
  const wishesReady = Boolean(emergency?.wishes.trim());
  const sections = [purposeReady, contacts.length > 0, documents.length > 0, wishesReady];

  const completeSections = sections.filter(Boolean).length;
  const planReady = Boolean(target?.targetUseDate && phase?.status);
  const emergencyReady = completeSections === sections.length;
  const printedReady = Boolean(emergency?.lastPrintedAt);
  const readiness = [planReady, emergencyReady, printedReady];

  return {
    planName: input.planName.trim() || "VWCE Vault",
    childName: input.childName.trim() || null,
    targetUseDate: target?.targetUseDate ?? null,
    planStatus: phase?.status ?? null,
    yearsLeft: phase?.yearsLeft ?? null,
    emergency: {
      completeSections,
      totalSections: sections.length,
      contactCount: contacts.length,
      documentLocationCount: documents.length,
      lastPrintedAt: emergency?.lastPrintedAt || null,
    },
    readiness: {
      complete: readiness.filter(Boolean).length,
      total: readiness.length,
      planReady,
      emergencyReady,
      printedReady,
    },
  };
}
