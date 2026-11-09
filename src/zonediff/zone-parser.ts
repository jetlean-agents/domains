import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";

function toAbsolute(name: string, origin: string): string {
  if (name.endsWith(".")) return name.slice(0, -1).toLowerCase();
  if (name === "@") return origin.toLowerCase();
  if (name === "") return origin.toLowerCase();
  return `${name}.${origin}`.toLowerCase();
}

/** Returns the registrable second-level domain (origin's immediate child) for an absolute owner name, or null for the apex/out-of-zone names. */
function secondLevelOf(absoluteName: string, origin: string): string | null {
  const o = origin.toLowerCase();
  if (absoluteName === o) return null;
  if (!absoluteName.endsWith(`.${o}`)) return null;
  const prefix = absoluteName.slice(0, absoluteName.length - o.length - 1);
  const labels = prefix.split(".");
  const lastLabel = labels[labels.length - 1];
  return `${lastLabel}.${o}`;
}

/**
 * Streams a BIND-format zone file (plain or gzip) and yields each unique
 * second-level domain name that owns at least one NS record. Tracks
 * `$ORIGIN` and resolves relative/absolute (trailing-dot) owner names.
 * Memory use is O(unique domains seen so far), never the whole file text.
 */
export async function* parseZoneFile(filePath: string): AsyncGenerator<string> {
  const isGz = filePath.endsWith(".gz");
  const raw = createReadStream(filePath);
  const stream = isGz ? raw.pipe(createGunzip()) : raw;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let origin = "";
  let lastOwner = "";
  const seen = new Set<string>();

  for await (const rawLine of rl) {
    const line = rawLine.replace(/;.*$/, "").trimEnd();
    if (!line.trim()) continue;

    if (line.startsWith("$ORIGIN")) {
      const parts = line.trim().split(/\s+/);
      origin = parts[1]?.endsWith(".") ? parts[1].slice(0, -1).toLowerCase() : (parts[1] ?? "").toLowerCase();
      continue;
    }
    if (line.startsWith("$")) continue; // other directives ($TTL, $INCLUDE, ...) — not needed here

    const startsWithWhitespace = /^\s/.test(rawLine);
    const fields = line.trim().split(/\s+/);
    let owner: string;
    let rest: string[];
    if (startsWithWhitespace) {
      owner = lastOwner;
      rest = fields;
    } else {
      owner = fields[0];
      rest = fields.slice(1);
      lastOwner = owner;
    }
    if (!owner) continue;

    // rest is [ttl?] [class?] TYPE ...rdata. ttl is numeric, class is IN/CH/HS.
    let idx = 0;
    if (/^\d+$/.test(rest[idx] ?? "")) idx++;
    if (["IN", "CH", "HS"].includes(rest[idx] ?? "")) idx++;
    const type = rest[idx];
    if (type !== "NS") continue;

    const absolute = toAbsolute(owner, origin);
    const sld = secondLevelOf(absolute, origin);
    if (!sld || seen.has(sld)) continue;
    seen.add(sld);
    yield sld;
  }
}
