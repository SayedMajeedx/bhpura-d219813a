import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Crown,
  Search,
  Filter,
  Instagram,
  Phone,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  Clock,
  Gift,
  Trash2,
  ExternalLink,
  Shirt,
  UtensilsCrossed,
  Store,
  ChevronDown,
  Edit3,
  Calendar,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { normalizePhoneForWhatsApp } from "@/lib/courier-whatsapp";

export type GrantApplication = {
  id: string;
  business_name: string;
  instagram_handle: string;
  whatsapp_number: string;
  product_category: string;
  readiness_status: string;
  current_sales_channel: string;
  biggest_challenge: string | null;
  status: "pending" | "reviewed" | "shortlisted" | "selected" | "offered_3_months" | "rejected";
  offered_grant: "none" | "6_months_free" | "3_months_free";
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORY_MAP: Record<string, { label: string; icon: any }> = {
  fashion: { label: "أزياء وعبايات", icon: Shirt },
  perfumes_beauty: { label: "عطور وتجميل", icon: Sparkles },
  accessories_gifts: { label: "إكسسوارات وهدايا", icon: Gift },
  food_sweets: { label: "حلويات ومأكولات", icon: UtensilsCrossed },
  other: { label: "نشاط آخر", icon: Store },
};

const READINESS_MAP: Record<string, { label: string; color: string }> = {
  ready_with_photos: {
    label: "جاهز مع الصور ⚡",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  products_only: {
    label: "المنتجات فقط",
    color: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  idea_stage: { label: "فكرة قيد التجهيز", color: "bg-muted text-muted-foreground border-border" },
};

const CHANNEL_MAP: Record<string, string> = {
  whatsapp_dm: "واتساب وإنستغرام",
  existing_store: "متجر إلكتروني آخر",
  physical_store: "محل / معرض فعلي",
  not_started: "لم يبدأ البيع",
};

const STATUS_MAP: Record<GrantApplication["status"], { label: string; color: string }> = {
  pending: { label: "معلّق ⏳", color: "bg-muted text-muted-foreground border-border" },
  reviewed: {
    label: "تمت المراجعة 👁️",
    color: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  shortlisted: {
    label: "مرشح بالقائمة ⭐",
    color: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  },
  selected: {
    label: "فائز بـ 6 شهور 🏆",
    color: "bg-primary/20 text-primary border-primary/40 font-bold",
  },
  offered_3_months: {
    label: "عرض 3 شهور 🎁",
    color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  rejected: {
    label: "مستبعد ✖",
    color: "bg-destructive/15 text-destructive border-destructive/30",
  },
};

export function SuperGrantsManager() {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [readinessFilter, setReadinessFilter] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<GrantApplication | null>(null);
  const [detailsApp, setDetailsApp] = useState<GrantApplication | null>(null);
  const [notesDraft, setNotesDraft] = useState("");

  const {
    data: apps = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["super-grant-applications"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("merchant_grant_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as GrantApplication[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<GrantApplication> }) => {
      const { error } = await (supabase.from as any)("merchant_grant_applications")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-grant-applications"] });
      toast.success("تم تحديث الطلب بنجاح");
      setSelectedApp(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "فشل التحديث");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("merchant_grant_applications")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-grant-applications"] });
      toast.success("تم حذف الطلب");
      setSelectedApp(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "فشل الحذف");
    },
  });

  // Filtered Apps
  const filteredApps = apps.filter((app) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      app.business_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.instagram_handle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.whatsapp_number.includes(searchTerm);

    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    const matchesReadiness = readinessFilter === "all" || app.readiness_status === readinessFilter;

    return matchesSearch && matchesStatus && matchesReadiness;
  });

  // Stats
  const totalApps = apps.length;
  const readyCount = apps.filter((a) => a.readiness_status === "ready_with_photos").length;
  const selectedCount = apps.filter((a) => a.status === "selected").length;
  const offered3Count = apps.filter((a) => a.status === "offered_3_months").length;

  const handleOpenNotes = (app: GrantApplication) => {
    setSelectedApp(app);
    setNotesDraft(app.admin_notes || "");
  };

  const handleSaveNotes = () => {
    if (!selectedApp) return;
    updateMutation.mutate({
      id: selectedApp.id,
      updates: { admin_notes: notesDraft },
    });
  };

  const handleStatusChange = (app: GrantApplication, newStatus: GrantApplication["status"]) => {
    let grantType: GrantApplication["offered_grant"] = app.offered_grant;
    if (newStatus === "selected") grantType = "6_months_free";
    else if (newStatus === "offered_3_months") grantType = "3_months_free";

    updateMutation.mutate({
      id: app.id,
      updates: { status: newStatus, offered_grant: grantType },
    });
  };

  // WhatsApp Message Builders
  const getWhatsAppLink = (app: GrantApplication, type: "winner_6m" | "special_3m") => {
    const cleanPhone = normalizePhoneForWhatsApp(app.whatsapp_number);
    let message = "";
    if (type === "winner_6m") {
      message = `أهلاً ${app.business_name} 👋✨\nنبارك لكم اختيار مشروعكم رسمياً ضمن برنامج انطلاقة من منصة BOUTQ OS للحصول على اشتراك مجاني كامل لمدة 6 شهور (نصف سنة) 🚀\n\nيسعدنا البدء معكم في تجهيز المتجر وربط المنتجات. هل أنتم جاهزون لنبدأ خطوات التفعيل؟`;
    } else {
      message = `أهلاً ${app.business_name} 👋\nتشرفنا جداً بتقديمكم في برنامج انطلاقة وأعجبنا مشروعكم ومنتجاتكم الجميلة 🤍\n\nنظراً لمحدودية المقاعد المختارة لمنحة الـ 6 شهور، وحرصاً منا على دعم انطلاقة مشروعكم، يسعدنا إهداؤكم **اشتراكاً مجانياً لمدة 3 شهور** بنظام BOUTQ OS لمساعدتكم في بدء البيع المنظم.\n\nإذا رغبتم بتفعيل العرض والبدء معنا، يرجى الرد بكلمة (جاهز) 🚀`;
    }
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  };

  return (
    <div className="space-y-6">
      {/* Header and KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-xl border-border bg-card shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-muted-foreground font-medium">إجمالي التقديمات</span>
            <div className="text-2xl font-black text-foreground">{totalApps}</div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-emerald-500/20 bg-emerald-500/5 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              جاهزون بالصور فوراً ⚡
            </span>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
              {readyCount}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-primary/20 bg-primary/5 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-primary font-medium">فائزو الـ 6 شهور 🏆</span>
            <div className="text-2xl font-black text-primary">{selectedCount} / 2</div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border-amber-500/20 bg-amber-500/5 shadow-xs">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
              عروض الـ 3 شهور 🎁
            </span>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
              {offered3Count}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-card p-3.5 rounded-xl border border-border">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالمتجر أو الحساب أو الهاتف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="ps-9 text-xs sm:text-sm rounded-lg min-h-10 placeholder:text-muted-foreground/45 placeholder:opacity-50"
          />
        </div>

        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] text-xs font-semibold min-h-10 rounded-lg">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="pending">معلّق</SelectItem>
              <SelectItem value="reviewed">تمت المراجعة</SelectItem>
              <SelectItem value="shortlisted">مرشح بالقائمة</SelectItem>
              <SelectItem value="selected">فائز 6 شهور</SelectItem>
              <SelectItem value="offered_3_months">عرض 3 شهور</SelectItem>
              <SelectItem value="rejected">مستبعد</SelectItem>
            </SelectContent>
          </Select>

          <Select value={readinessFilter} onValueChange={setReadinessFilter}>
            <SelectTrigger className="w-[150px] text-xs font-semibold min-h-10 rounded-lg">
              <SelectValue placeholder="الجاهزية" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الجاهزية</SelectItem>
              <SelectItem value="ready_with_photos">جاهز مع الصور ⚡</SelectItem>
              <SelectItem value="products_only">المنتجات فقط</SelectItem>
              <SelectItem value="idea_stage">فكرة قيد التجهيز</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            title="تحديث البيانات"
            className="min-h-10 min-w-10 rounded-lg"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="size-4 animate-spin text-primary" />
            جارٍ تحميل التقديمات...
          </div>
        </div>
      ) : filteredApps.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-border bg-card space-y-3">
          <div className="size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <HelpCircle className="size-6" />
          </div>
          <p className="font-bold text-foreground">لا توجد تقديمات تطابق خيارات البحث الحالية.</p>
          <p className="text-xs text-muted-foreground">
            تأكد من الفلاتر أو شجع أصحاب المشاريع للتقديم عبر رابط /grant
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredApps.map((app) => {
            const readinessInfo = READINESS_MAP[app.readiness_status] || {
              label: app.readiness_status,
              color: "bg-muted text-muted-foreground",
            };
            const statusInfo = STATUS_MAP[app.status] || STATUS_MAP.pending;
            const categoryInfo = CATEGORY_MAP[app.product_category] || {
              label: app.product_category,
              icon: Store,
            };
            const CategoryIcon = categoryInfo.icon;
            const formattedDate = new Date(app.created_at).toLocaleDateString("ar-BH", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <Card
                key={app.id}
                className={cn(
                  "rounded-xl border transition-all duration-200 overflow-hidden shadow-xs",
                  app.status === "selected"
                    ? "border-primary/50 bg-primary/5"
                    : app.readiness_status === "ready_with_photos"
                      ? "border-emerald-500/25 bg-card"
                      : "border-border bg-card",
                )}
              >
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-muted/60 border border-border flex items-center justify-center text-primary shrink-0">
                        <CategoryIcon className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            onClick={() => {
                              setDetailsApp(app);
                              setNotesDraft(app.admin_notes || "");
                            }}
                            className="font-heading text-base font-bold text-foreground hover:text-primary cursor-pointer transition-colors"
                            title="انقر لفتح تفاصيل الاستبيان بالكامل"
                          >
                            {app.business_name}
                          </h3>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] px-2 py-0.5", readinessInfo.color)}
                          >
                            {readinessInfo.label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mt-0.5">
                          <span>{categoryInfo.label}</span>
                          <span>•</span>
                          <span>
                            قناة البيع:{" "}
                            {CHANNEL_MAP[app.current_sales_channel] || app.current_sales_channel}
                          </span>
                          <span>•</span>
                          <span
                            className="flex items-center gap-1 font-mono font-bold text-foreground"
                            dir="ltr"
                          >
                            <Phone className="size-3 text-muted-foreground" />
                            {app.whatsapp_number}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {formattedDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status & Quick Change */}
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <Select
                        value={app.status}
                        onValueChange={(val) =>
                          handleStatusChange(app, val as GrantApplication["status"])
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "h-8 text-xs font-bold border rounded-lg min-w-[130px]",
                            statusInfo.color,
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">معلّق ⏳</SelectItem>
                          <SelectItem value="reviewed">تمت المراجعة 👁️</SelectItem>
                          <SelectItem value="shortlisted">مرشح بالقائمة ⭐</SelectItem>
                          <SelectItem value="selected">فائز 6 شهور 🏆</SelectItem>
                          <SelectItem value="offered_3_months">عرض 3 شهور 🎁</SelectItem>
                          <SelectItem value="rejected">مستبعد ✖</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Challenge details */}
                  {app.biggest_challenge && (
                    <div className="rounded-lg bg-muted/30 border border-border/50 p-2.5 text-xs text-muted-foreground leading-relaxed">
                      <span className="font-bold text-foreground block mb-0.5">
                        التحدي الأكبر للتاجر:
                      </span>
                      "{app.biggest_challenge}"
                    </div>
                  )}

                  {/* Admin notes if any */}
                  {app.admin_notes && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <span className="font-bold block mb-0.5">ملاحظات المشرف:</span>
                      {app.admin_notes}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {/* External links & Full view */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* View full survey details */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDetailsApp(app);
                          setNotesDraft(app.admin_notes || "");
                        }}
                        className="h-8 text-xs gap-1.5 rounded-lg border-primary/30 text-primary hover:bg-primary/10 font-bold"
                      >
                        <Eye className="size-3.5" />
                        عرض تفاصيل الاستبيان
                      </Button>

                      {/* Instagram profile link */}
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 rounded-lg border-border hover:border-pink-500/40 hover:text-pink-600"
                      >
                        <a
                          href={`https://instagram.com/${app.instagram_handle.replace(/^@/, "")}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Instagram className="size-3.5 text-pink-500" />
                          <span dir="ltr">@{app.instagram_handle.replace(/^@/, "")}</span>
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      </Button>

                      {/* WhatsApp 6M Winner CTA */}
                      <Button
                        asChild
                        size="sm"
                        className="h-8 text-xs gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                      >
                        <a
                          href={getWhatsAppLink(app, "winner_6m")}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Crown className="size-3.5" />
                          تهنئة الـ 6 شهور
                        </a>
                      </Button>

                      {/* WhatsApp 3M Offer CTA */}
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 rounded-lg border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-bold"
                      >
                        <a
                          href={getWhatsAppLink(app, "special_3m")}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Gift className="size-3.5" />
                          إهداء الـ 3 شهور
                        </a>
                      </Button>
                    </div>

                    {/* Meta & Notes actions */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenNotes(app)}
                        className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 className="size-3.5" />
                        {app.admin_notes ? "تعديل الملاحظات" : "إضافة ملاحظة"}
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`هل أنت متأكد من حذف طلب "${app.business_name}"؟`)) {
                            deleteMutation.mutate(app.id);
                          }
                        }}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="حذف الطلب"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full Survey Details Modal */}
      <Dialog open={Boolean(detailsApp)} onOpenChange={(open) => !open && setDetailsApp(null)}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {detailsApp && (
            <div className="space-y-5">
              <DialogHeader className="border-b border-border/60 pb-3 text-right">
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
                    <Store className="size-5 text-primary" />
                    استبيان: {detailsApp.business_name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-bold",
                      (STATUS_MAP[detailsApp.status] || STATUS_MAP.pending).color,
                    )}
                  >
                    {(STATUS_MAP[detailsApp.status] || STATUS_MAP.pending).label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  تاريخ وتوقيت التقديم:{" "}
                  {new Date(detailsApp.created_at).toLocaleDateString("ar-BH", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </DialogHeader>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Instagram className="size-4 text-pink-500" />
                    حساب الإنستغرام
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-foreground" dir="ltr">
                      @{detailsApp.instagram_handle.replace(/^@/, "")}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 rounded-lg"
                    >
                      <a
                        href={`https://instagram.com/${detailsApp.instagram_handle.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        زيارة الحساب
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                    <Phone className="size-4 text-emerald-500" />
                    رقم الواتساب للتواصل
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-sm text-foreground" dir="ltr">
                      {detailsApp.whatsapp_number}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 rounded-lg border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                    >
                      <a
                        href={`https://wa.me/${normalizePhoneForWhatsApp(detailsApp.whatsapp_number)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        محادثة واتساب
                        <ExternalLink className="size-3" />
                      </a>
                    </Button>
                  </div>
                </div>
              </div>

              {/* Store & Readiness Answers */}
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  إجابات الاستبيان حول المتجر
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-card p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted-foreground block text-[11px] mb-1">
                      مجال المنتجات
                    </span>
                    <span className="font-bold text-foreground">
                      {(CATEGORY_MAP[detailsApp.product_category] || {}).label ||
                        detailsApp.product_category}
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted-foreground block text-[11px] mb-1">
                      حالة الجاهزية والتصوير
                    </span>
                    <span className="font-bold text-foreground">
                      {(READINESS_MAP[detailsApp.readiness_status] || {}).label ||
                        detailsApp.readiness_status}
                    </span>
                  </div>

                  <div className="bg-card p-2.5 rounded-lg border border-border/60">
                    <span className="text-muted-foreground block text-[11px] mb-1">
                      قناة البيع الحالية
                    </span>
                    <span className="font-bold text-foreground">
                      {CHANNEL_MAP[detailsApp.current_sales_channel] ||
                        detailsApp.current_sales_channel}
                    </span>
                  </div>
                </div>
              </div>

              {/* The Biggest Challenge */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <Sparkles className="size-4" />
                  أكبر تحدٍ يواجه التاجر في المبيعات والعمليات:
                </div>
                <p className="text-xs sm:text-sm text-foreground leading-relaxed font-medium">
                  {detailsApp.biggest_challenge ? (
                    `"${detailsApp.biggest_challenge}"`
                  ) : (
                    <span className="text-muted-foreground italic">
                      لم يذكر التاجر أي تحدٍ محدد (حقل اختياري).
                    </span>
                  )}
                </p>
              </div>

              {/* Admin Notes & Status Selector */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Edit3 className="size-4 text-primary" />
                    ملاحظات المشرف وتحديث الحالة
                  </h4>
                  <div className="w-[150px]">
                    <Select
                      value={detailsApp.status}
                      onValueChange={(val) => {
                        const newStatus = val as GrantApplication["status"];
                        handleStatusChange(detailsApp, newStatus);
                        setDetailsApp((prev) => (prev ? { ...prev, status: newStatus } : null));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs font-bold border rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">معلّق ⏳</SelectItem>
                        <SelectItem value="reviewed">تمت المراجعة 👁️</SelectItem>
                        <SelectItem value="shortlisted">مرشح بالقائمة ⭐</SelectItem>
                        <SelectItem value="selected">فائز 6 شهور 🏆</SelectItem>
                        <SelectItem value="offered_3_months">عرض 3 شهور 🎁</SelectItem>
                        <SelectItem value="rejected">مستبعد ✖</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  rows={3}
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="اكتب ملاحظاتك الداخلية عن هذا المتجر..."
                  dir="rtl"
                  className="text-xs sm:text-sm rounded-xl leading-relaxed text-right placeholder:text-muted-foreground/45 placeholder:opacity-50"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    updateMutation.mutate({
                      id: detailsApp.id,
                      updates: { admin_notes: notesDraft },
                    });
                    setDetailsApp((prev) => (prev ? { ...prev, admin_notes: notesDraft } : null));
                  }}
                  disabled={updateMutation.isPending}
                  className="text-xs font-bold h-8"
                >
                  حفظ الملاحظة
                </Button>
              </div>

              {/* WhatsApp Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    asChild
                    size="sm"
                    className="h-8 text-xs gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                  >
                    <a
                      href={getWhatsAppLink(detailsApp, "winner_6m")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Crown className="size-3.5" />
                      تهنئة الـ 6 شهور
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1.5 rounded-lg border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-bold"
                  >
                    <a
                      href={getWhatsAppLink(detailsApp, "special_3m")}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Gift className="size-3.5" />
                      إهداء الـ 3 شهور
                    </a>
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailsApp(null)}
                  className="h-8 text-xs font-bold"
                >
                  إغلاق
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={Boolean(selectedApp)} onOpenChange={(open) => !open && setSelectedApp(null)}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              ملاحظات المشرف: {selectedApp?.business_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              اكتب ملاحظاتك الداخلية حول جودة الحساب، ملائمة المنتجات، أو نتائج التواصل بالواتساب.
            </p>
            <Textarea
              rows={4}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="مثال: صور المنتجات ممتازة وجاهزة للبدء..."
              dir="rtl"
              className="text-xs sm:text-sm rounded-xl leading-relaxed text-right placeholder:text-muted-foreground/45 placeholder:opacity-50"
            />
          </div>
          <DialogFooter className="flex gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={handleSaveNotes}
              disabled={updateMutation.isPending}
              className="font-bold text-xs"
            >
              حفظ الملاحظة
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedApp(null)}
              className="text-xs font-bold"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
