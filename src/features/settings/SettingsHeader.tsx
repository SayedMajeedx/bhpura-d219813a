import { useState, useMemo, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { useSettingsLevel } from "@/features/settings/settings-level";
import { SETTINGS_REGISTRY, type SettingsTabId } from "@/features/settings/registry";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Compass,
  Eye,
  ExternalLink,
  Loader2,
  Save,
  Search,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";

interface SettingsHeaderProps {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId, groupAnchor?: string) => void;
  isPreviewOpen?: boolean;
  onTogglePreview?: () => void;
}

export function SettingsHeader({
  activeTab,
  onTabChange,
  isPreviewOpen,
  onTogglePreview,
}: SettingsHeaderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, isDirty, dirtyCount, isSaving, save, reset } = useBrandSettingsFormContext();
  const { level, toggleLevel, isAdvanced } = useSettingsLevel();
  const brand = form.brand;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const brandDisplayName =
    (isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug || "Boutique";

  // Global Keyboard shortcut: Cmd+K or "/" to focus search; Escape to clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("contenteditable") === "true");

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === "/" && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === "Escape") {
        if (searchOpen || searchQuery) {
          setSearchQuery("");
          setSearchOpen(false);
          searchInputRef.current?.blur();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, searchQuery]);

  // Filter searchable registry fields
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];

    return SETTINGS_REGISTRY.filter((entry) => {
      if (!entry.tab || entry.owner === "system") return false;
      const labelMatch =
        entry.label.ar.toLowerCase().includes(q) || entry.label.en.toLowerCase().includes(q);
      const keyMatch = entry.key.toLowerCase().includes(q);
      const keywordMatch =
        (entry.keywords?.ar?.some((k) => k.toLowerCase().includes(q)) ?? false) ||
        (entry.keywords?.en?.some((k) => k.toLowerCase().includes(q)) ?? false);
      return labelMatch || keyMatch || keywordMatch;
    }).slice(0, 8);
  }, [searchQuery]);

  const handleSelectSearchResult = (entry: (typeof SETTINGS_REGISTRY)[0]) => {
    setSearchQuery("");
    setSearchOpen(false);
    if (entry.level === "advanced" && !isAdvanced) {
      toggleLevel();
    }
    if (entry.tab) {
      onTabChange(entry.tab as SettingsTabId, entry.group ? `group-${entry.group}` : undefined);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
      {/* Decorative gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/10 pointer-events-none" />

      {/* Row 1: Brand Identifier & Action Controls */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <Compass className="size-3 shrink-0" />
            <span>{isAr ? "لوحة تحكم الإعدادات" : "Settings Center"}</span>
            <span className="ms-1 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {brandDisplayName}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {isAr ? "إعدادات المتجر والعلامة التجارية" : "Store & Brand Settings"}
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
            {isAr
              ? "تحكّم بهوية متجرك، الصفحات، طرق الدفع والتوصيل، والفواتير من شاشة مركزية واحدة."
              : "Centrally manage your brand identity, storefront pages, payments, fulfillment, and invoices."}
          </p>
        </div>

        {/* Level Toggle & Save Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Store Preview (Opens in new tab) */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            asChild
            className="h-9 px-3 text-xs gap-1.5 rounded-xl hover:bg-muted"
            title={isAr ? "معاينة المتجر في نافذة جديدة" : "Preview store in new tab"}
          >
            <a
              href={getStorefrontUrl(brand.slug || "pura")}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="size-3.5 text-primary" />
              <span>{isAr ? "معاينة المتجر" : "Store Preview"}</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </a>
          </Button>

          {/* Basic vs Advanced Page-Wide Switch (Owner Decision #3) */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-border bg-background/80 shadow-xs">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-semibold ${!isAdvanced ? "text-primary" : "text-muted-foreground"}`}
              >
                {isAr ? "أساسي" : "Basic"}
              </span>
              <Switch
                checked={isAdvanced}
                onCheckedChange={toggleLevel}
                aria-label="Toggle Basic or Advanced settings level"
              />
              <span
                className={`text-xs font-semibold ${isAdvanced ? "text-primary" : "text-muted-foreground"}`}
              >
                {isAr ? "متقدم" : "Advanced"}
              </span>
            </div>
          </div>

          {/* Atomic Save / Discard Actions */}
          {isDirty && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reset}
                disabled={isSaving}
                className="h-9 px-3 text-xs gap-1"
              >
                <Undo2 className="size-3.5" />
                <span>{isAr ? "إلغاء التعديل" : "Discard"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={isSaving}
                className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-sm"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                <span>
                  {isSaving
                    ? isAr
                      ? "جاري الحفظ..."
                      : "Saving..."
                    : isAr
                      ? `حفظ التعديلات (${dirtyCount})`
                      : `Save Changes (${dirtyCount})`}
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Universal Setting Search Bar */}
      <div className="relative pt-1">
        <div className="relative flex items-center">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            className="ps-9 pe-16 h-9 text-xs bg-background/90 rounded-xl"
            value={searchQuery}
            placeholder={
              isAr
                ? "ابحث في جميع الإعدادات (مثال: الشعار، الدفع، بنفت باي، الضريبة، الفاتورة...)"
                : "Search all settings (e.g. logo, BenefitPay, currency, tax, invoice, terms)..."
            }
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
          />
          <div className="absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchQuery && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchQuery("");
                  setSearchOpen(false);
                }}
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </Button>
            )}
            <kbd className="hidden sm:inline-flex items-center text-xs font-mono text-muted-foreground bg-muted/80 border border-border rounded px-1.5 py-0.5 select-none pointer-events-none">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute z-50 inset-x-0 mt-1.5 rounded-xl border border-border bg-popover p-2 shadow-xl space-y-1">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
              {isAr ? "نتائج البحث السريع:" : "Matching Settings:"}
            </p>
            {searchResults.map((entry) => (
              <button
                key={`${entry.table}-${entry.key}`}
                type="button"
                onClick={() => handleSelectSearchResult(entry)}
                className="w-full flex items-center justify-between p-2 rounded-lg text-start hover:bg-muted text-xs transition-colors"
              >
                <div>
                  <span className="font-medium text-foreground">
                    {isAr ? entry.label.ar : entry.label.en}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span className="capitalize">{entry.tab}</span>
                    <span>›</span>
                    <span className="capitalize">{entry.group}</span>
                    {entry.level === "advanced" && (
                      <span className="ms-1 px-1 rounded bg-warning/10 text-warning font-medium">
                        {isAr ? "متقدم" : "Advanced"}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{entry.key}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
