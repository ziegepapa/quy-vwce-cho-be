import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installer = await readFile(new URL("./install-price-dispatch-timers.sh", import.meta.url), "utf8");
const uninstaller = await readFile(new URL("./uninstall-price-dispatch-timers.sh", import.meta.url), "utf8");

test("external scheduler uses Europe/Berlin wall-clock timers and retries missed events", () => {
  assert.match(installer, /OnCalendar=Mon\.\.Sat \*-\*-\* 08:25:00 Europe\/Berlin/);
  assert.match(installer, /OnCalendar=Mon\.\.Fri \*-\*-\* 19:25:00 Europe\/Berlin/);
  assert.equal((installer.match(/Persistent=true/g) ?? []).length, 2);
  assert.match(installer, /systemd-analyze calendar/);
  assert.match(installer, /systemctl enable --now vwce-price-dispatch-catchup\.timer vwce-price-dispatch-after-close\.timer/);
});

test("installer accepts a hidden repo-scoped token, protects it, and does not echo it", () => {
  assert.match(installer, /read -r -s -p/);
  assert.match(installer, /chmod 600/);
  assert.match(installer, /chown root:root/);
  assert.match(installer, /Actions: Read and write/);
  const tokenWriteLine = installer.split(/\r?\n/).find((line) => line.includes("PRICE_WORKFLOW_DISPATCH_TOKEN=%s"));
  assert.ok(tokenWriteLine, "token must only be written through the protected environment file");
  assert.ok(tokenWriteLine.endsWith(' > "${ENV_FILE}"'));
  assert.match(installer, /unset TOKEN/);
  assert.match(installer, /No immediate workflow was launched/);
});

test("uninstaller removes both timers and keeps token by default", () => {
  assert.match(uninstaller, /vwce-price-dispatch-catchup\.timer/);
  assert.match(uninstaller, /vwce-price-dispatch-after-close\.timer/);
  assert.match(uninstaller, /--remove-token/);
  assert.match(uninstaller, /Protected token file was kept/);
});
