import { test, expect, type Page } from "@playwright/test";

// Bug #22: the admin returns screens selected `product_variants.variant_name`
// and `stock_quantity`, which do not exist, so every request failed. This
// checks the request the detail page sends and that the return renders. The
// Supabase responses are mocked (as in desktop-audit.spec.ts); nothing reaches
// a real database.

const RETURN_ID = "ret-1";

const mockReturn = {
  id: RETURN_ID,
  brand_id: "test-brand",
  order_id: "order-101",
  customer_id: "cust-1",
  return_number: "RET-2026-0001",
  status: "new",
  type: "refund",
  reason: "size_fit",
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:00:00Z",
  total_item_refund: 45,
  net_refund_amount: 45,
  order: {
    id: "order-101",
    invoice_number: 1001,
    total: 45,
    subtotal: 45,
    discount: 0,
    currency: "BHD",
    tax_amount: 0,
    tax_rate: 0,
    shipping: 0,
    advance_paid: 45,
    payment_status: "paid",
    status: "completed",
    created_at: "2026-09-10T10:00:00Z",
    customer_name_snapshot: "Fatima Al-Mansoor",
    customer_phone_snapshot: "97339001122",
    customer_email_snapshot: "fatima@example.com",
    delivery_address_snapshot: null,
  },
  customer: { id: "cust-1", name: "Fatima Al-Mansoor", phone: "97339001122", email: null },
  items: [
    {
      id: "ret-item-1",
      brand_id: "test-brand",
      return_id: RETURN_ID,
      order_item_id: "item-1",
      product_id: "prod-1",
      variant_id: "var-1",
      quantity: 1,
      unit_price: 45,
      total_price: 45,
      reason: null,
      item_images: [],
      action_type: "refund",
      condition: "pending_inspection",
      restocked: false,
      restocked_quantity: 0,
      restocked_at: null,
      inspection_notes: null,
      product: {
        id: "prod-1",
        name_en: "Luxury Silk Abaya",
        name_ar: "عباية حرير فاخرة",
        image_url: null,
      },
      variant: {
        id: "var-1",
        sku: "ABAYA-SILK-54",
        size: "54",
        size_unit: null,
        color: null,
        fabric: null,
        option_four: null,
        option_five: null,
        stock_main: 12,
      },
    },
  ],
};

async function mockAdmin(page: Page, returnRequests: string[]) {
  await page.addInitScript(() => {
    const session = {
      access_token: "mock-access-token",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "mock-refresh-token",
      user: {
        id: "test-user-id",
        email: "majeed@hotmail.it",
        role: "authenticated",
        aud: "authenticated",
      },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    try {
      window.localStorage.setItem("sb-ikciahnuqhemvnyfvbyp-auth-token", JSON.stringify(session));
      // A user who chose "Keep me logged in". Without it the root layout
      // treats this fresh browser as a closed session and signs out at a
      // random point of the load (src/lib/session-persistence.ts), which made
      // this test flaky.
      window.localStorage.setItem("boutq.auth.rememberMe", "1");
    } catch {
      /* ignore storage error */
    }
  });

  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const isSingle = (accept: string | undefined) => (accept ?? "").includes("vnd.pgrst.object");

  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill(
      json({
        id: "test-user-id",
        email: "majeed@hotmail.it",
        role: "authenticated",
        aud: "authenticated",
        user_metadata: {},
        app_metadata: {},
      }),
    ),
  );
  await page.route("**/rest/v1/profiles?**", (route) =>
    route.fulfill(
      json([
        {
          id: "test-user-id",
          email: "majeed@hotmail.it",
          status: "active",
          role: "super_admin",
          brand_id: "test-brand",
          permissions: [],
          must_change_password: false,
        },
      ]),
    ),
  );
  await page.route("**/rest/v1/brands?**", (route) =>
    route.fulfill(
      json([
        {
          id: "test-brand",
          slug: "test-brand",
          name_en: "Boutq Boutique",
          name_ar: "بوتيك بوتيك",
          is_active: true,
        },
      ]),
    ),
  );
  await page.route("**/rest/v1/business_settings?**", (route) =>
    route.fulfill(
      json({ brand_id: "test-brand", business_name: "Boutq Boutique", currency: "BHD" }),
    ),
  );
  await page.route("**/rest/v1/return_requests?**", (route) => {
    returnRequests.push(decodeURIComponent(route.request().url()));
    const single = isSingle(route.request().headers()["accept"]);
    return route.fulfill(json(single ? mockReturn : [mockReturn]));
  });
  // Everything else the admin shell reads answers with nothing.
  for (const table of [
    "activity_logs",
    "brand_addons",
    "inventory_branches",
    "notifications",
    "orders",
    "customers",
    "products",
    "product_variants",
  ]) {
    await page.route(`**/rest/v1/${table}?**`, (route) =>
      route.fulfill(json(isSingle(route.request().headers()["accept"]) ? null : [])),
    );
  }
}

test("a return's detail page loads, selecting only variant columns that exist", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const returnRequests: string[] = [];
  await mockAdmin(page, returnRequests);

  await page.goto(`/admin/b/test-brand/returns/${RETURN_ID}`);
  await expect(page.getByText("RET-2026-0001").first()).toBeVisible({ timeout: 45_000 });

  const detailRequest = returnRequests.find((url) => url.includes(`id=eq.${RETURN_ID}`));
  expect(detailRequest, "the detail page requests its return").toBeTruthy();
  expect(detailRequest).toContain("stock_main");
  expect(detailRequest).not.toContain("variant_name");
  expect(detailRequest).not.toContain("stock_quantity");

  // The variant is labelled by its option values (size 54), not a missing name column.
  await expect(page.getByText("54").first()).toBeVisible();
});
