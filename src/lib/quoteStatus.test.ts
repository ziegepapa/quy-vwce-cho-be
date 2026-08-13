import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  db,
  putAutoCandidateAndResolve,
  saveManualQuoteForIsin,
  setQuotePreference,
} from "./db";
import { defaultSettings } from "./defaults";
import { listQuoteSelectionStates } from "./quoteStatus";
import { VWCE_ISIN } from "./types";

const OTHER_ISIN = "FR0010315770";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("quote selection UI state", () => {
  it("reports a fresh auto source in default auto mode", async () => {
    await putAutoCandidateAndResolve(
      {
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        venue: "XETRA",
        price: 167.54,
        asOf: "2026-08-04",
        provider: "yahoo_finance_chart",
      },
      { nowDate: "2026-08-04" },
    );
    const state = (await listQuoteSelectionStates({ nowDate: "2026-08-04" }))[0];
    expect(state.mode).toBe("auto");
    expect(state.autoStatus).toBe("valid-fresh");
    expect(state.effective?.source).toBe("auto");
    expect(state.isStale).toBe(false);
  });

  it("marks a retained stale auto effective when no manual fallback exists", async () => {
    await putAutoCandidateAndResolve(
      {
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        venue: "XETRA",
        price: 160,
        asOf: "2026-07-01",
      },
      { nowDate: "2026-08-04" },
    );

    const state = (await listQuoteSelectionStates({ nowDate: "2026-08-04" }))[0];
    expect(state.autoStatus).toBe("valid-stale");
    expect(state.effective?.source).toBe("auto");
    expect(state.isStale).toBe(true);
  });

  it("shows stale auto with deterministic manual fallback", async () => {
    await putAutoCandidateAndResolve(
      {
        instrumentIsin: VWCE_ISIN,
        currency: "EUR",
        venue: "XETRA",
        price: 160,
        asOf: "2026-07-01",
      },
      { nowDate: "2026-08-04" },
    );
    await saveManualQuoteForIsin(
      {
        instrumentIsin: VWCE_ISIN,
        price: 150,
        asOf: "2026-08-01",
      },
      { nowDate: "2026-08-04" },
    );
    await setQuotePreference(VWCE_ISIN, "auto", { nowDate: "2026-08-04" });

    const state = (await listQuoteSelectionStates({ nowDate: "2026-08-04" }))[0];
    expect(state.mode).toBe("auto");
    expect(state.autoStatus).toBe("valid-stale");
    expect(state.effective?.source).toBe("manual");
    expect(state.effective?.price).toBe(150);
    expect(state.isStale).toBe(false);
  });

  it("keeps preference and candidates isolated across ISINs", async () => {
    await saveManualQuoteForIsin({
      instrumentIsin: VWCE_ISIN,
      price: 150,
      asOf: "2026-08-01",
    });
    await saveManualQuoteForIsin({
      instrumentIsin: OTHER_ISIN,
      price: 42,
      asOf: "2026-08-02",
    });
    await setQuotePreference(OTHER_ISIN, "auto", { nowDate: "2026-08-04" });

    const states = await listQuoteSelectionStates({ nowDate: "2026-08-04" });
    const vwce = states.find((state) => state.instrumentIsin === VWCE_ISIN);
    const other = states.find((state) => state.instrumentIsin === OTHER_ISIN);
    expect(vwce?.mode).toBe("manual");
    expect(vwce?.effective?.price).toBe(150);
    expect(other?.mode).toBe("auto");
    expect(other?.effective?.price).toBe(42);
  });
});
