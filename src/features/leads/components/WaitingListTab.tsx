import { useState } from "react";
import { Check, Mail, MessageCircle, Package, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { productName, type WaitingGroup, type WaitingRequest } from "@/features/leads/lib/leads";

/**
 * Who asked to be told when a product is back, grouped by what they wait for. A member of staff
 * tells them: the button opens the shopper's WhatsApp chat or a new email with the message
 * written, and the request is marked as told. Nothing is sent by the system.
 */
export function WaitingListTab({
  groups,
  told,
  lang,
  busy,
  linkFor,
  onTell,
  onMarkTold,
  onWaitAgain,
  onRemove,
}: {
  groups: WaitingGroup[];
  told: WaitingRequest[];
  lang: "ar" | "en";
  busy: boolean;
  /** Where "Tell them" goes for a request, or null when its contact cannot be reached. */
  linkFor: (group: WaitingGroup, request: WaitingRequest) => string | null;
  onTell: (group: WaitingGroup, request: WaitingRequest) => void;
  onMarkTold: (ids: string[]) => void;
  onWaitAgain: (id: string) => void;
  onRemove: (ids: string[]) => void;
}) {
  const isAr = lang === "ar";
  const [showTold, setShowTold] = useState(false);

  if (groups.length === 0 && told.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-8 text-center text-xs text-muted-foreground">
        <p className="text-sm font-bold text-foreground">
          {isAr ? "لا أحد ينتظر" : "Nobody is waiting"}
        </p>
        <p className="mt-1">
          {isAr
            ? "عندما يطلب متسوق إشعاره عند توفر منتج نفد، يظهر هنا."
            : "When a shopper asks to be told that a sold-out product is back, they appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <section
          key={group.key}
          className="min-w-0 space-y-3 rounded-xl border border-border-subtle bg-card p-3.5 shadow-2xs"
        >
          <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-muted">
                {group.product?.image_url ? (
                  <img
                    src={group.product.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Package className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <h3
                  dir="auto"
                  className="text-page-start line-clamp-2 break-words text-sm font-bold text-foreground"
                >
                  {productName(group.product, lang)}
                </h3>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">
                  {group.option ? `${group.option} · ` : ""}
                  {isAr ? `${group.requests.length} بانتظاره` : `${group.requests.length} waiting`}
                </p>
              </div>
            </div>
            <StockMark group={group} isAr={isAr} />
          </header>

          <ul className="divide-y divide-border/50">
            {group.requests.map((request) => {
              const link = linkFor(group, request);
              return (
                <li
                  key={request.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {request.channel === "email" ? (
                      <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p
                        dir="ltr"
                        className="text-page-start break-all font-mono text-xs font-semibold"
                      >
                        {request.contact}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(request.created_at, isAr ? "ar-BH" : "en-BH")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={busy || !group.backInStock || !link}
                      title={
                        !group.backInStock
                          ? isAr
                            ? "لم يتوفر بعد"
                            : "Not back in stock yet"
                          : undefined
                      }
                      onClick={() => onTell(group, request)}
                    >
                      {isAr ? "أخبره الآن" : "Tell them"}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={busy}
                      aria-label={isAr ? "تم إخباره" : "Mark as told"}
                      title={isAr ? "تم إخباره" : "Mark as told"}
                      onClick={() => onMarkTold([request.id])}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground"
                      disabled={busy}
                      aria-label={isAr ? "حذف الطلب" : "Remove request"}
                      title={isAr ? "حذف الطلب" : "Remove request"}
                      onClick={() => onRemove([request.id])}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {told.length > 0 && (
        <section className="rounded-xl border border-border-subtle bg-card p-3.5 shadow-2xs">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-start text-xs font-bold text-foreground"
            aria-expanded={showTold}
            onClick={() => setShowTold((open) => !open)}
          >
            <span>{isAr ? `تم إخبارهم (${told.length})` : `Already told (${told.length})`}</span>
            <span className="text-muted-foreground">
              {showTold ? (isAr ? "إخفاء" : "Hide") : isAr ? "عرض" : "Show"}
            </span>
          </button>
          {showTold && (
            <ul className="mt-2 divide-y divide-border/50">
              {told.slice(0, 50).map((request) => (
                <li
                  key={request.id}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p dir="ltr" className="text-page-start break-all font-mono text-xs">
                      {request.contact}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "أُخبر في " : "Told on "}
                      {formatDate(request.notified_at, isAr ? "ar-BH" : "en-BH")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() => onWaitAgain(request.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {isAr ? "ما زال ينتظر" : "Still waiting"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function StockMark({ group, isAr }: { group: WaitingGroup; isAr: boolean }) {
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold";
  if (!group.product) {
    return (
      <span className={`${base} border-border-subtle bg-muted text-muted-foreground`}>
        {isAr ? "المنتج محذوف" : "Product deleted"}
      </span>
    );
  }
  if (group.backInStock) {
    return (
      <span
        className={`${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400`}
      >
        {isAr ? "متوفر الآن" : "Back in stock"}
      </span>
    );
  }
  return (
    <span className={`${base} border-border-subtle bg-muted text-muted-foreground`}>
      {group.product.is_active === false
        ? isAr
          ? "مخفي من المتجر"
          : "Hidden from the store"
        : isAr
          ? "لم يتوفر بعد"
          : "Still out of stock"}
    </span>
  );
}
