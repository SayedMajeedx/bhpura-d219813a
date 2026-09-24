import { AlertTriangle, Boxes, Check, Package, Search, TrendingUp } from "lucide-react";
import type { InventoryScopeTab } from "@/components/inventory/InventoryScopeSwitcher";

/** The inventory scope tabs, in display order, with their product counts. */
export function inventoryScopeTabs(counts: {
  all: number;
  attention: number;
  active: number;
  inactive: number;
  low: number;
  out: number;
  featured: number;
}): InventoryScopeTab[] {
  return [
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
}
