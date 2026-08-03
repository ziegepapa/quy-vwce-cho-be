/**
 * PR 2A — Multi-asset quote feed v2 entrypoint.
 * Writes public/data/quotes.json (schema 2) + mirrors VWCE to vwce-price.json (schema 1).
 * Node 22 built-ins only. No secrets. No HTML scraping.
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runMultiAssetUpdate, QUOTES_PATH, LEGACY_VWCE_PATH } from "./price/orchestrator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

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
    if (result.wrote) {
      console.log("Wrote", QUOTES_PATH);
      if (result.legacyWrote) console.log("Mirrored", LEGACY_VWCE_PATH);
      console.log(JSON.stringify(result.quotesDoc, null, 2));
      if (result.errors.length) {
        console.warn("Per-instrument errors (other quotes kept):");
        for (const e of result.errors) console.warn(`  ${e.isin}: ${e.message}`);
      }
      process.exit(0);
    }
    console.log(result.reason || "No write");
    if (result.errors.length) {
      for (const e of result.errors) console.warn(`  ${e.isin}: ${e.message}`);
    }
    if (result.quotesDoc) {
      console.log(JSON.stringify(result.quotesDoc, null, 2));
    }
    // Exit 1 only if every live instrument failed and we have no quotes at all
    if (
      result.errors.length &&
      (!result.quotesDoc || result.quotesDoc.quotes.length === 0)
    ) {
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error("FAIL:", e.message || e);
    process.exit(1);
  }
}
