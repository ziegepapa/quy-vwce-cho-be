import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, getSettings, saveSettings } from "./db";
import { defaultSettings } from "./defaults";
import type { AppSettings } from "./types";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.settings.put(defaultSettings());
});

describe("saveSettings transactional merge", () => {
  it("preserves concurrent partial autosaves", async () => {
    await Promise.all([
      saveSettings({ planName: "Kế hoạch mới" }, { sync: false }),
      saveSettings({ childName: "Bé An" }, { sync: false }),
      saveSettings({ inflationRate: 0.025 }, { sync: false }),
    ]);

    const settings = await getSettings();
    expect(settings.planName).toBe("Kế hoạch mới");
    expect(settings.childName).toBe("Bé An");
    expect(settings.inflationRate).toBe(0.025);
  });

  it("coalesces the outbox with the latest merged snapshot", async () => {
    await Promise.all([
      saveSettings({ planName: "Quỹ dài hạn" }),
      saveSettings({ childName: "Bé Minh" }),
    ]);

    const pending = await db.outbox.where("entityId").equals("settings").toArray();
    expect(pending).toHaveLength(1);
    const payload = pending[0]?.payload as AppSettings;
    expect(payload.planName).toBe("Quỹ dài hạn");
    expect(payload.childName).toBe("Bé Minh");
    expect((payload as AppSettings & { version?: number }).version).toBe(2);
  });
});
