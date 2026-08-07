/**
 * PR 2A — Multi-asset quote feed v2 entrypoint.
 * Writes public/data/quotes.json (schema 2) + mirrors VWCE to vwce-price.json (schema 1).
 * Node 22 built-ins only. No secrets. No HTML scraping.
 *
 * Exit policy (PRICE-FALLBACK-001):
 *   0  wrote a new quote, or kept a still-valid previous quote
 *   1  only when there is no usable quote at all, or the feed is malformed
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runMultiAssetUpdate, QUOTES_PATH, LEGACY_VWCE_PATH } from "./price/orchestrator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function reportDiagnostics(result) {
  if (result.warnings?.length) {
    console.warn("Degraded sources (a verified source still produced the price):");
    for (const w of result.warnings) console.warn(`  ${w.isin}: ${w.message}`);
  }
  if (result.errors?.length) {
    console.warn("Per-instrument errors (previous quotes kept):");
    for (const e of result.errors) console.warn(`  ${e.isin}: ${e.message}`);
  }
}

if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  const fixture = process.argv.includes("--fixture");
  try {
    const opts = { dryRun };
    if (fixture) {
      opts.bodiesByIsin = {
        IE00BK5BQT80: {
          yahooBody: JSON.parse(
            fs.readFileSync(
              path.join(__dirname, "fixtures/yahoo-vwce.json"),
              "utf8",
            ),
          ),
          onvistaBody: JSON.parse(
            fs.readFileSync(
              path.join(__dirname, "fixtures/onvista-vwce.json"),
              "utf8",
            ),
          ),
        },
      };
      if (process.argv.includes("--after-close")) {
        opts.now = new Date("2026-08-03T17:00:00.000Z");
      } else {
        opts.now = new Date("2026-08-03T09:00:00.000Z");
      }
      opts.fetchedAt = new Date();
    }
    const result = await runMultiAssetUpdate(opts);
    reportDiagnostics(result);

    if (result.wrote) {
      console.log("Wrote", QUOTES_PATH);
      if (result.legacyWrote) console.log("Mirrored", LEGACY_VWCE_PATH);
      console.log(JSON.stringify(result.quotesDoc, null, 2));
      process.exit(0);
    }

    console.log(result.reason || "No write");
    if (result.quotesDoc) {
      console.log(JSON.stringify(result.quotesDoc, null, 2));
    }

    // An outage is only fatal when it leaves us with nothing to serve.
    const hasUsableQuote =
      !!result.quotesDoc && result.quotesDoc.quotes.length > 0;
    if (result.errors?.length && !hasUsableQuote) {
      console.error(
        "FAIL: every price source failed and there is no previous quote to keep",
      );
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error("FAIL:", e.message || e);
    process.exit(1);
  }
}
