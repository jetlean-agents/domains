import type { Pool } from "pg";
import { config } from "../config.js";
import { evaluateDomain } from "./pipeline.js";
import { getAutoEvalCountToday, incrementAutoEvalCount, listDropDomainsNeedingEvaluation } from "../db/queries.js";

/**
 * Background auto-evaluation of new drops, capped at EVAL_DAILY_LIMIT fresh evaluations/day
 * (UTC calendar day) so a feed import doesn't burn through the whole day's Wayback/Common Crawl
 * budget in one run. Scheduled daily via EVAL_CRON (see src/scheduler.ts).
 */
export async function runAutoEvaluation(pool: Pool): Promise<{ evaluated: number }> {
  const already = await getAutoEvalCountToday(pool);
  const remaining = Math.max(0, config.evalDailyLimit - already);
  if (remaining === 0) return { evaluated: 0 };

  const domains = await listDropDomainsNeedingEvaluation(pool, remaining);
  let evaluated = 0;
  for (const domain of domains) {
    try {
      await evaluateDomain(pool, domain);
      evaluated += 1;
    } catch (err) {
      console.error(`auto-eval failed for ${domain}:`, err);
    }
  }
  if (evaluated > 0) await incrementAutoEvalCount(pool, evaluated);
  return { evaluated };
}
