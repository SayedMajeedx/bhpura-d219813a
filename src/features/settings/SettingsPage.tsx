import { useState, useEffect, useCallback, useMemo } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { SettingsLevelProvider } from "@/features/settings/settings-level";
import {
  BrandSettingsFormProvider,
  useBrandSettingsFormContext,
} from "@/features/settings/use-brand-settings-form";
import { type SettingsTabId } from "@/features/settings/registry";
import { SettingsHeader } from "@/features/settings/SettingsHeader";
import { SettingsTabs } from "@/features/settings/SettingsTabs";
import { SettingsNavContext } from "@/features/settings/GroupNavigator";
import { StoreReadinessChecklist } from "@/components/settings/StoreReadinessChecklist";
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";
import { LivePreviewPane } from "@/features/settings/shared/LivePreviewPane";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

const VALID_TABS: SettingsTabId[] = [
  "identity",
  "storefront",
  "orders",
  "notifications",
  "account",
];

function SettingsPageInner() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { isLoading, isError, error, isDirty, dirtyCount, isSaving, save, reset, bs } =
    useBrandSettingsFormContext();

  const [saveCount, setSaveCount] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Read initial active tab from URL search param (?tab=...)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get("tab") as SettingsTabId;
      if (VALID_TABS.includes(urlTab)) return urlTab;
    }
    return "identity";
  });

  // Active group within the tab (one group is rendered at a time — see GroupNavigator).
  const [activeGroup, setActiveGroup] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("group");
    }
    return null;
  });
  const navValue = useMemo(() => ({ activeGroup, setActiveGroup }), [activeGroup]);

  const handleTabChange = useCallback((tab: SettingsTabId, groupAnchor?: string) => {
    setActiveTab(tab);
    const group = groupAnchor ? groupAnchor.replace(/^group-/, "") : null;
    setActiveGroup(group);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (group) url.searchParams.set("group", group);
      else url.searchParams.delete("group");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // 1. TanStack Router navigation blocker when changes are unsaved (Phase 3)
  useBlocker({
    shouldBlockFn: () => {
      if (!isDirty) return false;
      const confirmLeave = window.confirm(
        isAr
          ? "لديك تغييرات غير محفوظة في الإعدادات. هل أنت متأكد من مغادرة الصفحة وتجاهلها؟"
          : "You have unsaved settings changes. Are you sure you want to leave without saving?",
      );
      return !confirmLeave;
    },
    enableBeforeUnload: true,
  });

  // 2. Window beforeunload guard as backup for browser tab close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // 3. One-time cleanup of obsolete localStorage keys (Phase 3 §5.5)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("boutq_storefront_radius");
        localStorage.removeItem("boutq_storefront_header_glass");
        localStorage.removeItem("boutq_storefront_badge_accent");
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSave = useCallback(async () => {
    const ok = await save();
    if (ok) {
      setSaveCount((prev) => prev + 1);
    }
  }, [save]);

  // Global Ctrl+S / Cmd+S shortcut to save changes when dirty
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty && !isSaving) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, isSaving, handleSave]);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
        <Card className="p-6 space-y-4 rounded-2xl border border-border">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center space-y-4">
        <Card className="p-8 border border-destructive/30 rounded-2xl bg-destructive/5 space-y-4">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="size-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">
              {isAr ? "تعذّر تحميل إعدادات المتجر" : "Failed to load store settings"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {error?.message ||
                (isAr
                  ? "يرجى التحقق من الاتصال وإعادة المحاولة"
                  : "Please check your network and try again.")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" />
            <span>{isAr ? "إعادة المحاولة" : "Retry"}</span>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24 px-2 sm:px-4">
      {/* Universal Command Header */}
      <SettingsHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        isPreviewOpen={isPreviewOpen}
        onTogglePreview={() => setIsPreviewOpen((v) => !v)}
      />

      {/* Main Workspace with Optional Side-by-Side Live Preview on xl screens */}
      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 space-y-6">
          {/* Store Launch Readiness Checklist (P3) */}
          <StoreReadinessChecklist
            brandId={brand.id}
            slug={brand.slug}
            lang={lang}
            logoUrl={brand.logo_url}
            brandPalette={bs.brand_palette as any}
            storeVertical={bs.store_vertical as any}
            onNavigateTab={handleTabChange}
          />

          {/* 5-Tab Navigation & Panels */}
          <SettingsNavContext.Provider value={navValue}>
            <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />
          </SettingsNavContext.Provider>
        </div>

        {/* Live Preview Side Pane (xl screens) */}
        <LivePreviewPane
          slug={brand.slug}
          brandName={(isAr ? brand.name_ar : brand.name_en) || brand.slug}
          saveCount={saveCount}
          isOpen={isPreviewOpen}
          onToggle={() => setIsPreviewOpen((v) => !v)}
        />
      </div>

      {/* Sticky Save Bar (Pops up when changes are dirty) */}
      <SettingsStickySaveBar
        activeTab={activeTab}
        isDirty={isDirty}
        dirtyCount={dirtyCount}
        isSaving={isSaving}
        onSave={() => void handleSave()}
        onDiscard={reset}
        isAr={isAr}
      />
    </div>
  );
}

export function SettingsPage() {
  const brand = useBrand();

  return (
    <SettingsLevelProvider>
      <BrandSettingsFormProvider brandId={brand.id}>
        <SettingsPageInner />
      </BrandSettingsFormProvider>
    </SettingsLevelProvider>
  );
}
