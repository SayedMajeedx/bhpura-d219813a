import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ShieldCheck,
  Sparkles,
  Settings as SettingsIcon,
  Power,
  Trash2,
  AlertTriangle,
  Monitor,
  LayoutDashboard,
  HelpCircle,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Ruler,
  Scissors,
  Crown,
  Shirt,
  Coffee,
  UtensilsCrossed,
  Download,
  Gift,
  Printer,
  Gem,
  Puzzle,
  UserCheck,
  CheckCircle2,
  Lock,
} from "lucide-react";
import type {
  AddonId,
  AddonManifest,
  BrandAddonRow,
  AddonSettingsField,
} from "@/lib/addons/addon-types";
import { ADDON_SHOWCASE_DATA } from "@/lib/addons/addon-showcase-data";
import { cn } from "@/lib/utils";

interface AddonDetailPageProps {
  manifest: AddonManifest;
  installedRow?: BrandAddonRow;
  allManifests: AddonManifest[];
  isRecommended?: boolean;
  isAr: boolean;
  onBack: () => void;
  onInstall: (manifest: AddonManifest) => Promise<void>;
  onToggleStatus: (manifest: AddonManifest, disable: boolean) => Promise<void>;
  onUninstall: (manifest: AddonManifest) => Promise<void>;
  onPurge: (manifest: AddonManifest) => void;
  onSaveSettings: (addonId: AddonId, settings: Record<string, any>) => Promise<void>;
  isMutating: boolean;
}

