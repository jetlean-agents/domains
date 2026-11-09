import type { Pool } from "pg";
import { getPublicSuffix } from "tldts";
import { parseCsv } from "./parse.js";
import type { Provider } from "./column-map.js";
import { insertDrops, recordCsvImport } from "../db/queries.js";

export interface ImportCsvResult {
  provider: Provider;
  rowCount: number;
  inserted: number;
  skipped: number;
}

/** Parses CSV text and inserts the resulting rows into `drops` with source=`csv:<provider>`. */
export async function importCsv(
  pool: Pool,
  text: string,
  opts: { provider?: Provider; sourceUrl?: string } = {},
): Promise<ImportCsvResult> {
  const parsed = parseCsv(text, { provider: opts.provider });
  const drops = parsed.rows.map((r) => ({
    domain: r.domain,
    tld: getPublicSuffix(r.domain) ?? "",
    source: `csv:${parsed.provider}`,
    dropped_at: r.dropped_at,
  }));
  const inserted = await insertDrops(pool, drops);
  await recordCsvImport(pool, {
    sourceUrl: opts.sourceUrl ?? null,
    provider: parsed.provider,
    rowCount: parsed.rows.length,
  });
  return { provider: parsed.provider, rowCount: parsed.rows.length, inserted, skipped: parsed.skipped };
}
