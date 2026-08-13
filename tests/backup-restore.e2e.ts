import { expect, test } from "@playwright/test";

// E2E smoke for local-first durability:
// - Create a tiny dataset (one transaction)
// - Export JSON backup
// - Wipe local storage (new context)
// - Import the backup
// - Reload and assert the transaction is present
//
// Notes:
// - Works in "missing Supabase config" mode (offline/local-only) because it never logs in.
// - Uses the UI flows so we cover file upload + confirm dialog.

test("backup JSON can be exported and imported (smoke)", async ({ page }) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });

  // App should boot (either login screen or missing-config screen).
  await expect(page.locator("#root > *").first()).toBeVisible();

  // Go to Transactions and add a minimal transaction.
  // We intentionally keep selectors resilient: use roles/labels where possible.
  await page.getByRole("link", { name: "Giao dịch" }).click();

  // If there is an empty state, add transaction.
  // The button label is expected to be stable in Vietnamese UI.
  await page.getByRole("button", { name: /Thêm/i }).click();

  // Fill a minimal cash_in transaction.
  await page.getByLabel(/Ngày/i).fill("2026-08-13");
  await page.getByLabel(/Loại/i).selectOption("cash_in");
  await page.getByLabel(/Số tiền/i).fill("100");
  await page.getByRole("button", { name: /Lưu/i }).click();

  // Navigate to Settings -> Data tab
  await page.getByRole("link", { name: "Cài đặt" }).click();
  await page.getByRole("tab", { name: "Dữ liệu" }).click();

  // Export JSON and capture the downloaded file.
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Xuất JSON/i }).click(),
  ]).then(([d]) => d);

  // Start a fresh context by clearing storage (simulate a clean device state).
  // (Playwright doesn't allow fully new browser inside a test easily without fixtures,
  // so we clear storage + reload.)
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.databases?.().then((dbs) => {
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    });
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#root > *").first()).toBeVisible();

  // Go back to Settings -> Data tab to import the backup.
  await page.getByRole("link", { name: "Cài đặt" }).click();
  await page.getByRole("tab", { name: "Dữ liệu" }).click();

  // Upload file
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByText(/Nhập file JSON/i).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(await download.path());

  // Confirm dialog
  await page.getByRole("button", { name: /Xác nhận thay dữ liệu/i }).click();

  // After import, app reloads. Ensure Transactions shows our record.
  await page.waitForTimeout(500);
  await page.getByRole("link", { name: "Giao dịch" }).click();

  // Look for the amount 100 (or formatted 100,00 depending locale) somewhere in the list.
  await expect(page.getByText(/100/)).toBeVisible();
});
