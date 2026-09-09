import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  TrustBadgesConfig,
  TrustBadgeItem,
  BADGE_COLOR_PRESETS,
  renderTrustBadgeIcon,
} from "@/lib/trust-badges";
import { TrustBadgeIconPicker } from "@/components/settings/TrustBadgeIconPicker";
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  Eye,
  Sparkles,
  Smartphone,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TrustBadgesEditorProps {
  value: TrustBadgesConfig;
  onChange: (value: TrustBadgesConfig) => void;
  isAr?: boolean;
  footerBg?: string | null;
  footerFg?: string | null;
}

export function TrustBadgesEditor({
  value,
  onChange,
  isAr = true,
  footerBg,
  footerFg,
}: TrustBadgesEditorProps) {
  const items = value.items || [];
  const isEnabled = value.enabled ?? true;

  const handleToggleGlobal = (enabled: boolean) => {
    onChange({ ...value, enabled });
  };

  const handleAddItem = () => {
    if (items.length >= 8) return;
    const newItem: TrustBadgeItem = {
      id: `badge-${Date.now()}`,
      icon: "ShieldCheck",
      text_ar: isAr ? "خدمة موثوقة ومضمونة" : "Trusted & Guaranteed",
      text_en: "Trusted & Guaranteed Service",
      color: "emerald",
      enabled: true,
    };
    onChange({ ...value, items: [...items, newItem] });
  };

  const handleRemoveItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange({ ...value, items: next });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    onChange({ ...value, items: next });
  };

  const handleUpdateItem = (index: number, patch: Partial<TrustBadgeItem>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange({ ...value, items: next });
  };

  return (
    <div className="space-y-5 rounded-xl border border-border p-4 bg-card shadow-sm" dir={isAr ? "rtl" : "ltr"}>
      {/* Top Header & Global Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">
              {isAr ? "شارات الطمأنينة والأمان في التذييل (Trust Badges)" : "Footer Reassurance & Trust Badges"}
            </h3>
            <Badge variant="outline" className="text-[10px] font-normal border-primary/40 text-primary">
              {isAr ? "شريط الفوتر" : "Footer Reassurance"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تخصيص الشارات والأيقونات المعروضة أسفل صفحة المتجر لتعزيز ثقة العميل (أصالة التصاميم، طرق الدفع، التشفير، التوصيل)."
              : "Customize the reassurance badges and icons shown at the bottom of your storefront to boost customer confidence."}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center bg-muted/40 p-2 rounded-xl border border-border/60">
          <Label htmlFor="toggle-trust-badges" className="text-xs font-semibold cursor-pointer">
            {isAr ? "إظهار شريط الشارات" : "Show Badges Bar"}
          </Label>
          <Switch
            id="toggle-trust-badges"
            checked={isEnabled}
            onCheckedChange={handleToggleGlobal}
          />
        </div>
      </div>

      {isEnabled && (
        <>
          {/* Badges List */}
          <div className="space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-8 rounded-xl border border-dashed border-border p-6 bg-muted/20 space-y-2">
                <Sparkles className="h-6 w-6 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">
                  {isAr ? "لم تتم إضافة شارات بعد. اضغط أدناه لإضافة شارتك الأولى." : "No badges configured yet. Click below to add your first."}
                </p>
              </div>
            ) : (
              items.map((item, index) => (
                <div
                  key={item.id || index}
                  className={cn(
                    "rounded-xl border p-3.5 bg-background/60 transition-all space-y-3",
                    item.enabled ? "border-border shadow-2xs" : "border-border/40 opacity-60 bg-muted/20"
                  )}
                >
                  {/* Item Row 1: Ordering + Icon Selector + Active Switch + Delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      {/* Order Controls */}
                      <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 border border-border/50">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === 0}
                          onClick={() => handleMove(index, "up")}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={isAr ? "تحريك لأعلى" : "Move up"}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={index === items.length - 1}
                          onClick={() => handleMove(index, "down")}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          title={isAr ? "تحريك لأسفل" : "Move down"}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <span className="text-xs font-semibold text-muted-foreground min-w-[20px]">
                        #{index + 1}
                      </span>

                      {/* Searchable Icon Dropdown */}
                      <TrustBadgeIconPicker
                        value={item.icon}
                        onChange={(iconKey) => handleUpdateItem(index, { icon: iconKey })}
                        colorId={item.color}
                        isAr={isAr}
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Color Presets */}
                      <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/50">
                        {BADGE_COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => handleUpdateItem(index, { color: preset.id })}
                            title={isAr ? preset.label_ar : preset.label_en}
                            className={cn(
                              "h-5 w-5 rounded-full transition-all flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring",
                              item.color === preset.id
                                ? "ring-2 ring-primary ring-offset-1 scale-110"
                                : "opacity-70 hover:opacity-100"
                            )}
                            style={{ backgroundColor: preset.dotColor }}
                          />
                        ))}
                      </div>

                      {/* Toggle Active */}
                      <div className="flex items-center gap-1.5">
                        <Switch
                          checked={item.enabled}
                          onCheckedChange={(checked) => handleUpdateItem(index, { enabled: checked })}
                          aria-label={isAr ? "تفعيل الشارة" : "Toggle badge"}
                        />
                      </div>

                      {/* Remove Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveItem(index)}
                        className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                        title={isAr ? "حذف الشارة" : "Remove badge"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Item Row 2: Bilingual Text Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div dir="rtl" className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-medium">
                        {isAr ? "النص بالعربية" : "Arabic Text"}
                      </Label>
                      <Input
                        value={item.text_ar || ""}
                        onChange={(e) => handleUpdateItem(index, { text_ar: e.target.value })}
                        placeholder={isAr ? "مثال: تصاميم حصرية خاصّة بنا" : "e.g. Exclusive In-House Designs"}
                        className="h-9 text-xs text-right bg-background border-border"
                      />
                    </div>
                    <div dir="ltr" className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground font-medium">
                        {isAr ? "النص بالإنجليزية" : "English Text"}
                      </Label>
                      <Input
                        value={item.text_en || ""}
                        onChange={(e) => handleUpdateItem(index, { text_en: e.target.value })}
                        placeholder="e.g. Exclusive In-House Designs"
                        className="h-9 text-xs text-left bg-background border-border"
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Add Badge Button */}
          {items.length < 8 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="w-full gap-2 border-dashed border-border py-2 text-xs font-semibold hover:border-primary/50"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span>{isAr ? "إضافة شارة طمأنينة جديدة" : "Add New Trust Badge"}</span>
              <span className="text-[10px] text-muted-foreground font-normal">
                ({items.length}/8)
              </span>
            </Button>
          )}

          {/* Live Storefront Preview */}
          <div className="mt-4 rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Eye className="h-3.5 w-3.5 text-primary" />
                {isAr ? "معاينة حية لشكل الفوتر بالمتجر" : "Live Storefront Footer Preview"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {isAr ? "تنعكس فورياً على المتجر" : "Reflected live on storefront"}
              </span>
            </div>

            {/* Simulated Desktop Preview */}
            <div
              className="rounded-xl border border-white/10 p-4 overflow-hidden"
              style={{
                backgroundColor: footerBg || "#121212",
                color: footerFg || "#ffffff",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider opacity-50 mb-2 flex items-center gap-1 font-mono">
                <Monitor className="h-3 w-3" />
                {isAr ? "العرض على الكمبيوتر (Desktop)" : "Desktop View"}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-2.5 px-4 text-[11px] font-medium border-y border-white/10 rounded-xl bg-white/5 backdrop-blur-xs max-w-3xl mx-auto">
                {items
                  .filter((b) => b.enabled)
                  .map((badge, idx) => (
                    <div key={badge.id || idx} className="inline-flex items-center gap-1.5">
                      {renderTrustBadgeIcon(badge.icon, "h-3.5 w-3.5", badge.color)}
                      <span className="opacity-95">
                        {isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}
                      </span>
                    </div>
                  ))}
              </div>

              {/* Simulated Mobile Preview */}
              <div className="mt-4 pt-3 border-t border-white/10">
                <div className="text-[10px] uppercase tracking-wider opacity-50 mb-2 flex items-center gap-1 font-mono">
                  <Smartphone className="h-3 w-3" />
                  {isAr ? "العرض على شاشة الجوال (Mobile Grid)" : "Mobile Grid View"}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs max-w-sm mx-auto">
                  {items
                    .filter((b) => b.enabled)
                    .map((badge, idx) => (
                      <div
                        key={badge.id || idx}
                        className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xs p-2.5 flex flex-col items-center justify-center text-center gap-1.5 min-h-[64px]"
                      >
                        {renderTrustBadgeIcon(badge.icon, "h-4 w-4", badge.color)}
                        <span className="text-[10px] font-medium opacity-95 line-clamp-2">
                          {isAr ? badge.text_ar || badge.text_en : badge.text_en || badge.text_ar}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
