import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ShieldCheck,
  Check,
  ArrowUpCircle,
  MoreVertical,
  Settings as SettingsIcon,
  Power,
  Trash2,
  AlertTriangle,
  Ruler,
  Scissors,
  Crown,
  Shirt,
  Sparkles,
  Coffee,
  UtensilsCrossed,
  Download,
  Gift,
  Printer,
  Gem,
  Puzzle,
  UserCheck,
} from "lucide-react";
import type { AddonId, AddonManifest, BrandAddonRow } from "@/lib/addons/addon-types";
import { ADDON_SHOWCASE_DATA } from "@/lib/addons/addon-showcase-data";
import { cn } from "@/lib/utils";

interface AddonCardMicrosoftStoreProps {
  manifest: AddonManifest;
  installedRow?: BrandAddonRow;
  isRecommended?: boolean;
  isAr: boolean;
  onSelect: (addonId: AddonId) => void;
  onInstall: (manifest: AddonManifest) => void;
  onOpenSettings: (manifest: AddonManifest) => void;
  onToggleStatus: (manifest: AddonManifest, disable: boolean) => void;
  onUninstall: (manifest: AddonManifest) => void;
  onPurge: (manifest: AddonManifest) => void;
  isMutating: boolean;
}

export function AddonCardMicrosoftStore({
  manifest,
  installedRow,
  isRecommended,
  isAr,
  onSelect,
  onInstall,
  onOpenSettings,
  onToggleStatus,
  onUninstall,
  onPurge,
  isMutating,
}: AddonCardMicrosoftStoreProps) {
  const isInstalled = Boolean(installedRow);
  const isDisabled = installedRow?.status === "disabled";
  const hasUpdate = isInstalled && (installedRow?.version || 0) < manifest.version;

  const showcase = ADDON_SHOWCASE_DATA[manifest.id];
  const publisher = showcase?.publisher
    ? isAr
      ? showcase.publisher.ar
      : showcase.publisher.en
    : isAr
      ? "فريق Boutq"
      : "Boutq Official";

  const getAddonIcon = (id: AddonId) => {
    switch (id) {
      case "size-guides":
        return <Ruler className="h-6 w-6" />;
      case "fit-passport":
        return <UserCheck className="h-6 w-6" />;
      case "made-to-order":
        return <Scissors className="h-6 w-6" />;
      case "abaya-pack":
        return <Crown className="h-6 w-6" />;
      case "fashion-core":
        return <Shirt className="h-6 w-6" />;
      case "beauty-perfume":
        return <Sparkles className="h-6 w-6" />;
      case "coffee-roastery":
        return <Coffee className="h-6 w-6" />;
      case "food-beverage":
        return <UtensilsCrossed className="h-6 w-6" />;
      case "digital-products":
        return <Download className="h-6 w-6" />;
      case "gifts":
        return <Gift className="h-6 w-6" />;
      case "print-stamps":
        return <Printer className="h-6 w-6" />;
      case "jewelry":
        return <Gem className="h-6 w-6" />;
      default:
        return <Puzzle className="h-6 w-6" />;
    }
  };

  return (
    <div
      onClick={() => onSelect(manifest.id)}
      className={cn(
        "group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md",
        isInstalled && !isDisabled && "border-primary/30 bg-card/95",
        isDisabled && "opacity-75 bg-muted/20",
      )}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* App Icon */}
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold shrink-0 transition-transform group-hover:scale-105 shadow-xs">
              {getAddonIcon(manifest.id)}
            </div>

            {/* App Info */}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                  {isAr ? manifest.name.ar : manifest.name.en}
                </h3>
                {isRecommended && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 py-0 px-1.5 text-primary border-primary/30 shrink-0 font-medium"
                  >
                    {isAr ? "موصى به" : "Recommended"}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="truncate">{publisher}</span>
                <span>•</span>
                <span className="capitalize">
                  {manifest.kind === "pack"
                    ? isAr
                      ? "حزمة نشاط"
                      : "Pack"
                    : isAr
                      ? "ميزة"
                      : "Feature"}
                </span>
              </div>
            </div>
          </div>

          {/* Installed Dropdown Menu (does not bubble click to card) */}
          {isInstalled && (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48">
                  {manifest.settingsSchema && (
                    <DropdownMenuItem
                      onClick={() => onOpenSettings(manifest)}
                      className="gap-2 cursor-pointer text-xs"
                    >
                      <SettingsIcon className="h-3.5 w-3.5" />
                      <span>{isAr ? "إعدادات الإضافة" : "Configure Settings"}</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem
                    onClick={() => onToggleStatus(manifest, !isDisabled)}
                    className="gap-2 cursor-pointer text-xs"
                  >
                    <Power className="h-3.5 w-3.5" />
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
                    onClick={() => onUninstall(manifest)}
                    className="gap-2 text-destructive cursor-pointer text-xs"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? "إلغاء التثبيت" : "Uninstall"}</span>
                  </DropdownMenuItem>

                  {manifest.purge && (
                    <DropdownMenuItem
                      onClick={() => onPurge(manifest)}
                      className="gap-2 text-destructive cursor-pointer font-medium text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{isAr ? "حذف البيانات نهائياً" : "Purge Data"}</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Category & Badge */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge
            variant="outline"
            className="text-[10px] h-4 py-0 px-1.5 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5 font-medium flex items-center gap-1"
          >
            <ShieldCheck className="h-2.5 w-2.5" />
            <span>{isAr ? "إضافة رسمية" : "Official"}</span>
          </Badge>
          {showcase?.categoryLabel && (
            <>
              <span className="text-muted-foreground/60">•</span>
              <span className="text-[11px] text-muted-foreground truncate">
                {isAr ? showcase.categoryLabel.ar : showcase.categoryLabel.en}
              </span>
            </>
          )}
        </div>

        {/* Short Description */}
        <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {showcase?.tagline
            ? isAr
              ? showcase.tagline.ar
              : showcase.tagline.en
            : isAr
              ? manifest.description.ar
              : manifest.description.en}
        </p>
      </div>

      {/* Card Footer: Status & Action Button */}
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
                {isDisabled ? (isAr ? "معطّل" : "Disabled") : isAr ? "مثبّت" : "Installed"}
              </span>
            </div>
          ) : (
            <span className="text-xs font-semibold text-primary">
              {isAr ? "مجاني مشمول" : "Included Free"}
            </span>
          )}
        </div>

        {/* Quick Action */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {hasUpdate && (
            <Badge
              variant="outline"
              className="gap-1 text-[11px] text-primary border-primary/30 bg-primary/5"
            >
              <ArrowUpCircle className="h-3 w-3" />
              <span>{isAr ? "تحديث" : "Update"}</span>
            </Badge>
          )}

          {!isInstalled ? (
            <Button
              size="sm"
              disabled={isMutating}
              onClick={() => onInstall(manifest)}
              className="h-8 rounded-lg px-3 text-xs font-medium gap-1.5 shadow-none"
            >
              <span>{isAr ? "تثبيت" : "Get"}</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelect(manifest.id)}
              className="h-8 rounded-lg px-3 text-xs font-medium border-border hover:bg-muted/50"
            >
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 me-1" />
              <span>{isAr ? "عرض التفاصيل" : "Details"}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
