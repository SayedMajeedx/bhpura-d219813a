import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { buildCartItem } from "@/lib/cart/add-to-cart";
import { toast } from "sonner";
import {
  Sparkles,
  Scissors,
  Ruler,
  Calendar,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ShoppingBag,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/$slug/custom-order")({
  head: () => ({
    meta: [
      { title: "طلب مخصص — Bespoke Order" },
      {
        name: "description",
        content: "نموذج الطلب المخصص والتنفيذ حسب القياس والمواصفات المطلوبة",
      },
    ],
  }),
  component: CustomOrderRouteComponent,
});

function CustomOrderRouteComponent() {
  const { brand, settings, currency, lang, t, addToCart } = useStorefront();
  const navigate = useNavigate();
  const isAr = lang === "ar";
  const NextIcon = isAr ? ArrowLeft : ArrowRight;
  const PrevIcon = isAr ? ArrowRight : ArrowLeft;

  // Check if made_to_order module is enabled
  const modules = (brand as any)?.modules || {};
  const isMtoEnabled = modules.made_to_order !== false;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [fabric, setFabric] = useState("");
  const [color, setColor] = useState("");
  const [designStyle, setDesignStyle] = useState("");

  const [measurementMode, setMeasurementMode] = useState<"standard" | "custom">("standard");
  const [standardSize, setStandardSize] = useState("54");
  const [customLength, setCustomLength] = useState("");
  const [customBust, setCustomBust] = useState("");
  const [customSleeve, setCustomSleeve] = useState("");
  const [customShoulder, setCustomShoulder] = useState("");

  const [targetDate, setTargetDate] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Base price for custom service
  const baseServicePrice = Number((settings as any)?.custom_order_base_price ?? 35);

  if (!isMtoEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Info className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold font-display text-foreground">
          {t("الطلبات المخصصة غير مفعّلة حالياً", "Custom Orders Currently Unavailable")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "هذا المتجر يستقبل الطلبات من التشكيلة المتوفرة حالياً في المتجر.",
            "This boutique currently accepts orders from available ready-to-wear collections.",
          )}
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/$slug" params={{ slug: brand.slug }}>
              {t("تصفح المنتجات المتوفرة", "Browse Available Collections")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const handleNext = () => {
    if (step === 1) {
      if (!fabric.trim() && !designStyle.trim()) {
        toast.error(
          t("يرجى تحديد نوع القماش أو مواصفات التصميم", "Please specify fabric or design details"),
        );
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (measurementMode === "custom" && !customLength.trim()) {
        toast.error(
          t("يرجى إدخال الطول المطلوب على الأقل", "Please enter at least the desired length"),
        );
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as 1 | 2);
    }
  };

  const handleCompleteOrder = () => {
    setIsSubmitting(true);
    try {
      const sizingSummary =
        measurementMode === "standard"
          ? `مقاس ${standardSize}`
          : `مخصص: طول ${customLength || "-"}${customBust ? ` / صدر ${customBust}` : ""}`;

      const customCartItem = buildCartItem({
        product: {
          id: `custom-order-${Date.now()}`,
          name: t("طلب تنفيذ مخصص", "Bespoke Custom Order"),
          name_ar: "طلب تنفيذ مخصص",
          name_en: "Bespoke Custom Order",
          base_price: baseServicePrice,
          image_url: brand.logo_url || null,
        },
        qty: 1,
        selectedColor: color || t("حسب الاتفاق", "As agreed"),
        selectedSize: sizingSummary,
        customFields: [
          {
            key: "orderType",
            label_ar: "نوع الطلب",
            label_en: "Order Type",
            value: "made_to_order",
          },
          { key: "fabric", label_ar: "القماش المختار", label_en: "Selected Fabric", value: fabric },
          {
            key: "designStyle",
            label_ar: "تفاصيل القصة",
            label_en: "Design Style",
            value: designStyle,
          },
          { key: "color", label_ar: "اللون المفضل", label_en: "Preferred Color", value: color },
          {
            key: "sizingSummary",
            label_ar: "المقاس والقياسات",
            label_en: "Sizing Summary",
            value: sizingSummary,
          },
          ...(measurementMode === "custom"
            ? [
                {
                  key: "customMeasurements",
                  label_ar: "القياسات الدقيقة",
                  label_en: "Exact Measurements",
                  value: `طول: ${customLength || "-"} | صدر: ${customBust || "-"} | كم: ${customSleeve || "-"} | كتف: ${customShoulder || "-"}`,
                },
              ]
            : []),
          ...(targetDate
            ? [
                {
                  key: "targetDate",
                  label_ar: "الموعد المطلوب",
                  label_en: "Target Date",
                  value: targetDate,
                },
              ]
            : []),
          ...(specialNotes
            ? [
                {
                  key: "specialNotes",
                  label_ar: "ملاحظات إضافية",
                  label_en: "Special Notes",
                  value: specialNotes,
                },
              ]
            : []),
          ...(referenceUrl
            ? [
                {
                  key: "referenceUrl",
                  label_ar: "رابط التصميم المرجعي",
                  label_en: "Reference URL",
                  value: referenceUrl,
                },
              ]
            : []),
        ],
      });

      addToCart(customCartItem);
      toast.success(
        t(
          "تم تسجيل طلبك المخصص وإضافته إلى حقيبة التسوق",
          "Custom request added to your shopping bag",
        ),
      );
      navigate({
        to: "/$slug/checkout",
        params: { slug: brand.slug },
      });
    } catch {
      toast.error(t("حدث خطأ أثناء إضافة الطلب", "Failed to add bespoke order"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <Badge variant="outline" className="border-primary/40 text-primary gap-1.5 px-3 py-1">
          <Sparkles className="h-3.5 w-3.5" />
          {t("خدمة التنفيذ المخصص", "Bespoke Made-to-Order Service")}
        </Badge>
        <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-foreground">
          {t("طلب تنفيذ خاص بمقاساتك", "Request a Custom Made Piece")}
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          {t(
            "صممي قطعتك الخاصة بدقة متناهية باختيار القماش واللون والقياسات الدقيقة التي تناسبك.",
            "Customize your exclusive piece with tailored fabrics, exact measurements, and hand-finished craftsmanship.",
          )}
        </p>
      </div>

      {/* Step Indicators */}
      <div className="mb-8 grid grid-cols-3 gap-2 border-b border-border pb-6">
        {[
          { num: 1, icon: Scissors, label: t("المواصفات والقماش", "Design & Fabric") },
          { num: 2, icon: Ruler, label: t("المقاسات الدقيقة", "Exact Sizing") },
          { num: 3, icon: Calendar, label: t("الملاحظات والموعد", "Notes & Timing") },
        ].map((s) => {
          const Icon = s.icon;
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <div
              key={s.num}
              className={`flex flex-col items-center gap-1.5 text-center transition-colors ${
                isActive
                  ? "text-primary font-semibold"
                  : isDone
                    ? "text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-xs ring-4 ring-primary/10"
                    : isDone
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className="text-xs">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Step Contents */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Scissors className="h-4 w-4 text-primary" />
              {t("الخطوة 1: اختيار القماش ونمط التصميم", "Step 1: Fabric & Design Specs")}
            </h2>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t("نوع القماش المفضل", "Preferred Fabric")} *
              </label>
              <Input
                value={fabric}
                onChange={(e) => setFabric(e.target.value)}
                placeholder={t(
                  "مثال: حرير ياباني، كريب صالونا، لينن فاخر...",
                  "e.g. Japanese Silk, Crepe, Fine Linen...",
                )}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t("اللون المطلوب", "Desired Color")}
              </label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder={t(
                  "مثال: أسود كلاسيكي، كحلي داكن، بيج رملي...",
                  "e.g. Classic Black, Deep Navy, Sand Beige...",
                )}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t("تفاصيل القصة والنمط", "Cut & Design Style Details")}
              </label>
              <Textarea
                rows={3}
                value={designStyle}
                onChange={(e) => setDesignStyle(e.target.value)}
                placeholder={t(
                  "وضّحي أي تفاصيل ترغبين بها مثل نوع الأكمام، الياقة، قصة البشت أو القصة المستقيمة...",
                  "Describe styling details such as sleeve finish, neckline, cut silhouette...",
                )}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              {t("الخطوة 2: أبعاد ومقاسات التنفيذ", "Step 2: Measurement Specifications")}
            </h2>

            <div className="flex rounded-lg border border-border p-1 bg-muted/40">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMeasurementMode("standard")}
                className={`h-auto rounded-md flex-1 rounded-md py-2 text-xs font-medium transition-all ${
                  measurementMode === "standard"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("مقاس قياسي جاهز", "Standard Size")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMeasurementMode("custom")}
                className={`h-auto rounded-md flex-1 rounded-md py-2 text-xs font-medium transition-all ${
                  measurementMode === "custom"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("قياسات مخصصة دقيقة (إنش / سم)", "Custom Exact Measurements")}
              </Button>
            </div>

            {measurementMode === "standard" ? (
              <div>
                <label className="block text-xs font-medium text-foreground mb-2">
                  {t("اختاري المقاس القياسي", "Select Standard Size")}
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {["50", "52", "54", "56", "58", "60"].map((sz) => (
                    <Button
                      key={sz}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setStandardSize(sz)}
                      className={`h-auto rounded-md rounded-lg border py-2.5 text-xs font-semibold transition-all ${
                        standardSize === sz
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {sz}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("الطول الكلي (إنش)", "Total Length (in)")} *
                  </label>
                  <Input
                    type="number"
                    value={customLength}
                    onChange={(e) => setCustomLength(e.target.value)}
                    placeholder="54"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("عرض الصدر / محيط الصدر (إنش)", "Bust Width / Circumference (in)")}
                  </label>
                  <Input
                    type="number"
                    value={customBust}
                    onChange={(e) => setCustomBust(e.target.value)}
                    placeholder="22"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("طول الكم من الرقبة (إنش)", "Sleeve from Neckline (in)")}
                  </label>
                  <Input
                    type="number"
                    value={customSleeve}
                    onChange={(e) => setCustomSleeve(e.target.value)}
                    placeholder="27"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    {t("عرض الكتف (إنش)", "Shoulder Width (in)")}
                  </label>
                  <Input
                    type="number"
                    value={customShoulder}
                    onChange={(e) => setCustomShoulder(e.target.value)}
                    placeholder="15"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {t("الخطوة 3: الموعد والملاحظات الإضافية", "Step 3: Timing & Special Notes")}
            </h2>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t(
                  "تاريخ المناسبة أو الموعد المفضل للاستلام",
                  "Preferred Delivery / Occasion Date",
                )}
              </label>
              <Input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t("رابط صورة مرجعية أو تصميم مشابه (اختياري)", "Reference Image Link (Optional)")}
              </label>
              <Input
                type="url"
                value={referenceUrl}
                onChange={(e) => setReferenceUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t("ملاحظات خاصة للخبير الحرفي", "Special Notes for the Artisan Team")}
              </label>
              <Textarea
                rows={3}
                value={specialNotes}
                onChange={(e) => setSpecialNotes(e.target.value)}
                placeholder={t(
                  "أي تعديلات معينة ترغبين في إضافتها على التصميم أو الشحن...",
                  "Any specific tailoring notes or preferences...",
                )}
              />
            </div>

            {/* Estimated Price summary */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {t("السعر المبدئي للتنفيذ المخصص", "Initial Bespoke Custom Fee")}
                </p>
                <p className="text-lg font-bold text-primary font-display">
                  {formatPrice(baseServicePrice, currency, lang)}
                </p>
              </div>
              <span className="text-xs text-muted-foreground max-w-xs text-end">
                {t(
                  "يشمل العمل الحرفي والمتابعة وتأكيد القياسات مع العميل",
                  "Includes artisanal crafting & personal measurement verification",
                )}
              </span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="gap-1.5"
            >
              <PrevIcon className="h-4 w-4" />
              {t("السابق", "Back")}
            </Button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleNext}
              className="gap-1.5"
            >
              {t("المتابعة", "Continue")}
              <NextIcon className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              size="default"
              onClick={handleCompleteOrder}
              disabled={isSubmitting}
              className="gap-2 font-semibold shadow-xs"
            >
              <ShoppingBag className="h-4 w-4" />
              {t("تأكيد وإضافة للسلة", "Confirm & Add to Bag")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
