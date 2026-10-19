import { useState } from "react";
import { CheckCircle2, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageCount, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsLoadFailedState } from "@/components/os/os-load-failed-state";
import { useI18n } from "@/lib/i18n";
import { useOutreachPage } from "@/features/outreach/hooks/use-outreach-page";
import { OutreachCardView } from "@/features/outreach/components/OutreachCardView";

/** How many of the clients to ask are shown before "Show all". */
const ASK_SHOWN = 5;

/**
 * Clients to message today: who is worth a word now and why, with the message written. The
 * store's personal touch, from what Boutq already knows; a person sends every message.
 */
export function OutreachPage({ now = Date.now() }: { now?: number }) {
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const page = useOutreachPage(lang, now);
  const { isAr, today, askConsent } = page;
  const [showAllAsks, setShowAllAsks] = useState(false);
  const asks = showAllAsks ? askConsent : askConsent.slice(0, ASK_SHOWN);

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AdminPageHeader
        icon={MessagesSquare}
        title={isAr ? "عملاء للتواصل اليوم" : "Clients to message today"}
        badges={
          page.loadState === "ready" ? (
            <AdminPageCount>
              {isAr ? `${today.length} اليوم` : `${today.length} today`}
            </AdminPageCount>
          ) : null
        }
        description={
          isAr
            ? "من يستحق رسالة الآن ولماذا، والرسالة مكتوبة بلغته. أنت من يضغط إرسال."
            : "Who is worth a message now and why, written in their language. You press send."
        }
      />

      {page.loadState === "loading" ? (
        <RoutePendingSkeleton />
      ) : page.loadState === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل قائمة اليوم" : "Today's list could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={page.queries}
        />
      ) : (
        <>
          <section aria-labelledby="outreach-today" className="space-y-3">
            <h2 id="outreach-today" className="sr-only">
              {isAr ? "رسائل اليوم" : "Today's messages"}
            </h2>
            {today.length === 0 ? (
              <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-card p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    {isAr ? "لا أحد يحتاج رسالة اليوم" : "Nobody needs a message today"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isAr
                      ? "تتابع هذه الصفحة: المقاسات التي عادت لمن طلبها، السلات المتروكة، أول طلب بعد استلامه، القطع الجديدة بمقاس العميل، ومن تأخر عن عادته في الطلب."
                      : "This page watches for: sizes back for whoever asked, left carts, a first order once received, new pieces in a client's size, and clients past their usual gap."}
                  </p>
                </div>
              </div>
            ) : (
              today.map((card) => (
                <OutreachCardView key={card.key} page={page} card={card} now={now} />
              ))
            )}
          </section>

          {askConsent.length > 0 && (
            <section aria-labelledby="outreach-ask" className="space-y-3 pt-2">
              <div className="space-y-1">
                <h2 id="outreach-ask" className="font-display text-base font-bold">
                  {isAr
                    ? `اسألهم إن كانوا يرغبون برسائلك (${askConsent.length})`
                    : `Ask whether they'd like your messages (${askConsent.length})`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? "اشتروا منك ولم يقولوا بعد إن كانوا يرغبون برسائل المتجر. القطع الجديدة بمقاسهم وتذكير العودة تصلهم بعد موافقتهم."
                    : "They bought from you but haven't said whether they'd like your messages. New pieces in their size and come-back reminders reach them once they agree."}
                </p>
              </div>
              {asks.map((card) => (
                <OutreachCardView key={card.key} page={page} card={card} now={now} />
              ))}
              {askConsent.length > ASK_SHOWN && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAllAsks((all) => !all)}
                >
                  {showAllAsks
                    ? isAr
                      ? "عرض أقل"
                      : "Show fewer"
                    : isAr
                      ? `عرض الكل (${askConsent.length})`
                      : `Show all (${askConsent.length})`}
                </Button>
              )}
            </section>
          )}

          <p className="px-1 text-xs text-muted-foreground">
            {isAr
              ? "لا يُرسل شيء تلقائياً. بعد فتح المحادثة يُسجَّل التواصل، ولا يظهر العميل مجدداً قبل أسبوع. من طلب إيقاف الرسائل لا يظهر هنا أبداً."
              : "Nothing is sent by itself. Opening a chat records it, and the client won't come up again for a week. A client who asked to stop never appears here."}
          </p>
        </>
      )}
    </div>
  );
}
