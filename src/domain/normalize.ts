import { getDomain, getPublicSuffix } from "tldts";

export interface NormalizedDomain {
  input: string;
  ascii: string;
  publicSuffix: string | null;
}

export class InvalidDomainError extends Error {
  constructor(input: string) {
    super(`Invalid domain: ${input}`);
  }
}

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Normalizes user input to ASCII (punycode) and validates shape + public suffix. */
export function normalizeDomain(raw: string): NormalizedDomain {
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed || trimmed.length > 253) throw new InvalidDomainError(raw);

  let ascii: string;
  try {
    ascii = toAscii(trimmed);
  } catch {
    throw new InvalidDomainError(raw);
  }

  const labels = ascii.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) {
    throw new InvalidDomainError(raw);
  }

  const registrable = getDomain(ascii);
  if (!registrable || registrable !== ascii) throw new InvalidDomainError(raw);

  return {
    input: raw,
    ascii,
    publicSuffix: getPublicSuffix(ascii) ?? null,
  };
}

function toAscii(hostname: string): string {
  if (/^[\x00-\x7f]*$/.test(hostname)) return hostname;
  return hostname
    .split(".")
    .map((label) => (/^[\x00-\x7f]*$/.test(label) ? label : domainToASCIILabel(label)))
    .join(".");
}

function domainToASCIILabel(label: string): string {
  const url = new URL(`https://${label}`);
  return url.hostname;
}
