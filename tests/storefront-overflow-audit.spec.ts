import { test, expect, type Page } from "@playwright/test";
import { ANON_KEY, SUPABASE_URL, guardWrites } from "./helpers/storefront-e2e";
import {
  auditOverlays,
  blockAppWrites,
  describeCutOff,
  findCutOffContent,
} from "./helpers/overflow";

/**
 * Nothing on a storefront page may be cut off at the side of a phone screen.
 *
 * Every storefront page is opened in Arabic and in English at the narrowest phone still in use
 * (320px) and at a common one (390px), with a cart that stresses the layout: a very long product
 * name, a note with a word that cannot wrap, and a row of measurements. Reads the live store like
 * the other storefront specs; every write is answered in the browser.
 *
 * Other stores can be audited locally: OVERFLOW_AUDIT_SLUGS=zh,pura,aurora npx playwright test
 * tests/storefront-overflow-audit.spec.ts
 */

const SLUGS = (process.env.OVERFLOW_AUDIT_SLUGS ?? "pura")
  .split(",")
  .map((slug) => slug.trim())
  .filter(Boolean);
const WIDTHS = [320, 390];
const LANGS = ["ar", "en"] as const;
const FIXED_PAGES = new Set([
  "account",
  "auth",
  "auth-confirmed",
  "book",
  "checkout",
  "custom-order",
  "page",
  "product",
  "search",
  "size-guide",
  "thank-you",
  "wishlist",
]);

const UNBREAKABLE = "x".repeat(90);

type LiveItem = { variant_id: string; product_id: string; image: string | null; price: number };

/** One real product of the store, so the cart's line is a line the store could sell. */
async function liveItem(slug: string): Promise<LiveItem | null> {
  const headers = { apikey: ANON_KEY!, Authorization: `Bearer ${ANON_KEY}` };
  const brandRes = await fetch(`${SUPABASE_URL}/rest/v1/brands?slug=eq.${slug}&select=id`, {
    headers,
  });
  const [brand] = (await brandRes.json()) as Array<{ id: string }>;
  if (!brand) return null;
  const query = new URLSearchParams({
    select: "id,image_url,product_variants(id,selling_price)",
    brand_id: `eq.${brand.id}`,
    is_active: "eq.true",
    limit: "20",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, { headers });
  const products = (await res.json()) as Array<{
    id: string;
    image_url: string | null;
    product_variants: Array<{ id: string; selling_price: number }>;
  }>;
  const product = products.find((p) => p.product_variants.length > 0);
  if (!product) return null;
  return {
    variant_id: product.product_variants[0].id,
    product_id: product.id,
    image: product.image_url,
    price: Number(product.product_variants[0].selling_price),
  };
}

/** A cart line that pushes on every width: long name, long values, a word that cannot wrap. */
function stressCart(item: LiveItem) {
  const longAr =
    "عباية فاخرة بتطريز يدوي دقيق وقماش كريب ملكي مع أكمام واسعة وحزام مخملي طويل جداً";
  const longEn =
    "Luxury hand-embroidered royal crepe abaya with wide sleeves and a very long velvet belt";
  return [
    {
      cart_line_id: "overflow-audit-1",
      variant_id: item.variant_id,
      product_id: item.product_id,
      name: longEn,
      name_ar: longAr,
      name_en: longEn,
      image: item.image,
      price: item.price,
      size: "Extra Extra Large Tall",
      color: "Midnight Blue With Gold Thread",
      fabric: "Royal Crepe",
      qty: 2,
      max_stock: 99,
      tailored: true,
      custom_fields: [
        { key: "length", label_ar: "الطول", label_en: "Length", value: "56 in", type: "text" },
        { key: "bust", label_ar: "محيط الصدر", label_en: "Bust", value: "40 in", type: "text" },
        {
          key: "tailoring_notes",
          label_ar: "ملاحظات",
          label_en: "Notes",
          value: `${longAr} ${UNBREAKABLE}`,
          type: "text",
        },
        {
          key: "reference",
          label_ar: "رابط",
          label_en: "Link",
          value: `https://example.com/${UNBREAKABLE}`,
          type: "text",
        },
      ],
    },
  ];
}

/** Where the home page links to: its first product and its first category. */
async function linkedPages(page: Page, slug: string) {
  return page.evaluate(
    ({ slug, fixed }) => {
      const paths = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map(
        (a) => new URL(a.href, window.location.origin).pathname,
      );
      const product = paths.find((p) => p.startsWith(`/${slug}/product/`)) ?? null;
      const category =
        paths.find((p) => {
          const parts = p.split("/").filter(Boolean);
          return parts.length === 2 && parts[0] === slug && !fixed.includes(parts[1]);
        }) ?? null;
      return { product, category };
    },
    { slug, fixed: Array.from(FIXED_PAGES) },
  );
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

for (const slug of SLUGS) {
  test.describe(`Storefront overflow audit: ${slug}`, () => {
    // Long (it presses every button of every page), so it runs on demand: npm run audit:overflow
    test.skip(!process.env.OVERFLOW_AUDIT, "On demand: npm run audit:overflow");
    test.skip(!SUPABASE_URL || !ANON_KEY, "Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

    test("no page cuts content off at the side of a phone", async ({ page }) => {
      test.setTimeout(1_200_000);
      const item = await liveItem(slug);
      test.skip(!item, `The store "${slug}" has no product to put in a cart`);

      await guardWrites(page);
      await blockAppWrites(page);
      await page.addInitScript(
        ({ slug, cart }) => {
          window.localStorage.setItem(`storefront-cart:${slug}`, JSON.stringify(cart));
        },
        { slug, cart: stressCart(item!) },
      );

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/${slug}?lang=ar`);
      await settle(page);
      const linked = await linkedPages(page, slug);

      const paths = [
        `/${slug}`,
        linked.category,
        linked.product,
        `/${slug}/checkout`,
        `/${slug}/search?q=a`,
        `/${slug}/wishlist`,
        `/${slug}/auth`,
        `/${slug}/size-guide`,
        `/${slug}/custom-order`,
        `/${slug}/book`,
        `/${slug}/page/0`,
      ].filter((path): path is string => Boolean(path));

      const problems: string[] = [];
      for (const path of paths) {
        for (const lang of LANGS) {
          await page.goto(`${path}${path.includes("?") ? "&" : "?"}lang=${lang}`);
          await settle(page);
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 844 });
            await page.waitForTimeout(250);
            const cut = await findCutOffContent(page);
            if (cut.length > 0) {
              problems.push(`${path} (${lang}, ${width}px)\n${describeCutOff(cut)}`);
            }
          }
          // The cart drawer, the menu, search, filters and pickers, on the narrowest phone.
          await page.setViewportSize({ width: 320, height: 844 });
          problems.push(...(await auditOverlays(page, `${path} (${lang}, 320px)`)));
        }
      }

      expect(
        problems,
        `Content cut off at the side of the screen:\n${problems.join("\n")}`,
      ).toEqual([]);
    });
  });
}
