import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RotateCcw,
  ArrowLeftRight,
  PackageCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { createExchangeReplacementOrder } from "@/lib/returns.functions";
import { formatMoney } from "@/lib/format";
import type { ReturnRequest } from "@/lib/returns.types";

interface ReturnExchangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnReq: ReturnRequest;
  brandId: string;
  lang: "en" | "ar";
  onSuccess: () => void;
}

interface ReplacementRow {
  variantId: string;
  quantity: number;
  unitPrice: number;
  description: string;
}

export function ReturnExchangeDialog({
  open,
  onOpenChange,
  returnReq,
  brandId,
  lang,
  onSuccess,
}: ReturnExchangeDialogProps) {
  const isAr = lang === "ar";
  const [items, setItems] = useState<ReplacementRow[]>([
    { variantId: "", quantity: 1, unitPrice: 0, description: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch available products & variants for brand
  const { data: variants = [], isLoading: loadingVariants } = useQuery({
    queryKey: ["brand-exchange-variants", brandId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select(`
          id,
          variant_name,
          sku,
          selling_price,
          stock_quantity,
          product_id,
          product:products (
            id,
            name_en,
            name_ar,
            base_price
          )
        `)
        .eq("brand_id", brandId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: open && !!brandId,
  });

  const returnedTotal = Number(returnReq.total_item_refund || 0);

  const replacementTotal = items.reduce(
    (sum, row) => sum + (row.quantity || 0) * (row.unitPrice || 0),
    0,
  );

  const priceDiff = replacementTotal - returnedTotal;

  const handleSelectVariant = (index: number, variantId: string) => {
    const selected = variants.find((v) => v.id === variantId);
    if (!selected) return;

    const price = Number(selected.selling_price || selected.product?.base_price || 0);
    const prodName = isAr
      ? selected.product?.name_ar || selected.product?.name_en
      : selected.product?.name_en || selected.product?.name_ar;
    const variantLabel = selected.variant_name ? ` - ${selected.variant_name}` : "";

    const next = [...items];
    next[index] = {
      ...next[index],
      variantId,
      unitPrice: price,
      description: `${prodName}${variantLabel}`,
    };
    setItems(next);
  };

  const handleUpdateRow = (index: number, field: keyof ReplacementRow, value: any) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const handleAddRow = () => {
    setItems([...items, { variantId: "", quantity: 1, unitPrice: 0, description: "" }]);
  };

  const handleRemoveRow = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCreateExchange = async () => {
    const validItems = items.filter((i) => i.variantId && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error(isAr ? "يرجى اختيار منتج بديل واحد على الأقل" : "Please select at least one replacement item");
      return;
    }

    setSubmitting(true);
    try {
      const res = await createExchangeReplacementOrder({
        brandId,
        returnId: returnReq.id,
        replacementItems: validItems.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
          unit_price: i.unitPrice,
          description: i.description,
        })),
      });

      if (!res.success) {
        toast.error(res.error || (isAr ? "فشل إنشاء طلب الاستبدال" : "Failed to create replacement order"));
        return;
      }

      toast.success(
        isAr
          ? `تم إنشاء طلب الاستبدال البديل رقم #${res.invoiceNumber} بنجاح`
          : `Replacement order #${res.invoiceNumber} created successfully`,
      );
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error creating replacement order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            {isAr ? "إنشاء طلب استبدال بديل مرتبط" : "Create Exchange Replacement Order"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Returned Value Header */}
          <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground block">{isAr ? "رقم طلب الإرجاع:" : "Return Request:"}</span>
              <span className="font-mono font-bold text-foreground">{returnReq.return_number}</span>
            </div>
            <div className="text-end">
              <span className="text-muted-foreground block">{isAr ? "قيمة المرتجع الأصلي:" : "Returned Value:"}</span>
              <span className="font-mono font-bold text-foreground">
                {formatMoney(returnedTotal, "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
              </span>
            </div>
          </div>

          {/* Replacement Items Selector */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-foreground">
              {isAr ? "المنتجات البديلة المراد شحنها" : "Replacement Items to Dispatch"}
            </Label>

            {items.map((row, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-border bg-background space-y-2.5 relative"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1">
                    <Select
                      value={row.variantId}
                      onValueChange={(val) => handleSelectVariant(idx, val)}
                      disabled={loadingVariants}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={isAr ? "اختر المنتج البديل..." : "Select replacement variant..."} />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {variants.map((v) => {
                          const name = isAr
                            ? v.product?.name_ar || v.product?.name_en
                            : v.product?.name_en || v.product?.name_ar;
                          const varName = v.variant_name ? ` (${v.variant_name})` : "";
                          const stock = v.stock_quantity ?? 0;

                          return (
                            <SelectItem
                              key={v.id}
                              value={v.id}
                              disabled={stock <= 0}
                              className="text-xs"
                            >
                              {name} {varName} — {formatMoney(Number(v.selling_price || 0), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")} (
                              {isAr ? `مخزون: ${stock}` : `Stock: ${stock}`})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRow(idx)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{isAr ? "الكمية" : "Quantity"}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) =>
                        handleUpdateRow(idx, "quantity", parseInt(e.target.value, 10) || 1)
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">{isAr ? "سعر القطعة (د.ب)" : "Unit Price (BHD)"}</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={row.unitPrice}
                      onChange={(e) =>
                        handleUpdateRow(idx, "unitPrice", parseFloat(e.target.value) || 0)
                      }
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="w-full h-8 text-xs gap-1 border-dashed"
            >
              <Plus className="h-3.5 w-3.5" />
              {isAr ? "إضافة منتج بديل آخر" : "Add Another Replacement Item"}
            </Button>
          </div>

          {/* Price Difference Calculation Box */}
          <div
            className={
              priceDiff > 0
                ? "p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs"
                : priceDiff < 0
                  ? "p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs"
                  : "p-3 rounded-xl border border-border bg-muted/40 text-xs"
            }
          >
            <div className="flex items-center justify-between font-bold text-sm">
              <span className="text-foreground">
                {priceDiff > 0
                  ? isAr
                    ? "فرق السعر (مطلوب من العميل):"
                    : "Price Difference (Customer Pays):"
                  : priceDiff < 0
                    ? isAr
                      ? "فرق السعر (يُرد للعميل):"
                      : "Price Difference (Brand Refunds):"
                    : isAr
                      ? "استبدال متطابق القيمة (بدون فرق):"
                      : "Even Exchange (No Price Difference):"}
              </span>
              <span className="font-mono font-bold">
                {formatMoney(Math.abs(priceDiff), "BHD", isAr ? "ar-BH-u-nu-latn" : "en-US")}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {priceDiff > 0
                ? isAr
                  ? "سيتم إنشاء طلب جديد بحالة دفع معلقة لفرق السعر، وخصم المخزون آلياً."
                  : "A new order will be created with pending payment for the price difference."
                : isAr
                  ? "سيتم إنشاء طلب جديد مدفوع بالكامل، ويمكن صرف الفرق كرصيد أو استرداد."
                  : "A new fully paid order will be generated and inventory allocated."}
            </p>
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
            onClick={handleCreateExchange}
            disabled={submitting || items.length === 0}
            className="h-9 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isAr ? "تأكيد وإنشاء طلب الاستبدال" : "Confirm Exchange Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
