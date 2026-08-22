import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const registerSource = await readFile(new URL("../public/registerSW.js", import.meta.url), "utf8");
const recoverySource = await readFile(new URL("../public/pwa-update-recovery.js", import.meta.url), "utf8");
const accessibilitySource = await readFile(new URL("../src/styles/accessibility-foundations.css", import.meta.url), "utf8");

class FakeElement {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.type = "";
    this.disabled = false;
  }

  append(...nodes) {
    this.children.push(...nodes);
    for (const node of nodes) this.document.register(node);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click() {
    this.listeners.get("click")?.({ currentTarget: this });
  }

  remove() {
    this.document.byId.delete(this.id);
  }
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

function createWorker() {
  const listeners = new Map();
  return {
    state: "installed",
    messages: [],
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message) {
      this.messages.push(message);
    },
    dispatch(type) {
      listeners.get(type)?.({ target: this });
    },
  };
}

async function startRegisterBridge({ locale = "vi", waiting = null, unsafe = false } = {}) {
  const eventListeners = new Map();
  const registrationListeners = new Map();
  const documentListeners = new Map();
  const document = {
    readyState: "complete",
    visibilityState: "visible",
    byId: new Map(),
    register(element) {
      if (element.id) this.byId.set(element.id, element);
      for (const child of element.children) this.register(child);
    },
    body: null,
    createElement(tagName) {
      return new FakeElement(tagName, this);
    },
    getElementById(id) {
      return this.byId.get(id) ?? null;
    },
    querySelector() {
      return unsafe ? new FakeElement("div", this) : null;
    },
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };
  document.body = new FakeElement("body", document);
  const update = async () => undefined;
  const registration = {
    waiting,
    installing: null,
    update,
    addEventListener(type, listener) {
      registrationListeners.set(type, listener);
    },
  };
  const reload = { count: 0 };
  const window = {
    localStorage: { getItem: () => locale },
    addEventListener(type, listener) {
      eventListeners.set(type, listener);
    },
    location: { reload: () => { reload.count += 1; } },
  };
  const serviceWorkerListeners = new Map();
  const navigator = {
    serviceWorker: {
      controller: {},
      register: async () => registration,
      addEventListener(type, listener) {
        serviceWorkerListeners.set(type, listener);
      },
    },
  };
  vm.runInNewContext(registerSource, { window, document, navigator, console, Promise, setTimeout });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { document, waiting, registration, reload, eventListeners, registrationListeners, documentListeners, serviceWorkerListeners };
}

test("PWA update action preserves a 44px mobile touch target", () => {
  assert.match(accessibilitySource, /\.pwa-update-actions button \{ min-height: 44px;/);
});

test("no waiting worker produces no update UI", async () => {
  const harness = await startRegisterBridge();
  assert.equal(harness.document.getElementById("vwce-pwa-update-notice"), null);
});

test("waiting worker renders accessible Vietnamese update notice", async () => {
  const waiting = createWorker();
  const harness = await startRegisterBridge({ waiting });
  const notice = harness.document.getElementById("vwce-pwa-update-notice");
  assert.ok(notice);
  assert.equal(notice.attributes.get("role"), "status");
  assert.equal(notice.attributes.get("aria-live"), "polite");
  assert.equal(findElement(notice, (node) => node.tagName === "strong")?.textContent, "Đã có phiên bản mới");
  assert.equal(findElement(notice, (node) => node.tagName === "button" && node.textContent === "Cập nhật")?.type, "button");
});

test("waiting worker renders German copy from persisted locale", async () => {
  const harness = await startRegisterBridge({ locale: "de", waiting: createWorker() });
  const notice = harness.document.getElementById("vwce-pwa-update-notice");
  assert.equal(findElement(notice, (node) => node.tagName === "strong")?.textContent, "Neue App-Version verfügbar");
  assert.ok(findElement(notice, (node) => node.tagName === "button" && node.textContent === "Aktualisieren"));
});

test("explicit update posts SKIP_WAITING and reloads only after activation", async () => {
  const waiting = createWorker();
  const harness = await startRegisterBridge({ waiting });
  const notice = harness.document.getElementById("vwce-pwa-update-notice");
  const update = findElement(notice, (node) => node.tagName === "button" && node.textContent === "Cập nhật");
  update.click();
  assert.equal(waiting.messages.length, 1);
  assert.equal(waiting.messages[0].type, "SKIP_WAITING");
  assert.equal(harness.reload.count, 0);
  waiting.state = "activated";
  waiting.dispatch("statechange");
  assert.equal(harness.reload.count, 0);
  harness.serviceWorkerListeners.get("controllerchange")?.();
  assert.equal(harness.reload.count, 1);
});

test("unsafe visible UI blocks activation and keeps the page untouched", async () => {
  const waiting = createWorker();
  const harness = await startRegisterBridge({ waiting, unsafe: true });
  const notice = harness.document.getElementById("vwce-pwa-update-notice");
  findElement(notice, (node) => node.tagName === "button" && node.textContent === "Cập nhật").click();
  assert.deepEqual(waiting.messages, []);
  assert.equal(harness.reload.count, 0);
  assert.equal(findElement(notice, (node) => node.tagName === "p")?.textContent, "Hãy hoàn tất thao tác đang mở trước khi cập nhật.");
});

async function runRecovery({ legacy = false, marker = false } = {}) {
  let installHandler = null;
  let markerPresent = marker;
  let skipWaitingCalls = 0;
  const markerCache = {
    async match() { return markerPresent ? {} : undefined; },
    async put() { markerPresent = true; },
  };
  const oldCache = {
    async keys() {
      return legacy ? [{ url: "https://ziegepapa.github.io/quy-vwce-cho-be/registerSW.js?__WB_REVISION__=04b919dfdb8554a9d303a9d535f7839f" }] : [];
    },
  };
  const caches = {
    async keys() { return ["workbox-precache-v2-https://ziegepapa.github.io/quy-vwce-cho-be/"]; },
    async open(name) { return name === "vwce-pwa-update-migration-v1" ? markerCache : oldCache; },
  };
  const self = {
    addEventListener(type, listener) { if (type === "install") installHandler = listener; },
    async skipWaiting() { skipWaitingCalls += 1; },
  };
  vm.runInNewContext(recoverySource, { self, caches, Response: class Response { constructor(body) { this.body = body; } }, Promise });
  let pending = null;
  installHandler({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  return { skipWaitingCalls, markerPresent };
}

test("recovery advances only the exact documented legacy cache once", async () => {
  const first = await runRecovery({ legacy: true });
  assert.equal(first.skipWaitingCalls, 1);
  assert.equal(first.markerPresent, true);
  const second = await runRecovery({ legacy: true, marker: true });
  assert.equal(second.skipWaitingCalls, 0);
});

test("recovery does not skip waiting for a normal cache", async () => {
  const result = await runRecovery({ legacy: false });
  assert.equal(result.skipWaitingCalls, 0);
  assert.equal(result.markerPresent, false);
});
