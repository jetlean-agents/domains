import { Socket } from "node:net";
import type { RetryableError } from "./rate-limit.js";

const IANA_WHOIS_HOST = "whois.iana.org";
const BOOTSTRAP_TTL_MS = 24 * 3600 * 1000;

/** Static fallback map for TLDs whose whois server is well-known or not reliably
 * discoverable via the IANA referral (e.g. ccTLDs with thin/no referral data). */
export const STATIC_WHOIS_SERVERS: Record<string, string> = {
  "com.ua": "whois.ua",
  ua: "whois.ua",
  de: "whois.denic.de",
  eu: "whois.eu",
  io: "whois.nic.io",
  co: "whois.nic.co",
  me: "whois.nic.me",
  es: "whois.nic.es",
  it: "whois.nic.it",
  com: "whois.verisign-grs.com",
  net: "whois.verisign-grs.com",
};

const ianaCache = new Map<string, { server: string | null; fetchedAt: number }>();

async function rawWhoisQuery(host: string, query: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let data = "";
    const timer = setTimeout(() => {
      socket.destroy();
      const err: RetryableError = new Error(`whois timeout for ${host}`);
      err.retryable = true;
      reject(err);
    }, timeoutMs);

    socket.setEncoding("utf8");
    socket.once("error", (e) => {
      clearTimeout(timer);
      const err: RetryableError = new Error(`whois socket error for ${host}: ${e.message}`);
      err.retryable = true;
      reject(err);
    });
    socket.connect(43, host, () => {
      socket.write(`${query}\r\n`);
    });
    socket.on("data", (chunk) => {
      data += chunk;
    });
    socket.on("end", () => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Resolves the authoritative whois server for a TLD via IANA referral, falling back to a static map. */
export async function resolveWhoisServer(
  publicSuffix: string,
  timeoutMs: number,
): Promise<string | null> {
  const cached = ianaCache.get(publicSuffix);
  if (cached && Date.now() - cached.fetchedAt < BOOTSTRAP_TTL_MS) {
    return cached.server ?? STATIC_WHOIS_SERVERS[publicSuffix] ?? null;
  }
  try {
    const tld = publicSuffix.split(".").pop()!;
    const raw = await rawWhoisQuery(IANA_WHOIS_HOST, tld, timeoutMs);
    const match = raw.match(/^whois:\s*(\S+)/im);
    const server = match?.[1] ?? null;
    ianaCache.set(publicSuffix, { server, fetchedAt: Date.now() });
    return server ?? STATIC_WHOIS_SERVERS[publicSuffix] ?? null;
  } catch {
    return STATIC_WHOIS_SERVERS[publicSuffix] ?? null;
  }
}

export async function queryWhois(server: string, domain: string, timeoutMs: number): Promise<string> {
  return rawWhoisQuery(server, domain, timeoutMs);
}
