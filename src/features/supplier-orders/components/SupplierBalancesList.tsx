import { MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/format";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import type { SupplierBalance } from "../lib/payments";
import { ordersLabel } from "../lib/order-state";

/** Each supplier the store owes money or awaits goods from, most owed first. */
export function SupplierBalancesList({
  balances,
  currency,
  lang,
}: {
  balances: readonly SupplierBalance[];
  currency: string;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  if (balances.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr
          ? "لا شيء عليك لأي مورد، ولا شيء بانتظار الوصول."
          : "You owe no supplier anything, and nothing is on its way."}
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {balances.map((supplier) => {
        const chat = whatsappChatUrl(supplier.phone);
        return (
          <li key={supplier.vendorId}>
            <Card className="flex min-w-0 items-center gap-3 p-3 sm:p-4">
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
                      {isAr ? `· ${supplier.lateOrders} متأخرة` : `· ${supplier.lateOrders} late`}
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
                  {formatMoney(supplier.owed, currency, lang)}
                </p>
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
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
