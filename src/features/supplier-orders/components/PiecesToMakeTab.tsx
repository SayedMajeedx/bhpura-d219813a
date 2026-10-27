import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Scissors } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useBrand } from "@/lib/brand-context";
import { useVocabulary } from "@/hooks/use-vocabulary";
import { workshopActionLabels } from "@/lib/store-vocabulary";
import { customerOrderName } from "../lib/customer-pieces";
import { piecesLabel } from "../lib/order-state";
import { daysWaiting } from "../lib/pieces-to-make";
import { usePiecesToMake } from "../hooks/use-pieces-to-make";
import { usePhoneBottomBar } from "../hooks/use-phone-bottom-bar";
import { SendToTailorDialog } from "./SendToTailorDialog";
import { useOrderNumberFormat } from "@/hooks/use-order-number";

/**
 * Customers' made-to-order pieces waiting to go to the workshop, by order, the longest waiting
 * first. Tick pieces from one order or several and send them to one supplier in one go, each at
 * its price this time. The staff's own list names the customer; the supplier is never told.
 */
export function PiecesToMakeTab({ currency, lang }: { currency: string; lang: "ar" | "en" }) {
  const isAr = lang === "ar";
  const numberFormat = useOrderNumberFormat();
  const brand = useBrand();
  const navigate = useNavigate();
  const { vocabulary } = useVocabulary();
  const { groups, isLoading } = usePiecesToMake(brand.id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const chosenGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, lines: g.lines.filter((l) => picked.has(l.id as string)) }))
        .filter((g) => g.lines.length > 0),
    [groups, picked],
  );
  const pieceCount = chosenGroups.reduce(
    (sum, g) => sum + g.lines.reduce((n, l) => n + (l.quantity || 1), 0),
    0,
  );
  const sendWords = workshopActionLabels(vocabulary, lang).send;

  const toggle = (ids: string[], on: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  usePhoneBottomBar("pieces-to-make", groups.length > 0);
  if (isLoading) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        {isAr ? "جارٍ التحميل…" : "Loading…"}
      </Card>
    );
  }
  if (groups.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="h-6 w-6 text-success" aria-hidden="true" />
        {isAr
          ? "لا قطع تنتظر الإرسال: كل طلبات التفصيل المدفوعة عند مورد."
          : "No piece is waiting: every paid made-to-order piece is with a supplier."}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {isAr
          ? "اختر القطع وأرسلها لمورد واحد دفعة وحدة. الأقدم انتظاراً أولاً."
          : "Pick the pieces and send them to one supplier at once. The longest waiting first."}
      </p>
      <ul className="space-y-2">
        {groups.map((group) => {
          const ids = group.lines.map((l) => l.id as string);
          const all = ids.every((id) => picked.has(id));
          const days = daysWaiting(group.createdAt);
          return (
            <li key={group.orderId}>
              <Card className="space-y-2 p-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Checkbox
                    checked={all}
                    onCheckedChange={(checked) => toggle(ids, checked === true)}
                    aria-label={
                      isAr
                        ? `كل قطع ${customerOrderName(group.invoice ?? null, true, numberFormat)}`
                        : `Every piece of ${customerOrderName(group.invoice ?? null, false, numberFormat)}`
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/admin/b/$slug/orders/$id"
                      params={{ slug: brand.slug, id: group.orderId }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {isAr ? `طلب #${group.invoice ?? ""}` : `Order #${group.invoice ?? ""}`}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {group.customerName && <span dir="auto">{group.customerName} · </span>}
                      {isAr
                        ? days === 0
                          ? "اليوم"
                          : `ينتظر منذ ${days} ${days === 1 ? "يوم" : days === 2 ? "يومين" : days <= 10 ? "أيام" : "يوماً"}`
                        : days === 0
                          ? "Today"
                          : `Waiting ${days} ${days === 1 ? "day" : "days"}`}
                    </p>
                  </div>
                </div>
                <ul className="space-y-1 ps-8">
                  {group.lines.map((line) => (
                    <li key={line.id} className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        checked={picked.has(line.id as string)}
                        onCheckedChange={(checked) => toggle([line.id as string], checked === true)}
                        aria-label={isAr ? `اختر ${line.description}` : `Pick ${line.description}`}
                      />
                      <span dir="auto" className="min-w-0 flex-1 break-words text-sm">
                        {line.description}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {piecesLabel(line.quantity || 1, lang)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 z-10 -mx-2 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:rounded-xl sm:border">
        <span className="text-sm text-muted-foreground">
          {pieceCount > 0
            ? isAr
              ? `مختار: ${piecesLabel(pieceCount, "ar")}`
              : `${piecesLabel(pieceCount, "en")} picked`
            : isAr
              ? "اختر القطع لإرسالها"
              : "Pick the pieces to send"}
        </span>
        <Button
          type="button"
          onClick={() => setSending(true)}
          disabled={chosenGroups.length === 0}
          className="min-h-11 gap-1.5 font-bold"
        >
          <Scissors className="h-4 w-4" aria-hidden="true" />
          {sendWords}
        </Button>
      </div>

      {sending && (
        <SendToTailorDialog
          open={sending}
          onOpenChange={setSending}
          brandId={brand.id}
          groups={chosenGroups}
          currency={currency}
          lang={lang}
          title={sendWords}
          onSent={(poId) => {
            setPicked(new Set());
            toast.success(isAr ? "أُرسلت القطع للمورد" : "Pieces sent to the supplier", {
              action: poId
                ? {
                    label: isAr ? "راسل المورد" : "Message the supplier",
                    onClick: () =>
                      navigate({
                        to: "/admin/b/$slug/supplier-orders/$id",
                        params: { slug: brand.slug, id: poId },
                      }),
                  }
                : undefined,
            });
          }}
        />
      )}
    </div>
  );
}
