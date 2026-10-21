import assert from "node:assert/strict";
import test from "node:test";
import { dispatchPriceWorkflow } from "./dispatch-price-workflow.mjs";

test("dispatches the existing price workflow with a repo-scoped request", async () => {
  let calledUrl = "";
  let calledOptions;
  const result = await dispatchPriceWorkflow({
    token: "test-token",
    fetchImpl: async (url, options) => {
      calledUrl = String(url);
      calledOptions = options;
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(calledUrl, "https://api.github.com/repos/ziegepapa/quy-vwce-cho-be/actions/workflows/update-vwce-price.yml/dispatches");
  assert.equal(calledOptions.method, "POST");
  assert.equal(calledOptions.headers.Authorization, "Bearer test-token");
  assert.equal(calledOptions.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.deepEqual(JSON.parse(calledOptions.body), { ref: "main" });
  assert.deepEqual(result, { status: 204, workflow: "update-vwce-price.yml", ref: "main" });
});

test("accepts the current REST API 200 response as well as the legacy 204 response", async () => {
  const result = await dispatchPriceWorkflow({
    token: "test-token",
    fetchImpl: async () => new Response(JSON.stringify({ workflow_run_id: 123 }), { status: 200 }),
  });
  assert.equal(result.status, 200);
});

test("requires a token without logging or embedding a token value in the error", async () => {
  await assert.rejects(
    () => dispatchPriceWorkflow({ token: "" }),
    /PRICE_WORKFLOW_DISPATCH_TOKEN is required/,
  );
});

test("fails closed on non-204 GitHub responses", async () => {
  await assert.rejects(
    () => dispatchPriceWorkflow({
      token: "test-token",
      fetchImpl: async () => new Response(JSON.stringify({ message: "Resource not accessible by integration" }), { status: 403 }),
    }),
    /HTTP 403.*Resource not accessible by integration/,
  );
});
