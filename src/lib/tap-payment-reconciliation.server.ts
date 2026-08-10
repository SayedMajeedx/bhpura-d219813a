const TAP_RECONCILIATION_AGE_MS = 30 * 60 * 1000;
const TAP_RECONCILIATION_BATCH_SIZE = 50;

const TAP_SUCCESS_STATUSES = new Set(["CAPTURED", "SUCCESS"]);
const TAP_TERMINAL_FAILURE_STATUSES = new Set([
  "ABANDONED",
  "CANCELLED",
  "DECLINED",
  "FAILED",
  "RESTRICTED",
  "TIMEDOUT",
  "VOID",
]);

export type TapReconciliationDecision = "paid" | "failed" | "pending";

export interface TapReconciliationCandidate {
  id: string;
  brand_id: string;
  payment_gateway_reference: string;
}

interface TapCharge {
  status?: string;
  metadata?: { order_id?: string; brand_id?: string };
}

export interface TapReconciliationResult {
  scanned: number;
  paid: number;
  failed: number;
  pending: number;
  skipped: number;
  errors: number;
}

export interface TapReconciliationDependencies {
  listCandidates(cutoffIso: string, limit: number): Promise<TapReconciliationCandidate[]>;
  getApiKey(brandId: string): Promise<string | null>;
  fetchCharge(chargeId: string, apiKey: string): Promise<TapCharge>;
  applyVerifiedStatus(
    candidate: TapReconciliationCandidate,
    verifiedStatus: string,
  ): Promise<boolean>;
}

export function classifyTapChargeStatus(status: string | undefined): TapReconciliationDecision {
  const normalized = status?.trim().toUpperCase() ?? "";
  if (TAP_SUCCESS_STATUSES.has(normalized)) return "paid";
  if (TAP_TERMINAL_FAILURE_STATUSES.has(normalized)) return "failed";
  return "pending";
}

export async function reconcileTapPaymentCandidates(
  dependencies: TapReconciliationDependencies,
  now = new Date(),
): Promise<TapReconciliationResult> {
  const result: TapReconciliationResult = {
    scanned: 0,
    paid: 0,
    failed: 0,
    pending: 0,
    skipped: 0,
    errors: 0,
  };
  const cutoffIso = new Date(now.getTime() - TAP_RECONCILIATION_AGE_MS).toISOString();
  const candidates = await dependencies.listCandidates(cutoffIso, TAP_RECONCILIATION_BATCH_SIZE);
  result.scanned = candidates.length;
  const apiKeys = new Map<string, string | null>();

  // Deliberately sequential: the cron runs every minute and must not burst the
  // gateway or cause multiple transitions to compete for the same order rows.
  for (const candidate of candidates) {
    try {
      let apiKey = apiKeys.get(candidate.brand_id);
      if (apiKey === undefined) {
        apiKey = await dependencies.getApiKey(candidate.brand_id);
        apiKeys.set(candidate.brand_id, apiKey);
      }
      if (!apiKey) {
        result.errors += 1;
        continue;
      }

      const charge = await dependencies.fetchCharge(candidate.payment_gateway_reference, apiKey);
      if (
        charge.metadata?.order_id !== candidate.id ||
        charge.metadata?.brand_id !== candidate.brand_id
      ) {
        result.errors += 1;
        continue;
      }

      const verifiedStatus = charge.status?.trim().toUpperCase() ?? "";
      const decision = classifyTapChargeStatus(verifiedStatus);
      if (decision === "pending") {
        result.pending += 1;
        continue;
      }

      const transitioned = await dependencies.applyVerifiedStatus(candidate, verifiedStatus);
      if (!transitioned) {
        result.skipped += 1;
      } else {
        result[decision] += 1;
      }
    } catch (error) {
      result.errors += 1;
      console.error(
        JSON.stringify({
          event: "tap_payment_reconciliation_error",
          orderId: candidate.id,
          brandId: candidate.brand_id,
          chargeId: candidate.payment_gateway_reference,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return result;
}

function createProductionDependencies(): TapReconciliationDependencies {
  return {
    async listCandidates(cutoffIso, limit) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("orders")
        .select("id, brand_id, payment_gateway_reference")
        .in("payment_method", [
          "card",
          "tap",
          "creimax",
          "credit",
          "credit_card",
          "debit_card",
          "apple_pay",
          "google_pay",
        ])
        .in("payment_status", ["unpaid", "UNPAID"])
        .not("payment_gateway_reference", "is", null)
        .lt("created_at", cutoffIso)
        .not("status", "in", '("cancelled","completed","shipped","delivered","returned")')
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`candidate query failed: ${error.message}`);
      return (data ?? []).filter(
        (row): row is TapReconciliationCandidate =>
          typeof row.id === "string" &&
          typeof row.brand_id === "string" &&
          typeof row.payment_gateway_reference === "string",
      );
    },

    async getApiKey(brandId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin.rpc as CallableFunction)(
        "get_integration_credential_secret",
        { p_brand_id: brandId, p_provider: "tap" },
      );
      if (error) throw new Error(`credential lookup failed: ${error.message}`);
      const credential = Array.isArray(data) ? data[0] : null;
      return credential && typeof credential.api_key === "string" ? credential.api_key : null;
    },

    async fetchCharge(chargeId, apiKey) {
      const response = await fetch(
        `https://api.tap.company/v2/charges/${encodeURIComponent(chargeId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error(`Tap verification returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object") throw new Error("Tap returned invalid JSON");
      return payload as TapCharge;
    },

    async applyVerifiedStatus(candidate, verifiedStatus) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin.rpc as CallableFunction)(
        "reconcile_verified_tap_order",
        {
          p_order_id: candidate.id,
          p_brand_id: candidate.brand_id,
          p_charge_id: candidate.payment_gateway_reference,
          p_verified_status: verifiedStatus,
        },
      );
      if (error) throw new Error(`verified transition failed: ${error.message}`);
      return data === true;
    },
  };
}

export async function reconcileAbandonedTapPayments(): Promise<TapReconciliationResult> {
  return reconcileTapPaymentCandidates(createProductionDependencies());
}
