import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Adds one customization preset (measurements, engraving, gift note...) to every selected product. */
export function BulkPresetDialog({
  open,
  onOpenChange,
  count,
  presets,
  value,
  onValueChange,
  applying,
  onApply,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  presets: { key: string; label: { ar: string; en: string } }[];
  value: string;
  onValueChange: (value: string) => void;
  applying: boolean;
  onApply: () => void;
  isAr: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {isAr ? "إضافة نموذج تخصيص للمنتجات المحددة" : "Add a customization preset"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `سيُضاف النموذج المختار إلى ${count} منتج. المنتج الذي عنده النموذج أصلاً لا يتغير، وحقول القياس اليدوية القديمة تُحذف عند إضافة نموذج قياسات.`
              : `The chosen preset is added to ${count} products. A product that already has it is left as it is, and the older hand-made measurement fields are dropped when a measurements preset is added.`}
          </p>
          <p className="text-xs font-semibold text-amber-600">
            {isAr
              ? "تصبح المنتجات «حسب الطلب»: لا تتطلب مخزوناً جاهزاً ولا يُخصم منها عند الشراء."
              : "The products become made to order: no ready stock is needed and none is deducted on purchase."}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "النموذج" : "Preset"}
            </Label>
            <select
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
            >
              <option value="">{isAr ? "اختر نموذجاً..." : "Choose a preset..."}</option>
              {presets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {isAr ? preset.label.ar : preset.label.en}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button type="button" disabled={applying || !value} onClick={onApply}>
            {applying
              ? isAr
                ? "جاري الإضافة..."
                : "Adding..."
              : isAr
                ? "إضافة للمنتجات"
                : "Add to products"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
