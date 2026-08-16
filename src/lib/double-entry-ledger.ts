import { supabase } from "@/integrations/supabase/client";

export interface IncomeStatementData {
  grossRevenue: number;
  returnsDiscounts: number;
  netRevenue: number;
  productCogs: number;
  packagingBomCogs: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number; // OpEx (Rent, Salaries, Marketing, Incubator)
  paymentProcessingFees: number; // Gateway fees (Tap, Benefit, Card)
  netOperatingProfit: number;
  netProfitMarginPercent: number;
}

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
 * Calculates Income Statement (P&L) strictly following the formula:
 * Net Profit = Revenue - Total COGS (Products + Packaging BOM) - OpEx - Gateway Fees
 */
export function calculateIncomeStatement(
  orders: any[],
  expenses: any[],
  cardFeePercent: number = 0,
  benefitFeePercent: number = 0,
): IncomeStatementData {
  const confirmedOrders = orders.filter((o) =>
    ["confirmed", "paid", "shipped", "completed"].includes(o.status),
  );

  const grossRevenue = confirmedOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const returnsDiscounts = 0; // Reserved for refunds
  const netRevenue = grossRevenue - returnsDiscounts;

  let productCogs = 0;
  let packagingBomCogs = 0;

  confirmedOrders.forEach((order) => {
    (order.order_items ?? []).forEach((item: any) => {
      const qty = Number(item.quantity || 0);
      const unitCost = Number(item.unit_cost || 0);
      const packagingCost = Number(item.packaging_cost || 0);

      productCogs += unitCost * qty;
      packagingBomCogs += packagingCost * qty;
    });
  });

  const totalCogs = productCogs + packagingBomCogs;
  const grossProfit = netRevenue - totalCogs;
  const grossMarginPercent = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

  let operatingExpenses = 0; // OpEx
  let directProductionExpenses = 0; // Direct COGS expenses

  expenses.forEach((e) => {
    const amt = Number(e.amount || 0);
    if (e.expense_type === "cogs") {
      directProductionExpenses += amt;
    } else {
      operatingExpenses += amt;
    }
  });

  // Calculate gateway processing fees
  let paymentProcessingFees = 0;
  confirmedOrders.forEach((o) => {
    const totalVal = Number(o.total || 0);
    if (o.payment_method === "card") {
      paymentProcessingFees += totalVal * (cardFeePercent / 100);
    } else if (o.payment_method === "benefit") {
      paymentProcessingFees += totalVal * (benefitFeePercent / 100);
    }
  });

  const aggregateTotalCogs = totalCogs + directProductionExpenses;
  const netOperatingProfit = netRevenue - aggregateTotalCogs - operatingExpenses - paymentProcessingFees;
  const netProfitMarginPercent = netRevenue > 0 ? (netOperatingProfit / netRevenue) * 100 : 0;

  return {
    grossRevenue: Number(grossRevenue.toFixed(3)),
    returnsDiscounts: Number(returnsDiscounts.toFixed(3)),
    netRevenue: Number(netRevenue.toFixed(3)),
    productCogs: Number(productCogs.toFixed(3)),
    packagingBomCogs: Number(packagingBomCogs.toFixed(3)),
    totalCogs: Number(aggregateTotalCogs.toFixed(3)),
    grossProfit: Number(grossProfit.toFixed(3)),
    grossMarginPercent: Number(grossMarginPercent.toFixed(1)),
    operatingExpenses: Number(operatingExpenses.toFixed(3)),
    paymentProcessingFees: Number(paymentProcessingFees.toFixed(3)),
    netOperatingProfit: Number(netOperatingProfit.toFixed(3)),
    netProfitMarginPercent: Number(netProfitMarginPercent.toFixed(1)),
  };
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
