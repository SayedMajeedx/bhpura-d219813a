import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useBrandSettingsFormContext } from "@/features/settings/use-brand-settings-form";
import { AdvancedOnly } from "@/features/settings/FieldVisibility";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  type ShippingZone,
  COUNTRIES_DATABASE,
  GCC_NON_BH_CODES,
  ARAB_CODES,
  getCountryByCode,
  getShippingPricingDescription,
} from "@/lib/shipping";
import { CountryFlag } from "@/components/ui/country-flag";
import { Banknote, CreditCard, Plus, QrCode, Sparkles, Trash2, Truck } from "lucide-react";

export function FulfillmentGroup() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { form, setBs } = useBrandSettingsFormContext();
  const bs = form.bs;

  const rawZones = bs.shipping_zones;
  const zones: ShippingZone[] = Array.isArray(rawZones)
    ? (rawZones as unknown as ShippingZone[])
    : [];

  const [isAddZoneOpen, setIsAddZoneOpen] = useState(false);
  const [newZone, setNewZone] = useState<{
    name_en: string;
    name_ar: string;
    countries: string[];
    pricing_type: "flat" | "per_piece" | "bundle";
    fee: string;
    bundle_size: number;
    estimate_ar: string;
    estimate_en: string;
    allowed_payment_methods: Array<"cod" | "card" | "benefit">;
  }>({
    name_en: "",
    name_ar: "",
    countries: [],
    pricing_type: "flat",
    fee: "5",
    bundle_size: 2,
    estimate_ar: "",
    estimate_en: "",
    allowed_payment_methods: ["card", "benefit"],
  });

  const toggleCountry = (code: string) => {
    setNewZone((prev) => {
      const exists = prev.countries.includes(code);
      const next = exists ? prev.countries.filter((c) => c !== code) : [...prev.countries, code];
      let autoAr = prev.name_ar;
      let autoEn = prev.name_en;
      if (!exists && prev.countries.length === 0) {
        const country = getCountryByCode(code);
        if (country) {
          autoAr = country.name_ar;
          autoEn = country.name_en;
        }
      }
      return { ...prev, countries: next, name_ar: autoAr, name_en: autoEn };
    });
  };

  const applyGccPreset = () => {
    setIsAddZoneOpen(true);
    setNewZone((prev) => ({
      ...prev,
      countries: GCC_NON_BH_CODES,
      name_ar: prev.name_ar || "دول الخليج العربي",
      name_en: prev.name_en || "GCC Countries",
      fee: prev.fee !== "" ? prev.fee : "5",
      estimate_ar: prev.estimate_ar || "خلال 3 - 5 أيام عمل",
      estimate_en: prev.estimate_en || "3 - 5 business days",
    }));
  };

  const applyArabPreset = () => {
    setIsAddZoneOpen(true);
    setNewZone((prev) => ({
      ...prev,
      countries: ARAB_CODES,
      name_ar: prev.name_ar || "الدول العربية",
      name_en: prev.name_en || "Arab Countries",
      fee: prev.fee !== "" ? prev.fee : "7",
      estimate_ar: prev.estimate_ar || "خلال 5 - 7 أيام عمل",
      estimate_en: prev.estimate_en || "5 - 7 business days",
    }));
  };

  const addZone = () => {
    const nameAr = newZone.name_ar.trim() || newZone.name_en.trim();
    const nameEn = newZone.name_en.trim() || newZone.name_ar.trim();
    if (!nameAr || newZone.countries.length === 0) return;

    const feeNum = newZone.fee === "" ? 5 : Number(newZone.fee);
    const zone: ShippingZone = {
      id: crypto.randomUUID(),
      name_en: nameEn,
      name_ar: nameAr,
      countries: newZone.countries,
      pricing_type: newZone.pricing_type,
      fee: isNaN(feeNum) ? 5 : feeNum,
      bundle_size:
        newZone.pricing_type === "bundle"
          ? Math.max(1, Number(newZone.bundle_size || 2))
          : undefined,
      estimate_ar: newZone.estimate_ar.trim() || undefined,
      estimate_en: newZone.estimate_en.trim() || undefined,
      allowed_payment_methods: newZone.allowed_payment_methods,
    };

    setBs({ shipping_zones: [...zones, zone] as any });
    setNewZone({
      name_en: "",
      name_ar: "",
      countries: [],
      pricing_type: "flat",
      fee: "5",
      bundle_size: 2,
      estimate_ar: "",
      estimate_en: "",
      allowed_payment_methods: ["card", "benefit"],
    });
    setIsAddZoneOpen(false);
  };

  const removeZone = (zoneId: string) => {
    setBs({ shipping_zones: zones.filter((z) => z.id !== zoneId) as any });
  };

  const toggleZonePaymentMethod = (zoneId: string, method: "cod" | "card" | "benefit") => {
    const next = zones.map((z) => {
      if (z.id !== zoneId) return z;
      const current = Array.isArray(z.allowed_payment_methods)
        ? z.allowed_payment_methods
        : ["card", "benefit"];
      const exists = current.includes(method);
      const nextMethods = exists ? current.filter((m) => m !== method) : [...current, method];
      return { ...z, allowed_payment_methods: nextMethods };
    });
    setBs({ shipping_zones: next as any });
  };

  return (
    <div className="space-y-6">
      {/* 1. Fulfillment Methods */}
      <div className="rounded-xl border border-border p-5 bg-card shadow-sm space-y-5">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Truck className="size-4 text-primary" />
            <span>
              {isAr ? "خيارات التوصيل والاستلام (Fulfillment)" : "Fulfillment & Delivery"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {isAr
              ? "تحكم في خيارات الشحن للعنوان أو الاستلام من المتجر أو المنتجات الرقمية."
              : "Enable home delivery, in-store pickup, and digital product fulfillment."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-background">
            <div>
              <p className="text-xs font-semibold">{isAr ? "التوصيل للعنوان" : "Home Delivery"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "شحن للمنزل" : "Standard shipping"}
              </p>
            </div>
            <Switch
              checked={bs.delivery_enabled ?? true}
              onCheckedChange={(v) => setBs({ delivery_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-background">
            <div>
              <p className="text-xs font-semibold">{isAr ? "الاستلام من الفرع" : "Store Pickup"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "استلام ذاتي" : "In-store pickup"}
              </p>
            </div>
            <Switch
              checked={bs.pickup_enabled ?? true}
              onCheckedChange={(v) => setBs({ pickup_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-background">
            <div>
              <p className="text-xs font-semibold">
                {isAr ? "التسليم الرقمي" : "Digital Delivery"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr ? "واتساب/إيميل" : "Electronic"}
              </p>
            </div>
            <Switch
              checked={bs.digital_delivery_enabled ?? false}
              onCheckedChange={(v) => setBs({ digital_delivery_enabled: v })}
            />
          </div>
        </div>

        {/* Default Bahrain Domestic Delivery */}
        {bs.delivery_enabled && (
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-primary/10 pb-3">
              <div className="flex items-center gap-2.5">
                <CountryFlag
                  code="BH"
                  className="w-8 h-5 rounded-xs object-cover border border-border shadow-xs shrink-0"
                />
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    {isAr
                      ? "التوصيل داخل البحرين (الافتراضي)"
                      : "Domestic Delivery - Bahrain (Default)"}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "الوجهة التلقائية المعتمدة للمتجر" : "Default shipping destination"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "سعر التوصيل داخل البحرين" : "Bahrain Delivery Fee"}
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  className="text-xs h-9 font-mono"
                  value={bs.delivery_fee ?? 0}
                  onChange={(e) =>
                    setBs({ delivery_fee: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr ? "وقت التوصيل التقديري" : "Estimated Delivery Window"}
                </Label>
                <Input
                  className="text-xs h-9"
                  value={isAr ? (bs.delivery_estimate_ar ?? "") : (bs.delivery_estimate_en ?? "")}
                  placeholder={isAr ? "خلال 24 - 48 ساعة" : "24 - 48 hours"}
                  onChange={(e) => {
                    if (isAr) setBs({ delivery_estimate_ar: e.target.value || null });
                    else setBs({ delivery_estimate_en: e.target.value || null });
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr
                    ? "نص الشحن والاستبدال في صفحة المنتج (عربي)"
                    : "Shipping & returns text on product page (Arabic)"}
                </Label>
                <Textarea
                  dir="rtl"
                  rows={3}
                  className="text-xs"
                  value={bs.shipping_returns_ar ?? ""}
                  placeholder="توصيل خلال 24-48 ساعة داخل البحرين. الاستبدال خلال 7 أيام بحالته الأصلية."
                  onChange={(e) => setBs({ shipping_returns_ar: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {isAr
                    ? "نص الشحن والاستبدال في صفحة المنتج (إنجليزي)"
                    : "Shipping & returns text on product page (English)"}
                </Label>
                <Textarea
                  dir="ltr"
                  rows={3}
                  className="text-xs"
                  value={bs.shipping_returns_en ?? ""}
                  placeholder="Delivery within 24-48h in Bahrain. Exchanges within 7 days in original condition."
                  onChange={(e) => setBs({ shipping_returns_en: e.target.value || null })}
                />
              </div>
            </div>
          </div>
        )}

        {/* 2. Custom Shipping Zones (GCC, Arab, International) */}
        {bs.delivery_enabled && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground">
                  {isAr
                    ? "مناطق الشحن الإقليمية والدولية"
                    : "Regional & International Shipping Zones"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? "أضف مناطق مخصصة لدول الخليج والدول العربية والعالمية."
                    : "Set custom rates for GCC and global destinations."}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={applyGccPreset}
                >
                  <Sparkles className="size-3 text-primary" />
                  <span>{isAr ? "+ دول الخليج" : "+ GCC"}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1.5"
                  onClick={applyArabPreset}
                >
                  <Sparkles className="size-3 text-primary" />
                  <span>{isAr ? "+ الدول العربية" : "+ Arab"}</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setIsAddZoneOpen(!isAddZoneOpen)}
                >
                  <Plus className="size-3.5" />
                  <span>{isAr ? "إضافة منطقة" : "Add Zone"}</span>
                </Button>
              </div>
            </div>

            {/* Zone List */}
            {zones.length > 0 ? (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="rounded-xl border border-border p-4 bg-background space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-semibold text-foreground">
                          {isAr ? zone.name_ar : zone.name_en}
                        </h5>
                        <p className="text-xs text-muted-foreground">
                          {getShippingPricingDescription(
                            zone,
                            bs.currency || "BHD",
                            isAr ? "ar" : "en",
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => removeZone(zone.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {zone.countries.map((cCode) => {
                        const country = getCountryByCode(cCode);
                        return (
                          <span
                            key={cCode}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs text-foreground font-medium"
                          >
                            <CountryFlag code={cCode} className="w-4 h-3 rounded-2xs" />
                            <span>
                              {isAr ? country?.name_ar || cCode : country?.name_en || cCode}
                            </span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Zone Payment Methods */}
                    <div className="flex items-center gap-3 pt-2 border-t border-border text-xs">
                      <span className="text-xs text-muted-foreground font-medium">
                        {isAr ? "طرق الدفع المسموحة:" : "Payment Methods:"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleZonePaymentMethod(zone.id, "card")}
                        className={`h-auto rounded-md inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          zone.allowed_payment_methods?.includes("card")
                            ? "bg-primary/10 border-primary text-primary"
                            : "border-border text-muted-foreground opacity-60"
                        }`}
                      >
                        <CreditCard className="size-3" />
                        <span>{isAr ? "بطاقة" : "Card"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleZonePaymentMethod(zone.id, "benefit")}
                        className={`h-auto rounded-md inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          zone.allowed_payment_methods?.includes("benefit")
                            ? "bg-destructive/10 border-destructive text-destructive"
                            : "border-border text-muted-foreground opacity-60"
                        }`}
                      >
                        <QrCode className="size-3" />
                        <span>{isAr ? "بنفت باي" : "BenefitPay"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleZonePaymentMethod(zone.id, "cod")}
                        className={`h-auto rounded-md inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${
                          zone.allowed_payment_methods?.includes("cod")
                            ? "bg-success/10 border-success text-success"
                            : "border-border text-muted-foreground opacity-60"
                        }`}
                      >
                        <Banknote className="size-3" />
                        <span>{isAr ? "عند الاستلام" : "COD"}</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {isAr
                  ? "لم يتم إنشاء مناطق شحن إضافية بعد. اضغط '+ دول الخليج' أو 'إضافة منطقة' للبدء."
                  : "No custom shipping zones created yet. Use presets or click 'Add Zone'."}
              </p>
            )}

            {/* Add Zone Drawer/Box */}
            {isAddZoneOpen && (
              <div className="rounded-xl border border-primary/20 bg-muted/10 p-4 space-y-4">
                <h5 className="text-xs font-semibold text-foreground">
                  {isAr ? "إضافة منطقة شحن جديدة" : "Add New Shipping Zone"}
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{isAr ? "الاسم (عربي)" : "Zone Name (AR)"}</Label>
                    <Input
                      className="mt-1 text-xs h-8 text-end"
                      value={newZone.name_ar}
                      placeholder={isAr ? "دول الخليج العربي" : "Zone name in Arabic"}
                      onChange={(e) => setNewZone({ ...newZone, name_ar: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{isAr ? "الاسم (إنجليزي)" : "Zone Name (EN)"}</Label>
                    <Input
                      className="mt-1 text-xs h-8 text-start"
                      value={newZone.name_en}
                      placeholder="GCC Countries"
                      onChange={(e) => setNewZone({ ...newZone, name_en: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{isAr ? "رسوم الشحن" : "Shipping Fee"}</Label>
                    <Input
                      type="number"
                      step="0.5"
                      className="mt-1 text-xs h-8 font-mono"
                      value={newZone.fee}
                      onChange={(e) => setNewZone({ ...newZone, fee: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      {isAr ? "مدة التوصيل المتوقعة" : "Delivery Estimate"}
                    </Label>
                    <Input
                      className="mt-1 text-xs h-8"
                      value={isAr ? newZone.estimate_ar : newZone.estimate_en}
                      placeholder={isAr ? "3 - 5 أيام عمل" : "3 - 5 business days"}
                      onChange={(e) => {
                        if (isAr) setNewZone({ ...newZone, estimate_ar: e.target.value });
                        else setNewZone({ ...newZone, estimate_en: e.target.value });
                      }}
                    />
                  </div>
                </div>

                {/* Country Selector */}
                <div>
                  <Label className="text-xs">
                    {isAr ? "اختر الدول التابعة لهذه المنطقة:" : "Select Countries:"}
                  </Label>
                  <div className="mt-2 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 border border-border rounded-lg bg-background">
                    {COUNTRIES_DATABASE.filter((c) => c.code !== "BH").map((c) => {
                      const selected = newZone.countries.includes(c.code);
                      return (
                        <Button
                          key={c.code}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleCountry(c.code)}
                          className={`h-auto rounded-md inline-flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 hover:bg-muted border-border text-foreground"
                          }`}
                        >
                          <CountryFlag code={c.code} className="w-3.5 h-2.5 rounded-2xs" />
                          <span>{isAr ? c.name_ar : c.name_en}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => setIsAddZoneOpen(false)}
                  >
                    {isAr ? "إلغاء" : "Cancel"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!newZone.name_ar.trim() || newZone.countries.length === 0}
                    onClick={addZone}
                  >
                    {isAr ? "حفظ المنطقة" : "Save Zone"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Advanced Delivery Estimate Settings */}
        <AdvancedOnly
          fieldKey="delivery_estimate_enabled"
          reason={
            isAr
              ? "تخصيص عبارات وتفعيل تنبيه مدة التوصيل"
              : "Toggle and tune delivery estimate messaging"
          }
        >
          <div className="rounded-xl border border-border p-4 bg-muted/5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h4 className="text-xs font-semibold">
                {isAr ? "إعدادات مدة التوصيل المتقدمة" : "Advanced Delivery Estimate Timing"}
              </h4>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3.5 bg-background">
              <div>
                <Label className="cursor-pointer text-xs font-medium">
                  {isAr
                    ? "إظهار مدة التوصيل التقديرية في المتجر"
                    : "Display Delivery Estimate on Storefront"}
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isAr
                    ? "عرض المدة في صفحات المنتجات والدفع"
                    : "Show timing on product & checkout pages"}
                </p>
              </div>
              <Switch
                checked={bs.delivery_estimate_enabled ?? true}
                onCheckedChange={(checked) => setBs({ delivery_estimate_enabled: checked })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div dir="rtl">
                <Label className="text-xs font-medium">
                  {isAr ? "عبارة التوصيل (عربي)" : "Estimate Text (Arabic)"}
                </Label>
                <Input
                  className="mt-1.5 text-end text-xs h-9"
                  value={bs.delivery_estimate_ar ?? ""}
                  placeholder={isAr ? "التوصيل المتوقع خلال 24 - 48 ساعة" : "24-48 hours"}
                  onChange={(e) => setBs({ delivery_estimate_ar: e.target.value || null })}
                />
              </div>

              <div dir="ltr">
                <Label className="text-xs font-medium">
                  {isAr ? "عبارة التوصيل (إنجليزي)" : "Estimate Text (English)"}
                </Label>
                <Input
                  className="mt-1.5 text-start text-xs h-9"
                  value={bs.delivery_estimate_en ?? ""}
                  placeholder="Estimated delivery within 24 - 48 hours"
                  onChange={(e) => setBs({ delivery_estimate_en: e.target.value || null })}
                />
              </div>
            </div>
          </div>
        </AdvancedOnly>
      </div>
    </div>
  );
}
