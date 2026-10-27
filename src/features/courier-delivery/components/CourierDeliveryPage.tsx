import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useBrand } from "@/lib/brand-context";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import {
  courierCompleteDelivery,
  courierConfirmPickup,
  invalidateOrders,
  ordersQueries,
} from "@/lib/data/orders";
import {
  courierDelivery,
  courierNextStep,
  onMyWayMessage,
  type CourierOrder,
  type CourierStage,
} from "../lib/courier-delivery";
import { useOrderNumberFormat } from "@/hooks/use-order-number";
import { orderNumberLabel } from "@/lib/order-number";

/**
 * One delivery, for the courier it is assigned to: who to reach, where to go, what to hand
 * over, how much to collect, and one button for the next step. Made for a phone held in one
 * hand; the same page on a desktop is a single column.
 *
 * It replaces the office's order editor for a courier, which needs store data a courier may
 * not read and never finished loading.
 */

const STAGE_LABEL: Record<CourierStage, { ar: string; en: string }> = {
  pick_up: { ar: "جاهز للاستلام", en: "Ready to pick up" },
  on_the_way: { ar: "في الطريق", en: "On the way" },
  delivered: { ar: "تم التسليم", en: "Delivered" },
  cancelled: { ar: "ملغي", en: "Cancelled" },
};

