import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SUPER_ADMIN_EMAIL } from "@/lib/profile-context";
import { Crown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuperGrantsManager } from "@/components/super/SuperGrantsManager";
import { Link } from "@tanstack/react-router";
import { fetchCallerProfile } from "@/lib/data/profiles";

export const Route = createFileRoute("/_authenticated/admin/super/grants")({
  beforeLoad: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw redirect({ to: "/auth" });

    const email = (user.email || "").toLowerCase();
    const profile = await fetchCallerProfile(user.id);

    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || profile?.role === "super_admin";
    if (!isSuperAdmin) throw redirect({ to: "/admin" });
  },
  component: SuperAdminGrantsPage,
});

function SuperAdminGrantsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      {/* Platform Header */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card p-4 sm:p-6 shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-primary/5 pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
              <Crown className="size-3.5" />
              <span>BOUTQ OS • إدارة مبادرات المتاجر</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              استبيانات منحة الـ 6 شهور (برنامج انطلاقة) 🚀
            </h1>
            <p className="text-xs text-muted-foreground max-w-xl">
              مراجعة وفرز طلبات أصحاب المشاريع المتقدمين من إعلان الإنستغرام، تصفية الحسابات
              الجاهزة، والتواصل المباشر معهم عبر الواتساب.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-bold">
              <Link to="/admin/super/requests">
                <span>طلبات المنصة العامة</span>
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="h-9 gap-1.5 text-xs font-bold bg-primary text-primary-foreground"
            >
              <a href="/grant" target="_blank" rel="noreferrer">
                <span>معاينة الاستبيان العام</span>
              </a>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Grants Manager */}
      <SuperGrantsManager />
    </div>
  );
}
