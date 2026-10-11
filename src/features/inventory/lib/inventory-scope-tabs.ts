import { AlertTriangle, Boxes, Check, Package, Scissors, Search, TrendingUp } from "lucide-react";
import type { InventoryScopeTab } from "@/components/inventory/InventoryScopeSwitcher";

/** Tabs that only mean something when the store counts stock. */
const STOCK_TABS = new Set(["attention", "low", "out"]);

/**
 * The inventory scope tabs, in display order, with their product counts.
 * A store that does not count stock (a services store) gets no stock tabs.
 */
export function inventoryScopeTabs(
  counts: {
    all: number;
    attention: number;
    active: number;
    inactive: number;
    low: number;
    out: number;
    featured: number;
    /** Products made when they are ordered; the tab is left out when the store has none. */
    madeToOrder?: number;
  },
  {
    tracksStock = true,
    madeToOrderLabel,
  }: { tracksStock?: boolean; madeToOrderLabel?: { ar: string; en: string } } = {},
): InventoryScopeTab[] {
  const tabs: InventoryScopeTab[] = [
    {
      id: "all",
      label_en: "All Products",
      label_ar: "جميع المنتجات",
      count: counts.all,
      icon: Package,
    },
    {
      id: "attention",
      label_en: "Needs Attention",
      label_ar: "يتطلب الانتباه",
      count: counts.attention,
      icon: AlertTriangle,
    },
    {
      id: "active",
      label_en: "Active in Store",
      label_ar: "نشط بالمتجر",
      count: counts.active,
      icon: Check,
    },
    {
      id: "inactive",
      label_en: "Hidden / Drafts",
      label_ar: "مخفي ومسودات",
      count: counts.inactive,
      icon: Search,
    },
    {
      id: "low",
      label_en: "Low Stock",
      label_ar: "مخزون منخفض",
      count: counts.low,
      icon: AlertTriangle,
    },
    {
      id: "out",
      label_en: "Out of Stock",
      label_ar: "نفد المخزون",
      count: counts.out,
      icon: Boxes,
    },
    {
      id: "featured",
      label_en: "Featured",
      label_ar: "المنتجات المميزة",
      count: counts.featured,
      icon: TrendingUp,
    },
  ];
  if ((counts.madeToOrder ?? 0) > 0) {
    tabs.splice(tabs.length - 1, 0, {
      id: "made_to_order",
      label_en: madeToOrderLabel?.en || "Made to Order",
      label_ar: madeToOrderLabel?.ar || "حسب الطلب",
      count: counts.madeToOrder ?? 0,
      icon: Scissors,
    });
  }
  return tracksStock ? tabs : tabs.filter((tab) => !STOCK_TABS.has(tab.id));
}
