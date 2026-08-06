import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const mockPort = 8788;
const edgeUrl = "http://127.0.0.1:8000/";
let providerPayload = null;

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const mockServer = http.createServer(async (request, response) => {
  try {
    if (request.url === "/auth/v1/user") {
      if (request.headers.authorization !== "Bearer test-user-token") {
        json(response, 401, { error: "invalid token" });
        return;
      }
      json(response, 200, { id: "test-user", role: "authenticated" });
      return;
    }

    if (request.url === "/v1/chat/completions" && request.method === "POST") {
      providerPayload = await readJson(request);
      json(response, 200, {
        choices: [{ message: { content: "Số liệu được giải thích từ Trace đã lọc. Không phải tư vấn đầu tư." } }],
      });
      return;
    }

    json(response, 404, { error: "not found" });
  } catch (error) {
    json(response, 500, { error: error instanceof Error ? error.message : "unknown" });
  }
});

await new Promise((resolve, reject) => {
  mockServer.once("error", reject);
  mockServer.listen(mockPort, "127.0.0.1", resolve);
});

const edge = spawn(
  "deno",
  ["run", "--allow-env", "--allow-net", "supabase/functions/explain-trace/index.ts"],
  {
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
      SUPABASE_ANON_KEY: "test-anon-key",
      AI_API_URL: `http://127.0.0.1:${mockPort}/v1/chat/completions`,
      AI_API_KEY: "test-server-key",
      AI_MODEL: "test-model",
      AI_ALLOWED_ORIGINS: "http://localhost:5173",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let edgeLogs = "";
edge.stdout.on("data", (chunk) => { edgeLogs += chunk.toString(); });
edge.stderr.on("data", (chunk) => { edgeLogs += chunk.toString(); });

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForEdge() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(edgeUrl, {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      });
      if (response.status === 204) return;
    } catch {
      // The isolated server is still starting.
    }
    await sleep(200);
  }
  throw new Error(`Edge Function did not start. Logs:\n${edgeLogs}`);
}

const requestBody = {
  schemaVersion: 1,
  locale: "vi-VN",
  localUserId: "secret-user-id",
  trace: {
    title: "Tổng tài sản",
    primary: "1.234,50 €",
    deterministicExplanation: "Giải thích chuẩn luôn hiển thị.",
    rows: [
      {
        id: "secret-row-id",
        label: "Giá VWCE",
        value: "168,04 €",
        source: "Giá tự động hiệu lực",
        formula: "quantity × price",
      },
    ],
  },
};

try {
  await waitForEdge();

  const successResponse = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify(requestBody),
  });
  assert.equal(successResponse.status, 200);
  assert.deepEqual(await successResponse.json(), {
    explanation: "Số liệu được giải thích từ Trace đã lọc. Không phải tư vấn đầu tư.",
  });
  assert.ok(providerPayload, "provider should receive one request");
  const serializedProviderPayload = JSON.stringify(providerPayload);
  assert.ok(!serializedProviderPayload.includes("secret-user-id"));
  assert.ok(!serializedProviderPayload.includes("secret-row-id"));
  assert.ok(serializedProviderPayload.includes("Tổng tài sản"));

  const unauthorizedResponse = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
    },
    body: JSON.stringify(requestBody),
  });
  assert.equal(unauthorizedResponse.status, 401);

  const forbiddenOriginResponse = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      Authorization: "Bearer test-user-token",
      "Content-Type": "application/json",
      Origin: "https://not-allowed.example",
    },
    body: JSON.stringify(requestBody),
  });
  assert.equal(forbiddenOriginResponse.status, 403);

  console.log("Edge smoke environment passed: auth, origin policy, payload allow-list and provider response.");
} finally {
  edge.kill("SIGTERM");
  await new Promise((resolve) => mockServer.close(resolve));
}
