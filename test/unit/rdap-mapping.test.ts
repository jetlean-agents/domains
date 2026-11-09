import { describe, expect, it } from "vitest";
import { mapRdapStatuses } from "../../src/domain/rdap.js";

describe("mapRdapStatuses", () => {
  it("defaults to registered with no statuses", () => {
    expect(mapRdapStatuses(undefined)).toBe("registered");
    expect(mapRdapStatuses([])).toBe("registered");
  });

  it("maps normal statuses to registered", () => {
    expect(mapRdapStatuses(["active", "client transfer prohibited"])).toBe("registered");
  });

  it("maps pending delete", () => {
    expect(mapRdapStatuses(["pending delete"])).toBe("pending_delete");
  });

  it("maps redemption period", () => {
    expect(mapRdapStatuses(["redemption period"])).toBe("redemption");
  });

  it("is case-insensitive", () => {
    expect(mapRdapStatuses(["Pending Delete"])).toBe("pending_delete");
  });
});
