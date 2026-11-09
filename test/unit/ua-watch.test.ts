import { describe, expect, it } from "vitest";
import { isDropTransition } from "../../src/uawatch/watch.js";

describe("isDropTransition", () => {
  it("flags a transition into pending_delete", () => {
    expect(isDropTransition("registered", "pending_delete")).toBe(true);
  });

  it("flags a transition into redemption", () => {
    expect(isDropTransition("registered", "redemption")).toBe(true);
  });

  it("flags a transition into available", () => {
    expect(isDropTransition("pending_delete", "available")).toBe(true);
  });

  it("does not flag a no-op (same status)", () => {
    expect(isDropTransition("registered", "registered")).toBe(false);
    expect(isDropTransition("pending_delete", "pending_delete")).toBe(false);
  });

  it("does not flag a transition into registered or unknown", () => {
    expect(isDropTransition("unknown", "registered")).toBe(false);
    expect(isDropTransition("registered", "unknown")).toBe(false);
  });
});
