import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Package,
  ReceiptText,
  BadgePercent,
  Megaphone,
  Wallet,
  Users,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface OsQuickActionsProps {
  slug: string | null;
  lang: "en" | "ar";
  className?: string;
}

export function OsQuickActions({ slug, lang, className }: OsQuickActionsProps) {
  const navigate = useNavigate();
  const isAr = lang === "ar";

  if (!slug) return null;

  const actions = [
    {
      id: "product",
      label: isAr ? "إضافة منتج جديد" : "New Product",
      description: isAr ? "إدراج صنف ومخزون جديد" : "Add item & inventory",
      icon: Package,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/inventory",
          params: { slug },
          search: { action: "new" } as any,
        }),
    },
    {
      id: "order",
      label: isAr ? "إنشاء طلب يدوي" : "Create Manual Order",
      description: isAr ? "تسجيل طلبية وفاتورة مباشرة" : "Direct order & invoice",
      icon: ReceiptText,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/orders",
          params: { slug },
          search: { action: "new_manual" } as any,
        }),
    },
    {
      id: "discount",
      label: isAr ? "إنشاء كود خصم" : "Create Discount Code",
      description: isAr ? "كوبون تخفيض أو عرض ترويجي" : "Coupon or promotion",
      icon: BadgePercent,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/discounts",
          params: { slug },
          search: { action: "new" } as any,
        }),
    },
    {
      id: "customer",
      label: isAr ? "تسجيل عميل جديد" : "Add Customer",
      description: isAr ? "حفظ بيانات عميل جديد" : "Save client contact info",
      icon: Users,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/customers",
          params: { slug },
          search: { action: "new" } as any,
        }),
    },
    {
      id: "campaign",
      label: isAr ? "إرسال رسالة واتساب" : "WhatsApp Broadcast",
      description: isAr ? "حملة تسويقية أو تنبيه" : "Marketing message or alert",
      icon: Megaphone,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/campaigns",
          params: { slug },
          search: { segment: "All" },
        }),
    },
    {
      id: "expense",
      label: isAr ? "تسجيل مصروف جديد" : "Record Expense",
      description: isAr ? "إثبات قيد مالي أو نفقة" : "Log operating cost",
      icon: Wallet,
      onClick: () =>
        navigate({
          to: "/admin/b/$slug/expenses",
          params: { slug },
          search: { action: "new" } as any,
        }),
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size="sm"
          className={cn(
            "h-7.5 px-2.5 gap-1.5 text-xs font-bold rounded-lg shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all select-none",
            className,
          )}
          aria-label={isAr ? "إجراء سريع جديد" : "New Quick Action"}
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          <span>{isAr ? "جديد" : "New"}</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={isAr ? "start" : "end"}
        sideOffset={6}
        className="w-64 p-1.5 rounded-xl border border-[var(--os-border)] os-glass shadow-xl select-none z-50 animate-in fade-in zoom-in-95 duration-150"
      >
        <DropdownMenuLabel className="px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          {isAr ? "⚡ إجراءات سريعة فورية" : "⚡ Global Quick Actions"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-border/60" />

        <DropdownMenuGroup className="space-y-0.5">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <DropdownMenuItem
                key={act.id}
                onClick={act.onClick}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-primary/10 focus:bg-primary/10 transition-colors group"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-colors shrink-0 shadow-2xs">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-foreground leading-tight">
                    {act.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
                    {act.description}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
