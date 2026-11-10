import { useMemo, useState } from "react";
import { ChevronDown, FileText, MessageCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import { useMoneyLabel } from "@/hooks/use-store-currency";
import { useBrand } from "@/lib/brand-context";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { cn } from "@/lib/utils";
import { supplierBalances } from "../lib/payments";
import { ordersLabel, type SupplierOrder } from "../lib/order-state";
import {
  methodLabel,
  paymentCredit,
  supplierCredits,
  type AccountPayment,
} from "../lib/supplier-account";
import { SupplierPaymentDialog } from "./SupplierPaymentDialog";
import { SupplierStatementDialog } from "./SupplierStatementDialog";

/**
 * Each supplier the store owes money, awaits goods from or holds credit with, most owed first:
 * a payment to them in one press, spread over their orders, every payment made to them with its
 * day, how it was paid and the orders it paid, and their statement of account; a supplier with
 * nothing open keeps a way to their statement.
 */
export function SupplierBalancesList({
  brandId,
  orders,
  payments,
  today,
  currency,
  lang,
}: {
  brandId: string;
  orders: readonly SupplierOrder[];
  payments: readonly AccountPayment[];
  today: string;
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const moneyLabel = useMoneyLabel(lang);
  const credits = useMemo(() => supplierCredits(payments), [payments]);
  const balances = useMemo(
    () => supplierBalances(orders, today, credits),
    [orders, today, credits],
  );
  const [paying, setPaying] = useState<{ id: string; name: string } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [statementFor, setStatementFor] = useState<{
    id: string;
    name: string;
    phone: string | null;
  } | null>(null);
  const brand = useBrand() as { slug: string; name_ar?: string | null; name_en?: string | null };
  const store =
    (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || brand.slug;
  // Suppliers with orders but nothing owed, on its way or held: their statement stays a tap away.
  const settled = useMemo(() => {
    const listed = new Set(balances.map((b) => b.vendorId));
    const seen = new Map<string, { id: string; name: string; phone: string | null }>();
    for (const order of orders) {
      if (order.status === "draft" || listed.has(order.vendor_id)) continue;
      if (!seen.has(order.vendor_id)) {
        seen.set(order.vendor_id, {
          id: order.vendor_id,
          name: order.vendor_name,
          phone: order.vendor_phone,
        });
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [balances, orders]);
  const money = (n: number) => formatMoney(n, currency, lang);
  const locale = isAr ? "ar-BH" : "en-BH";

  return (
    <>
      {balances.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          {isAr
            ? "لا شيء عليك لأي مورد، ولا شيء بانتظار الوصول."
            : "You owe no supplier anything, and nothing is on its way."}
        </Card>
      )}
      <ul className="space-y-2">
        {balances.map((supplier) => {
          const chat = whatsappChatUrl(supplier.phone);
          const theirs = payments
            .filter((p) => p.vendor_id === supplier.vendorId)
            .slice()
            .reverse();
          const open = opened === supplier.vendorId;
          return (
            <li key={supplier.vendorId}>
              <Card className="space-y-2 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="text-page-start line-clamp-2 break-words font-bold">
                      {supplier.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {supplier.openOrders > 0
                        ? `${ordersLabel(supplier.openOrders, lang)} ${isAr ? "بانتظار الاستلام" : "awaiting delivery"}`
                        : isAr
                          ? "وصل كل ما طلبته منه"
                          : "Everything ordered has arrived"}
                      {supplier.lateOrders > 0 && (
                        <span className="ms-1 font-semibold text-warning">
                          {isAr
                            ? `· ${supplier.lateOrders} متأخرة`
                            : `· ${supplier.lateOrders} late`}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-xs text-muted-foreground">{isAr ? "عليك" : "You owe"}</p>
                    <p
                      className={
                        supplier.owed > 0
                          ? "font-bold tabular-nums text-warning"
                          : "font-bold tabular-nums"
                      }
                    >
                      {money(supplier.owed)}
                    </p>
                    {supplier.credit > 0 && (
                      <p className="text-xs tabular-nums text-success">
                        {isAr
                          ? `لك عنده ${money(supplier.credit)}`
                          : `Credit ${money(supplier.credit)}`}
                      </p>
                    )}
                  </div>
                  {chat && (
                    <a
                      href={chat}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={
                        isAr
                          ? `محادثة ${supplier.name} على واتساب`
                          : `Chat with ${supplier.name} on WhatsApp`
                      }
                      className="grid size-10 shrink-0 place-items-center rounded-md border border-border hover:bg-muted"
                    >
                      <MessageCircle className="h-4 w-4 text-success" aria-hidden="true" />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setPaying({ id: supplier.vendorId, name: supplier.name })}
                  >
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    {isAr ? "تسجيل دفعة" : "Record payment"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() =>
                      setStatementFor({
                        id: supplier.vendorId,
                        name: supplier.name,
                        phone: supplier.phone,
                      })
                    }
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {isAr ? "كشف الحساب" : "Statement"}
                  </Button>
                  {theirs.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      aria-expanded={open}
                      onClick={() => setOpened(open ? null : supplier.vendorId)}
                    >
                      {isAr ? `الدفعات (${theirs.length})` : `Payments (${theirs.length})`}
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-(--motion-quick)",
                          open && "rotate-180",
                        )}
                        aria-hidden="true"
                      />
                    </Button>
                  )}
                </div>
                {open && (
                  <ul className="divide-y divide-border-subtle border-t border-border-subtle text-sm">
                    {theirs.map((payment) => (
                      <PaymentRow
                        key={payment.id}
                        payment={payment}
                        money={money}
                        locale={locale}
                        lang={lang}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {settled.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {isAr ? "كشف حساب مورد آخر:" : "Another supplier's statement:"}
          </span>
          {settled.map((s) => (
            <Button
              key={s.id}
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setStatementFor(s)}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span dir="auto">{s.name}</span>
            </Button>
          ))}
        </div>
      )}
      {statementFor && (
        <SupplierStatementDialog
          open
          onOpenChange={(next) => !next && setStatementFor(null)}
          supplier={statementFor}
          orders={orders}
          payments={payments}
          store={store}
          slug={brand.slug}
          currency={currency}
          lang={lang}
        />
      )}
      {paying && (
        <SupplierPaymentDialog
          open
          onOpenChange={(next) => !next && setPaying(null)}
          brandId={brandId}
          vendor={paying}
          orders={orders}
          credit={credits.get(paying.id) ?? 0}
          currency={currency}
          moneyLabel={moneyLabel}
          lang={lang}
        />
      )}
    </>
  );
}

/** One payment to a supplier: when, how, how much, and what it paid. */
function PaymentRow({
  payment,
  money,
  locale,
  lang,
}: {
  payment: AccountPayment;
  money: (n: number) => string;
  locale: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  const voided = Boolean(payment.voided_at);
  const paid = [
    ...new Set(payment.applied.filter((a) => !a.voided && a.po_number).map((a) => a.po_number)),
  ];
  const credit = paymentCredit(payment);
  return (
    <li className="py-2">
      <p className={voided ? "text-muted-foreground line-through" : "font-semibold"}>
        <span className="tabular-nums">{money(payment.amount)}</span>
        <span className="ms-2 text-xs font-normal text-muted-foreground">
          {formatDate(payment.paid_on, locale)} · {methodLabel(payment.method, lang)}
        </span>
      </p>
      {!voided && (paid.length > 0 || credit > 0) && (
        <p className="text-xs text-muted-foreground">
          {paid.length > 0 && (isAr ? `دفعت ${paid.join("، ")}` : `Paid ${paid.join(", ")}`)}
          {paid.length > 0 && credit > 0 && " · "}
          {credit > 0 && (isAr ? `رصيد ${money(credit)}` : `Credit ${money(credit)}`)}
        </p>
      )}
      {(payment.reference || payment.note) && (
        <p dir="auto" className="text-page-start break-words text-xs text-muted-foreground">
          {[payment.reference, payment.note].filter(Boolean).join(" · ")}
        </p>
      )}
      {voided && (
        <p dir="auto" className="text-page-start break-words text-xs text-muted-foreground">
          {isAr ? "أُلغيت: " : "Taken back: "}
          {payment.void_reason}
        </p>
      )}
    </li>
  );
}
