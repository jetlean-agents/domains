function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface QueueError extends Error {
  retryable?: boolean;
  statusCode?: number;
  /** Parsed `Retry-After` header (ms), when the upstream sent one on a 429/503. */
  retryAfterMs?: number;
}

/** Reads a header from an undici response (`string | string[] | undefined`), first value wins. */
export function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Parses a `Retry-After` header: either delay-seconds or an HTTP-date. Undefined if unparseable. */
export function parseRetryAfterMs(header: string | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

export const COOLDOWN_MIN_MS = 60_000;
export const COOLDOWN_MAX_MS = 15 * 60_000;

/**
 * Pure cooldown-length calculation: at least `minMs` (or the upstream's `Retry-After`, if longer),
 * doubling per consecutive throttle response, capped at `maxMs`. Exported so the escalation curve
 * itself can be unit-tested without actually waiting out a real cooldown.
 */
export function computeCooldownMs(
  consecutiveThrottle: number,
  retryAfterMs: number | undefined,
  opts: { minMs?: number; maxMs?: number } = {},
): number {
  const minMs = opts.minMs ?? COOLDOWN_MIN_MS;
  const maxMs = opts.maxMs ?? COOLDOWN_MAX_MS;
  const escalated = minMs * 2 ** Math.max(0, consecutiveThrottle - 1);
  return Math.min(maxMs, Math.max(retryAfterMs ?? 0, minMs, escalated));
}

/**
 * Global (not per-host) queue: serializes `run()` calls so consecutive tasks start at least
 * `minIntervalMs` apart, and — on a 429/503 — pauses the *whole* queue (not just the failing
 * caller) for a cooldown window before anyone's next attempt, honoring `Retry-After` when present
 * and escalating (60s -> ... -> 15min cap) on repeated throttling. Used for Wayback CDX/content
 * fetches and Common Crawl Index API calls, both of which must be throttled to one caller at a
 * time regardless of which domain is being evaluated — a per-call backoff that runs outside the
 * queue would let other concurrent callers keep hitting the upstream at full speed while the
 * throttled one waits, which is what actually trips a longer IP-level block.
 *
 * Logs one line per attempt (`queue=<label> t=<ms> gap_ms=<since previous request start>
 * status=<code> attempt=<n>`) and one line per cooldown entry, so a live run can be checked
 * against the configured interval.
 */
export class MinIntervalQueue {
  // Each queued entry is one attempt; it resolves only once that attempt (including its own
  // success/failure handling and any re-enqueue of the next attempt) is fully done. `pump()`
  // awaits each entry before looking at the queue again, so attempts never overlap in flight —
  // a 429 discovered mid-attempt is guaranteed to set the cooldown before any other queued
  // attempt (same `run()` call or a different, concurrent one) gets to start.
  private queue: Array<(gapMs: number) => Promise<void>> = [];
  private pumping = false;
  private lastRunAt = 0;
  private cooldownUntil = 0;
  private consecutiveThrottle = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly label: string,
    private readonly cooldownOpts: { minMs?: number; maxMs?: number } = {},
  ) {}

  private pump(): void {
    if (this.pumping) return;
    this.pumping = true;
    void (async () => {
      while (this.queue.length > 0) {
        const wait = Math.max(
          0,
          this.lastRunAt + this.minIntervalMs - Date.now(),
          this.cooldownUntil - Date.now(),
        );
        if (wait > 0) await sleep(wait);
        const task = this.queue.shift();
        const now = Date.now();
        const gapMs = this.lastRunAt === 0 ? 0 : now - this.lastRunAt;
        this.lastRunAt = now;
        await task?.(gapMs);
      }
      this.pumping = false;
    })();
  }

  /** Pauses every future attempt (any caller, any domain) in this queue until the cooldown elapses. */
  private enterCooldown(retryAfterMs: number | undefined, statusCode: number): void {
    this.consecutiveThrottle += 1;
    const ms = computeCooldownMs(this.consecutiveThrottle, retryAfterMs, this.cooldownOpts);
    this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms);
    console.warn(
      `queue=${this.label} cooldown=1 ms=${ms} status=${statusCode} consecutive=${this.consecutiveThrottle}`,
    );
  }

  async run<T>(fn: () => Promise<T>, opts?: { retries?: number }): Promise<T> {
    const maxAttempts = (opts?.retries ?? 3) + 1;
    return new Promise<T>((resolve, reject) => {
      let attempt = 1;
      const enqueueAttempt = (): void => {
        this.queue.push(async (gapMs: number) => {
          const t = Date.now();
          try {
            const result = await fn();
            console.log(`queue=${this.label} t=${t} gap_ms=${gapMs} status=200 attempt=${attempt}`);
            this.consecutiveThrottle = 0;
            resolve(result);
          } catch (err) {
            const e = err as QueueError;
            console.log(
              `queue=${this.label} t=${t} gap_ms=${gapMs} status=${e.statusCode ?? "error"} attempt=${attempt}`,
            );
            if (e.statusCode === 429 || e.statusCode === 503) {
              this.enterCooldown(e.retryAfterMs, e.statusCode);
            }
            const retryable = e?.retryable !== false;
            if (!retryable || attempt === maxAttempts) {
              reject(err);
              return;
            }
            attempt += 1;
            enqueueAttempt();
          }
        });
        this.pump();
      };
      enqueueAttempt();
    });
  }
}
