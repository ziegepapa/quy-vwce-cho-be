import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_OWNER = "ziegepapa";
const DEFAULT_REPOSITORY = "quy-vwce-cho-be";
const DEFAULT_WORKFLOW = "update-vwce-price.yml";

export async function dispatchPriceWorkflow({
  token,
  owner = DEFAULT_OWNER,
  repository = DEFAULT_REPOSITORY,
  workflow = DEFAULT_WORKFLOW,
  ref = "main",
  fetchImpl = globalThis.fetch,
}) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("PRICE_WORKFLOW_DISPATCH_TOKEN is required; token value was not logged.");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("Invalid GitHub owner or repository.");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(workflow)) {
    throw new Error("Invalid workflow file name.");
  }
  if (typeof ref !== "string" || ref.trim().length === 0 || ref.length > 255) {
    throw new Error("Invalid dispatch ref.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("A fetch implementation is required.");
  }

  const endpoint = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: ref.trim() }),
  });

  // GitHub has documented 204 for older REST API versions and 200 with newer versions.
  if (response.status !== 204 && response.status !== 200) {
    let detail = "";
    try {
      detail = (await response.text()).trim().slice(0, 300);
    } catch {
      // Never expose request headers or the token in an error.
    }
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
  }

  return { status: response.status, workflow, ref: ref.trim() };
}

async function main() {
  const token = process.env.PRICE_WORKFLOW_DISPATCH_TOKEN;
  const workflow = process.env.PRICE_WORKFLOW_FILE || DEFAULT_WORKFLOW;
  const ref = process.env.PRICE_WORKFLOW_REF || "main";
  const result = await dispatchPriceWorkflow({ token, workflow, ref });
  process.stdout.write(`Dispatched ${result.workflow} on ${result.ref}; GitHub accepted the request. Check Actions for the run result.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Price workflow dispatch failed."}\n`);
    process.exitCode = 1;
  });
}
