import { test, expect, type Page } from "@playwright/test";
import {
  auditOverlays,
  blockAppWrites,
  describeCutOff,
  findCutOffContent,
} from "./helpers/overflow";
import { BRAND, signInWithStressData } from "./helpers/admin-stress";

/**
 * Nothing on an admin page may be cut off at the side of a phone screen.
 *
 * Every admin screen of a store is opened in Arabic and in English at 320px and 390px, signed in
 * with a faked session and with every Supabase call answered in the browser. The data is made to
 * push on the layout: long names, a long email, notes with a word that cannot wrap.
 */

const WIDTHS = [320, 390];

const SCREENS = [
  "dashboard",
  "orders",
  "orders/order-1",
  "customers",
  "customers/cust-1",
  "inventory",
  "categories",
  "campaigns",
  "discounts",
  "expenses",
  "communications",
  "pages",
  "team",
  "integrations",
  "settings",
  "reports",
  "reports/sales",
  "reports/products",
  "reports/customers",
  "reports/export",
  "reports/advance",
  "abandoned-carts",
  "addons",
  "bookings",
  "content-studio",
  "export",
  "giveaways",
  "import",
  "incubators",
  "loyalty",
  "returns",
  "reviews",
  "size-guides",
  // The platform's own screens (super admin).
  "/admin",
  "/admin/brands",
  "/admin/super/grants",
  "/admin/super/health",
  "/admin/super/requests",
  "/admin/super/settings",
];

/** A store screen by its name, or a platform screen by its path. */
const screenPath = (screen: string) =>
  screen.startsWith("/") ? screen : `/admin/b/${BRAND}/${screen}`;

/** The screen has its heading and its data: every Supabase call is answered at once here. */
async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator("main h1")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

// Long (it presses every button of every screen), so it runs on demand: npm run audit:overflow
test.skip(!process.env.OVERFLOW_AUDIT, "On demand: npm run audit:overflow");

for (const lang of ["ar", "en"] as const) {
  test(`no admin screen cuts content off at the side of a phone (${lang})`, async ({ page }) => {
    test.setTimeout(1_500_000);
    await signInWithStressData(page, lang);
    await blockAppWrites(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const requested = process.env.AUDIT_SCREENS?.split(",").map((screen) => screen.trim());
    const screens = requested?.length ? SCREENS.filter((s) => requested.includes(s)) : SCREENS;

    const problems: string[] = [];
    for (const screen of screens) {
      await page.goto(screenPath(screen));
      await settle(page);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(250);
        const cut = await findCutOffContent(page);
        if (cut.length > 0)
          problems.push(`${screen} (${lang}, ${width}px)\n${describeCutOff(cut)}`);
      }
      // Dialogs, drawers and menus, on the narrowest phone.
      await page.setViewportSize({ width: 320, height: 844 });
      problems.push(...(await auditOverlays(page, `${screen} (${lang}, 320px)`)));
    }

    expect(problems, `Content cut off at the side of the screen:\n${problems.join("\n")}`).toEqual(
      [],
    );
  });
}
