import { normalizeDomain, InvalidDomainError } from "../domain/normalize.js";
import { detectColumnMap, type ColumnMap, type Provider } from "./column-map.js";

/** Splits one CSV line into fields, respecting double-quoted fields (with "" escaping). No external deps. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export interface ParsedCsvRow {
  domain: string;
  dropped_at: string;
}

export interface ParsedCsv {
  provider: Provider;
  rows: ParsedCsvRow[];
  skipped: number;
}

/** Parses CSV text into normalized {domain, dropped_at} rows, skipping invalid domains instead of throwing. */
export function parseCsv(text: string, opts: { provider?: Provider; today?: string } = {}): ParsedCsv {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { provider: opts.provider ?? "generic", rows: [], skipped: 0 };

  const header = splitCsvLine(lines[0]);
  const map: ColumnMap = opts.provider
    ? { provider: opts.provider, domainCol: 0, dateCol: null }
    : detectColumnMap(header);

  const rows: ParsedCsvRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line);
    const rawDomain = fields[map.domainCol];
    if (!rawDomain) {
      skipped++;
      continue;
    }
    let domain: string;
    try {
      domain = normalizeDomain(rawDomain).ascii;
    } catch (err) {
      if (err instanceof InvalidDomainError) {
        skipped++;
        continue;
      }
      throw err;
    }
    const rawDate = map.dateCol !== null ? fields[map.dateCol] : undefined;
    const dropped_at = (rawDate && normalizeDate(rawDate)) || today;
    rows.push({ domain, dropped_at });
  }

  return { provider: map.provider, rows, skipped };
}
