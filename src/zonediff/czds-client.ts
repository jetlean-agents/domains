import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { request } from "undici";
import { config } from "../config.js";

const AUTH_URL = "https://account-api.icann.org/api/authenticate";
const CZDS_BASE = "https://czds-api.icann.org";

interface CzdsSession {
  token: string;
}

async function authenticate(): Promise<CzdsSession> {
  const res = await request(AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: config.czds.username, password: config.czds.password }),
  });
  if (res.statusCode !== 200) {
    throw new Error(`CZDS auth failed: HTTP ${res.statusCode}`);
  }
  const body = (await res.body.json()) as { accessToken: string };
  return { token: body.accessToken };
}

/** Lists zone download links the authenticated account currently has access to. */
export async function listAvailableZones(session: CzdsSession): Promise<string[]> {
  const res = await request(`${CZDS_BASE}/czds/downloads/links`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (res.statusCode !== 200) {
    throw new Error(`CZDS list zones failed: HTTP ${res.statusCode}`);
  }
  return (await res.body.json()) as string[];
}

/** Downloads a <tld>.zone.gz file to `destPath`. Only called when CZDS creds are configured. */
export async function downloadZone(session: CzdsSession, tld: string, destPath: string): Promise<void> {
  const res = await request(`${CZDS_BASE}/czds/downloads/${tld}.zone`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (res.statusCode !== 200) {
    throw new Error(`CZDS download failed for ${tld}: HTTP ${res.statusCode}`);
  }
  await pipeline(res.body, createWriteStream(destPath));
}

export function czdsEnabled(): boolean {
  return Boolean(config.czds.username && config.czds.password);
}

export async function czdsAuthenticate(): Promise<CzdsSession> {
  return authenticate();
}
