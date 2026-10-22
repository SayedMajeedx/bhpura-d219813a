import { describe, expect, it } from "vitest";
import { calculateCashFlowStatement } from "../src/lib/double-entry-ledger";

describe("Accounting & Financial Statements Behavioral Suite", () => {
  describe("Cash Flow Statement Calculations", () => {
    it("aggregates cash box and bank account balances into total liquidity", () => {
      const cashAccounts = [
        { account_type: "cash_box", balance: 250.5 },
        { account_type: "bank_account", balance: 1420.75 },
      ];

      const statement = calculateCashFlowStatement(cashAccounts, [], []);

      expect(statement.cashBoxBalance).toBe(250.5);
      expect(statement.bankAccountBalance).toBe(1420.75);
      expect(statement.totalLiquidity).toBe(1671.25);
    });

    it("calculates operating cash inflow from paid orders and cash outflow from expenses", () => {
      const orders = [
        { id: "1", payment_status: "paid", total: 200.0 },
        { id: "2", payment_status: "paid", total: 75.5 },
        { id: "3", payment_status: "unpaid", total: 150.0 }, // Unpaid COD order is not cash inflow yet
      ];

      const expenses = [{ amount: 50.0 }, { amount: 30.25 }];

      const statement = calculateCashFlowStatement([], orders, expenses);

      // Inflow: 200 + 75.5 = 275.500
      expect(statement.operatingCashInflow).toBe(275.5);
      // Outflow: 50 + 30.25 = 80.250
      expect(statement.operatingCashOutflow).toBe(80.25);
      // Net Cash Flow: 275.5 - 80.25 = 195.250
      expect(statement.netCashFlow).toBe(195.25);
    });

    it("tracks pending reconciliation transfers and amounts", () => {
      const orders = [
        { id: "1", reconciliation_status: "pending", total: 45.0 },
        { id: "2", reconciliation_status: "pending", total: 35.5 },
        { id: "3", reconciliation_status: "reconciled", total: 100.0 },
      ];

      const statement = calculateCashFlowStatement([], orders, []);

      expect(statement.unreconciledTransfersCount).toBe(2);
      expect(statement.unreconciledTransfersAmount).toBe(80.5);
    });

    it("handles zero values and empty datasets with 3 decimal precision", () => {
      const statement = calculateCashFlowStatement([], [], []);

      expect(statement.cashBoxBalance).toBe(0);
      expect(statement.bankAccountBalance).toBe(0);
      expect(statement.totalLiquidity).toBe(0);
      expect(statement.operatingCashInflow).toBe(0);
      expect(statement.operatingCashOutflow).toBe(0);
      expect(statement.netCashFlow).toBe(0);
      expect(statement.unreconciledTransfersCount).toBe(0);
      expect(statement.unreconciledTransfersAmount).toBe(0);
    });
  });
});
