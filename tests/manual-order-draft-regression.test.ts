import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { orderSaveBlocker } from "../src/features/orders/lib/order-save";

// The order editor is split across its route and src/features/orders (Phase 5).
const orderDetailSource = () =>
  [
    "src/routes/_authenticated/admin.b.$slug.orders.$id.tsx",
    ...["actions", "components", "hooks", "lib"].flatMap((dir) =>
      readdirSync(`src/features/orders/${dir}`)
        .sort()
        .map((file) => `src/features/orders/${dir}/${file}`),
    ),
  ]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

const list = readFileSync("src/routes/_authenticated/admin.b.$slug.orders.index.tsx", "utf8");
const detail = orderDetailSource();

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
    const pickup = { fulfillment_method: "pickup", branch_id: "b1" };
    expect(orderSaveBlocker({ ...pickup, customer_id: null }, [], "new", "ar")).toBe(
      "أضف عميلاً أو منتجاً واحداً على الأقل قبل حفظ الطلب.",
    );
    expect(orderSaveBlocker({ ...pickup, customer_id: "c1" }, [], "new", "en")).toBeNull();
    expect(orderSaveBlocker({ ...pickup, customer_id: null }, [], "o1", "en")).toBeNull();
    // The check runs before any insert: save returns on a blocker first.
    const saveHandler = detail.slice(detail.indexOf("const save = async"));
    expect(saveHandler.indexOf("orderSaveBlocker(")).toBeLessThan(
      saveHandler.indexOf('.from("orders")'),
    );
  });
});