export function AddonDetailPage({
  manifest,
  installedRow,
  allManifests,
  isRecommended,
  isAr,
  onBack,
  onInstall,
  onToggleStatus,
  onUninstall,
  onPurge,
  onSaveSettings,
  isMutating,
}: AddonDetailPageProps) {
  const isInstalled = Boolean(installedRow);
  const isDisabled = installedRow?.status === "disabled";

  const showcase = ADDON_SHOWCASE_DATA[manifest.id];

  // Preview tab state: 'storefront' | 'admin' | 'settings'
  const [activePreviewTab, setActivePreviewTab] = useState<"storefront" | "admin" | "settings">(
    "storefront",
  );

  // Settings form local state (if installed)
  const [settingsForm, setSettingsForm] = useState<Record<string, any>>(
    installedRow?.settings || {},
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Expanded FAQ items state
  const [expandedFaqs, setExpandedFaqs] = useState<Record<number, boolean>>({ 0: true });

  const toggleFaq = (index: number) => {
    setExpandedFaqs((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      await onSaveSettings(manifest.id, settingsForm);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const getAddonIcon = (id: AddonId) => {
    switch (id) {
      case "size-guides":
        return <Ruler className="h-10 w-10" />;
      case "fit-passport":
        return <UserCheck className="h-10 w-10" />;
      case "made-to-order":
        return <Scissors className="h-10 w-10" />;
      case "abaya-pack":
        return <Crown className="h-10 w-10" />;
      case "fashion-core":
        return <Shirt className="h-10 w-10" />;
      case "beauty-perfume":
        return <Sparkles className="h-10 w-10" />;
      case "coffee-roastery":
        return <Coffee className="h-10 w-10" />;
      case "food-beverage":
        return <UtensilsCrossed className="h-10 w-10" />;
      case "digital-products":
        return <Download className="h-10 w-10" />;
      case "gifts":
        return <Gift className="h-10 w-10" />;
      case "print-stamps":
        return <Printer className="h-10 w-10" />;
      case "jewelry":
        return <Gem className="h-10 w-10" />;
      default:
        return <Puzzle className="h-10 w-10" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-200">
      {/* Top Breadcrumb & Back Bar */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-2 text-muted-foreground hover:text-foreground font-medium rounded-xl h-9"
          >
            {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            <span>{isAr ? "الرجوع إلى متجر الإضافات" : "Back to Add-on Store"}</span>
          </Button>

          <span className="text-muted-foreground/50">/</span>

          <span className="text-sm font-semibold text-foreground">
            {isAr ? manifest.name.ar : manifest.name.en}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {manifest.kind === "pack"
              ? isAr
                ? "حزمة نشاط"
                : "Vertical Pack"
              : isAr
                ? "ميزة متخصصة"
                : "Specialized Feature"}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            v{manifest.version}.0
          </Badge>
        </div>
      </div>

      {/* Main Hero Header Card */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: App Identity */}
          <div className="flex items-start gap-5">
            {/* App Icon */}
            <div className="h-20 w-20 md:h-24 md:w-24 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 shadow-sm border border-primary/20">
              {getAddonIcon(manifest.id)}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                  {isAr ? manifest.name.ar : manifest.name.en}
                </h1>

                {isRecommended && (
                  <Badge
                    variant="outline"
                    className="text-xs text-primary border-primary/30 font-medium"
                  >
                    {isAr ? "موصى به لنشاطك" : "Recommended for your store"}
                  </Badge>
                )}

                {showcase?.badge && (
                  <Badge variant="secondary" className="text-xs font-medium">
                    {isAr ? showcase.badge.ar : showcase.badge.en}
                  </Badge>
                )}
              </div>

              {/* Publisher & Verification */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {showcase
                    ? isAr
                      ? showcase.publisher.ar
                      : showcase.publisher.en
                    : "Boutq Official"}
                </span>
                <span className="flex items-center gap-1 text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{isAr ? "معتمد رسميًا" : "Verified Official"}</span>
                </span>
                <span>•</span>
                <span>
                  {showcase
                    ? isAr
                      ? showcase.categoryLabel.ar
                      : showcase.categoryLabel.en
                    : "E-Commerce"}
                </span>
              </div>

              {/* Platform Reliability & Support */}
              <div className="flex items-center gap-2 pt-1.5 text-xs text-muted-foreground flex-wrap">
                <Badge
                  variant="outline"
                  className="text-xs h-5 px-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5 font-medium flex items-center gap-1"
                >
                  <Check className="h-3 w-3" />
                  <span>{isAr ? "جاهزة للعمل الفوري" : "Production Ready"}</span>
                </Badge>
                <span>•</span>
                <span>{isAr ? "دعم ثنائي اللغة (عربي / إنجليزي)" : "Full Bilingual Support"}</span>
                <span>•</span>
                <span>{isAr ? "تحديثات مستمرة مشمولة" : "Automated Platform Updates"}</span>
              </div>
            </div>
          </div>

          {/* Right: Primary Action Box */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4 p-4 rounded-xl bg-muted/30 border border-border lg:min-w-64">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                {isAr ? "رسوم الاستخدام:" : "Subscription:"}
              </div>
              <div className="text-base font-bold text-foreground">
                {isAr ? "مجاني مشمول بالباقة" : "Free (Included in Plan)"}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-2 w-full sm:w-auto lg:w-full">
              {!isInstalled ? (
                <Button
                  size="lg"
                  disabled={isMutating}
                  onClick={() => onInstall(manifest)}
                  className="w-full gap-2 font-bold shadow-sm"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{isAr ? "تثبيت الإضافة الآن" : "Install Add-on"}</span>
                </Button>
              ) : (
                <div className="space-y-2 w-full">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isDisabled ? "outline" : "default"}
                      size="default"
                      disabled={isMutating}
                      onClick={() => onToggleStatus(manifest, !isDisabled)}
                      className="flex-1 gap-1.5 font-medium"
                    >
                      <Power className="h-4 w-4" />
                      <span>
                        {isDisabled
                          ? isAr
                            ? "تفعيل الإضافة"
                            : "Enable"
                          : isAr
                            ? "معطلة مؤقتاً"
                            : "Active"}
                      </span>
                    </Button>

                    {manifest.settingsSchema && (
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setActivePreviewTab("settings")}
                        className="gap-1.5 border-border"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        <span>{isAr ? "الإعدادات" : "Settings"}</span>
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 px-1">
                    <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{isAr ? "مثبتة في متجرك" : "Installed"}</span>
                    </span>

                    <button
                      onClick={() => onUninstall(manifest)}
                      disabled={isMutating}
                      className="text-xs text-muted-foreground hover:text-destructive underline decoration-dotted transition-colors"
                    >
                      {isAr ? "إلغاء التثبيت" : "Uninstall"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Visual Preview Showcase (Microsoft Store Screen Carousel) */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isAr ? "المعاينة البصرية للإضافة" : "Interactive Visual Preview"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "شاهد أين تظهر هذه الإضافة وكيف تعمل داخل واجهة المتجر ولوحة التحكم"
                : "See where and how this add-on functions in the storefront and admin dashboard"}
            </p>
          </div>

          {/* Preview View Switcher */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border">
            <Button
              variant={activePreviewTab === "storefront" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePreviewTab("storefront")}
              className="gap-1.5 h-8 text-xs rounded-lg"
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>{isAr ? "واجهة المتجر للعميل" : "Storefront"}</span>
            </Button>

            <Button
              variant={activePreviewTab === "admin" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActivePreviewTab("admin")}
              className="gap-1.5 h-8 text-xs rounded-lg"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span>{isAr ? "لوحة التحكم" : "Admin Panel"}</span>
            </Button>

            {isInstalled && manifest.settingsSchema && (
              <Button
                variant={activePreviewTab === "settings" ? "default" : "ghost"}
                size="sm"
                onClick={() => setActivePreviewTab("settings")}
                className="gap-1.5 h-8 text-xs rounded-lg"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
                <span>{isAr ? "تخصيص الإعدادات" : "Settings"}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Live Mockup Screen Canvas */}
        <div className="rounded-xl border border-border bg-muted/15 p-6 md:p-8">
          {activePreviewTab === "storefront" && showcase && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                  <Monitor className="h-3 w-3" />
                  <span>
                    {isAr
                      ? showcase.previewMockup.storefront.tag?.ar
                      : showcase.previewMockup.storefront.tag?.en}
                  </span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "تظهر تلقائياً في صفحة المنتج" : "Auto-embeds on product page"}
                </span>
              </div>

              {/* Realistic Storefront Mockup Widget */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-destructive/60" />
                    <div className="h-3 w-3 rounded-full bg-amber-400/60" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    boutique-storefront.com/p/product-name
                  </span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-bold text-foreground">
                    {isAr
                      ? showcase.previewMockup.storefront.title.ar
                      : showcase.previewMockup.storefront.title.en}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? showcase.previewMockup.storefront.subtitle.ar
                      : showcase.previewMockup.storefront.subtitle.en}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  {showcase.previewMockup.storefront.bullets.map((b, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-muted/30 p-3 text-xs font-medium text-foreground flex items-center gap-2"
                    >
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{isAr ? b.ar : b.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activePreviewTab === "admin" && showcase && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                  <LayoutDashboard className="h-3 w-3" />
                  <span>
                    {isAr
                      ? showcase.previewMockup.admin.tag?.ar
                      : showcase.previewMockup.admin.tag?.en}
                  </span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "متكامل مع لوحة التحكم" : "Integrated with Admin"}
                </span>
              </div>

              {/* Realistic Admin Mockup Card */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {getAddonIcon(manifest.id)}
                    </div>
                    <div>
                      <div className="font-semibold text-xs text-foreground">
                        {isAr ? manifest.name.ar : manifest.name.en}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {isAr ? "لوحة الإدارة والإشراف" : "Management View"}
                      </div>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {isAr ? "لوحة مخصصة" : "Admin Panel"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-bold text-foreground">
                    {isAr
                      ? showcase.previewMockup.admin.title.ar
                      : showcase.previewMockup.admin.title.en}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr
                      ? showcase.previewMockup.admin.subtitle.ar
                      : showcase.previewMockup.admin.subtitle.en}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  {showcase.previewMockup.admin.bullets.map((b, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border bg-muted/30 p-3 text-xs font-medium text-foreground flex items-center gap-2"
                    >
                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{isAr ? b.ar : b.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activePreviewTab === "settings" && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
                  <SettingsIcon className="h-3 w-3" />
                  <span>{isAr ? "خيارات التخصيص" : "Customization"}</span>
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {isAr ? "احفظ الإعدادات لتطبيقها فوراً" : "Save to apply immediately"}
                </span>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
                <div className="border-b border-border pb-3">
                  <h3 className="text-base font-bold text-foreground">
                    {isAr ? "إعدادات الإضافة لمتجرك" : "Add-on Settings for Your Store"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isAr
                      ? "خصص خيارات الإضافة بما يناسب أسلوب علامتك التجارية"
                      : "Customize add-on preferences matching your brand identity"}
                  </p>
                </div>

                {manifest.settingsSchema && manifest.settingsSchema.length > 0 ? (
                  <div className="space-y-4">
                    {manifest.settingsSchema.map((field) => {
                      const value = settingsForm[field.key] ?? field.default;

                      return (
                        <div
                          key={field.key}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border bg-muted/20"
                        >
                          <div className="space-y-0.5">
                            <label className="text-xs font-semibold text-foreground">
                              {isAr ? field.label.ar : field.label.en}
                            </label>
                          </div>

                          <div className="sm:w-48 shrink-0">
                            {field.type === "boolean" ? (
                              <Switch
                                checked={Boolean(value)}
                                onCheckedChange={(checked) =>
                                  setSettingsForm((prev) => ({ ...prev, [field.key]: checked }))
                                }
                              />
                            ) : field.type === "select" ? (
                              <select
                                value={String(value ?? "")}
                                onChange={(e) =>
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    [field.key]: e.target.value,
                                  }))
                                }
                                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                              >
                                {field.options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {isAr ? opt.label.ar : opt.label.en}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                value={String(value ?? "")}
                                onChange={(e) =>
                                  setSettingsForm((prev) => ({
                                    ...prev,
                                    [field.key]: e.target.value,
                                  }))
                                }
                                className="h-9 text-xs rounded-lg border-border"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-2 flex justify-end">
                      <Button
                        size="sm"
                        disabled={isSavingSettings}
                        onClick={handleSaveSettings}
                        className="gap-2 font-medium"
                      >
                        <Check className="h-4 w-4" />
                        <span>{isAr ? "حفظ إعدادات الإضافة" : "Save Settings"}</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    {isAr
                      ? "هذه الإضافة تعمل تلقائياً بدون الحاجة لضبط يدوي للإعدادات."
                      : "This add-on works automatically without requiring manual configuration."}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comprehensive Narrative Overview (شرح كافي ووافي) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 cols: Detailed narrative & features */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Overview */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <h2 className="text-lg font-bold text-foreground">
              {isAr ? "عن هذه الإضافة والقيمة لمتجرك" : "About this Add-on & Business Value"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {showcase
                ? isAr
                  ? showcase.fullOverview.ar
                  : showcase.fullOverview.en
                : isAr
                  ? manifest.description.ar
                  : manifest.description.en}
            </p>
          </div>

          {/* Section 2: Key Features Grid */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">
              {isAr ? "المميزات الرئيسية وما تضيفه لمتجرك" : "Key Features & Capabilities"}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {showcase?.keyFeatures.map((feat, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center font-bold">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-xs text-foreground">
                      {isAr ? feat.title.ar : feat.title.en}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {isAr ? feat.description.ar : feat.description.en}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: How it Works (3 steps) */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-bold text-foreground">
              {isAr ? "كيف تعمل في متجرك خطوة بخطوة" : "How it Works in Your Store"}
            </h2>

            <div className="space-y-3">
              {showcase?.workflowSteps.map((step) => (
                <div
                  key={step.step}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-muted/20"
                >
                  <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
                    {step.step}
                  </div>
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-foreground">
                      {isAr ? step.title.ar : step.title.en}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {isAr ? step.description.ar : step.description.en}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: FAQs */}
          {showcase?.faqs && showcase.faqs.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />
                <span>{isAr ? "الأسئلة الشائعة" : "Frequently Asked Questions"}</span>
              </h2>

              <div className="space-y-2">
                {showcase.faqs.map((faq, idx) => {
                  const isOpen = Boolean(expandedFaqs[idx]);
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-border overflow-hidden transition-colors"
                    >
                      <button
                        onClick={() => toggleFaq(idx)}
                        className="w-full flex items-center justify-between p-3.5 text-start font-semibold text-xs text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <span>{isAr ? faq.q.ar : faq.q.en}</span>
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="px-3.5 pb-3.5 pt-1 text-xs text-muted-foreground leading-relaxed border-t border-border/50 bg-muted/10">
                          {isAr ? faq.a.ar : faq.a.en}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right 1 col: Technical Specs & Placement Slots */}
        <div className="space-y-6">
          {/* Placement Slots & System Hooks */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span>{isAr ? "مواقع الظهور والتكامل" : "Integration & Placements"}</span>
            </h3>

            <div className="space-y-2">
              {manifest.contributions.slots && manifest.contributions.slots.length > 0 ? (
                manifest.contributions.slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="p-2.5 rounded-xl border border-border bg-muted/20 text-xs space-y-1"
                  >
                    <div className="font-semibold text-foreground">{slot.placement}</div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">
                      slot_id: {slot.id}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">
                  {isAr ? "تكامل نظامي على مستوى المتجر" : "System-wide integration"}
                </div>
              )}
            </div>

            {/* Dependencies */}
            {manifest.requires && manifest.requires.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5 font-medium">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span>{isAr ? "تعتمد على تثبيت:" : "Requires dependencies:"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {manifest.requires.map((reqId) => {
                    const reqManifest = allManifests.find((m) => m.id === reqId);
                    return (
                      <Badge key={reqId} variant="secondary" className="text-[11px]">
                        {reqManifest ? (isAr ? reqManifest.name.ar : reqManifest.name.en) : reqId}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Technical Specifications */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-bold text-sm text-foreground">
              {isAr ? "معلومات ومواصفات الإضافة" : "Specifications"}
            </h3>

            <div className="space-y-3 text-xs divide-y divide-border">
              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">{isAr ? "الناشر" : "Publisher"}</span>
                <span className="font-medium text-foreground">Boutq Official</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">{isAr ? "الإصدار الحالي" : "Version"}</span>
                <span className="font-mono text-foreground">v{manifest.version}.0</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">{isAr ? "نوع الإضافة" : "Kind"}</span>
                <span className="font-medium text-foreground capitalize">{manifest.kind}</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">{isAr ? "التوافق" : "Compatibility"}</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {isAr ? "متوافق 100%" : "Fully Compatible"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-muted-foreground">{isAr ? "الدعم الفني" : "Support"}</span>
                <span className="font-medium text-foreground">Boutq 24/7 SLA</span>
              </div>
            </div>
          </div>

          {/* Business Data Purge Warning (if applicable & installed) */}
          {isInstalled && manifest.purge && (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 space-y-3">
              <div className="flex items-center gap-2 text-destructive font-bold text-xs">
                <AlertTriangle className="h-4 w-4" />
                <span>{isAr ? "إدارة البيانات والحذف النهائي" : "Data Management & Purge"}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isAr
                  ? "يتيح لك النظام حذف جميع السجلات والمحتوى المرتبط بهذه الإضافة نهائياً من قاعدة بيانات المتجر."
                  : "You can permanently delete all records associated with this add-on from store database."}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPurge(manifest)}
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5 me-1.5" />
                <span>{isAr ? "حذف البيانات نهائياً" : "Purge Data"}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
