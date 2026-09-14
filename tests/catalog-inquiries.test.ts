import { describe, it, expect } from "vitest";
import { type CatalogInquirySummary } from "../src/lib/reporting.functions";
import {
  isCatalogMode,
  renderInquiryMessage,
  normalizeWhatsAppDigits,
} from "../src/lib/storefront-mode";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Catalog Inquiries — Database Migration Contract", () => {
  const migrationPath = resolve(
    __dirname,
    "../supabase/migrations/20260913120000_catalog_inquiry_tracking.sql",
  );
  const sql = readFileSync(migrationPath, "utf-8");

  it("adds inquiry_count column to product_engagement_daily", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS inquiry_count bigint NOT NULL DEFAULT 0;");
  });

  it("updates record_storefront_product_engagement to support inquiry event", () => {
    expect(sql).toContain("p_event NOT IN ('view', 'click', 'inquiry')");
    expect(sql).toContain(
      "inquiry_count = product_engagement_daily.inquiry_count + CASE WHEN p_event = 'inquiry' THEN 1 ELSE 0 END;",
    );
  });

  it("updates get_storefront_trending to weight inquiries heavily (5x)", () => {
    expect(sql).toContain("e.inquiry_count * 5");
  });
});

describe("Catalog Inquiries — Analytics Aggregation Logic", () => {
  // Pure aggregation function matching fetchCatalogInquiriesReporting behavior
  function aggregateInquiryRows(
    rows: Array<{
      product_id: string;
      inquiry_count: number;
      view_count: number;
      click_count: number;
      product: { name: string; name_ar?: string } | null;
    }>,
  ): CatalogInquirySummary {
    let totalInquiries = 0;
    let totalViews = 0;
    let totalClicks = 0;

    const productMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        inquiries: number;
        views: number;
        clicks: number;
      }
    >();

    for (const r of rows) {
      const inq = Number(r.inquiry_count || 0);
      // An inquiry implies a product view; views must be at least equal to inquiries
      const views = Math.max(Number(r.view_count || 0), inq);
      const clicks = Number(r.click_count || 0);

      totalInquiries += inq;
      totalViews += views;
      totalClicks += clicks;

      const pId = r.product_id;
      const existing = productMap.get(pId);
      const pName = r.product?.name || "Product";

      if (existing) {
        existing.inquiries += inq;
        existing.views += views;
        existing.clicks += clicks;
      } else {
        productMap.set(pId, {
          productId: pId,
          productName: pName,
          inquiries: inq,
          views: views,
          clicks: clicks,
        });
      }
    }

    const productInquiries = Array.from(productMap.values())
      .map((p) => {
        const effectiveProductViews = Math.max(p.views, p.inquiries);
        return {
          ...p,
          inquiryRate:
            effectiveProductViews > 0
              ? Math.min(100, (p.inquiries / effectiveProductViews) * 100)
              : 0,
        };
      })
      .sort((a, b) => b.inquiries - a.inquiries || b.views - a.views);

    const effectiveViews = Math.max(totalViews, totalInquiries);
    const overallRate =
      effectiveViews > 0 ? Math.min(100, (totalInquiries / effectiveViews) * 100) : 0;

    return {
      totalInquiries,
      totalViews,
      totalClicks,
      inquiryRate: Number(overallRate.toFixed(1)),
      productInquiries,
    };
  }

  it("calculates total inquiries, views, clicks, and rates accurately", () => {
    const mockRows = [
      {
        product_id: "prod-1",
        inquiry_count: 5,
        view_count: 100,
        click_count: 20,
        product: { name: "Silk Abaya" },
      },
      {
        product_id: "prod-2",
        inquiry_count: 15,
        view_count: 200,
        click_count: 50,
        product: { name: "Linen Kaftan" },
      },
      {
        product_id: "prod-1", // duplicate day entry
        inquiry_count: 3,
        view_count: 50,
        click_count: 10,
        product: { name: "Silk Abaya" },
      },
    ];

    const result = aggregateInquiryRows(mockRows);

    expect(result.totalInquiries).toBe(23); // 5 + 15 + 3
    expect(result.totalViews).toBe(350); // 100 + 200 + 50
    expect(result.totalClicks).toBe(80); // 20 + 50 + 10
    expect(result.inquiryRate).toBe(6.6); // (23 / 350) * 100 = 6.57% -> 6.6%

    expect(result.productInquiries).toHaveLength(2);
    // prod-2 has 15 inquiries, prod-1 has 8 inquiries -> prod-2 should be first
    expect(result.productInquiries[0].productId).toBe("prod-2");
    expect(result.productInquiries[0].inquiries).toBe(15);
    expect(result.productInquiries[0].views).toBe(200);
    expect(result.productInquiries[0].inquiryRate).toBe(7.5); // 15 / 200 * 100

    expect(result.productInquiries[1].productId).toBe("prod-1");
    expect(result.productInquiries[1].inquiries).toBe(8);
    expect(result.productInquiries[1].views).toBe(150);
  });

  it("safely handles empty datasets without division by zero errors", () => {
    const result = aggregateInquiryRows([]);
    expect(result.totalInquiries).toBe(0);
    expect(result.totalViews).toBe(0);
    expect(result.totalClicks).toBe(0);
    expect(result.inquiryRate).toBe(0);
    expect(result.productInquiries).toEqual([]);
  });

  it("guarantees views >= inquiries so conversion rate reflects true engagement without zero-view inconsistency", () => {
    const result = aggregateInquiryRows([
      {
        product_id: "prod-ghost",
        inquiry_count: 2,
        view_count: 0,
        click_count: 0,
        product: { name: "Ghost Item" },
      },
    ]);
    expect(result.totalInquiries).toBe(2);
    expect(result.totalViews).toBe(2);
    expect(result.inquiryRate).toBe(100);
    expect(result.productInquiries[0].views).toBe(2);
    expect(result.productInquiries[0].inquiryRate).toBe(100);
  });
});

describe("Catalog Inquiries — Dashboard KPI and Middle Grid Differentiation", () => {
  it("determines catalog mode correctly from business settings", () => {
    expect(isCatalogMode({ storefront_mode: "catalog" })).toBe(true);
    expect(isCatalogMode({ storefront_mode: "shop" })).toBe(false);
    expect(isCatalogMode({})).toBe(false);
    expect(isCatalogMode(undefined)).toBe(false);
  });

  it("generates WhatsApp inquiry messages with product information", () => {
    const message = renderInquiryMessage(
      "السلام عليكم، أود الاستفسار عن {product_name} بسعر {price}",
      {
        productName: "عباية مخملية",
        priceLabel: "45.000 BHD",
      },
    );

    expect(message).toBe("السلام عليكم، أود الاستفسار عن عباية مخملية بسعر 45.000 BHD");
  });

  it("normalizes WhatsApp phone digits correctly for international links", () => {
    expect(normalizeWhatsAppDigits("+973 33 123 456")).toBe("97333123456");
    expect(normalizeWhatsAppDigits("00966-50-123-4567")).toBe("966501234567");
    expect(normalizeWhatsAppDigits("39123456")).toBe("97339123456");
  });
});
