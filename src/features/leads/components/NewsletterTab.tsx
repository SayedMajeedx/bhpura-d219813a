import { Copy, Download, Mail, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { subscriberCounts, type Subscriber } from "@/features/leads/lib/leads";

/**
 * The people who signed up for the store's news on the storefront. The store writes to them
 * with its own tools: the list can be copied or downloaded, and a person who asks to be taken
 * off it is removed here.
 */
export function NewsletterTab({
  subscribers,
  lang,
  busy,
  onDownload,
  onCopy,
  onRemove,
}: {
  subscribers: Subscriber[];
  lang: "ar" | "en";
  busy: boolean;
  onDownload: () => void;
  onCopy: () => void;
  onRemove: (subscriber: Subscriber) => void;
}) {
  const isAr = lang === "ar";
  const counts = subscriberCounts(subscribers);

  if (subscribers.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-card p-8 text-center text-xs text-muted-foreground">
        <p className="text-sm font-bold text-foreground">
          {isAr ? "لا يوجد مشتركون بعد" : "No sign-ups yet"}
        </p>
        <p className="mt-1">
          {isAr
            ? "من يشترك في نشرة المتجر من واجهة المتجر يظهر هنا."
            : "Anyone who signs up for the store's news on the storefront appears here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-card p-3.5 shadow-2xs">
        <p className="min-w-0 break-words text-xs text-muted-foreground">
          <span className="font-mono text-sm font-extrabold text-foreground">{counts.total}</span>{" "}
          {isAr ? "مشترك" : "sign-ups"}
          {" · "}
          {isAr
            ? `${counts.email} بريد إلكتروني، ${counts.whatsapp} واتساب`
            : `${counts.email} by email, ${counts.whatsapp} by WhatsApp`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onCopy}>
            <Copy className="h-3.5 w-3.5" />
            {isAr ? "نسخ القائمة" : "Copy the list"}
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            {isAr ? "تنزيل ملف" : "Download file"}
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border/50 rounded-xl border border-border-subtle bg-card px-3.5 shadow-2xs">
        {subscribers.map((subscriber) => (
          <li
            key={subscriber.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {subscriber.channel === "email" ? (
                <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <MessageCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p dir="ltr" className="text-page-start break-all font-mono text-xs font-semibold">
                  {subscriber.contact}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(subscriber.created_at, isAr ? "ar-BH" : "en-BH")}
                </p>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              disabled={busy}
              aria-label={
                isAr ? `إزالة ${subscriber.contact}` : `Remove ${subscriber.contact} from the list`
              }
              onClick={() => onRemove(subscriber)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
