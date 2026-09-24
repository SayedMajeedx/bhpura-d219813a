import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, RefreshCw, Sliders } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

import type { Product } from "@/features/inventory/types";

export function ManageProductAxesDialog({
  productId,
  product,
  onChanged,
}: {
  productId: string;
  product?: Product;
  onChanged: () => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    variant_label_size_ar: product?.variant_label_size_ar ?? "",
    variant_label_size_en: product?.variant_label_size_en ?? "",
    variant_label_color_ar: product?.variant_label_color_ar ?? "",
    variant_label_color_en: product?.variant_label_color_en ?? "",
    variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
    variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
    variant_label_four_ar: product?.variant_label_four_ar ?? "",
    variant_label_four_en: product?.variant_label_four_en ?? "",
    variant_label_five_ar: product?.variant_label_five_ar ?? "",
    variant_label_five_en: product?.variant_label_five_en ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        variant_label_size_ar: product?.variant_label_size_ar ?? "",
        variant_label_size_en: product?.variant_label_size_en ?? "",
        variant_label_color_ar: product?.variant_label_color_ar ?? "",
        variant_label_color_en: product?.variant_label_color_en ?? "",
        variant_label_fabric_ar: product?.variant_label_fabric_ar ?? "",
        variant_label_fabric_en: product?.variant_label_fabric_en ?? "",
        variant_label_four_ar: product?.variant_label_four_ar ?? "",
        variant_label_four_en: product?.variant_label_four_en ?? "",
        variant_label_five_ar: product?.variant_label_five_ar ?? "",
        variant_label_five_en: product?.variant_label_five_en ?? "",
      });
    }
  }, [open, product]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await (supabase.from("products") as any)
        .update({
          variant_label_size_ar: form.variant_label_size_ar.trim() || null,
          variant_label_size_en: form.variant_label_size_en.trim() || null,
          variant_label_color_ar: form.variant_label_color_ar.trim() || null,
          variant_label_color_en: form.variant_label_color_en.trim() || null,
          variant_label_fabric_ar: form.variant_label_fabric_ar.trim() || null,
          variant_label_fabric_en: form.variant_label_fabric_en.trim() || null,
          variant_label_four_ar: form.variant_label_four_ar.trim() || null,
          variant_label_four_en: form.variant_label_four_en.trim() || null,
          variant_label_five_ar: form.variant_label_five_ar.trim() || null,
          variant_label_five_en: form.variant_label_five_en.trim() || null,
        })
        .eq("id", productId);

      if (error) throw error;

      toast.success(
        isAr ? "تم حفظ وتحديث خصائص ومحاور المنتج بنجاح!" : "Variant axes updated successfully!",
      );
      setOpen(false);
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Failed to update axes");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = (ar: string, en: string) => {
    if (!form.variant_label_color_ar) {
      setForm((prev) => ({ ...prev, variant_label_color_ar: ar, variant_label_color_en: en }));
    } else if (!form.variant_label_fabric_ar) {
      setForm((prev) => ({ ...prev, variant_label_fabric_ar: ar, variant_label_fabric_en: en }));
    } else if (!form.variant_label_four_ar) {
      setForm((prev) => ({ ...prev, variant_label_four_ar: ar, variant_label_four_en: en }));
    } else if (!form.variant_label_five_ar) {
      setForm((prev) => ({ ...prev, variant_label_five_ar: ar, variant_label_five_en: en }));
    } else {
      toast.info(
        isAr
          ? "جميع المحاور مستخدمة بالفعل، يمكنك تعديلها يدوياً أدناه."
          : "All axes are assigned. You can edit them manually below.",
      );
    }
  };

  const presets = [
    { ar: "النكهة", en: "Flavor" },
    { ar: "نوع التغليف", en: "Packaging" },
    { ar: "الحشوة", en: "Filling" },
    { ar: "درجة التحميص", en: "Roast Level" },
    { ar: "الإضافات", en: "Add-ons" },
    { ar: "الخامة", en: "Fabric" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 rounded-lg text-xs font-bold gap-1.5 hover:bg-secondary/40 touch-manipulation"
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>{isAr ? "خصائص ومحاور المنتج" : "Customize Axes"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-black">
            {isAr ? "🏷️ تخصيص أسماء الخصائص والمحاور" : "🏷️ Customize Variant Attributes & Axes"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تحكم في أسماء الأعمدة والخيارات لمتغيرات هذا المنتج (حتى 5 محاور مستقلة) لتظهر بشكل مخصص ومثالي في لوحة التحكم والمتجر."
              : "Customize column titles and options for this product (up to 5 independent axes) across admin and storefront."}
          </p>
        </DialogHeader>

        {/* Quick Presets */}
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <span className="text-xs font-bold text-muted-foreground block">
            {isAr ? "⚡ نماذج واقتراحات سريعة بنقرة واحدة:" : "⚡ Quick Presets (1-click add):"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.ar}
                type="button"
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-background border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => applyPreset(p.ar, p.en)}
              >
                + {isAr ? p.ar : p.en}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 py-2">
          {/* Axis 1: Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border border-border bg-card">
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr
                  ? "المحور 1: المقاس / الحجم / الوزن (عربي)"
                  : "Axis 1: Size / Weight (Arabic)"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder={isAr ? "المقاس أو الوزن أو الحجم" : "Size or Weight"}
                value={form.variant_label_size_ar}
                onChange={(e) => setForm({ ...form, variant_label_size_ar: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "المحور 1: بالإنجليزية" : "Axis 1: English"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Size / Weight"
                value={form.variant_label_size_en}
                onChange={(e) => setForm({ ...form, variant_label_size_en: e.target.value })}
              />
            </div>
          </div>

          {/* Axis 2: Color / Flavor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border border-border bg-card">
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr
                  ? "المحور 2: اللون / النكهة / الخيار (عربي)"
                  : "Axis 2: Color / Flavor / Option (Arabic)"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder={isAr ? "اللون أو النكهة أو الخيار" : "Color / Flavor / Option"}
                value={form.variant_label_color_ar}
                onChange={(e) => setForm({ ...form, variant_label_color_ar: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "المحور 2: بالإنجليزية" : "Axis 2: English"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Color / Flavor / Option"
                value={form.variant_label_color_en}
                onChange={(e) => setForm({ ...form, variant_label_color_en: e.target.value })}
              />
            </div>
          </div>

          {/* Axis 3: Fabric / Packaging */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border border-border bg-card">
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr
                  ? "المحور 3: الخامة / التغليف / مخصص (عربي)"
                  : "Axis 3: Fabric / Packaging / Custom (Arabic)"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder={isAr ? "الخامة أو نوع التغليف" : "Fabric or Packaging"}
                value={form.variant_label_fabric_ar}
                onChange={(e) => setForm({ ...form, variant_label_fabric_ar: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "المحور 3: بالإنجليزية" : "Axis 3: English"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Fabric / Packaging"
                value={form.variant_label_fabric_en}
                onChange={(e) => setForm({ ...form, variant_label_fabric_en: e.target.value })}
              />
            </div>
          </div>

          {/* Axis 4: Roast / Filling */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border border-border bg-card">
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr
                  ? "المحور 4: الحشوة / درجة التحميص (عربي)"
                  : "Axis 4: Filling / Roast (Arabic)"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder={isAr ? "الحشوة أو درجة التحميص" : "Filling or Roast"}
                value={form.variant_label_four_ar}
                onChange={(e) => setForm({ ...form, variant_label_four_ar: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "المحور 4: بالإنجليزية" : "Axis 4: English"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Filling / Roast"
                value={form.variant_label_four_en}
                onChange={(e) => setForm({ ...form, variant_label_four_en: e.target.value })}
              />
            </div>
          </div>

          {/* Axis 5: Add-ons / Extras */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl border border-border bg-card">
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr
                  ? "المحور 5: الإضافات / المرفقات (عربي)"
                  : "Axis 5: Add-ons / Extras (Arabic)"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder={isAr ? "الإضافات أو المرفقات" : "Add-ons or Inclusions"}
                value={form.variant_label_five_ar}
                onChange={(e) => setForm({ ...form, variant_label_five_ar: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-muted-foreground">
                {isAr ? "المحور 5: بالإنجليزية" : "Axis 5: English"}
              </Label>
              <Input
                className="mt-1 h-8 text-xs"
                placeholder="Add-ons / Inclusions"
                value={form.variant_label_five_en}
                onChange={(e) => setForm({ ...form, variant_label_five_en: e.target.value })}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            <span>{isAr ? "حفظ وتطبيق الخصائص" : "Save & Apply Axes"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
