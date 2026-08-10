import { describe, expect, test, vi } from "vitest";
import {
  classifyTapChargeStatus,
  reconcileTapPaymentCandidates,
  type TapReconciliationDependencies,
} from "../src/lib/tap-payment-reconciliation.server";

const candidate = {
  id: "order-1",
  brand_id: "brand-1",
  payment_gateway_reference: "chg-1",
};

function dependencies(charge: {
  status?: string;
  metadata?: { order_id?: string; brand_id?: string };
}): TapReconciliationDependencies {
  return {
    listCandidates: vi.fn().mockResolvedValue([candidate]),
    getApiKey: vi.fn().mockResolvedValue("test-key"),
    fetchCharge: vi.fn().mockResolvedValue(charge),
    applyVerifiedStatus: vi.fn().mockResolvedValue(true),
  };
}

describe("Tap payment reconciliation", () => {
  test.each([
    ["CAPTURED", "paid"],
    ["SUCCESS", "paid"],
    ["DECLINED", "failed"],
    ["TIMEDOUT", "failed"],
    ["INITIATED", "pending"],
    [undefined, "pending"],
  ] as const)("classifies %s as %s", (status, expected) => {
    expect(classifyTapChargeStatus(status)).toBe(expected);
  });

  test("applies a terminal status only after charge metadata matches", async () => {
    const deps = dependencies({
      status: "CAPTURED",
      metadata: { order_id: candidate.id, brand_id: candidate.brand_id },
    });

    const result = await reconcileTapPaymentCandidates(deps, new Date("2026-08-08T12:00:00Z"));

    expect(deps.applyVerifiedStatus).toHaveBeenCalledWith(candidate, "CAPTURED");
    expect(result).toMatchObject({ scanned: 1, paid: 1, errors: 0 });
    expect(deps.listCandidates).toHaveBeenCalledWith("2026-08-08T11:30:00.000Z", 50);
  });

  test("keeps stock reserved for non-terminal gateway statuses", async () => {
    const deps = dependencies({
      status: "INITIATED",
      metadata: { order_id: candidate.id, brand_id: candidate.brand_id },
    });

    const result = await reconcileTapPaymentCandidates(deps);

    expect(deps.applyVerifiedStatus).not.toHaveBeenCalled();
    expect(result.pending).toBe(1);
  });

  test("rejects mismatched gateway metadata without changing the order", async () => {
    const deps = dependencies({
      status: "DECLINED",
      metadata: { order_id: "another-order", brand_id: candidate.brand_id },
    });

    const result = await reconcileTapPaymentCandidates(deps);

    expect(deps.applyVerifiedStatus).not.toHaveBeenCalled();
    expect(result.errors).toBe(1);
  });

  test("treats a concurrent webhook transition as an idempotent skip", async () => {
    const deps = dependencies({
      status: "DECLINED",
      metadata: { order_id: candidate.id, brand_id: candidate.brand_id },
    });
    vi.mocked(deps.applyVerifiedStatus).mockResolvedValue(false);

    const result = await reconcileTapPaymentCandidates(deps);

    expect(result).toMatchObject({ failed: 0, skipped: 1, errors: 0 });
  });

  test("does not cancel when Tap verification fails", async () => {
    const deps = dependencies({});
    vi.mocked(deps.fetchCharge).mockRejectedValue(new Error("gateway unavailable"));

    const result = await reconcileTapPaymentCandidates(deps);

    expect(deps.applyVerifiedStatus).not.toHaveBeenCalled();
    expect(result.errors).toBe(1);
  });
});
