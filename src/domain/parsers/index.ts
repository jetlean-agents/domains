import type { WhoisParser } from "./types.js";
import { parseGenericWhois } from "./generic.js";
import { parseDeWhois } from "./de.js";
import { parseComUaWhois } from "./comua.js";

const PARSERS: Record<string, WhoisParser> = {
  de: parseDeWhois,
  ua: parseComUaWhois,
  "com.ua": parseComUaWhois,
};

/** Picks the whois response parser for a public suffix, falling back to the generic parser. */
export function getWhoisParser(publicSuffix: string): WhoisParser {
  return PARSERS[publicSuffix] ?? parseGenericWhois;
}
