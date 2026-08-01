import React, { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pin, Plus, Package, ShoppingBag, Download, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getPinnedActions,
  togglePinnedAction,
  type PinnedAction,
} from "@/lib/os-productivity";

interface OsPinnedActionsProps {
  lang: "ar" | "en";
  activeSlug: string | null;
  className?: string;
}

export function OsPinnedActions({ lang, activeSlug, className }: OsPinnedActionsProps) {
  const isAr = lang === "ar";
  const [pinned, setPinned] = useState<PinnedAction[]>([]);

  useEffect(() => {
    setPinned(getPinnedActions());
  }, []);

  const defaultQuickActions: PinnedAction[] = [
    {
      id: "new_order",
      titleEn: "+ New Order",
      titleAr: "+ طلب جديد",
      route: `/admin/b/${activeSlug || "default"}/orders`,
    },
    {
      id: "new_product",
      titleEn: "+ Add Product",
      titleAr: "+ إضافة منتج",
      route: `/admin/b/${activeSlug || "default"}/inventory`,
    },
    {
      id: "export_sales",
      titleEn: "Export Sales",
      titleAr: "تصدير المبيعات",
      route: `/admin/b/${activeSlug || "default"}/reports/export`,
    },
  ];

  const actionsToRender = pinned.length > 0 ? pinned : defaultQuickActions;

  if (!activeSlug) return null;

  return (
    <div className={cn("hidden sm:flex items-center gap-1.5 shrink-0 select-none", className)}>
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
        {actionsToRender.map((action) => (
          <Link
            key={action.id}
            to={action.route as any}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-2xs whitespace-nowrap"
          >
            <Pin className="h-3 w-3 text-primary/70 shrink-0" />
            <span>{isAr ? action.titleAr : action.titleEn}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
