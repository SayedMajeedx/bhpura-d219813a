import { describe, expect, it } from "vitest";
import {
  calculateIncomeStatement,
  calculateCashFlowStatement,
} from "../src/lib/double-entry-ledger";

describe("Accounting & Financial Statements Behavioral Suite", () => {
  describe("Income Statement (P&L) Calculations", () => {
    it("calculates standard income statement with fulfilled packaging BOM and gateway fees", () => {
      const orders = [
        {
          id: "ord-1",
          status: "completed",
          fulfillment_status: "delivered",
          payment_method: "card",
          total: 100.0,
          order_items: [
            { quantity: 2, unit_cost: 15.0, packaging_cost: 1.25 }, // Product COGS: 30, BOM: 2.5
          ],
        },
        {
          id: "ord-2",
          status: "confirmed",
          fulfillment_status: "delivered",
          payment_method: "benefit",
          total: 50.0,
          order_items: [
            { quantity: 1, unit_cost: 10.0, packaging_cost: 0.5 }, // Product COGS: 10, BOM: 0.5
          ],
        },
      ];

      const expenses = [
        { amount: 20.0, expense_type: "operating" }, // OpEx
        { amount: 50.0, expense_type: "cogs" }, // Inventory asset purchase (not period OpEx)
      ];

      const cardFeePercent = 2.5; // 2.5% of 100 = 2.500
      const benefitFeePercent = 1.0; // 1% of 50 = 0.500

      const statement = calculateIncomeStatement(
        orders,
        expenses,
        cardFeePercent,
        benefitFeePercent,
        [],
      );

      // Revenue: 100 + 50 = 150.000
      expect(statement.grossRevenue).toBe(150.0);
      expect(statement.returnsDiscounts).toBe(0);
      expect(statement.netRevenue).toBe(150.0);

      // Product COGS: 30 + 10 = 40.000
      expect(statement.productCogs).toBe(40.0);
      // Packaging BOM COGS: 2.5 + 0.5 = 3.000
      expect(statement.packagingBomCogs).toBe(3.0);
      expect(statement.totalCogs).toBe(43.0);

      // Gross profit: 150 - 43 = 107.000
      expect(statement.grossProfit).toBe(107.0);
      // Margin: (107 / 150) * 100 = 71.333% -> 71.3%
      expect(statement.grossMarginPercent).toBe(71.3);

      // Operating Expenses: only non-cogs = 20.000
      expect(statement.operatingExpenses).toBe(20.0);
      // Gateway fees: 2.5 (card) + 0.5 (benefit) = 3.000
      expect(statement.paymentProcessingFees).toBe(3.0);

      // Net operating profit: 150 - 43 - 20 - 3 = 84.000
      expect(statement.netOperatingProfit).toBe(84.0);
      // Net profit margin: (84 / 150) * 100 = 56.0%
      expect(statement.netProfitMarginPercent).toBe(56.0);
    });

    it("excludes packaging BOM COGS for unfulfilled/pending orders", () => {
      const orders = [
        {
          id: "ord-unfulfilled",
          status: "confirmed",
          fulfillment_status: "pending", // Unfulfilled
          payment_method: "benefit",
          total: 80.0,
          order_items: [{ quantity: 2, unit_cost: 20.0, packaging_cost: 2.0 }],
        },
      ];

      const statement = calculateIncomeStatement(orders, [], 0, 0, []);

      expect(statement.productCogs).toBe(40.0); // 2 * 20
      expect(statement.packagingBomCogs).toBe(0); // BOM not deducted until fulfilled
      expect(statement.totalCogs).toBe(40.0);
      expect(statement.grossProfit).toBe(40.0);
    });

    it("deducts processed returns from gross revenue and caps net revenue at zero", () => {
      const orders = [
        {
          id: "ord-1",
          status: "completed",
          fulfillment_status: "delivered",
          total: 100.0,
          order_items: [],
        },
      ];

      const returns = [
        { refund_status: "processed", net_refund_amount: 30.0 },
        { refund_status: "pending", net_refund_amount: 25.0 }, // pending return not yet deducted
      ];

      const statement = calculateIncomeStatement(orders, [], 0, 0, returns);

      expect(statement.grossRevenue).toBe(100.0);
      expect(statement.returnsDiscounts).toBe(30.0);
      expect(statement.netRevenue).toBe(70.0);
    });

    it("respects options: defaultPackagingCost fallback and bomEnabled flag", () => {
      const orders = [
        {
          id: "ord-1",
          status: "completed",
          fulfillment_status: "delivered",
          total: 50.0,
          order_items: [{ quantity: 3, unit_cost: 5.0 }], // packaging_cost missing
        },
      ];

      // With default packaging cost
      const stmtWithDefault = calculateIncomeStatement(orders, [], 0, 0, [], {
        defaultPackagingCost: 0.6,
      });
      expect(stmtWithDefault.packagingBomCogs).toBe(1.8); // 3 * 0.600

      // With BOM disabled
      const stmtBomDisabled = calculateIncomeStatement(orders, [], 0, 0, [], {
        defaultPackagingCost: 0.6,
        bomEnabled: false,
      });
      expect(stmtBomDisabled.packagingBomCogs).toBe(0);
    });

    it("handles zero revenue, empty arrays, and negative net operating profit gracefully", () => {
      const orders: any[] = [];
      const expenses = [{ amount: 150.0, expense_type: "operating" }];

      const statement = calculateIncomeStatement(orders, expenses, 2.5, 1.0, []);

      expect(statement.grossRevenue).toBe(0);
      expect(statement.netRevenue).toBe(0);
      expect(statement.totalCogs).toBe(0);
      expect(statement.grossProfit).toBe(0);
      expect(statement.grossMarginPercent).toBe(0);
      expect(statement.operatingExpenses).toBe(150.0);
      expect(statement.netOperatingProfit).toBe(-150.0);
      expect(statement.netProfitMarginPercent).toBe(0);
    });

    it("filters out cancelled and refunded orders from revenue calculations", () => {
      const orders = [
        { id: "1", status: "cancelled", total: 100.0, order_items: [] },
        { id: "2", status: "canceled", total: 80.0, order_items: [] },
        { id: "3", status: "refunded", total: 60.0, order_items: [] },
        { id: "4", status: "completed", total: 50.0, order_items: [] },
      ];

      const statement = calculateIncomeStatement(orders, [], 0, 0, []);
      expect(statement.grossRevenue).toBe(50.0);
    });
  });

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
