import { useState, useMemo, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { useSettingsLevel } from "@/features/settings/settings-level";
import { SETTINGS_REGISTRY, type SettingsTabId } from "@/features/settings/registry";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { isSettingApplicable } from "@/lib/storefront-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Eye, Save, Search, Settings, SlidersHorizontal, Undo2, X } from "lucide-react";

interface SettingsHeaderProps {
  activeTab: SettingsTabId;
  onTabChange: (tab: SettingsTabId, groupAnchor?: string) => void;
  isPreviewOpen?: boolean;
  onTogglePreview?: () => void;
}

export function SettingsHeader({ onTabChange }: SettingsHeaderProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, isDirty, dirtyCount, isSaving, save, reset } = useBrandSettingsFormContext();
  const { toggleLevel, isAdvanced } = useSettingsLevel();
  const brand = form.brand;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
      // Never surface a setting the active storefront engine cannot read —
      // it would navigate to a group where the control is hidden.
      if (!isSettingApplicable(entry.scope, form.bs)) return false;
      const labelMatch =
        entry.label.ar.toLowerCase().includes(q) || entry.label.en.toLowerCase().includes(q);
      const keyMatch = entry.key.toLowerCase().includes(q);
      const keywordMatch =
        (entry.keywords?.ar?.some((k) => k.toLowerCase().includes(q)) ?? false) ||
        (entry.keywords?.en?.some((k) => k.toLowerCase().includes(q)) ?? false);
      return labelMatch || keyMatch || keywordMatch;
    }).slice(0, 8);
  }, [searchQuery, form.bs]);

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

  // One row on a phone, like every admin page's heading: the store's name is in the top bar, and
  // saving is the bar at the screen's foot (the heading's save is for wider screens). The card it
  // replaced took 560px of a phone before the settings' tabs.
  return (
    <div className="space-y-2">
      <AdminPageHeader
        icon={Settings}
        title={isAr ? "الإعدادات" : "Settings"}
        description={
          isAr
            ? "هوية متجرك، واجهته، الدفع والتوصيل، الفواتير والإشعارات."
            : "Your store's identity, storefront, payments, delivery, invoices and notifications."
        }
        actions={
          <>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold">
              <SlidersHorizontal className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className={isAdvanced ? "text-primary" : "text-muted-foreground"}>
                {isAr ? "متقدم" : "Advanced"}
              </span>
              <Switch
                checked={isAdvanced}
                onCheckedChange={toggleLevel}
                aria-label={isAr ? "عرض الإعدادات المتقدمة" : "Show advanced settings"}
              />
            </label>
            <Button
              asChild
              variant="outline"
              className="h-9 w-9 gap-1.5 px-0 text-xs font-bold shadow-2xs sm:w-auto sm:px-3.5"
            >
              <a
                href={getStorefrontUrl(brand.slug)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={isAr ? "معاينة المتجر" : "Store preview"}
              >
                <Eye className="size-4 text-primary" aria-hidden="true" />
                <span className="hidden sm:inline">{isAr ? "معاينة المتجر" : "Store preview"}</span>
              </a>
            </Button>
            {isDirty && (
              <>
                <AdminPageAction
                  icon={Undo2}
                  label={isAr ? "إلغاء التعديل" : "Discard"}
                  variant="outline"
                  iconOnPhone
                  onClick={reset}
                  disabled={isSaving}
                  className="hidden sm:inline-flex"
                />
                <AdminPageAction
                  icon={Save}
                  label={
                    isSaving
                      ? isAr
                        ? "جاري الحفظ..."
                        : "Saving..."
                      : isAr
                        ? `حفظ التعديلات (${dirtyCount})`
                        : `Save Changes (${dirtyCount})`
                  }
                  busy={isSaving}
                  onClick={() => void save()}
                  disabled={isSaving}
                  className="hidden sm:inline-flex"
                />
              </>
            )}
          </>
        }
      />

      {/* Search across every setting */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            className="ps-9 pe-16 h-9 text-xs bg-background/90 rounded-xl"
            value={searchQuery}
            aria-label={isAr ? "ابحث في الإعدادات" : "Search settings"}
            placeholder={
              isAr
                ? "ابحث في الإعدادات: الشعار، بنفت باي، الضريبة..."
                : "Search settings: logo, BenefitPay, tax..."
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
