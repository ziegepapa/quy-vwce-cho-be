// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/sync/engine", () => ({
  listConflicts: vi.fn(),
  resolveConflict: vi.fn(),
}));

import {
  SYNC_CONFLICT_FOCUS_STATE_KEY,
  SYNC_CONFLICTS_SECTION_ID,
  conflictCtaLabel,
  focusSyncConflictSection,
  openSyncConflictSection,
  readSyncConflictFocusToken,
  reconcileVisibleLogoutBlockers,
} from "./components/SyncConflictSection";

describe("App conflict banner routing and blocker state", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("navigates from another route to the Data tab with a one-shot focus token", () => {
    const navigate = vi.fn();
    const focus = vi.fn();

    const action = openSyncConflictSection({
      pathname: "/",
      search: "",
      navigate,
      focus,
      token: "focus-once",
    });

    expect(action).toBe("navigated");
    expect(navigate).toHaveBeenCalledWith("/settings?tab=data", {
      state: { [SYNC_CONFLICT_FOCUS_STATE_KEY]: "focus-once" },
    });
    expect(focus).not.toHaveBeenCalled();
    expect(readSyncConflictFocusToken(navigate.mock.calls[0][1].state)).toBe("focus-once");
  });

  it("focuses and scrolls directly when already on the Data tab", async () => {
    const section = document.createElement("section");
    section.id = SYNC_CONFLICTS_SECTION_ID;
    section.tabIndex = -1;
    section.scrollIntoView = vi.fn();
    document.body.append(section);
    const navigate = vi.fn();

    const action = openSyncConflictSection({
      pathname: "/settings",
      search: "?tab=data",
      navigate,
    });

    expect(action).toBe("focused");
    await expect.poll(() => document.activeElement).toBe(section);
    expect(section.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("fails silently after a bounded focus retry when the section is gone", async () => {
    await expect(focusSyncConflictSection({ attempts: 2, delayMs: 0 })).resolves.toBe(false);
  });

  it("uses explicit singular and plural conflict CTA labels", () => {
    expect(conflictCtaLabel(1)).toBe("Xử lý 1 xung đột");
    expect(conflictCtaLabel(3)).toBe("Xử lý 3 xung đột");
  });

  it("clears a visible conflict blocker only when every blocker is zero", () => {
    const current = { pending: 0, dead: 0, conflicts: 1 };
    expect(reconcileVisibleLogoutBlockers(current, { pending: 0, dead: 0, conflicts: 0 })).toBeNull();
  });

  it("keeps pending and dead outbox blockers independent after conflicts reach zero", () => {
    const current = { pending: 0, dead: 0, conflicts: 1 };
    expect(
      reconcileVisibleLogoutBlockers(current, { pending: 2, dead: 0, conflicts: 0 }),
    ).toEqual({ pending: 2, dead: 0, conflicts: 0 });
    expect(
      reconcileVisibleLogoutBlockers(current, { pending: 0, dead: 1, conflicts: 0 }),
    ).toEqual({ pending: 0, dead: 1, conflicts: 0 });
  });
});
