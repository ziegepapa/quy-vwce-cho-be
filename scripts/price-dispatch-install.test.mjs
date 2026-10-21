import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installer = await readFile(new URL("./install-price-dispatch-timers.sh", import.meta.url), "utf8");
const uninstaller = await readFile(new URL("./uninstall-price-dispatch-timers.sh", import.meta.url), "utf8");

test("external scheduler installer pins Berlin wall-clock windows and uses systemd persistence", () => {
  assert.match(installer, /OnCalendar=Mon\.\.Sat \* -\* -\* 08:25:00 Europe\/Berlin/.source.replaceAll(" ", ""));
});
