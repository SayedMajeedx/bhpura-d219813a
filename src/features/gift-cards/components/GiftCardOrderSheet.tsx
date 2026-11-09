import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Check, Copy, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import type { GiftCardPurchase } from "@/lib/data/gift-cards";
import { getGiftCardOrderRecord } from "@/lib/gift-card-purchase.functions";
import { CARD_STATE_WORDS, cardState } from "../lib/gift-cards";
import { localToday } from "@/features/supplier-orders/lib/order-state";
import { purchaseWords } from "../lib/online-sales";
import {
  EMAIL_STATE_WORDS,
  ORDER_STEP_WORDS,
  emailState,
  orderReference,
  orderTotal,
  orderStep,
  orderTimeline,
  paymentWords,
} from "../lib/card-orders";
import {
  PrintStepActions,
  ReceiptButton,
  SendCodeButton,
  TransferActions,
} from "./GiftCardOrderActions";
import { PrintOrderCardButton } from "./PrintCardDialog";

const when = (value: string, lang: "ar" | "en") =>
  new Date(value).toLocaleString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="space-y-1.5 rounded-xl border border-border p-3 text-sm">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-end text-sm">{children}</span>
    </div>
  );
}

/**
 * One gift card order: what it needs, who bought it and how to reach them, who it is for, how it
 * was paid, how the code goes, the card it issued, the buyer's own page and what has happened.
 */
