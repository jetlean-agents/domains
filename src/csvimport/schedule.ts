import type { Pool } from "pg";
import { request } from "undici";
import { config } from "../config.js";
import { importCsv } from "./import.js";

export async function runCsvImportUrls(pool: Pool, urls: string[] = config.csvImportUrls): Promise<void> {
  for (const url of urls) {
    try {
      const res = await request(url, { signal: AbortSignal.timeout(30_000) });
      const text = await res.body.text();
      const result = await importCsv(pool, text, { sourceUrl: url });
      console.log(`csv import ${url}: provider=${result.provider} rows=${result.rowCount} inserted=${result.inserted}`);
    } catch (err) {
      console.error(`csv import failed for ${url}:`, err);
    }
  }
}
