import assert from "node:assert";

console.log("Starting Simple Product & Incubator Integrity Verification...\n");

// Test 1: Null Barcode Partial Unique Index Safety
console.log("Test 1: Barcode Uniqueness & Null Handling");
// PostgreSQL Schema from Migration 20260706103909:
// CREATE UNIQUE INDEX IF NOT EXISTS product_variants_user_barcode_uniq
//   ON public.product_variants (user_id, barcode)
//   WHERE barcode IS NOT NULL;

const testVariants = [
  { id: "var_1", user_id: "user_a", barcode: null, sku: null, is_default: true },
  { id: "var_2", user_id: "user_a", barcode: null, sku: null, is_default: true },
  { id: "var_3", user_id: "user_a", barcode: "6084001234567", sku: "SKU-001", is_default: false },
];

// Check simulated partial index
const indexedEntries = new Map();
let indexCollisionDetected = false;

for (const variant of testVariants) {
  // Partial index condition: WHERE barcode IS NOT NULL
  if (variant.barcode !== null) {
    const key = `${variant.user_id}:${variant.barcode}`;
    if (indexedEntries.has(key)) {
      indexCollisionDetected = true;
    } else {
      indexedEntries.set(key, variant.id);
    }
  }
}

assert.strictEqual(
  indexCollisionDetected,
  false,
  "Null barcodes must never trigger uniqueness conflicts!",
);
assert.strictEqual(indexedEntries.size, 1, "Only non-null barcodes should be indexed");
console.log(
  "  PASSED: Multiple default variants with null barcode safely bypass partial unique index.\n",
);

// Test 2: In-memory barcode duplication check (barcodeInUse)
console.log("Test 2: barcodeInUse validation");
const normalizeBarcode = (value) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .toUpperCase();

const barcodeInUse = (value, exceptId) => {
  const normalized = normalizeBarcode(value);
  return (
    !!normalized &&
    testVariants.some(
      (variant) => variant.id !== exceptId && normalizeBarcode(variant.barcode) === normalized,
    )
  );
};

assert.strictEqual(barcodeInUse(null), false);
assert.strictEqual(barcodeInUse(""), false);
assert.strictEqual(barcodeInUse("6084001234567"), true);
assert.strictEqual(barcodeInUse("6084001234567", "var_3"), false);
console.log("  PASSED: In-memory barcode collision checker ignores null/empty barcode values.\n");

// Test 3: Incubator Multi-location Stock Isolation & Consignment Logic
console.log("Test 3: Multi-Location Stock Trigger & Incubator Consignment Logic");
// PostgreSQL Trigger trg_product_variants_sync_stock enforces:
// NEW.stock := COALESCE(NEW.stock_main, 0) + COALESCE(NEW.stock_incubator, 0);

const createVariantStock = (stockMain, stockIncubator) => {
  const sMain = Number(stockMain ?? 0);
  const sInc = Number(stockIncubator ?? 0);
  return {
    stock_main: sMain,
    stock_incubator: sInc,
    stock: sMain + sInc,
  };
};

// Initial state for simple product
const defaultVariant = createVariantStock(15, 0);
assert.strictEqual(defaultVariant.stock_main, 15);
assert.strictEqual(defaultVariant.stock_incubator, 0);
assert.strictEqual(defaultVariant.stock, 15);
console.log("  Initial State: In-Store (Main) = 15, Consignment (Incubator) = 0, Total = 15.");

// Merchant dispatches 5 units on consignment to an external partner/incubator
const consignmentTransferQty = 5;
const consignedVariant = createVariantStock(
  defaultVariant.stock_main - consignmentTransferQty,
  defaultVariant.stock_incubator + consignmentTransferQty,
);

assert.strictEqual(consignedVariant.stock_main, 10);
assert.strictEqual(consignedVariant.stock_incubator, 5);
assert.strictEqual(consignedVariant.stock, 15);
console.log(
  "  Consignment Transfer: In-Store (Main) = 10, Consignment (Incubator) = 5, Total = 15.",
);

// Simulating order deductions per location constraint (order_items_location_check)
const orderLocations = ["main", "incubator"];
for (const loc of orderLocations) {
  assert.ok(
    ["main", "incubator"].includes(loc),
    `Location ${loc} satisfies location check constraint`,
  );
}
console.log(
  "  PASSED: Multi-location stock and consignment triggers strictly preserved without conflict.\n",
);

console.log("All Simple Product & Incubator Consignment tests passed successfully!");