export function GiftCardOrderSheet({
  purchase,
  lang,
  onClose,
  onOpenCard,
}: {
  purchase: GiftCardPurchase | null;
  lang: "ar" | "en";
  onClose: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const isAr = lang === "ar";
  const purchaseId = purchase?.id ?? "";
  const record = useQuery({
    queryKey: ["gift-cards", "order-record", purchaseId],
    queryFn: () => getGiftCardOrderRecord({ data: { purchaseId } }),
    enabled: Boolean(purchaseId),
    retry: false,
  });
  if (!purchase) return null;

  const step = orderStep(purchase);
  const card = purchase.gift_cards;
  const amount = formatMoney(Number(purchase.amount), purchase.currency, lang);
  const chat = whatsappChatUrl(purchase.buyer_phone);
  const printChat = whatsappChatUrl(purchase.print_phone);
  const fee = Number(purchase.print_fee ?? 0);
  const emailed = purchase.delivery_channel === "email";
  const emailNow = record.data
    ? EMAIL_STATE_WORDS[emailState(record.data.paidEmail, record.data.hasMailbox)][lang]
    : null;
  const cardNow =
    card?.status != null
      ? cardState(
          {
            status: card.status,
            balance: card.balance ?? 0,
            expires_on: card.expires_on,
          },
          localToday(),
        )
      : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent dir={isAr ? "rtl" : "ltr"} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-start">
          <SheetTitle>{amount}</SheetTitle>
          <SheetDescription>
            <span dir="ltr">{orderReference(purchase)}</span> · {purchaseWords(purchase)[lang]}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {step && (
            <section className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="text-sm font-semibold">{ORDER_STEP_WORDS[step][lang]}</p>
              {step === "check_transfer" ? (
                <>
                  {purchase.receipt_key && <ReceiptButton purchase={purchase} lang={lang} />}
                  <TransferActions purchase={purchase} lang={lang} />
                </>
              ) : step === "send_code" ? (
                <SendCodeButton purchase={purchase} lang={lang} />
              ) : (
                <PrintStepActions purchase={purchase} lang={lang} />
              )}
            </section>
          )}

          <Block title={isAr ? "المشتري" : "Buyer"}>
            <p className="font-medium break-words text-page-start" dir="auto">
              {purchase.buyer_name}
            </p>
            {purchase.buyer_phone && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <a
                  href={`tel:${purchase.buyer_phone}`}
                  className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2"
                  dir="ltr"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {purchase.buyer_phone}
                </a>
                {chat && (
                  <a
                    href={chat}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2"
                  >
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    {isAr ? "واتساب" : "WhatsApp"}
                  </a>
                )}
              </div>
            )}
            {purchase.buyer_email && (
              <a
                href={`mailto:${purchase.buyer_email}`}
                className="inline-flex min-h-6 items-center gap-1 text-xs break-all underline underline-offset-2"
                dir="ltr"
              >
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                {purchase.buyer_email}
              </a>
            )}
            <Row label={isAr ? "لغة الشراء" : "Language"}>
              {purchase.lang === "en" ? "English" : "العربية"}
            </Row>
            <Row label={isAr ? "الحساب" : "Account"}>
              {purchase.buyer_user_id
                ? isAr
                  ? "مسجّل الدخول"
                  : "Signed in"
                : isAr
                  ? "ضيف"
                  : "Guest"}
            </Row>
          </Block>

          {(purchase.recipient_name || purchase.message) && (
            <Block title={isAr ? "الهدية" : "The gift"}>
              {purchase.recipient_name && (
                <Row label={isAr ? "إلى" : "For"}>{purchase.recipient_name}</Row>
              )}
              {purchase.message && (
                <p className="text-sm break-words text-page-start" dir="auto">
                  “{purchase.message}”
                </p>
              )}
            </Block>
          )}

          <Block title={isAr ? "الدفع" : "Payment"}>
            <Row label={isAr ? "الطريقة" : "Method"}>
              {paymentWords(purchase.payment_method, lang)}
            </Row>
            <Row label={isAr ? "الحالة" : "Status"}>{purchaseWords(purchase)[lang]}</Row>
            {purchase.print_by_store && (
              <>
                <Row label={isAr ? "قيمة البطاقة" : "Card value"}>{amount}</Row>
                <Row label={isAr ? "الطباعة والتوصيل" : "Printing and delivery"}>
                  {formatMoney(fee, purchase.currency, lang)}
                </Row>
                <Row label={isAr ? "المدفوع" : "Paid"}>
                  <span className="font-semibold">
                    {formatMoney(orderTotal(purchase), purchase.currency, lang)}
                  </span>
                </Row>
              </>
            )}
            {purchase.gateway_reference && (
              <Row label={isAr ? "مرجع الدفع" : "Payment reference"}>
                <span className="font-mono text-xs" dir="ltr">
                  {purchase.gateway_reference}
                </span>
              </Row>
            )}
            {purchase.receipt_key && !step && (
              <div className="pt-1">
                <ReceiptButton purchase={purchase} lang={lang} />
              </div>
            )}
            {purchase.cancel_reason && (
              <Row label={isAr ? "السبب" : "Reason"}>{purchase.cancel_reason}</Row>
            )}
          </Block>

          <Block title={isAr ? "تسليم الرمز" : "Delivering the code"}>
            <Row label={isAr ? "الطريقة" : "By"}>
              {emailed ? (isAr ? "البريد" : "Email") : isAr ? "واتساب" : "WhatsApp"}
            </Row>
            <Row label={isAr ? "إلى" : "To"}>
              <span dir="ltr">{emailed ? purchase.buyer_email : purchase.buyer_phone}</span>
            </Row>
            {purchase.status === "paid" && (
              <Row label={isAr ? "الحالة" : "Status"}>
                {emailed
                  ? (emailNow ?? "…")
                  : purchase.code_sent_at
                    ? isAr
                      ? "أُرسل الرمز"
                      : "Code sent"
                    : isAr
                      ? "لم يُرسل بعد"
                      : "Not sent yet"}
              </Row>
            )}
            {purchase.status === "paid" && !step && (
              <div className="pt-1">
                {!emailed && <SendCodeButton purchase={purchase} lang={lang} />}
              </div>
            )}
          </Block>

          {purchase.print_by_store && (
            <Block title={isAr ? "الطباعة والتوصيل" : "Printing and delivery"}>
              <p className="text-sm break-words text-page-start" dir="auto">
                {purchase.print_address}
              </p>
              {purchase.print_phone && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <a
                    href={`tel:${purchase.print_phone}`}
                    className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2"
                    dir="ltr"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    {purchase.print_phone}
                  </a>
                  {printChat && (
                    <a
                      href={printChat}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2"
                    >
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                      {isAr ? "واتساب" : "WhatsApp"}
                    </a>
                  )}
                </div>
              )}
              <Row label={isAr ? "الحالة" : "Status"}>
                {purchase.print_delivered_at
                  ? isAr
                    ? "وصلت"
                    : "Delivered"
                  : purchase.printed_at
                    ? isAr
                      ? "طُبعت، بانتظار التوصيل"
                      : "Printed, to deliver"
                    : purchase.status === "paid"
                      ? isAr
                        ? "لم تُطبع بعد"
                        : "Not printed yet"
                      : isAr
                        ? "بعد الدفع"
                        : "Once paid"}
              </Row>
              {purchase.status === "paid" && step !== "print_card" && step !== "deliver_card" && (
                <div className="pt-1">
                  <PrintOrderCardButton purchase={purchase} lang={lang} />
                </div>
              )}
            </Block>
          )}

          {card && (
            <Block title={isAr ? "البطاقة" : "The card"}>
              <Row label={isAr ? "الرمز" : "Code"}>
                <span className="font-mono font-semibold" dir="ltr">
                  {card.code}
                </span>
              </Row>
              {card.balance != null && (
                <Row label={isAr ? "الرصيد" : "Balance"}>
                  <span dir="ltr">
                    {formatMoney(Number(card.balance), purchase.currency, lang)}
                  </span>
                </Row>
              )}
              {cardNow && (
                <Row label={isAr ? "حالة البطاقة" : "Card status"}>
                  {CARD_STATE_WORDS[cardNow][lang]}
                </Row>
              )}
              {purchase.gift_card_id && (
                <div className="pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenCard(purchase.gift_card_id as string)}
                  >
                    {isAr ? "فتح البطاقة" : "Open the card"}
                  </Button>
                </div>
              )}
            </Block>
          )}

          <BuyerPage link={record.data?.link ?? null} failed={record.isError} lang={lang} />

          <Block title={isAr ? "السجل" : "History"}>
            <ol className="space-y-1">
              {orderTimeline(purchase).map((moment) => (
                <li key={moment.key} className="flex items-start justify-between gap-3 text-xs">
                  <span className="font-medium">{moment[lang]}</span>
                  <span className="shrink-0 text-muted-foreground">{when(moment.at, lang)}</span>
                </li>
              ))}
            </ol>
          </Block>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The buyer's own page for the order: to open, or to copy and send them again. */
function BuyerPage({
  link,
  failed,
  lang,
}: {
  link: string | null;
  failed: boolean;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error(isAr ? "تعذّر النسخ" : "Could not copy");
    }
  };
  return (
    <Block title={isAr ? "صفحة المشتري" : "Buyer's page"}>
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "رابط خاص بهذا الطلب، ويظهر فيه الرمز بعد الدفع. أرسله للمشتري فقط."
          : "A private link to this order, showing the code once paid. Share it with the buyer only."}
      </p>
      {failed ? (
        <p className="text-xs text-destructive">
          {isAr ? "تعذّر جلب الرابط." : "The link could not be loaded."}
        </p>
      ) : link ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              {isAr ? "فتح الصفحة" : "Open the page"}
            </a>
          </Button>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? (isAr ? "نُسخ" : "Copied") : isAr ? "نسخ الرابط" : "Copy the link"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">…</p>
      )}
    </Block>
  );
}
