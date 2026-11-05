import { useEffect, useId, useState } from "react";
import { FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Lang, SheetLang } from "@/features/orders/lib/job-sheet";
import { useProfileOptional } from "@/lib/profile-context";
import { usePrintPurchaseOrder } from "../hooks/use-purchase-order";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";
import type { SupplierOrder } from "../lib/order-state";

/** The supplier order page's "Order" button: prints the order as a document. */
export function PrintPurchaseOrderButton({
  brandId,
  order,
  catalog,
  storeName,
  currency,
  supplierLang,
  lang,
}: {
  brandId: string;
  order: SupplierOrder;
  catalog: SupplierCatalog;
  storeName: string;
  currency: string;
  supplierLang: SheetLang | null | undefined;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const profile = useProfileOptional();
  const [open, setOpen] = useState(false);
  const print = usePrintPurchaseOrder({
    brandId,
    catalog,
    brandName: storeName,
    currency,
    lang,
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-1.5"
        aria-label={isAr ? "اطبع الطلبية" : "Print the order"}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{isAr ? "الطلبية" : "Order"}</span>
      </Button>
      <PurchaseOrderPrintDialog
        open={open}
        onOpenChange={setOpen}
        supplierLang={supplierLang}
        canShowPrices={Boolean(profile?.isAdmin || profile?.canViewFinancials)}
        onPrint={(chosen, withPrices) => void print(order, chosen, withPrices)}
        lang={lang}
      />
    </>
  );
}

/**
 * Printing a supplier order as a document: in Arabic or English (the supplier's language when
 * they chose one), and with the agreed prices only when ticked, by staff who may see them.
 */
export function PurchaseOrderPrintDialog({
  open,
  onOpenChange,
  supplierLang,
  canShowPrices,
  onPrint,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The supplier's own language, if they chose one. */
  supplierLang: SheetLang | null | undefined;
  canShowPrices: boolean;
  onPrint: (sheetLang: Lang, withPrices: boolean) => void;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const start: Lang = supplierLang === "ar" || supplierLang === "en" ? supplierLang : lang;
  const [chosen, setChosen] = useState<Lang>(start);
  const [withPrices, setWithPrices] = useState(false);
  useEffect(() => {
    if (open) {
      setChosen(start);
      setWithPrices(false);
    }
  }, [open, start]);

  const languageName = isAr ? "لغة الورقة" : "Page language";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isAr ? "طباعة طلبية المورّد" : "Print purchase order"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "كل قطعة بتفاصيلها من طلب الزبون: المقاس أو القياسات، الخيارات والملاحظات، ورقم الطلب بدون اسم الزبون."
              : "Each piece with its details from the customer's order: the size or measurements, the options and notes, and the order's number without the customer's name."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{languageName}</p>
          <div role="radiogroup" aria-label={languageName} className="flex flex-wrap gap-2">
            {(["ar", "en"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                role="radio"
                aria-checked={chosen === option}
                variant={chosen === option ? "default" : "outline"}
                size="sm"
                onClick={() => setChosen(option)}
                className="h-9 min-w-20 pointer-coarse:h-11"
              >
                <span lang={option}>{option === "ar" ? "العربية" : "English"}</span>
              </Button>
            ))}
          </div>
        </div>
        {canShowPrices && (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`${uid}-prices`}
              checked={withPrices}
              onCheckedChange={(next) => setWithPrices(next === true)}
            />
            <Label htmlFor={`${uid}-prices`} className="text-sm font-normal">
              {isAr ? "مع الأسعار المتفق عليها والمجموع" : "With the agreed prices and the total"}
            </Label>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onPrint(chosen, canShowPrices && withPrices);
              onOpenChange(false);
            }}
            className="gap-1.5"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {isAr ? "طباعة" : "Print"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
