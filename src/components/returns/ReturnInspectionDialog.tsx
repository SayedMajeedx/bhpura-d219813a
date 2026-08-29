import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  PackageCheck,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { inspectAndRestockReturnItem } from "@/lib/returns.functions";
import {
  RETURN_CONDITION_CONFIG,
  type ReturnItem,
  type ReturnItemCondition,
} from "@/lib/returns.types";

interface ReturnInspectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ReturnItem | null;
  brandId: string;
  lang: "en" | "ar";
  onSuccess: () => void;
}

export function ReturnInspectionDialog({
  open,
  onOpenChange,
  item,
  brandId,
  lang,
  onSuccess,
}: ReturnInspectionDialogProps) {
  const isAr = lang === "ar";
  const [condition, setCondition] = useState<ReturnItemCondition>("sellable");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!item) return null;

  const currentStock = item.variant?.stock_quantity ?? 0;
  const isSellable = condition === "sellable";
  const projectedStock = isSellable ? currentStock + item.quantity : currentStock;

  const handleInspect = async () => {
    setSubmitting(true);
    try {
      const res = await inspectAndRestockReturnItem({
        brandId,
        returnItemId: item.id,
        condition,
        inspectionNotes: inspectionNotes.trim() || undefined,
      });

      if (!res.success) {
        toast.error(res.error || (isAr ? "فشل تسجيل فحص البند" : "Failed to record inspection"));
        return;
      }

      toast.success(
        isAr
          ? isSellable
            ? `تم فحص البند وتحديث المخزون (+${item.quantity}) بنجاح`
            : "تم تسجيل حالة الفحص بنجاح"
          : isSellable
            ? `Item inspected and restocked (+${item.quantity}) successfully`
            : "Item inspection recorded successfully",
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error processing inspection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <PackageCheck className="h-5 w-5 text-primary" />
            {isAr ? "فحص الجودة وتحديد حالة المنتج" : "Inspect Item & Stock Recovery"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Item Snapshot */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-center gap-3">
            {item.product?.image_url && (
              <img
                src={item.product.image_url}
                alt=""
                className="h-12 w-12 rounded-md object-cover border border-border shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <h4 className="text-xs font-bold text-foreground truncate">
                {isAr
                  ? item.product?.name_ar || item.product?.name_en
                  : item.product?.name_en || item.product?.name_ar}
              </h4>
              <p className="text-[11px] text-muted-foreground truncate">
                {item.variant?.variant_name || item.variant?.sku || "Default Variant"}
              </p>
              <div className="flex items-center gap-2 text-[11px] font-mono mt-0.5">
                <span className="font-semibold text-foreground">
                  {isAr ? "الكمية المرتجعة:" : "Return Qty:"} {item.quantity}
                </span>
                <span>•</span>
                <span className="text-muted-foreground">
                  {isAr ? "المخزون الحالي:" : "Current Stock:"} {currentStock}
                </span>
              </div>
            </div>
          </div>

          {/* Condition Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "حالة القطعة بعد الفحص" : "Condition Upon Physical Inspection"}
            </Label>
            <Select
              value={condition}
              onValueChange={(val) => setCondition(val as ReturnItemCondition)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RETURN_CONDITION_CONFIG) as ReturnItemCondition[])
                  .filter((c) => c !== "pending")
                  .map((c) => {
                    const cfg = RETURN_CONDITION_CONFIG[c];
                    return (
                      <SelectItem key={c} value={c} className="text-xs">
                        {isAr ? cfg.labelAr : cfg.labelEn}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {isAr
                ? RETURN_CONDITION_CONFIG[condition]?.descriptionAr
                : RETURN_CONDITION_CONFIG[condition]?.descriptionEn}
            </p>
          </div>

          {/* Stock Impact Visual Box */}
          <div
            className={
              isSellable
                ? "p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-800 dark:text-emerald-300"
                : "p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300"
            }
          >
            <div className="flex items-center justify-between font-semibold">
              <span className="flex items-center gap-1.5">
                {isSellable ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                )}
                {isSellable
                  ? isAr
                    ? "سيتم إعادة القطع للمخزون فوراً"
                    : "Will restock into active inventory"
                  : isAr
                    ? "لن يتم زيادة المخزون (شطب أو توجيه فني)"
                    : "No restock (written off or pending review)"}
              </span>
              <span className="font-mono text-xs">
                {currentStock} <ArrowRight className="inline h-3 w-3 mx-0.5" /> {projectedStock}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "ملاحظات الفحص الفني (اختياري)" : "Inspection Notes (Optional)"}
            </Label>
            <Textarea
              placeholder={
                isAr
                  ? "مثال: تم فحص الغلاف الخارجي والتأكد من سلامة الباركود والملصقات..."
                  : "e.g., Packaging intact, seals verified..."
              }
              value={inspectionNotes}
              onChange={(e) => setInspectionNotes(e.target.value)}
              className="text-xs min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="h-9 text-xs"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleInspect}
            disabled={submitting}
            className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isAr ? "تأكيد الفحص وإعادة المخزون" : "Confirm & Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
