import { Link } from "@tanstack/react-router";
import { FileText, MessageCircle } from "lucide-react";
import { formatPrice } from "@/lib/storefront-context";
import { orderLineName } from "@/lib/order-line-name";
import { orderNumberLabel } from "@/lib/order-number";
import { paymentNote, type OrderReceipt } from "@/features/order-receipt/lib/order-receipt";
import { lineFields } from "@/lib/made-to-measure";
import { formatCustomField } from "@/lib/addons/custom-fields";
import { expectedDay } from "@/lib/delivery-estimate";

/**
 * An order as its shopper reads it: its number, what is in it, what it costs and how it is
 * paid, with its invoice. On the thank-you page and the order tracking page.
 */
export function OrderReceiptCard({
  receipt,
  lang,
  slug,
  trackLink = false,
  reviewMeasurements = false,
  askUrl = null,
  askLabel = null,
}: {
  receipt: OrderReceipt;
  lang: "ar" | "en";
  slug: string;
  /** Offer the tracking page (on the thank-you page; the tracking page is where it leads). */
  trackLink?: boolean;
  /** Show a piece's measurements to check, while it has not gone to the workshop. */
  reviewMeasurements?: boolean;
  /** A chat with the store about this order, and what the button says. */
  askUrl?: string | null;
  askLabel?: string | null;
}) {
  const ar = lang === "ar";
  const money = (amount: number) => formatPrice(amount, receipt.currency, lang);
  const number = orderNumberLabel(receipt.invoiceNumber, receipt.numberFormat);
  const payment = paymentNote(receipt, lang);
  const expected =
    receipt.estimateDays && !["completed", "cancelled"].includes(receipt.status)
      ? expectedDay(receipt.createdAt, receipt.estimateDays, lang)
      : null;
  // Each piece being made, with what was typed for it.
  const toCheck = reviewMeasurements
    ? receipt.lines.flatMap((line) => {
        if (line.location !== "custom") return [];
        const fields = lineFields(line.custom_field_values);
        const rows = [...fields.rows].flatMap((field) => {
          const shown = formatCustomField(
            { ...field, key: field.key ?? "", value: String(field.value ?? "") },
            lang,
          );
          return shown ? [shown] : [];
        });
        return rows.length > 0 || fields.notes.length > 0
          ? [{ name: orderLineName(line, lang), rows, notes: fields.notes }]
          : [];
      })
    : [];
  const rows: Array<[string, string]> = [
    [ar ? "المجموع الفرعي" : "Subtotal", money(receipt.subtotal)],
    ...(receipt.discount > 0
      ? ([[ar ? "الخصم" : "Discount", `− ${money(receipt.discount)}`]] as Array<[string, string]>)
      : []),
    ...(receipt.shipping > 0
      ? ([[ar ? "التوصيل" : "Delivery", money(receipt.shipping)]] as Array<[string, string]>)
      : []),
    ...(receipt.tax > 0
      ? ([[ar ? "ضريبة القيمة المضافة" : "VAT", money(receipt.tax)]] as Array<[string, string]>)
      : []),
  ];

  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-card p-5 text-start sm:p-6"
      aria-label={ar ? `الطلب ${number}` : `Order ${number}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">{ar ? "رقم الطلب" : "Order number"}</p>
        <p className="font-display text-xl font-semibold" dir="ltr">
          {number}
        </p>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {receipt.lines.map((line, index) => (
          <li key={index} className="flex items-start justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0 break-words" dir="auto">
              {orderLineName(line, lang)}
              {line.quantity > 1 && (
                <span className="text-muted-foreground" dir="ltr">
                  {" "}
                  × {line.quantity}
                </span>
              )}
            </span>
            <span className="shrink-0 font-medium tabular-nums">{money(line.line_total)}</span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-muted-foreground">
            <dt>{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-1 text-base font-semibold">
          <dt>{ar ? "الإجمالي" : "Total"}</dt>
          <dd className="tabular-nums">{money(receipt.total)}</dd>
        </div>
      </dl>

      {payment && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground">{payment}</p>
      )}

      {expected && (
        <p className="text-sm text-muted-foreground">
          {ar ? "الموعد المتوقع: قبل " : "Expected by "}
          <span className="font-semibold text-foreground">{expected}</span>
        </p>
      )}

      {toCheck.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-sm font-semibold">
            {ar ? "راجع مقاساتك قبل بدء التجهيز" : "Check your measurements before work starts"}
          </p>
          {toCheck.map((piece) => (
            <div key={piece.name} className="space-y-1">
              {toCheck.length > 1 && (
                <p className="text-xs font-semibold" dir="auto">
                  {piece.name}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {piece.rows.map((row) => (
                  <div key={row.key} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-medium tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {piece.notes.map((note) => (
                <p key={note} className="text-xs text-muted-foreground" dir="auto">
                  {note}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {receipt.invoiceToken && (
          <Link
            to="/invoice/$id"
            params={{ id: receipt.invoiceToken }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
          >
            <FileText className="size-4" aria-hidden="true" />
            {ar ? "عرض الفاتورة" : "View invoice"}
          </Link>
        )}
        {trackLink && receipt.invoiceNumber !== null && (
          <Link
            to="/$slug/track-order"
            params={{ slug }}
            search={{ number: number }}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
          >
            {ar ? "تتبّع الطلب" : "Track this order"}
          </Link>
        )}
        {askUrl && askLabel && (
          <a
            href={askUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted"
          >
            <MessageCircle className="size-4" aria-hidden="true" />
            {askLabel}
          </a>
        )}
      </div>
    </section>
  );
}
