interface HostState {
  active: number;
  queue: Array<() => void>;
  lastRunAt: number;
}

export interface RetryableError extends Error {
  retryable?: boolean;
}

export class HostRateLimiter {
  private hosts = new Map<string, HostState>();

  constructor(
    private readonly concurrency: number,
    private readonly rps: number,
  ) {}

  private stateFor(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = { active: 0, queue: [], lastRunAt: 0 };
      this.hosts.set(host, s);
    }
    return s;
  }

  private async acquire(host: string): Promise<void> {
    const s = this.stateFor(host);
    while (true) {
      const minIntervalMs = 1000 / this.rps;
      const now = Date.now();
      const waitForRps = Math.max(0, s.lastRunAt + minIntervalMs - now);
      if (s.active < this.concurrency && waitForRps === 0) {
        s.active += 1;
        s.lastRunAt = Date.now();
        return;
      }
      await new Promise<void>((resolve) => {
        const delay = waitForRps > 0 ? waitForRps : 10;
        setTimeout(resolve, delay);
      });
    }
  }

  private release(host: string): void {
    const s = this.stateFor(host);
    s.active = Math.max(0, s.active - 1);
  }

  /** Runs fn() under per-host concurrency+RPS limits, retrying with exponential backoff on retryable errors. */
  async run<T>(host: string, fn: () => Promise<T>, opts?: { retries?: number }): Promise<T> {
    const maxRetries = opts?.retries ?? 2;
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= maxRetries) {
      await this.acquire(host);
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const retryable = (err as RetryableError)?.retryable !== false;
        if (!retryable || attempt === maxRetries) break;
        const backoffMs = 2 ** attempt * 200;
        await new Promise((r) => setTimeout(r, backoffMs));
      } finally {
        this.release(host);
      }
      attempt += 1;
    }
    throw lastErr;
  }
}
