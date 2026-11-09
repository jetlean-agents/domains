import { resolveNs } from "node:dns/promises";

/** Returns true when the domain has NS records (i.e. is delegated/registered). */
export async function hasNsRecords(domain: string): Promise<boolean> {
  try {
    const ns = await resolveNs(domain);
    return ns.length > 0;
  } catch {
    return false;
  }
}
