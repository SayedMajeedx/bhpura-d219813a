import { supabase } from "@/integrations/supabase/client";

export interface CashFlowStatementData {
  cashBoxBalance: number;
  bankAccountBalance: number;
  totalLiquidity: number;
  operatingCashInflow: number;
  operatingCashOutflow: number;
  netCashFlow: number;
  unreconciledTransfersCount: number;
  unreconciledTransfersAmount: number;
}

/**
 * Calculates Cash Flow and Liquidity position
 */
export function calculateCashFlowStatement(
  cashAccounts: any[],
  orders: any[],
  expenses: any[],
): CashFlowStatementData {
  let cashBoxBalance = 0;
  let bankAccountBalance = 0;

  cashAccounts.forEach((acc) => {
    const val = Number(acc.balance || 0);
    if (acc.account_type === "bank_account") {
      bankAccountBalance += val;
    } else {
      cashBoxBalance += val;
    }
  });

  const totalLiquidity = cashBoxBalance + bankAccountBalance;

  const paidOrders = orders.filter((o) => o.payment_status === "paid");
  const operatingCashInflow = paidOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const operatingCashOutflow = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const netCashFlow = operatingCashInflow - operatingCashOutflow;

  const pendingReconciliations = orders.filter((o) => o.reconciliation_status === "pending");
  const unreconciledTransfersCount = pendingReconciliations.length;
  const unreconciledTransfersAmount = pendingReconciliations.reduce(
    (sum, o) => sum + Number(o.total || 0),
    0,
  );

  return {
    cashBoxBalance: Number(cashBoxBalance.toFixed(3)),
    bankAccountBalance: Number(bankAccountBalance.toFixed(3)),
    totalLiquidity: Number(totalLiquidity.toFixed(3)),
    operatingCashInflow: Number(operatingCashInflow.toFixed(3)),
    operatingCashOutflow: Number(operatingCashOutflow.toFixed(3)),
    netCashFlow: Number(netCashFlow.toFixed(3)),
    unreconciledTransfersCount,
    unreconciledTransfersAmount: Number(unreconciledTransfersAmount.toFixed(3)),
  };
}

/**
 * Helper to record double-entry journal entry in database
 */
export async function postDoubleEntryJournal(
  brandId: string,
  referenceType: "order" | "expense" | "po" | "manual",
  referenceId: string,
  narration: string,
  debitAccountCode: string,
  creditAccountCode: string,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (amount <= 0) return { success: true };

    // 1. Create journal entry header
    const { data: entry, error: entryErr } = await (supabase as any)
      .from("journal_entries")
      .insert({
        brand_id: brandId,
        reference_type: referenceType,
        reference_id: referenceId,
        narration,
      } as any)
      .select("id")
      .single();

    if (entryErr || !entry) {
      return { success: false, error: entryErr?.message || "Failed to create journal entry" };
    }

    // 2. Fetch or create ledger accounts
    const { data: debitAcc } = await (supabase as any)
      .from("ledger_accounts")
      .select("id")
      .eq("brand_id", brandId)
      .eq("code", debitAccountCode)
      .maybeSingle();

    const { data: creditAcc } = await (supabase as any)
      .from("ledger_accounts")
      .select("id")
      .eq("brand_id", brandId)
      .eq("code", creditAccountCode)
      .maybeSingle();

    if (debitAcc && creditAcc) {
      await (supabase as any).from("journal_entry_lines").insert([
        { entry_id: entry.id, account_id: debitAcc.id, debit: amount, credit: 0 },
        { entry_id: entry.id, account_id: creditAcc.id, debit: 0, credit: amount },
      ] as any);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to post double-entry ledger" };
  }
}
