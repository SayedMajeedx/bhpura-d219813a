import { test, expect } from "@playwright/test";

// Mock database states for Playwright audits
const mockProducts = [
  {
    id: "prod-1",
    brand_id: "test-brand",
    name_en: "Original Mock Product",
    name_ar: "المنتج الأصلي",
    base_price: 15.0,
    is_visible: true,
    image_url: null,
    created_at: "2026-07-20T12:00:00Z",
  },
];

const mockVariants = [
  {
    id: "var-1",
    product_id: "prod-1",
    brand_id: "test-brand",
    sku: "SKU-ORIGINAL",
    size: "54",
    color: "Red",
    fabric: "Silk",
    selling_price: 15.0,
    stock_main: 10,
    created_at: "2026-07-20T12:00:00Z",
  },
];

const mockOrders = [
  {
    id: "order-1",
    brand_id: "test-brand",
    invoice_number: "1001",
    status: "pending",
    payment_status: "unpaid",
    payment_method: "benefit_pay",
    total: 15.0,
    total_amount: 15.0,
    currency: "BHD",
    created_at: "2026-07-22T12:00:00Z",
    customer_id: "cust-1",
    customer_name_snapshot: "John Doe",
    customer_email_snapshot: "john@example.com",
    customer_phone_snapshot: "97312345678",
    customers: {
      name: "John Doe",
    },
    profiles: {
      full_name: "John Doe",
      phone: "97312345678",
    },
    order_items: [
      {
        id: "item-1",
        quantity: 1,
        unit_price: 15.0,
        price: 15.0,
        line_total: 15.0,
        variant_id: "var-1",
        name_en: "Original Mock Product",
        description: "Dress - PR3 - المقاس: 52 - اللون: Black",
      },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // Mock authentication and brand session
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
    } catch {}
  });

  // Mock Supabase Auth
  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-user-id",
        email: "majeed@hotmail.it",
        role: "authenticated",
        aud: "authenticated",
      }),
    });
  });

  await page.route("**/auth/v1/logout**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  // Mock REST requests
  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    const accept = route.request().headers()["accept"] || "";
    const isSingle = accept.includes("vnd.pgrst.object");

    if (url.includes("/brands")) {
      const brandObj = {
        id: "test-brand",
        slug: "test-brand",
        name_en: "Boutq Test Store",
        name_ar: "متجر بوك التجريبي",
        is_active: true,
        support_access_enabled: true,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isSingle ? brandObj : [brandObj]),
      });
      return;
    }

    if (url.includes("/profiles")) {
      const profileObj = {
        id: "test-user-id",
        status: "active",
        role: "super_admin",
        brand_id: "test-brand",
        email: "majeed@hotmail.it",
        created_at: "2026-07-20T12:00:00Z",
        updated_at: "2026-07-20T12:00:00Z",
        brand: {
          id: "test-brand",
          slug: "test-brand",
          name_en: "Boutq Test Store",
          name_ar: "متجر بوك التجريبي",
          logo_url: null,
          is_active: true,
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isSingle ? profileObj : [profileObj]),
      });
      return;
    }

    if (url.includes("/business_settings")) {
      const settingsObj = {
        id: "setting-1",
        brand_id: "test-brand",
        business_name: "Boutq Test Store",
        currency: "BHD",
        card_processing_fee: 2.5,
        benefit_processing_fee: 1.0,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isSingle ? settingsObj : [settingsObj]),
      });
      return;
    }

    if (url.includes("/orders")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/1" },
        body: JSON.stringify(mockOrders),
      });
      return;
    }

    if (url.includes("/products")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockProducts),
      });
      return;
    }

    if (url.includes("/product_variants")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockVariants),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
});

