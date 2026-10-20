import { useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { useAdminStoreProfile } from "@/hooks/use-store-profile";
import { jobSheetPieces, type JobSheetProduct } from "@/features/orders/lib/job-sheet";
import { supplierOrderQueries } from "@/lib/data/supplier-orders";
import { messagePieces, supplierMessage } from "../lib/supplier-message";
import type { SupplierOrder } from "../lib/order-state";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";

/**
 * The order written out for the supplier on WhatsApp: each piece with its size, measurements,
 * the customer's notes for the workshop and extras, and the agreed prices if the store wants
 * them written. Shown before it opens; a person presses send. No customer's name, number or
 * address goes in it.
 */
export function SupplierMessageDialog({
  open,
  onOpenChange,
  brandId,
  order,
  catalog,
  storeName,
  currency,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  order: SupplierOrder;
  catalog: SupplierCatalog;
  storeName: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const [withPrices, setWithPrices] = useState(true);
  const { profile: storeProfile } = useAdminStoreProfile(brandId);
  const customerIds = useMemo(
    () => order.items.map((l) => l.order_item_id).filter(Boolean) as string[],
    [order.items],
  );
  const detailsQ = useQuery({
    ...supplierOrderQueries.pieceDetails(brandId, customerIds),
    enabled: open && customerIds.length > 0,
  });

  const message = useMemo(() => {
    const sheets = new Map(
      (detailsQ.data ?? []).map((item) => {
        const [piece] = jobSheetPieces(
          [{ ...item, location: "custom" } as Parameters<typeof jobSheetPieces>[0][number]],
          catalog.products as unknown as JobSheetProduct[],
          { lang, brandAddons: storeProfile.addons, storeVertical: storeProfile.vertical },
        );
        return [item.id, piece ?? null] as const;
      }),
    );
    return supplierMessage({
      vendorName: order.vendor_name,
      storeName,
      poNumber: order.po_number,
      expectedAt: order.expected_at,
      pieces: messagePieces(
        order.items,
        {
          productName: (id) => catalog.productName(id),
          sizeName: (id) => catalog.sizeName(id),
          customerPiece: (id) => sheets.get(id) ?? null,
        },
        lang,
      ),
      includePrices: withPrices,
      money: (amount) => formatMoney(amount, currency, lang),
      lang,
    });
  }, [detailsQ.data, catalog, order, storeName, withPrices, currency, lang, storeProfile]);

  const chat = whatsappChatUrl(order.vendor_phone);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success(isAr ? "نُسخت الرسالة" : "Message copied");
    } catch {
      toast.error(isAr ? "تعذر النسخ" : "Could not copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="flex max-h-[92dvh] max-w-lg flex-col gap-3 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>
            {isAr ? `رسالة إلى ${order.vendor_name}` : `Message to ${order.vendor_name}`}
          </DialogTitle>
          <DialogDescription>
            {isAr
              ? "القطع ومقاساتها وملاحظات التفصيل، بلا اسم الزبون ولا رقمه. أنت من يضغط إرسال."
              : "The pieces with their sizes and making notes, with no customer name or number. You press send."}
          </DialogDescription>
        </DialogHeader>

        <pre
          dir="auto"
          className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 font-sans text-sm"
        >
          {message}
        </pre>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`${uid}-prices`}
            checked={withPrices}
            onCheckedChange={(checked) => setWithPrices(checked === true)}
          />
          <Label htmlFor={`${uid}-prices`} className="text-sm font-normal">
            {isAr ? "اكتب الأسعار المتفق عليها" : "Write the agreed prices"}
          </Label>
        </div>
        {!chat && (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "لا رقم لهذا المورد: انسخ الرسالة، أو أضف رقمه في دليل الموردين."
              : "This supplier has no number: copy the message, or add their number in the suppliers list."}
          </p>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={copy} className="gap-1.5">
            <Copy className="h-4 w-4" aria-hidden="true" />
            {isAr ? "نسخ" : "Copy"}
          </Button>
          {chat && (
            <Button asChild className="gap-1.5">
              <a
                href={`${chat}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {isAr ? "افتح واتساب" : "Open WhatsApp"}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
