import type { Page } from "@playwright/test";

/**
 * A signed-in admin session with every Supabase call answered in the browser, and data made to
 * push on the layout: long names, a long email, notes with a word that cannot wrap.
 */

export const BRAND = "test-brand";
const UNBREAKABLE = "x".repeat(90);
const LONG_AR = "عباية فاخرة بتطريز يدوي دقيق وقماش كريب ملكي مع أكمام واسعة وحزام مخملي طويل جداً";
const LONG_EN =
  "Luxury hand-embroidered royal crepe abaya with wide sleeves and a very long velvet belt";
const LONG_PERSON = "Fatima Abdulrahman Mohammed Al-Khalifa Bin Ahmed Al-Mansoori";
const LONG_EMAIL = `fatima.abdulrahman.mohammed.alkhalifa.${"long".repeat(8)}@example-boutique-mail.com`;

const brand = {
  id: BRAND,
  slug: BRAND,
  name_en: `${LONG_EN} Store`,
  name_ar: `متجر ${LONG_AR}`,
  logo_url: null,
  is_active: true,
  support_access_enabled: true,
};
const products = [
  {
    id: "prod-1",
    brand_id: BRAND,
    name: LONG_EN,
    name_en: LONG_EN,
    name_ar: LONG_AR,
    category: LONG_EN,
    base_price: 15,
    is_active: true,
    is_made_to_order: true,
    item_kind: "product",
    image_url: null,
    created_at: "2026-07-20T12:00:00Z",
  },
];
const variants = [
  {
    id: "var-1",
    product_id: "prod-1",
    brand_id: BRAND,
    sku: `SKU-${UNBREAKABLE.slice(0, 40)}`,
    size: "Extra Extra Large Tall",
    color: "Midnight Blue With Gold Thread",
    fabric: "Royal Crepe",
    selling_price: 15,
    stock: 10,
    stock_main: 10,
    stock_incubator: 0,
    created_at: "2026-07-20T12:00:00Z",
  },
];
const customer = {
  id: "cust-1",
  brand_id: BRAND,
  name: LONG_PERSON,
  phone: "97312345678",
  email: LONG_EMAIL,
  notes: `${LONG_AR} ${UNBREAKABLE}`,
  created_at: "2026-07-20T12:00:00Z",
};
const orders = [
  {
    id: "order-1",
    brand_id: BRAND,
    invoice_number: 1001,
    status: "confirmed",
    fulfillment_status: "NEEDS_PACKING",
    fulfillment_method: "delivery",
    payment_status: "unpaid",
    payment_method: "benefit_pay",
    total: 15,
    total_amount: 15,
    subtotal: 15,
    currency: "BHD",
    order_date: "2026-07-22",
    created_at: "2026-07-22T12:00:00Z",
    customer_id: "cust-1",
    customer_name_snapshot: LONG_PERSON,
    customer_email_snapshot: LONG_EMAIL,
    customer_phone_snapshot: "97312345678",
    customer_address_snapshot: `${LONG_AR}, ${LONG_EN}`,
    notes: `${LONG_AR} ${UNBREAKABLE}`,
    delivery_notes: `${LONG_EN} ${UNBREAKABLE}`,
    public_invoice_token: "token-1",
    customers: { name: LONG_PERSON, phone: "97312345678", email: LONG_EMAIL },
    profiles: { full_name: LONG_PERSON, phone: "97312345678" },
    order_items: [
      {
        id: "item-1",
        order_id: "order-1",
        product_id: "prod-1",
        variant_id: "var-1",
        quantity: 1,
        unit_price: 15,
        price: 15,
        line_total: 15,
        customization_total: 0,
        customizations: [],
        location: "custom",
        name_en: LONG_EN,
        description: `${LONG_AR} - ${LONG_EN}`,
        selected_variant: { size: "Extra Extra Large Tall", color: "Midnight Blue", fabric: "" },
        custom_field_values: [
          { key: "length", label_ar: "الطول", label_en: "Length", value: "56 in" },
          {
            key: "tailoring_notes",
            label_ar: "ملاحظات",
            label_en: "Notes",
            value: `${LONG_AR} ${UNBREAKABLE}`,
          },
        ],
      },
    ],
  },
];
const vendors = [{ id: "vendor-1", brand_id: BRAND, name: LONG_PERSON, phone: "97312345678" }];
/** A tailor's order, partly received, late and part paid, with a cost of the whole order. */
const purchaseOrders = [
  {
    id: "po-1",
    brand_id: BRAND,
    po_number: "PO-0001",
    status: "partially_received",
    vendor_id: "vendor-1",
    total_amount: 210,
    paid_amount: 50,
    expected_at: "2026-07-25",
    received_at: null,
    created_at: "2026-07-20T12:00:00Z",
    notes: `${LONG_AR} ${UNBREAKABLE}`,
    vendors: { name: LONG_PERSON, phone: "97312345678" },
    purchase_order_items: [
      {
        id: "po-item-1",
        variant_id: "var-1",
        product_id: "prod-1",
        description: LONG_EN,
        quantity: 10,
        received_quantity: 4,
        unit_cost: 18,
        line_total: 180,
        sort_order: 0,
      },
      {
        id: "po-item-2",
        variant_id: null,
        product_id: null,
        description: `${LONG_AR} ${UNBREAKABLE}`,
        quantity: 1,
        received_quantity: 0,
        unit_cost: 30,
        line_total: 30,
        sort_order: 1,
      },
    ],
  },
];
const purchaseReceipts = [
  {
    id: "receipt-1",
    item_id: "po-item-1",
    variant_id: "var-1",
    request_id: "00000000-0000-4000-8000-000000000001",
    quantity: 4,
    unit_cost: 21,
    cost_before: 0,
    cost_after: 21,
    note: `${LONG_EN} ${UNBREAKABLE}`,
    received_at: "2026-07-24T12:00:00Z",
  },
];
const categories = [
  { id: "cat-1", brand_id: BRAND, name: LONG_EN, name_en: LONG_EN, name_ar: LONG_AR, slug: "long" },
];

