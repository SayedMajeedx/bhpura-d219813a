import { useState } from "react";
import {
  BellRing,
  CalendarClock,
  Check,
  Heart,
  MessageCircle,
  MessageCircleQuestion,
  Pencil,
  ShoppingBag,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SUGGESTION_REASONS,
  type OutreachCard,
  type OutreachReason,
} from "@/features/outreach/lib/outreach";
import { REASON_LABELS, outreachWhy } from "@/features/outreach/lib/outreach-messages";
import type { OutreachPageState } from "@/features/outreach/hooks/use-outreach-page";

const ICONS: Record<OutreachReason, LucideIcon> = {
  back_in_stock: BellRing,
  cart: ShoppingBag,
  aftercare: Heart,
  new_in_size: Sparkles,
  due_back: CalendarClock,
  ask_consent: MessageCircleQuestion,
};

/** "Today", "Yesterday", "3 days ago", with Western digits in Arabic as the admin writes them. */
export function sinceLabel(at: string, now: number, lang: "ar" | "en") {
  const days = Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000));
  return new Intl.RelativeTimeFormat(lang === "ar" ? "ar-u-nu-latn" : "en", {
    numeric: "auto",
  }).format(-days, "day");
}

/** "+973 •••• 0016": enough to recognise the number, not to copy it from over a shoulder. */
export function maskedNumber(contact: string) {
  const tail = contact.slice(-4);
  const code = contact.length > 8 ? contact.slice(0, contact.length - 8) : "";
  return `${code ? `+${code} ` : ""}•••• ${tail}`;
}

/** One client: who, why now, the message as it will be sent, and one tap to open the chat. */
export function OutreachCardView({
  page,
  card,
  now,
}: {
  page: OutreachPageState;
  card: OutreachCard;
  now: number;
}) {
  const { isAr, lang } = page;
  const [editing, setEditing] = useState(false);
  const Icon = ICONS[card.reason];
  const suggestion = SUGGESTION_REASONS.includes(card.reason);
  const messageLang = page.langOf(card);
  const text = page.textOf(card);
  const busy = page.busyKey === card.key;
  const asking = card.reason === "ask_consent";
  const who = card.name?.trim() || (isAr ? "عميل بدون اسم" : "Unnamed client");
  const messageId = `outreach-message-${card.key.replace(/[^a-zA-Z0-9-]/g, "-")}`;

  return (
    <article
      aria-label={`${who}: ${REASON_LABELS[card.reason][lang]}`}
      className="min-w-0 rounded-2xl border border-border-subtle bg-card p-4 shadow-2xs"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary"
        >
          {who.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3
              dir="auto"
              className="text-page-start min-w-0 break-words font-semibold leading-snug line-clamp-2"
            >
              {who}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                suggestion || asking
                  ? "bg-muted text-muted-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {REASON_LABELS[card.reason][lang]}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span dir="ltr">{maskedNumber(card.contact)}</span>
            <span aria-hidden="true"> · </span>
            {sinceLabel(card.since, now, lang)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-foreground/90">
        {outreachWhy(card, lang, page.ctx)}
      </p>

      <div className="mt-3 rounded-xl border border-border-subtle bg-muted/40">
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-1.5">
          <span id={messageId} className="text-xs font-medium text-muted-foreground">
            {isAr ? "الرسالة" : "Message"}
          </span>
          <div className="flex items-center gap-1">
            <div
              role="group"
              aria-label={isAr ? "لغة الرسالة" : "Message language"}
              className="flex rounded-lg bg-background p-0.5"
            >
              {(["ar", "en"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={messageLang === value}
                  onClick={() => page.setLang(card, value)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-xs font-semibold transition-colors",
                    messageLang === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value === "ar" ? "ع" : "EN"}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={editing}
              aria-label={isAr ? "تعديل الرسالة" : "Edit the message"}
              onClick={() => setEditing((open) => !open)}
              className="h-7 w-7 p-0"
            >
              <Pencil className="size-3.5" />
            </Button>
          </div>
        </div>
        {editing ? (
          <Textarea
            aria-labelledby={messageId}
            dir={messageLang === "ar" ? "rtl" : "ltr"}
            value={text}
            onChange={(event) => page.setText(card, event.target.value)}
            rows={6}
            className="min-h-32 rounded-t-none border-0 bg-transparent text-sm focus-visible:ring-2"
          />
        ) : (
          <p
            dir={messageLang === "ar" ? "rtl" : "ltr"}
            className="whitespace-pre-wrap break-words px-3 py-2.5 text-sm leading-relaxed"
          >
            {text}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => page.send(card)}
          disabled={busy || !text.trim()}
          className="min-w-0 flex-1 gap-2 sm:flex-none"
        >
          <MessageCircle className="size-4" />
          {asking
            ? isAr
              ? "اسأله على واتساب"
              : "Ask on WhatsApp"
            : isAr
              ? "افتح واتساب بالرسالة"
              : "Open WhatsApp with it"}
        </Button>
        {asking && card.customerId && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void page.recordAgreed(card)}
            disabled={busy}
            className="gap-1.5"
          >
            <Check className="size-4" />
            {isAr ? "وافق مسبقاً" : "Already agreed"}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => page.skip(card)} disabled={busy}>
          {isAr ? "ليس الآن" : "Not now"}
        </Button>
      </div>
    </article>
  );
}
