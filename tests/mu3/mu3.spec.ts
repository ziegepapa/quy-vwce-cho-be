import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("MU3 two real local Auth accounts: owner invite, list, revoke; member denied", async ({ browser }, info) => {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== "http://127.0.0.1:54321" || !anon || !service || process.env.CI !== "true") throw new Error("MU3 refuses non-local test target");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const privileged = createClient(url, service, options);
  const stamp = randomUUID(), ownerEmail = "mu3-owner-" + stamp + "@example.invalid", memberEmail = "mu3-member-" + stamp + "@example.invalid";
  const password = randomUUID() + "Aa!9";
  const created = await privileged.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
  expect(created.error).toBeNull();
  const owner = createClient(url, anon, options);
  const login = await owner.auth.signInWithPassword({ email: ownerEmail, password });
  expect(login.error).toBeNull();
  const ownerId = login.data.user!.id, ownerToken = login.data.session!.access_token;
  const tx = { user_id: ownerId, id: "mu3-" + stamp, version: 1, data: { synthetic: true } };
  expect((await owner.from("transactions").insert(tx)).error).toBeNull();
  const call = async (token: string, ownerId: string, data: object) => {
    const response = await fetch("http://127.0.0.1:8000/", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ ...data, ownerId }) });
    return { status: response.status, data: await response.json() };
  };
  const mount = async (page: Page, id: string, token: string) => {
    await page.goto("http://127.0.0.1:4173/quy-vwce-cho-be/tests/mu3/fixture.html");
    await page.evaluate(({ id, token }) => (window as unknown as { mountMu3: (id: string, token: string, locale: string) => void }).mountMu3(id, token, "de"), { id, token });
  };
  const ownerContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const ownerPage = await ownerContext.newPage();
  await mount(ownerPage, ownerId, ownerToken);
  await expect(ownerPage.getByText("Noch keine Mitglieder.")).toBeVisible();
  await ownerPage.getByLabel("E-Mail-Adresse").fill(memberEmail);
  await ownerPage.getByRole("button", { name: "Einladung erstellen" }).click();
  await expect(ownerPage.getByText("Eingeladen", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Einladung erstellt. Noch kein Zugriff.")).toBeVisible();
  await ownerPage.screenshot({ path: info.outputPath("mu3-owner-invited.png") });
  console.log("PASS owner UI creates invited membership; Auth link not delivered");
  const list = await call(ownerToken, ownerId, { action: "list" });
  expect(list.status).toBe(200);
  expect(list.data.members).toHaveLength(1);
  expect(list.data.members[0]).toMatchObject({ email: memberEmail, role: "member", status: "invited" });
  const memberId = list.data.members[0].id;
  expect((await call(ownerToken, ownerId, { action: "invite", email: memberEmail })).status).toBe(409);
  expect((await call(ownerToken, ownerId, { action: "activate", memberId })).status).toBe(400);
  const scope = { owner_user_id: ownerId, member_user_id: memberId };
  expect((await owner.from("vault_memberships").update({ status: "active" }).match(scope)).error?.code).toBe("42501");
  console.log("PASS owner cannot activate or duplicate membership");
  // Trusted fixture simulates acceptance only. No actual email or real account.
  const verified = await privileged.auth.admin.updateUserById(memberId, { password, email_confirm: true, user_metadata: { display_name: "Testmitglied" } });
  expect(verified.error).toBeNull();
  const member = createClient(url, anon, options);
  const memberLogin = await member.auth.signInWithPassword({ email: memberEmail, password });
  expect(memberLogin.error).toBeNull();
  const memberToken = memberLogin.data.session!.access_token;
  const readOwner = async () => {
    const result = await member.from("transactions").select("id").eq("user_id", ownerId).eq("id", tx.id);
    expect(result.error).toBeNull();
    return result.data;
  };
  expect(await readOwner()).toHaveLength(0);
  expect((await privileged.from("vault_memberships").update({ status: "pending" }).match(scope).select()).data?.[0]?.status).toBe("pending");
  await ownerPage.getByRole("button", { name: "Erneut laden" }).click();
  await expect(ownerPage.getByText("Ausstehend", { exact: true })).toBeVisible();
  expect(await readOwner()).toHaveLength(0);
  expect((await privileged.from("vault_memberships").update({ status: "active", activated_at: new Date().toISOString() }).match(scope).select()).data?.[0]?.status).toBe("active");
  await ownerPage.getByRole("button", { name: "Erneut laden" }).click();
  await expect(ownerPage.getByText("Aktiv", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Testmitglied")).toBeVisible();
  await ownerPage.screenshot({ path: info.outputPath("mu3-owner-active.png") });
  expect(await readOwner()).toHaveLength(1);
  console.log("PASS invited/pending read denied; trusted active transition visible and shared read allowed");
  for (const target of [ownerId, memberId]) {
    for (const action of ["list", "invite", "revoke"]) {
      const r = await call(memberToken, target, { action, email: ownerEmail, memberId });
      expect(r.status, "member cannot " + action).toBe(403);
    }
  }
  const memberContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const memberPage = await memberContext.newPage();
  const denied = memberPage.waitForResponse(r => r.url() === "http://127.0.0.1:8000/" && r.request().method() === "POST");
  await mount(memberPage, memberId, memberToken);
  expect((await denied).status()).toBe(403);
  await expect(memberPage.getByRole("button", { name: "Einladung erstellen" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Zugriff widerrufen" })).toHaveCount(0);
  console.log("PASS member forged owner scope and own management requests denied; controls absent");
  await ownerPage.getByRole("button", { name: "Zugriff widerrufen" }).click();
  await expect(ownerPage.getByRole("button", { name: "Widerruf bestätigen" })).toBeVisible();
  await ownerPage.getByRole("button", { name: "Widerruf bestätigen" }).click();
  await expect(ownerPage.getByText("Widerrufen", { exact: true })).toBeVisible();
  await expect(ownerPage.getByText("Zugriff widerrufen.", { exact: true })).toBeVisible();
  await expect(ownerPage.getByRole("button", { name: "Zugriff widerrufen" })).toHaveCount(0);
  await ownerPage.screenshot({ path: info.outputPath("mu3-owner-revoked.png") });
  const valid = await member.auth.getUser(memberToken);
  expect(valid.error).toBeNull(); expect(valid.data.user?.id).toBe(memberId);
  expect(await readOwner()).toHaveLength(0);
  expect((await call(memberToken, memberId, { action: "list" })).status).toBe(403);
  const preserved = await owner.from("transactions").select("data").eq("id", tx.id).single();
  expect(preserved.error).toBeNull(); expect(preserved.data?.data).toEqual(tx.data);
  console.log("PASS owner UI revoked; same member JWT remains valid but shared read denied; owner row unchanged");
  await memberContext.close(); await ownerContext.close();
});
