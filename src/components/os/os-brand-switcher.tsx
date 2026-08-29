import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Activity, Crown, Store, Clock as ClockIcon, Settings } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { startImpersonationSession } from "@/lib/impersonation.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface BrandRow {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string | null;
  is_active: boolean;
}

export interface OsBrandSwitcherProps {
  activeSlug: string | null;
  brands: BrandRow[];
  lang: "en" | "ar";
  pathname: string;
  collapsed?: boolean;
}

export function OsBrandSwitcher({
  activeSlug,
  brands,
  lang,
  pathname,
  collapsed = false,
}: OsBrandSwitcherProps) {
  const [switching, setSwitching] = React.useState(false);

  const handleBrandChange = async (targetSlug: string) => {
    if (targetSlug === activeSlug) return;
    const targetBrand = brands.find((b) => b.slug === targetSlug);
    if (!targetBrand) return;

    setSwitching(true);
    const toastId = toast.loading(
      lang === "ar" ? "جاري تفعيل جلسة محاكاة المتجر..." : "Initializing impersonation session...",
    );
    try {
      const res = await startImpersonationSession({ data: { targetTenantId: targetBrand.id } });
      if (res && "token" in res && res.token) {
        document.cookie = `boutq_impersonation_token=${res.token}; path=/; max-age=${60 * 60 * 24}; samesite=lax${window.location.protocol === "https:" ? "; secure" : ""}`;
      }
      toast.success(
        lang === "ar"
          ? "تم تحويل جلسة المحاكاة بنجاح"
          : "Impersonation session updated successfully",
        { id: toastId },
      );
      window.location.href = `/admin/b/${targetSlug}/dashboard`;
    } catch (err: any) {
      console.error(err);
      toast.error(
        lang === "ar"
          ? "تعذر تبديل المتجر. يرجى التحقق من صلاحية الوصول."
          : "Unable to switch store. Please verify access permissions.",
        { id: toastId },
      );
      setSwitching(false);
    }
  };

  if (collapsed) {
    return (
      <div className="p-2 border-b border-[var(--os-border)] flex justify-center">
        <div
          title={lang === "ar" ? "المدير الأعلى" : "Super Admin"}
          className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30"
        >
          <Crown className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-[var(--os-border)] space-y-2 bg-muted/20 backdrop-blur-xs rounded-xl mx-2 my-1">
      <div className="flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <Crown className="h-3.5 w-3.5 text-amber-500" />
        {lang === "ar" ? "المدير الأعلى" : "Super Admin"}
      </div>

      {activeSlug && (
        <Select value={activeSlug} disabled={switching} onValueChange={handleBrandChange}>
          <SelectTrigger className="h-8 text-xs bg-background/80">
            <SelectValue placeholder={lang === "ar" ? "اختر علامة" : "Select a brand"} />
          </SelectTrigger>
          <SelectContent>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.slug}>
                {(lang === "ar" ? b.name_ar : b.name_en) || b.name_en || b.slug}
                {!b.is_active ? " (inactive)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="grid grid-cols-1 gap-1 pt-1">
        <Link
          to="/admin/brands"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/brands"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Store className="h-3.5 w-3.5" />
          {lang === "ar" ? "إدارة العلامات" : "Manage brands"}
        </Link>
        <Link
          to="/admin/super/requests"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/super/requests"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <ClockIcon className="h-3.5 w-3.5" />
          {lang === "ar" ? "طلبات التسجيل" : "Tenant Requests"}
        </Link>
        <Link
          to="/admin/super/health"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/super/health"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          {lang === "ar" ? "صحة النظام" : "System health"}
        </Link>
        <Link
          to="/admin/super/settings"
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            pathname === "/admin/super/settings"
              ? "bg-primary text-primary-foreground font-semibold shadow-xs"
              : "hover:bg-muted/80 text-muted-foreground hover:text-foreground",
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          {lang === "ar" ? "إعدادات المنصة" : "Platform Settings"}
        </Link>
      </div>
    </div>
  );
}