export function CourierDeliveryPage({ orderId }: { orderId: string }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const numberFormat = useOrderNumberFormat(brand.id);
  const qc = useQueryClient();
  const orderQ = useQuery(ordersQueries.detail(brand.id, orderId, "assigned-courier"));
  const [working, setWorking] = useState(false);
  const [handingOver, setHandingOver] = useState(false);
  const [collected, setCollected] = useState("");
  const [note, setNote] = useState("");

  const backToList = (
    <Button asChild variant="ghost" size="sm" className="h-10 gap-1.5 px-2 text-sm">
      <Link to="/admin/b/$slug/orders" params={{ slug: brand.slug }}>
        {isAr ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
        {isAr ? "توصيلاتي" : "My deliveries"}
      </Link>
    </Button>
  );

  if (orderQ.isPending) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-3 sm:p-6" aria-busy="true">
        <Skeleton className="h-10 w-40 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-36 w-full rounded-2xl" />
      </div>
    );
  }

  if (orderQ.isError || !orderQ.data) {
    return (
      <div className="mx-auto max-w-xl space-y-4 p-3 sm:p-6">
        {backToList}
        <Card className="space-y-2 p-5 text-center">
          <h1 className="text-base font-bold text-foreground">
            {isAr ? "هذا الطلب ليس ضمن توصيلاتك" : "This order is not one of your deliveries"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "قد يكون أُسند إلى مندوب آخر أو تم إلغاؤه. راجع قائمة توصيلاتك."
              : "It may have been given to another courier or cancelled. Check your list."}
          </p>
          <Button variant="outline" className="h-11" onClick={() => void orderQ.refetch()}>
            {isAr ? "إعادة المحاولة" : "Try again"}
          </Button>
        </Card>
      </div>
    );
  }

  const delivery = courierDelivery(orderQ.data as unknown as CourierOrder, lang);
  const step = courierNextStep(delivery.stage);
  const money = (amount: number) => formatMoney(amount, delivery.currency, lang);
  const storeName = (isAr ? brand.name_ar : null) || brand.name_en || "";

  const refresh = async () => {
    await orderQ.refetch();
    void invalidateOrders(qc, brand.id);
  };

  const confirmPickup = async () => {
    setWorking(true);
    try {
      await courierConfirmPickup(orderId, lang);
      toast.success(isAr ? "تم. الطلب الآن في الطريق" : "Done. The order is now on the way");
      await refresh();
    } catch (error) {
      toast.error(
        getFriendlyErrorMessage(error) || (isAr ? "تعذر تحديث الطلب" : "Could not update"),
      );
    } finally {
      setWorking(false);
    }
  };

  const openHandOver = () => {
    setCollected(delivery.toCollect > 0 ? delivery.toCollect.toFixed(3) : "0");
    setNote("");
    setHandingOver(true);
  };

  const amount = Number(collected);
  const amountValid = collected.trim() !== "" && Number.isFinite(amount) && amount >= 0;

  const completeDelivery = async () => {
    if (!amountValid) return;
    setWorking(true);
    try {
      const error = await courierCompleteDelivery(orderId, amount, note.trim() || null);
      if (error) throw error;
      toast.success(isAr ? "تم تسجيل التسليم" : "Delivery recorded");
      setHandingOver(false);
      await refresh();
    } catch (error) {
      const already = String((error as { message?: string })?.message ?? "").includes(
        "DELIVERY_ALREADY_COMPLETED",
      );
      toast.error(
        already
          ? isAr
            ? "تم تسليم هذا الطلب مسبقاً"
            : "This delivery was already completed"
          : getFriendlyErrorMessage(error) ||
              (isAr ? "تعذر تسجيل التسليم" : "Could not record the delivery"),
      );
      if (already) await refresh();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-3 p-3 pb-10 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between gap-2">
        {backToList}
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-foreground">
          {STAGE_LABEL[delivery.stage][lang]}
        </span>
      </div>

      <h1 className="font-display text-xl font-bold text-foreground">
        {isAr ? "طلب" : "Order"} {orderNumberLabel(delivery.number, numberFormat)}
      </h1>

      {/* What to collect, and the one thing to do next */}
      <Card className="space-y-4 border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted-foreground">
              {isAr ? "المبلغ المطلوب تحصيله" : "Amount to collect"}
            </p>
            {delivery.toCollect > 0 ? (
              <p className="font-display text-3xl font-extrabold text-foreground tabular-nums">
                {money(delivery.toCollect)}
              </p>
            ) : (
              <p className="text-lg font-bold text-foreground">
                {isAr ? "مدفوع بالكامل، لا تحصّل شيئاً" : "Paid in full, collect nothing"}
              </p>
            )}
          </div>
        </div>

        {step === "confirm_pickup" && (
          <Button
            className="h-14 w-full gap-2 text-base font-bold"
            disabled={working}
            onClick={confirmPickup}
          >
            {working ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
            {isAr ? "استلمت الطلب، أنا في الطريق" : "I have the parcel, on my way"}
          </Button>
        )}
        {step === "deliver" && (
          <Button
            className="h-14 w-full gap-2 text-base font-bold"
            disabled={working}
            onClick={openHandOver}
          >
            <CheckCircle2 className="h-5 w-5" />
            {delivery.toCollect > 0
              ? isAr
                ? "حصّلت المبلغ وسلّمت الطلب"
                : "Collected and delivered"
              : isAr
                ? "سلّمت الطلب"
                : "Delivered"}
          </Button>
        )}
        {delivery.stage === "delivered" && (
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            {isAr ? "تم تسليم هذا الطلب. شكراً لك." : "This order is delivered. Thank you."}
          </p>
        )}
        {delivery.stage === "cancelled" && (
          <p className="text-sm font-bold text-destructive">
            {isAr ? "هذا الطلب ملغي. لا تسلّمه." : "This order is cancelled. Do not deliver it."}
          </p>
        )}
      </Card>

      {/* Who */}
      <Card className="space-y-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {isAr ? "العميل" : "Customer"}
          </p>
          <p dir="auto" className="break-words text-base font-bold text-foreground text-page-start">
            {delivery.customerName}
          </p>
          {delivery.phoneText && (
            <p dir="ltr" className="text-sm text-muted-foreground tabular-nums text-page-start">
              {delivery.phoneText}
            </p>
          )}
        </div>
        {delivery.phone ? (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" className="h-12 gap-2 text-sm font-bold">
              <a href={`tel:+${delivery.phone}`}>
                <Phone className="h-4 w-4" />
                {isAr ? "اتصال" : "Call"}
              </a>
            </Button>
            <Button asChild variant="outline" className="h-12 gap-2 text-sm font-bold">
              <a
                target="_blank"
                rel="noreferrer"
                href={`https://wa.me/${delivery.phone}?text=${encodeURIComponent(
                  onMyWayMessage({
                    isAr,
                    storeName,
                    customerName: delivery.customerName,
                    number: delivery.number,
                    numberFormat,
                  }),
                )}`}
              >
                <MessageCircle className="h-4 w-4" />
                {isAr ? "واتساب" : "WhatsApp"}
              </a>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isAr ? "لا يوجد رقم هاتف على الطلب." : "There is no phone number on the order."}
          </p>
        )}
      </Card>

      {/* Where */}
      <Card className="space-y-3 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          {isAr ? "عنوان التوصيل" : "Delivery address"}
        </p>
        {delivery.addressLines.length > 0 ? (
          <div className="space-y-0.5">
            {delivery.addressLines.map((line) => (
              <p
                key={line}
                dir="auto"
                className="break-words text-sm font-semibold text-foreground text-page-start"
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-foreground">
            {isAr
              ? "لا يوجد عنوان مفصّل على الطلب. اتصل بالعميل لتأكيد الموقع."
              : "There is no detailed address on the order. Call the customer to confirm the place."}
          </p>
        )}
        {delivery.addressNote && (
          <p
            dir="auto"
            className="rounded-lg bg-muted p-2.5 text-sm text-foreground break-words text-page-start"
          >
            {delivery.addressNote}
          </p>
        )}
        {delivery.mapsUrl && (
          <Button asChild variant="outline" className="h-12 w-full gap-2 text-sm font-bold">
            <a target="_blank" rel="noreferrer" href={delivery.mapsUrl}>
              <Navigation className="h-4 w-4" />
              {isAr ? "فتح في الخرائط" : "Open in Maps"}
            </a>
          </Button>
        )}
      </Card>

      {delivery.notes.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-xs font-semibold text-muted-foreground">
            {isAr ? "ملاحظات" : "Notes"}
          </p>
          {delivery.notes.map((line) => (
            <p
              key={line}
              dir="auto"
              className="whitespace-pre-wrap break-words text-sm text-foreground text-page-start"
            >
              {line}
            </p>
          ))}
        </Card>
      )}

      {/* What */}
      <Card className="space-y-3 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Package className="h-3.5 w-3.5" />
          {isAr ? `محتويات الطلب (${delivery.pieces})` : `In the parcel (${delivery.pieces})`}
        </p>
        <ul className="divide-y divide-border">
          {delivery.items.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p
                  dir="auto"
                  className="break-words text-sm font-semibold text-foreground text-page-start"
                >
                  {item.title}
                </p>
                {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
              </div>
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-bold tabular-nums text-foreground">
                ×{item.quantity}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog open={handingOver} onOpenChange={(open) => !working && setHandingOver(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isAr ? "تأكيد التسليم" : "Confirm the delivery"}</DialogTitle>
            <DialogDescription>
              {delivery.toCollect > 0
                ? isAr
                  ? `المطلوب تحصيله ${money(delivery.toCollect)}. اكتب ما استلمته فعلاً.`
                  : `${money(delivery.toCollect)} is due. Enter what you actually received.`
                : isAr
                  ? "الطلب مدفوع بالكامل. أكّد أنك سلّمته للعميل."
                  : "The order is paid in full. Confirm you handed it to the customer."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {delivery.toCollect > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="courier-collected">
                  {isAr
                    ? `المبلغ المستلم (${delivery.currency})`
                    : `Amount received (${delivery.currency})`}
                </Label>
                <Input
                  id="courier-collected"
                  dir="ltr"
                  inputMode="decimal"
                  className="h-12 text-lg font-bold tabular-nums"
                  value={collected}
                  onChange={(event) => setCollected(event.target.value)}
                />
                {amountValid && Math.abs(amount - delivery.toCollect) > 0.0005 && (
                  <p className="text-xs font-semibold text-destructive">
                    {isAr
                      ? "المبلغ يختلف عن المطلوب. اكتب السبب في الملاحظة."
                      : "This differs from the amount due. Say why in the note."}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="courier-note">{isAr ? "ملاحظة (اختياري)" : "Note (optional)"}</Label>
              <Textarea
                id="courier-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  isAr ? "مثال: استلمه أحد أفراد الأسرة" : "e.g. received by a family member"
                }
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-12"
              disabled={working}
              onClick={() => setHandingOver(false)}
            >
              {isAr ? "رجوع" : "Back"}
            </Button>
            <Button
              className="h-12 gap-2 font-bold"
              disabled={working || !amountValid}
              onClick={completeDelivery}
            >
              {working && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAr ? "تأكيد التسليم" : "Confirm delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
