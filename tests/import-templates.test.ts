import { describe, expect, it } from "vitest";
import { sampleTemplate } from "../src/features/import-export/lib/import-templates";
import { productSampleCsv } from "../src/features/import-export/lib/store-columns";

// The sample files the import page offers, one per kind of import.

describe("the sample file of an import", () => {
  it("is the store's own product columns: with stock for a store that keeps it, without for one that does not", () => {
    const withStock = sampleTemplate("products");
    const withoutStock = sampleTemplate("products", false);
    expect(withStock.filename).toBe("boutq_products_template.csv");
    expect(withStock.text).toBe(productSampleCsv(true));
    expect(withoutStock.text).toBe(productSampleCsv(false));
    expect(withoutStock.text).not.toBe(withStock.text);
  });

  it("starts with the columns the customer importer reads", () => {
    const { filename, text } = sampleTemplate("customers");
    expect(filename).toBe("boutq_customers_template.csv");
    expect(text.split("\n")[0]).toBe("name,phone,email,notes");
    expect(text.split("\n")).toHaveLength(4);
  });

  it("starts with the columns the order importer reads, a line per order line", () => {
    const { filename, text } = sampleTemplate("orders");
    expect(filename).toBe("boutq_orders_template.csv");
    expect(text.split("\n")[0]).toBe(
      "order_number,created_at,customer_name,customer_phone,customer_email,total,item_name,quantity,price",
    );
    for (const row of text.split("\n").slice(1)) expect(row.split(",")).toHaveLength(9);
  });

  it("does not let the stock choice change the other two", () => {
    expect(sampleTemplate("customers", false)).toEqual(sampleTemplate("customers", true));
    expect(sampleTemplate("orders", false)).toEqual(sampleTemplate("orders", true));
  });
});
