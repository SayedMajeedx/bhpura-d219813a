import * as React from "react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandAddons } from "@/hooks/use-brand-addons";
import { getAllAddons, starterPackFor, dependentsOf } from "@/lib/addons/addon-registry";
import type {
  AddonId,
  BrandAddonRow,
  AddonManifest,
  AddonSettingsField,
} from "@/lib/addons/addon-types";
import type { StoreVertical } from "@/lib/store-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Puzzle,
  Search,
  Power,
  Settings as SettingsIcon,
  Trash2,
  AlertTriangle,
  ArrowUpCircle,
  History,
  Lock,
  Sparkles,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddonStoreProps {
  brandId: string;
  slug: string;
  storeVertical?: StoreVertical | null;
}

export function AddonStore({ brandId, slug: _slug, storeVertical }: AddonStoreProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const {
    addons: installedRows,
    events,
    policies: _policies,
    isLoading: _isLoading,
    isMutating,
    installAddon,
    disableAddon,
    enableAddon,
    uninstallAddon,
    updateSettings,
    upgradeBrandAddons,
  } = useBrandAddons(brandId);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "installed" | "recommended">("all");
  const [selectedKind, setSelectedKind] = useState<"all" | "feature" | "pack">("all");

  // Modals state
  const [settingsModalAddon, setSettingsModalAddon] = useState<AddonManifest | null>(null);
  const [settingsForm, setSettingsForm] = useState<Record<string, unknown>>({});
  const [purgeModalAddon, setPurgeModalAddon] = useState<AddonManifest | null>(null);
  const [purgeConfirmationText, setPurgeConfirmationText] = useState("");
  const [showEventsDialog, setShowEventsDialog] = useState(false);

  const allManifests = React.useMemo(() => getAllAddons(), []);

  // Compute installed map
  const installedMap = React.useMemo(() => {
    const map = new Map<string, BrandAddonRow>();
    for (const row of installedRows) {
      map.set(row.addon_id, row);
    }
    return map;
  }, [installedRows]);

  // Compute starter pack recommendations
  const starterPack = React.useMemo(() => {
    if (!storeVertical) return { required: [] as AddonId[], suggested: [] as AddonId[] };
    return starterPackFor(storeVertical);
  }, [storeVertical]);

  const recommendedIds = React.useMemo(() => {
    return new Set<string>([...starterPack.required, ...starterPack.suggested]);
  }, [starterPack]);

  // Check if any installed addon has an upgrade available
  const pendingUpgrades = React.useMemo(() => {
    return installedRows.filter((row) => {
      const manifest = allManifests.find((m) => m.id === row.addon_id);
      return manifest && row.version < manifest.version;
    });
  }, [installedRows, allManifests]);

  // Filtered manifests
  const filteredManifests = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allManifests.filter((m) => {
      const installed = installedMap.get(m.id);
      const isInstalled = Boolean(installed);

      // Tab filter
      if (activeTab === "installed" && !isInstalled) return false;
      if (activeTab === "recommended" && !recommendedIds.has(m.id)) return false;

      // Kind filter
      if (selectedKind !== "all" && m.kind !== selectedKind) return false;

      // Search query
      if (!q) return true;
      const nameAr = m.name.ar.toLowerCase();
      const nameEn = m.name.en.toLowerCase();
      const descAr = m.description.ar.toLowerCase();
      const descEn = m.description.en.toLowerCase();

      return (
        nameAr.includes(q) ||
        nameEn.includes(q) ||
        descAr.includes(q) ||
        descEn.includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    });
  }, [allManifests, installedMap, activeTab, selectedKind, searchQuery, recommendedIds]);

  // Open settings modal
  const handleOpenSettings = (manifest: AddonManifest) => {
    const row = installedMap.get(manifest.id);
    setSettingsModalAddon(manifest);
    setSettingsForm(row?.settings || {});
  };

  const handleSaveSettings = async () => {
    if (!settingsModalAddon) return;
    try {
      await updateSettings({
        addonId: settingsModalAddon.id,
        settings: settingsForm,
      });
      toast.success(isAr ? "تم حفظ إعدادات الإضافة بنجاح" : "Add-on settings saved");
      setSettingsModalAddon(null);
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل حفظ الإعدادات" : "Failed to save settings"));
    }
  };

  // Safe uninstall (no purge)
  const handleUninstall = async (manifest: AddonManifest) => {
    const installedIds = Array.from(installedMap.keys()) as AddonId[];
    const dependents = dependentsOf(manifest.id, installedIds);
    if (dependents.length > 0) {
      toast.error(
        isAr
          ? `لا يمكن إزالة هذه الإضافة لأن الإضافات التالية تعتمد عليها: ${dependents.join(", ")}`
          : `Cannot remove: required by ${dependents.join(", ")}`,
      );
      return;
    }

    try {
      await uninstallAddon({
        addonId: manifest.id,
        purge: false,
      });
      toast.success(isAr ? "تم إزالة الإضافة بنجاح" : "Add-on removed successfully");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل إزالة الإضافة" : "Failed to remove add-on"));
    }
  };

  // Safe purge execution
  const handleConfirmPurge = async () => {
    if (!purgeModalAddon) return;
    const expected = isAr ? purgeModalAddon.name.ar : purgeModalAddon.name.en;
    if (
      purgeConfirmationText.trim() !== expected &&
      purgeConfirmationText.trim() !== purgeModalAddon.id
    ) {
      toast.error(
        isAr ? "اسم الإضافة المدخل غير مطابق للتأكيد" : "Confirmation text does not match",
      );
      return;
    }

    try {
      await uninstallAddon({
        addonId: purgeModalAddon.id,
        purge: true,
      });
      toast.success(
        isAr ? "تم إزالة الإضافة وحذف بياناتها بنجاح" : "Add-on and its data purged successfully",
      );
      setPurgeModalAddon(null);
      setPurgeConfirmationText("");
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل حذف بيانات الإضافة" : "Failed to purge add-on data"));
    }
  };

  // Upgrade all pending
  const handleUpgradeAll = async () => {
    try {
      const res = await upgradeBrandAddons();
      toast.success(
        isAr
          ? `تم تحديث ${res.upgraded.length} إضافة بنجاح`
          : `Upgraded ${res.upgraded.length} add-on(s) successfully`,
      );
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل التحديث" : "Upgrade failed"));
    }
  };

  // Install starter pack missing items
  const missingStarterCount = React.useMemo(() => {
    return starterPack.required.filter((id) => !installedMap.has(id)).length;
  }, [starterPack, installedMap]);

  const handleInstallStarterPack = async () => {
    try {
      for (const addonId of starterPack.required) {
        if (!installedMap.has(addonId)) {
          await installAddon({ addonId, withDependencies: true });
        }
      }
      toast.success(
        isAr
          ? "تم تثبيت إضافات حزمة البداية لنشاطك بنجاح"
          : "Starter pack add-ons installed successfully",
      );
    } catch (err: any) {
      toast.error(err.message || (isAr ? "فشل تثبيت الحزمة" : "Failed to install starter pack"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Upgrades Alert */}
      {pendingUpgrades.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ArrowUpCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground">
                {isAr
                  ? `يوجد ${pendingUpgrades.length} تحديث متوفر للإضافات المثبتة`
                  : `${pendingUpgrades.length} add-on upgrade(s) available`}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "تتضمن التحديثات تحسينات أداء وإصلاحات لميزات المتجر."
                  : "Updates include stability and performance enhancements."}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleUpgradeAll}
            disabled={isMutating}
            className="shrink-0 gap-2 font-medium"
          >
            <ArrowUpCircle className="size-4" />
            <span>{isAr ? "تحديث الكل الآن" : "Upgrade All Now"}</span>
          </Button>
        </div>
      )}

      {/* Starter Pack Recommendation Callout */}
      {storeVertical && missingStarterCount > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {isAr ? "حزمة البداية المقترحة لنشاطك" : "Recommended Starter Pack"}
                </span>
                <Badge variant="outline" className="text-xs">
                  {storeVertical}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? `متبقي ${missingStarterCount} إضافات أساسية مستحسنة لنشاط ${storeVertical}.`
                  : `${missingStarterCount} essential add-on(s) remaining for your vertical.`}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleInstallStarterPack}
            disabled={isMutating}
            className="shrink-0 gap-1.5 border-border"
          >
            <Sparkles className="size-3.5 text-primary" />
            <span>{isAr ? "تثبيت الإضافات المتبقية" : "Install Missing Add-ons"}</span>
          </Button>
        </div>
      )}

      {/* Controls & Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              isAr ? "ابحث عن إضافة بالاسم أو الوظيفة..." : "Search add-ons by name or feature..."
            }
            className="h-10 ps-10 pe-4 rounded-xl border-border bg-muted/20 text-sm focus-visible:ring-primary"
          />
        </div>

        {/* Action Controls & Audit button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEventsDialog(true)}
            className="gap-1.5 h-10 rounded-xl border-border shrink-0"
          >
            <History className="size-4 text-muted-foreground" />
            <span>{isAr ? "سجل النشاطات" : "Audit Log"}</span>
            {events.length > 0 && (
              <Badge variant="secondary" className="ms-1 px-1.5 py-0 text-xs">
                {events.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs & Categories */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        {/* Main Tabs */}
        <div className="flex items-center gap-1.5">
          <Button
            variant={activeTab === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("all")}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            {isAr ? "جميع الإضافات" : "All Add-ons"}
            <span className="ms-1.5 rounded-full bg-background/20 px-1.5 py-0.2 text-xs">
              {allManifests.length}
            </span>
          </Button>
          <Button
            variant={activeTab === "installed" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("installed")}
            className="h-9 rounded-xl text-xs font-semibold"
          >
            {isAr ? "المثبتة" : "Installed"}
            <span className="ms-1.5 rounded-full bg-background/20 px-1.5 py-0.2 text-xs">
              {installedRows.length}
            </span>
          </Button>
          {storeVertical && (
            <Button
              variant={activeTab === "recommended" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("recommended")}
              className="h-9 rounded-xl text-xs font-semibold"
            >
              {isAr ? "موصى به لنشاطك" : "Recommended"}
              <span className="ms-1.5 rounded-full bg-background/20 px-1.5 py-0.2 text-xs">
                {recommendedIds.size}
              </span>
            </Button>
          )}
        </div>

        {/* Kind Pills */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto scrollbar-none">
          <Button
            variant={selectedKind === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedKind("all")}
            className="h-8 rounded-lg text-xs"
          >
            {isAr ? "الكل" : "All"}
          </Button>
          <Button
            variant={selectedKind === "feature" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedKind("feature")}
            className="h-8 rounded-lg text-xs whitespace-nowrap"
          >
            {isAr ? "ميزات متخصصة" : "Features"}
          </Button>
          <Button
            variant={selectedKind === "pack" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSelectedKind("pack")}
            className="h-8 rounded-lg text-xs whitespace-nowrap"
          >
            {isAr ? "حزم الأنشطة" : "Packs"}
          </Button>
        </div>
      </div>

      {/* Grid of Addons */}
      {filteredManifests.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Puzzle className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">
            {isAr ? "لا توجد إضافات تطابق البحث" : "No add-ons found"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "جرّب كلمات بحث مختلفة أو غيّر التبويب الحالي."
              : "Try another search term or switch filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredManifests.map((manifest) => {
            const installedRow = installedMap.get(manifest.id);
            const isInstalled = Boolean(installedRow);
            const isDisabled = installedRow?.status === "disabled";
            const isRecommended = recommendedIds.has(manifest.id);
            const hasUpdate = isInstalled && (installedRow?.version || 0) < manifest.version;

            return (
              <div
                key={manifest.id}
                className={cn(
                  "flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm",
                  isInstalled && !isDisabled && "border-primary/40",
                  isDisabled && "opacity-75 bg-muted/20",
                )}
              >
                <div>
                  {/* Top Header: Category, Status, Menu */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0">
                        <Puzzle className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {isAr ? manifest.name.ar : manifest.name.en}
                          </span>
                          {isRecommended && (
                            <Badge
                              variant="outline"
                              className="text-xs h-4 py-0 text-primary border-primary/30"
                            >
                              {isAr ? "موصى به" : "Recommended"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span>v{manifest.version}</span>
                          <span>•</span>
                          <span className="capitalize">
                            {manifest.kind === "pack"
                              ? isAr
                                ? "حزمة"
                                : "Pack"
                              : isAr
                                ? "ميزة"
                                : "Feature"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Installed Menu */}
                    {isInstalled && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48">
                          {manifest.settingsSchema && (
                            <DropdownMenuItem
                              onClick={() => handleOpenSettings(manifest)}
                              className="gap-2 cursor-pointer"
                            >
                              <SettingsIcon className="h-4 w-4" />
                              <span>{isAr ? "إعدادات الإضافة" : "Configure Settings"}</span>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            onClick={async () => {
                              if (isDisabled) {
                                await enableAddon({ addonId: manifest.id });
                                toast.success(isAr ? "تم تفعيل الإضافة" : "Add-on enabled");
                              } else {
                                await disableAddon({ addonId: manifest.id });
                                toast.info(isAr ? "تم تعطيل الإضافة مؤقتاً" : "Add-on disabled");
                              }
                            }}
                            className="gap-2 cursor-pointer"
                          >
                            <Power className="h-4 w-4" />
                            <span>
                              {isDisabled
                                ? isAr
                                  ? "تفعيل الإضافة"
                                  : "Enable Add-on"
                                : isAr
                                  ? "تعطيل مؤقت"
                                  : "Disable Add-on"}
                            </span>
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => handleUninstall(manifest)}
                            className="gap-2 text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>{isAr ? "إلغاء التثبيت" : "Uninstall"}</span>
                          </DropdownMenuItem>

                          {manifest.purge && (
                            <DropdownMenuItem
                              onClick={() => {
                                setPurgeModalAddon(manifest);
                                setPurgeConfirmationText("");
                              }}
                              className="gap-2 text-destructive cursor-pointer font-medium"
                            >
                              <AlertTriangle className="h-4 w-4" />
                              <span>{isAr ? "حذف البيانات نهائياً" : "Purge Business Data"}</span>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  {/* Description */}
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {isAr ? manifest.description.ar : manifest.description.en}
                  </p>

                  {/* Requirements / Dependencies indicator */}
                  {manifest.requires && manifest.requires.length > 0 && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 shrink-0" />
                      <span>
                        {isAr ? "يتطلب:" : "Requires:"}{" "}
                        <span className="font-medium text-foreground">
                          {manifest.requires.join(", ")}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div>
                    {isInstalled ? (
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "size-2 rounded-full",
                            isDisabled ? "bg-amber-500" : "bg-emerald-500",
                          )}
                        />
                        <span className="text-xs font-medium text-foreground">
                          {isDisabled
                            ? isAr
                              ? "معطّل مؤقتاً"
                              : "Disabled"
                            : isAr
                              ? "مثبّت ونشط"
                              : "Active"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {isAr ? "مجاني بالكامل" : "Free"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isInstalled ? (
                      <>
                        {hasUpdate && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUpgradeAll}
                            disabled={isMutating}
                            className="h-8 gap-1 text-xs border-primary/40 text-primary"
                          >
                            <ArrowUpCircle className="size-3.5" />
                            <span>{isAr ? "تحديث" : "Upgrade"}</span>
                          </Button>
                        )}
                        {manifest.settingsSchema && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenSettings(manifest)}
                            className="h-8 gap-1.5 text-xs border-border"
                          >
                            <SettingsIcon className="size-3.5" />
                            <span>{isAr ? "الإعدادات" : "Settings"}</span>
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await installAddon({
                              addonId: manifest.id,
                              withDependencies: true,
                            });
                            toast.success(
                              isAr
                                ? `تم تثبيت ${manifest.name.ar} بنجاح`
                                : `${manifest.name.en} installed successfully`,
                            );
                          } catch (err: any) {
                            toast.error(err.message || (isAr ? "فشل التثبيت" : "Install failed"));
                          }
                        }}
                        disabled={isMutating}
                        className="h-8 gap-1.5 text-xs font-medium"
                      >
                        <Puzzle className="size-3.5" />
                        <span>{isAr ? "تثبيت الإضافة" : "Install"}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Settings Dialog */}
      <Dialog
        open={Boolean(settingsModalAddon)}
        onOpenChange={(open) => !open && setSettingsModalAddon(null)}
      >
        <DialogContent className="max-w-lg rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <SettingsIcon className="size-5 text-primary" />
              <span>
                {isAr ? "إعدادات الإضافة:" : "Configure Add-on:"}{" "}
                {settingsModalAddon &&
                  (isAr ? settingsModalAddon.name.ar : settingsModalAddon.name.en)}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "تخصيص سلوك الإضافة وخيارات العرض للعملاء والواجهة."
                : "Customize add-on behavior and options for customers and storefront."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {settingsModalAddon?.settingsSchema?.map((field: AddonSettingsField) => {
              const val = settingsForm[field.key] ?? field.default;

              if (field.type === "boolean") {
                return (
                  <div
                    key={field.key}
                    className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20"
                  >
                    <div>
                      <Label htmlFor={field.key} className="text-sm font-semibold cursor-pointer">
                        {isAr ? field.label.ar : field.label.en}
                      </Label>
                    </div>
                    <Switch
                      id={field.key}
                      checked={Boolean(val)}
                      onCheckedChange={(checked) =>
                        setSettingsForm((prev) => ({ ...prev, [field.key]: checked }))
                      }
                    />
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={field.key} className="text-xs font-semibold">
                      {isAr ? field.label.ar : field.label.en}
                    </Label>
                    <Select
                      value={String(val ?? "")}
                      onValueChange={(newVal) =>
                        setSettingsForm((prev) => ({ ...prev, [field.key]: newVal }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl border-border bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {isAr ? opt.label.ar : opt.label.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              return (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key} className="text-xs font-semibold">
                    {isAr ? field.label.ar : field.label.en}
                  </Label>
                  <Input
                    id={field.key}
                    value={String(val ?? "")}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="h-10 rounded-xl border-border bg-background"
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSettingsModalAddon(null)}
              className="rounded-xl border-border"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button onClick={handleSaveSettings} disabled={isMutating} className="rounded-xl">
              {isAr ? "حفظ التغييرات" : "Save Settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Explicit Purge Confirmation Dialog */}
      <Dialog
        open={Boolean(purgeModalAddon)}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeModalAddon(null);
            setPurgeConfirmationText("");
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl border-destructive/30 bg-card">
          <DialogHeader>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-2">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-destructive">
              {isAr ? "تأكيد حذف بيانات الإضافة نهائياً" : "Confirm Permanent Data Purge"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {isAr
                ? `أنت على وشك حذف جميع البيانات والجداول المرتبطة بـ (${purgeModalAddon ? purgeModalAddon.name.ar : ""}) نهائياً من قاعدة بيانات متجرك. هذا الإجراء لا يمكن التراجع عنه.`
                : `You are about to permanently delete all stored data associated with this add-on from your store. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="text-xs font-medium text-foreground">
              {isAr ? (
                <>
                  لتأكيد الحذف، اكتب{" "}
                  <span className="font-bold text-destructive">{purgeModalAddon?.name.ar}</span> في
                  الحقل أدناه:
                </>
              ) : (
                <>
                  Type{" "}
                  <span className="font-bold text-destructive">{purgeModalAddon?.name.en}</span>{" "}
                  below to confirm:
                </>
              )}
            </p>
            <Input
              value={purgeConfirmationText}
              onChange={(e) => setPurgeConfirmationText(e.target.value)}
              placeholder={
                purgeModalAddon ? (isAr ? purgeModalAddon.name.ar : purgeModalAddon.name.en) : ""
              }
              className="h-10 rounded-xl border-destructive/40 bg-background"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setPurgeModalAddon(null);
                setPurgeConfirmationText("");
              }}
              className="rounded-xl border-border"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmPurge}
              disabled={isMutating}
              className="rounded-xl"
            >
              {isAr ? "تأكيد وحذف البيانات نهائياً" : "Confirm Permanent Purge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Events / Audit Log Dialog */}
      <Dialog open={showEventsDialog} onOpenChange={setShowEventsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border-border bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <History className="size-5 text-primary" />
              <span>{isAr ? "سجل نشاطات وإضافات المتجر" : "Add-on Events & Audit Log"}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {isAr
                ? "سجل توثيقي لجميع عمليات التثبيت والتحديث والتعطيل والإزالة."
                : "A verified record of all add-on installs, upgrades, and status updates."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3">
            {events.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {isAr ? "لا توجد نشاطات مسجلة بعد." : "No events recorded yet."}
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/15 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge
                      variant={
                        event.action === "install"
                          ? "default"
                          : event.action === "purge"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs h-5 py-0 capitalize"
                    >
                      {event.action}
                    </Badge>
                    <span className="font-semibold text-foreground">{event.addon_id}</span>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">{event.source || "manual"}</span>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    {new Date(event.created_at).toLocaleString(isAr ? "ar-BH" : "en-US", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
