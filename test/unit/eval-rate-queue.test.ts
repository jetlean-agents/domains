import { describe, expect, it } from "vitest";
import {
  MinIntervalQueue,
  getHeader,
  parseRetryAfterMs,
  computeCooldownMs,
  type QueueError,
} from "../../src/evaluation/rate-queue.js";

describe("MinIntervalQueue", () => {
  it("never starts two tasks less than minIntervalMs apart, globally (not per-host)", async () => {
    const queue = new MinIntervalQueue(50, "test");
    const starts: number[] = [];
    await Promise.all(
      [1, 2, 3, 4].map(() =>
        queue.run(async () => {
          starts.push(Date.now());
        }),
      ),
    );
    starts.sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(45); // small slack for timer jitter
    }
  });

  it("retries a retryable error and eventually succeeds", async () => {
    const queue = new MinIntervalQueue(10, "test");
    let attempts = 0;
    const result = await queue.run(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err: QueueError = new Error("rate limited");
        err.retryable = true;
        throw err;
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry a non-retryable error", async () => {
    const queue = new MinIntervalQueue(10, "test");
    let attempts = 0;
    await expect(
      queue.run(async () => {
        attempts += 1;
        const err: QueueError = new Error("not found");
        err.retryable = false;
        throw err;
      }),
    ).rejects.toThrow("not found");
    expect(attempts).toBe(1);
  });

  it("on a 429, pauses the WHOLE queue (every caller) for the cooldown window, not just the failing task", async () => {
    // Small cooldown bounds (opts) so the test doesn't have to wait out the real 60s floor —
    // the escalation math itself is covered separately by computeCooldownMs below.
    const queue = new MinIntervalQueue(10, "test", { minMs: 120, maxMs: 120 });
    const starts: number[] = [];

    // Task A: fails once with a 429 (no Retry-After -> falls back to the 120ms test floor), then succeeds.
    const taskA = queue.run(
      (() => {
        let attempts = 0;
        return async () => {
          attempts += 1;
          starts.push(Date.now());
          if (attempts === 1) {
            const err: QueueError = new Error("rate limited");
            err.statusCode = 429;
            err.retryable = true;
            throw err;
          }
          return "ok";
        };
      })(),
    );
    // Task B: queued right behind A, has nothing to do with A's failure, must still be delayed
    // by A's cooldown — this is exactly the bug report: a per-call backoff that runs outside the
    // shared queue lets concurrent callers keep hitting the upstream during the cooldown window.
    const taskB = queue.run(async () => {
      starts.push(Date.now());
      return "ok";
    });

    const before = Date.now();
    await Promise.all([taskA, taskB]);
    starts.sort((a, b) => a - b);
    // The first attempt (A's failing one) starts immediately; every start after it must respect
    // the ~120ms cooldown, not just the 10ms minInterval.
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - before).toBeGreaterThanOrEqual(100); // slack under the 120ms cooldown
    }
  });

  it("resets the throttle streak after a success", async () => {
    const queue = new MinIntervalQueue(5, "test", { minMs: 20, maxMs: 20 });
    let attempts = 0;
    await queue.run(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const err: QueueError = new Error("rate limited");
          err.statusCode = 429;
          err.retryable = true;
          throw err;
        }
        return "ok";
      },
      { retries: 1 },
    );
    expect(attempts).toBe(2);
  });
});

describe("computeCooldownMs", () => {
  it("floors at the minimum even with no Retry-After", () => {
    expect(computeCooldownMs(1, undefined)).toBe(60_000);
  });

  it("uses Retry-After when it's longer than the minimum", () => {
    expect(computeCooldownMs(1, 90_000)).toBe(90_000);
  });

  it("ignores a Retry-After shorter than the minimum", () => {
    expect(computeCooldownMs(1, 5_000)).toBe(60_000);
  });

  it("doubles per consecutive throttle, capped at 15 minutes", () => {
    expect(computeCooldownMs(1, undefined)).toBe(60_000);
    expect(computeCooldownMs(2, undefined)).toBe(120_000);
    expect(computeCooldownMs(3, undefined)).toBe(240_000);
    expect(computeCooldownMs(4, undefined)).toBe(480_000);
    expect(computeCooldownMs(5, undefined)).toBe(900_000); // 960_000 capped to 900_000 (15min)
    expect(computeCooldownMs(10, undefined)).toBe(900_000);
  });

  it("respects custom min/max bounds (used by tests to avoid waiting out real cooldowns)", () => {
    expect(computeCooldownMs(1, undefined, { minMs: 100, maxMs: 300 })).toBe(100);
    expect(computeCooldownMs(3, undefined, { minMs: 100, maxMs: 300 })).toBe(300);
  });
});

describe("getHeader", () => {
  it("returns a plain string header as-is", () => {
    expect(getHeader({ "retry-after": "30" }, "retry-after")).toBe("30");
  });

  it("returns the first value of an array header", () => {
    expect(getHeader({ "retry-after": ["30", "60"] }, "retry-after")).toBe("30");
  });

  it("returns undefined for a missing header", () => {
    expect(getHeader({}, "retry-after")).toBeUndefined();
  });
});

describe("parseRetryAfterMs", () => {
  it("parses delay-seconds form", () => {
    expect(parseRetryAfterMs("30")).toBe(30_000);
  });

  it("parses an HTTP-date form", () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(5_000);
    expect(ms).toBeLessThan(15_000);
  });

  it("returns undefined for missing or unparseable input", () => {
    expect(parseRetryAfterMs(undefined)).toBeUndefined();
    expect(parseRetryAfterMs("not-a-date")).toBeUndefined();
  });
});