const user = {
  id: "test-user-id",
  email: LONG_EMAIL,
  role: "authenticated",
  aud: "authenticated",
};

export async function signInWithStressData(page: Page, lang: "ar" | "en") {
  await page.addInitScript(
    ({ user, lang }) => {
      const session = {
        access_token: "mock-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "mock-refresh-token",
        user,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      try {
        window.localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
        window.localStorage.setItem("lang", lang);
        // "Keep me signed in": without it the app signs a fresh browser session out.
        window.localStorage.setItem("boutq.auth.rememberMe", "1");
      } catch {
        /* storage is not available */
      }
    },
    { user, lang },
  );

  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) }),
  );
  await page.route("**/auth/v1/logout**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(/\/(storage|functions)\/v1\//, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const answer = (rows: unknown[], headers: Record<string, string> = {}) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers,
        body: JSON.stringify(single ? (rows[0] ?? null) : rows),
      });

    if (url.includes("/rpc/")) return answer([]);
    if (url.includes("/brands")) return answer([brand]);
    if (url.includes("/profiles")) {
      return answer([
        {
          id: user.id,
          status: "active",
          role: "super_admin",
          brand_id: BRAND,
          email: user.email,
          full_name: LONG_PERSON,
          created_at: "2026-07-20T12:00:00Z",
          updated_at: "2026-07-20T12:00:00Z",
          brand,
        },
      ]);
    }
    if (url.includes("/business_settings")) {
      return answer([
        {
          id: "setting-1",
          brand_id: BRAND,
          business_name: brand.name_en,
          currency: "BHD",
          card_processing_fee: 2.5,
          benefit_processing_fee: 1,
        },
      ]);
    }
    if (url.includes("/purchase_order_receipts")) return answer(purchaseReceipts);
    if (url.includes("/purchase_orders")) return answer(purchaseOrders);
    if (url.includes("/vendors")) return answer(vendors);
    if (url.includes("/order_items")) return answer(orders[0].order_items);
    if (url.includes("/orders")) return answer(orders, { "content-range": "0-0/1" });
    if (url.includes("/customers")) return answer([customer], { "content-range": "0-0/1" });
    if (url.includes("/product_variants")) return answer(variants);
    if (url.includes("/products")) return answer(products);
    if (url.includes("/categories")) return answer(categories);
    return answer([]);
  });
}
