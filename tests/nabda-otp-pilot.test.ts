import { describe, expect, it } from "vitest";
import { mayUseOtpPilot, normalizeBahrainPhone } from "../src/lib/nabda-otp.server";

describe("Nabda OTP pilot phone normalization", () => {
  it.each([
    ["39950016", "97339950016"],
    ["+973 3995 0016", "97339950016"],
    ["00973-39950016", "97339950016"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBahrainPhone(input)).toBe(expected);
  });

  it.each(["", "12345678", "+966500000000", "97329950016", "9733995"])(
    "rejects invalid or non-Bahrain number %s",
    (input) => {
      expect(normalizeBahrainPhone(input)).toBeNull();
    },
  );
});

describe("who may use the OTP pilot", () => {
  it("is the platform's owner only, never a store's admin", () => {
    expect(mayUseOtpPilot({ role: "super_admin", status: "active" })).toBe(true);
    expect(mayUseOtpPilot({ role: "super_admin", status: "suspended" })).toBe(false);
    expect(mayUseOtpPilot({ role: "brand_admin", status: "active" })).toBe(false);
    expect(mayUseOtpPilot({ role: "admin", status: "active" })).toBe(false);
    expect(mayUseOtpPilot(null)).toBe(false);
  });
});
