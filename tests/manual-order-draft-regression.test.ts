import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const list = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.index.tsx", "utf8");
const detail = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.$id.tsx", "utf8");

describe("manual order creation", () => {
  it("opens an in-memory draft without inserting an order", () => {
    const createHandler = list.slice(
      list.indexOf("const create = async"),
      list.indexOf("const orders = useMemo"),
    );
    expect(createHandler).toContain('id: "new"');
    expect(createHandler).not.toContain('.from("orders")');
    // The order query moved to src/features/orders/hooks (Phase 5).
    const detailData = readFileSync("src/features/orders/hooks/use-order-detail-data.ts", "utf8");
    expect(detailData).toContain('enabled: id !== "new"');
  });

  it("requires meaningful data before the first database insert", () => {
    const saveHandler = detail.slice(
      detail.indexOf("const save = async"),
      detail.indexOf("// Activity log", detail.indexOf("const save = async")),
    );
    expect(saveHandler).toContain('id === "new" && !order.customer_id && items.length === 0');
    expect(saveHandler).toContain("أضف عميلاً أو منتجاً واحداً على الأقل قبل حفظ الطلب.");
    expect(saveHandler.indexOf("Add at least one customer or product")).toBeLessThan(
      saveHandler.indexOf('.from("orders")'),
    );
  });
});