test("Comprehensive Mobile UX Audit at 390x844 Viewport", async ({ page }) => {
  const auditResults: Record<string, any> = {
    viewportAndLayout: {},
    navigationAndDrawer: {},
    tapTargets: [],
    pageAudits: {},
  };

  page.on("console", (msg) => console.log("BROWSER LOG:", msg.type(), msg.text()));
  page.on("requestfailed", (req) => console.log("FAILED REQ:", req.url(), req.failure()?.errorText));
  page.on("response", (res) => {
    if (res.status() >= 400) console.log("ERROR RESP:", res.status(), res.url());
  });

  // Navigate to Dashboard
  await page.goto("/admin/b/test-brand/dashboard");
  await page.waitForLoadState("networkidle");

  console.log("NAVIGATED URL:", page.url());
  console.log("PAGE BODY TEXT:", await page.innerText("body"));

  // 1. Audit Header & Viewport Layout
  const viewportSize = page.viewportSize();
  console.log("=== STARTING MOBILE UX AUDIT ===");
  console.log("Viewport Size:", viewportSize);

  // Check horizontal body overflow
  const bodyOverflow = await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body.scrollWidth;
    const bodyOverflowStyle = window.getComputedStyle(document.body).overflow;
    const htmlOverflowStyle = window.getComputedStyle(document.documentElement).overflow;
    return {
      docWidth,
      scrollWidth,
      bodyScrollWidth,
      hasHorizontalScroll: scrollWidth > docWidth || bodyScrollWidth > docWidth,
      bodyOverflowStyle,
      htmlOverflowStyle,
    };
  });
  auditResults.viewportAndLayout.bodyOverflow = bodyOverflow;

  // Measure Top Mobile Header
  const topHeader = page.locator(".no-print.fixed.top-0").first();
  await expect(topHeader).toBeVisible();
  const headerBoundingBox = await topHeader.boundingBox();
  auditResults.viewportAndLayout.headerBoundingBox = headerBoundingBox;

  // Measure Header Tap Targets
  const headerButtons = topHeader.locator("button");
  const headerButtonCount = await headerButtons.count();
  for (let i = 0; i < headerButtonCount; i++) {
    const btn = headerButtons.nth(i);
    const box = await btn.boundingBox();
    const ariaLabel = (await btn.getAttribute("aria-label")) || (await btn.innerText()) || `HeaderBtn-${i}`;
    if (box) {
      const isViolating = box.width < 44 || box.height < 44;
      auditResults.tapTargets.push({
        location: "Mobile Header Top Bar",
        label: ariaLabel.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        violates: isViolating,
      });
    }
  }

  // 2. Test Mobile Hamburger Drawer Navigation
  const menuButton = page.locator("button[aria-label='القائمة الرئيسية']").first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await page.waitForTimeout(300);

  const drawerSheet = page.locator("div[role='dialog']").first();
  await expect(drawerSheet).toBeVisible();

  // Test drawer close via Backdrop click at { x: 20, y: 100 } (exposed backdrop on left in RTL)
  await page.mouse.click(20, 100);
  await page.waitForTimeout(300);
  await expect(drawerSheet).not.toBeVisible();

  // Re-open drawer for route navigation check
  await menuButton.click();
  await page.waitForTimeout(300);

  // Measure Drawer Link Tap Targets
  const drawerLinks = drawerSheet.locator("a");
  const drawerLinkCount = await drawerLinks.count();
  for (let i = 0; i < drawerLinkCount; i++) {
    const link = drawerLinks.nth(i);
    const box = await link.boundingBox();
    const label = await link.innerText();
    if (box) {
      const isViolating = box.height < 44;
      auditResults.tapTargets.push({
        location: "Mobile Navigation Drawer Link",
        label: label.trim(),
        width: Math.round(box.width),
        height: Math.round(box.height),
        violates: isViolating,
      });
    }
  }

  // Close drawer before page iterations
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  // 3. Test Mobile Navigation across pages
  const routesToTest = [
    { name: "Dashboard", path: "/admin/b/test-brand/dashboard" },
    { name: "Orders", path: "/admin/b/test-brand/orders" },
    { name: "Inventory", path: "/admin/b/test-brand/products" },
    { name: "Settings", path: "/admin/b/test-brand/settings" },
    { name: "Reports", path: "/admin/b/test-brand/reports" },
  ];

  for (const route of routesToTest) {
    const pageConsoleErrors: string[] = [];
    const pageUncaughtExceptions: Error[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") pageConsoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      pageUncaughtExceptions.push(err);
    });

    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    // Check table horizontal scrollability if tables exist
    const tables = page.locator("table");
    const tableCount = await tables.count();
    let tableAudit = null;

    if (tableCount > 0) {
      tableAudit = await page.evaluate(() => {
        const table = document.querySelector("table");
        if (!table) return null;
        const container = table.closest("div") || table.parentElement;
        const tableWidth = table.scrollWidth;
        const containerWidth = container ? container.clientWidth : 0;
        return {
          tableWidth,
          containerWidth,
          isScrollable: container ? container.scrollWidth > container.clientWidth : false,
        };
      });
    }

    auditResults.pageAudits[route.name] = {
      path: route.path,
      consoleErrors: pageConsoleErrors,
      uncaughtExceptions: pageUncaughtExceptions,
      hasTables: tableCount > 0,
      tableAudit,
    };
  }

  console.log("=== MOBILE UX AUDIT COMPLETE ===");
  console.log(JSON.stringify(auditResults, null, 2));

  // Assert zero uncaught exceptions across mobile navigation
  Object.values(auditResults.pageAudits).forEach((pAudit: any) => {
    expect(pAudit.uncaughtExceptions).toEqual([]);
  });
});
