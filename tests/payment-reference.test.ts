import { describe, expect, it } from "vitest";
import { getPaymentGatewayReference } from "../src/lib/payment-reference";

describe("getPaymentGatewayReference", () => {
  it("uses the canonical database field", () => {
    expect(
      getPaymentGatewayReference({
        payment_gateway_reference: "chg_current",
        gateway_reference: "chg_legacy",
      }),
    ).toBe("chg_current");
  });

  it("supports historical integration-specific fields", () => {
    expect(getPaymentGatewayReference({ payment_intent_id: "pi_legacy" })).toBe("pi_legacy");
    expect(getPaymentGatewayReference({ tap_id: "chg_legacy" })).toBe("chg_legacy");
  });

  it("returns null when no reference exists", () => {
    expect(getPaymentGatewayReference({})).toBeNull();
  });
});
