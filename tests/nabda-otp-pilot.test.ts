import { describe, expect, it } from "vitest";
import { normalizeBahrainPhone } from "../src/lib/nabda-otp.server";

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
