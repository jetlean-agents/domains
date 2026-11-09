import type { RetryableError } from "../domain/rate-limit.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Global (not per-host) queue: serializes `run()` calls so consecutive tasks start at least
 * `minIntervalMs` apart, with exponential backoff retries on retryable errors. Used for
 * Wayback CDX/content fetches and Common Crawl Index API calls, both of which must be throttled
 * to one caller at a time regardless of which domain is being evaluated.
 */
export class MinIntervalQueue {
  private queue: Array<() => void> = [];
  private draining = false;
  private lastRunAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  private acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.drain();
    });
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    void (async () => {
      while (this.queue.length > 0) {
        const wait = Math.max(0, this.lastRunAt + this.minIntervalMs - Date.now());
        if (wait > 0) await sleep(wait);
        const resolve = this.queue.shift();
        this.lastRunAt = Date.now();
        resolve?.();
      }
      this.draining = false;
    })();
  }

  async run<T>(fn: () => Promise<T>, opts?: { retries?: number }): Promise<T> {
    const maxRetries = opts?.retries ?? 3;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      await this.acquire();
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retryable = (err as RetryableError)?.retryable !== false;
        if (!retryable || attempt === maxRetries) break;
        await sleep(2 ** attempt * this.minIntervalMs);
      }
      attempt += 1;
    }
    throw lastErr;
  }
}
