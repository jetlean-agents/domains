import { request } from "undici";
import { config } from "../config.js";

export function autoregEnabled(): boolean {
  return Boolean(config.autoreg.apiUrl && config.autoreg.apiToken);
}

export class AutoregError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoregError";
  }
}

function authHeaders(): Record<string, string> {
  // Autoreg's ServiceTokenAuthentication expects "Authorization: Token <raw>" — not "Bearer".
  return { authorization: `Token ${config.autoreg.apiToken}`, "content-type": "application/json" };
}

/** Looks up an Autoreg niche's numeric id by its slug (`GET /api/v1/niches/?slug=<slug>`). */
async function resolveNicheId(slug: string): Promise<number> {
  const url = `${config.autoreg.apiUrl}/api/v1/niches/?slug=${encodeURIComponent(slug)}`;
  const res = await request(url, { method: "GET", headers: authHeaders() });
  if (res.statusCode !== 200) {
    throw new AutoregError(`Autoreg niche lookup failed: HTTP ${res.statusCode}`);
  }
  const body = (await res.body.json()) as { results?: Array<{ id: number }> } | Array<{ id: number }>;
  const results = Array.isArray(body) ? body : body.results ?? [];
  if (results.length === 0) {
    throw new AutoregError(`Autoreg has no niche with slug "${slug}"`);
  }
  return results[0].id;
}

/**
 * Creates a site in Autoreg for a watchlist domain (`POST /api/v1/sites/`). `desiredAction`
 * is forwarded as the Autoreg site `type` (`drop` | `new`); anything else defaults to `drop`
 * (this endpoint is only meaningful for a drop/new-domain workflow).
 */
export async function createAutoregSite(
  domain: string,
  nicheSlug: string,
  desiredAction: string,
): Promise<string> {
  const nicheId = await resolveNicheId(nicheSlug);
  const type = desiredAction === "new" ? "new" : "drop";
  const res = await request(`${config.autoreg.apiUrl}/api/v1/sites/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ niche: nicheId, name: domain, type, domain }),
  });
  if (res.statusCode !== 201) {
    const body = await res.body.text();
    throw new AutoregError(`Autoreg site creation failed: HTTP ${res.statusCode} ${body}`);
  }
  const site = (await res.body.json()) as { id: number };
  return String(site.id);
}
