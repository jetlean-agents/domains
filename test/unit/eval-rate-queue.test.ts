import { describe, expect, it } from "vitest";
import { MinIntervalQueue } from "../../src/evaluation/rate-queue.js";
import type { RetryableError } from "../../src/domain/rate-limit.js";

describe("MinIntervalQueue", () => {
  it("never starts two tasks less than minIntervalMs apart, globally (not per-host)", async () => {
    const queue = new MinIntervalQueue(50);
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

  it("retries a retryable error with backoff and eventually succeeds", async () => {
    const queue = new MinIntervalQueue(10);
    let attempts = 0;
    const result = await queue.run(async () => {
      attempts += 1;
      if (attempts < 3) {
        const err: RetryableError = new Error("rate limited");
        err.retryable = true;
        throw err;
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry a non-retryable error", async () => {
    const queue = new MinIntervalQueue(10);
    let attempts = 0;
    await expect(
      queue.run(async () => {
        attempts += 1;
        const err: RetryableError = new Error("not found");
        err.retryable = false;
        throw err;
      }),
    ).rejects.toThrow("not found");
    expect(attempts).toBe(1);
  });
});
