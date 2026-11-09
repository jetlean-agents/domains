import { describe, expect, it } from "vitest";
import { HostRateLimiter } from "../../src/domain/rate-limit.js";

describe("HostRateLimiter", () => {
  it("never runs more than `concurrency` tasks for the same host at once", async () => {
    const limiter = new HostRateLimiter(2, 100);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limiter.run("example.com", async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 20));
        active -= 1;
      });

    await Promise.all([task(), task(), task(), task()]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("retries a retryable error and eventually succeeds", async () => {
    const limiter = new HostRateLimiter(1, 100);
    let attempts = 0;
    const result = await limiter.run("example.com", async () => {
      attempts += 1;
      if (attempts < 2) {
        const err: Error & { retryable?: boolean } = new Error("fail");
        err.retryable = true;
        throw err;
      }
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry a non-retryable error", async () => {
    const limiter = new HostRateLimiter(1, 100);
    let attempts = 0;
    await expect(
      limiter.run("example.com", async () => {
        attempts += 1;
        const err: Error & { retryable?: boolean } = new Error("fail");
        err.retryable = false;
        throw err;
      }),
    ).rejects.toThrow("fail");
    expect(attempts).toBe(1);
  });
});
