import type { Session } from "@supabase/supabase-js";
import type { AppSettings, Transaction, MonthlySnapshot, Goal, Quote } from "./types";
import { isValidAsOfDate, quoteId } from "./instrument";
import { VALL_ISIN, VWCE_ISIN } from "./types";

export const localSharingEnabled = import.meta.env.VITE_MU3_LOCAL_REHEARSAL === "true" &&
  import.meta.env.VITE_SUPABASE_URL === "http://127.0.0.1:54321";
const endpoint = "http://127.0.0.1:54321/rest/v1/";
type Membership = { owner_user_id: string; member_user_id: string; role: "member" | "admin"; status: "invited" | "pending" | "active" | "revoked" };
type Row = { id: string; data: Record<string, unknown> };
type Scope = { id: string; token: string };
export type MemberScope = { kind: "owner" } | { kind: "locked" } | { kind: "member"; ownerId: string };
export type SharedSnapshot = {
  transactions: Transaction[];
  settings: Pick<AppSettings, "planName" | "contributionY2" | "vwceReturn" | "endDate" | "trackInAppCash"> | null;
  history: Pick<MonthlySnapshot, "id" | "year" | "month" | "totalValue">[];
  goals: Pick<Goal, "id" | "name" | "dueDate" | "amount">[];
  quotes: Quote[];
  readAt: string;
};
const scope = (session: Session): Scope => ({ id: session.user.id, token: session.access_token });
async function getRows<T>(session: Scope, table: string, params: Record<string,string>, signal: AbortSignal): Promise<T[]> {
  if (!localSharingEnabled || !navigator.onLine) throw new Error("sharing unavailable");
  const response = await fetch(endpoint + table + "?" + new URLSearchParams(params), {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string, Authorization: "Bearer " + session.token },
    cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("shared request denied");
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error("invalid response");
  return body as T[];
}
export async function resolveMemberScope(session: Session, signal: AbortSignal): Promise<MemberScope> {
  const rows = await getRows<Membership>(scope(session), "vault_memberships", {
    select: "owner_user_id,member_user_id,role,status", member_user_id: "eq." + session.user.id, limit: "2",
  }, signal);
  if (!rows.length) return { kind: "owner" };
  // First release is one shared vault per member. Never guess which vault to show.
  if (rows.length !== 1 || rows[0].member_user_id !== session.user.id ||
    rows[0].owner_user_id === session.user.id || rows[0].status !== "active" || rows[0].role !== "member") return { kind: "locked" };
  return { kind: "member", ownerId: rows[0].owner_user_id };
}
async function entityRows(session: Scope, table: string, ownerId: string, signal: AbortSignal): Promise<Row[]> {
  const result: Row[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const page = await getRows<Row>(session, table, {
      select: "id,data", user_id: "eq." + ownerId, deleted_at: "is.null", order: "id.asc",
      limit: "500", offset: String(offset),
    }, signal);
    if (page.some(row => !row || typeof row.id !== "string" || !row.data || typeof row.data !== "object" || row.id !== row.data.id)) throw new Error("invalid entity");
    result.push(...page);
    if (page.length < 500) return result;
  }
  throw new Error("shared snapshot exceeds local rehearsal limit");
}
async function publicQuotes(signal: AbortSignal): Promise<Quote[]> {
  try {
    const r = await fetch(import.meta.env.BASE_URL + "data/quotes.json", { cache: "no-store", signal });
    if (!r.ok) return [];
    const body = await r.json();
    if (body.schemaVersion !== 2 || !Array.isArray(body.quotes)) return [];
    const result: Quote[] = [];
    for (const row of body.quotes) {
      if (![VWCE_ISIN,VALL_ISIN].includes(row?.instrumentIsin) || row.currency !== "EUR" || typeof row.price !== "number" ||
          !Number.isFinite(row.price) || row.price <= 0 || !isValidAsOfDate(row.asOf) || row.asOf > new Date().toISOString().slice(0,10)) continue;
      if (result.some(q => q.instrumentIsin === row.instrumentIsin)) return [];
      result.push({ id: quoteId(row.instrumentIsin), instrumentIsin: row.instrumentIsin, currency: "EUR", price: row.price, asOf: row.asOf, source: "auto", createdAt: row.asOf, updatedAt: row.asOf });
    }
    return result;
  } catch { return []; }
}
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export async function readSharedSnapshot(session: Session, ownerId: string, signal: AbortSignal): Promise<SharedSnapshot> {
  const before = await resolveMemberScope(session, signal);
  if (before.kind !== "member" || before.ownerId !== ownerId) throw new Error("membership inactive");
  const [settings, transactions, history, goals, quotes] = await Promise.all([
    entityRows(scope(session), "app_settings", ownerId, signal),
    entityRows(scope(session), "transactions", ownerId, signal),
    entityRows(scope(session), "monthly_snapshots", ownerId, signal),
    entityRows(scope(session), "goals", ownerId, signal),
    publicQuotes(signal),
  ]);
  const after = await resolveMemberScope(session, signal);
  if (signal.aborted || after.kind !== "member" || after.ownerId !== ownerId) throw new Error("membership inactive");
  const s = settings.find(row => row.id === "settings")?.data;
  const safeSettings = s && typeof s.planName === "string" && finite(s.contributionY2) && finite(s.vwceReturn) && typeof s.endDate === "string" ?
    { planName: s.planName, contributionY2: s.contributionY2, vwceReturn: s.vwceReturn, endDate: s.endDate, trackInAppCash: s.trackInAppCash === true } : null;
  const txs = transactions.map(({data}) => data as unknown as Transaction);
  if (txs.some(tx => typeof tx.date !== "string" || typeof tx.type !== "string" || typeof tx.createdAt !== "string" || !finite(tx.amount))) throw new Error("invalid transaction");
  return {
    settings: safeSettings, transactions: txs,
    history: history.flatMap(({id,data}) => finite(data.year) && finite(data.month) && finite(data.totalValue) ? [{id,year:data.year,month:data.month,totalValue:data.totalValue}] : []),
    goals: goals.flatMap(({id,data}) => typeof data.name === "string" && typeof data.dueDate === "string" && finite(data.amount) ? [{id,name:data.name,dueDate:data.dueDate,amount:data.amount}] : []),
    quotes, readAt: new Date().toISOString(),
  };
}
