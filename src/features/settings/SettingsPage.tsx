import { useState, useEffect, useCallback } from "react";
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
import { SettingsStickySaveBar } from "@/components/settings/SettingsStickySaveBar";
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
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { isLoading, isError, error, isDirty, isSaving, save, reset } =
    useBrandSettingsFormContext();

  // Read initial active tab from URL search param (?tab=...)
  const [activeTab, setActiveTab] = useState<SettingsTabId>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get("tab") as SettingsTabId;
      if (VALID_TABS.includes(urlTab)) return urlTab;
    }
    return "identity";
  });

  const handleTabChange = useCallback((tab: SettingsTabId, groupAnchor?: string) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      if (groupAnchor) {
        url.searchParams.set("group", groupAnchor.replace(/^group-/, ""));
      } else {
        url.searchParams.delete("group");
      }
      window.history.replaceState({}, "", url.toString());

      if (groupAnchor) {
        setTimeout(() => {
          const el = document.getElementById(groupAnchor);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 150);
      }
    }
  }, []);

  // Check URL params on initial mount for anchor scrolling
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlGroup = params.get("group");
      if (urlGroup) {
        setTimeout(() => {
          const el = document.getElementById(`group-${urlGroup}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 300);
      }
    }
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
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
              {error?.message || (isAr ? "يرجى التحقق من الاتصال وإعادة المحاولة" : "Please check your network and try again.")}
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
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Universal Command Header */}
      <SettingsHeader activeTab={activeTab} onTabChange={handleTabChange} />

      {/* 5-Tab Navigation & Panels */}
      <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Sticky Save Bar (Pops up when changes are dirty) */}
      <SettingsStickySaveBar
        activeTab={activeTab}
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={() => void save()}
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
