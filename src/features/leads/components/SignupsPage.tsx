import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { OsLoadFailedState, combinedLoadState } from "@/components/os/os-load-failed-state";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { catalogQueries } from "@/lib/data/catalog";
import {
  deleteBackInStockRequests,
  deleteNewsletterSubscriber,
  invalidateLeads,
  leadsQueries,
  setBackInStockTold,
} from "@/lib/data/leads";
import {
  backInStockMessage,
  contactLink,
  productName,
  subscribersCsv,
  toldRequests,
  waitingGroups,
  type Subscriber,
  type WaitingGroup,
  type WaitingRequest,
} from "@/features/leads/lib/leads";
import { WaitingListTab } from "@/features/leads/components/WaitingListTab";
import { NewsletterTab } from "@/features/leads/components/NewsletterTab";

/**
 * What shoppers left for the store on its storefront: requests to be told when a product is
 * back in stock, and newsletter sign-ups. Both were collected and shown nowhere.
 */
export function SignupsPage() {
  const brand = useBrand();
  const brandId = brand.id;
  const { lang: rawLang } = useI18n();
  const lang = rawLang === "ar" ? "ar" : "en";
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Subscriber | null>(null);

  const requestsQ = useQuery(leadsQueries.backInStock(brandId));
  const subscribersQ = useQuery(leadsQueries.newsletter(brandId));
  const productsQ = useQuery(catalogQueries.products(brandId));
  const variantsQ = useQuery(catalogQueries.variants(brandId));
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));

  const groups = useMemo(
    () => waitingGroups(requestsQ.data ?? [], productsQ.data ?? [], variantsQ.data ?? []),
    [requestsQ.data, productsQ.data, variantsQ.data],
  );
  const told = useMemo(() => toldRequests(requestsQ.data ?? []), [requestsQ.data]);
  const subscribers = subscribersQ.data ?? [];
  const waiting = groups.reduce((sum, group) => sum + group.requests.length, 0);

  const storeName =
    settingsQ.data?.business_name ||
    (isAr ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) ||
    brand.slug;

  /** The message and where it opens, in the language the shopper used. */
  const linkFor = (group: WaitingGroup, request: WaitingRequest) => {
    const messageLang = request.lang === "en" ? "en" : "ar";
    const link = getStorefrontUrl(brand, `/product/${group.productId}`);
    const message = backInStockMessage({
      storeName,
      name: productName(group.product, messageLang),
      option: group.option,
      link: link.startsWith("http") ? link : `${window.location.origin}${link}`,
      lang: messageLang,
    });
    const subject =
      messageLang === "ar" ? `${storeName}: المنتج متوفر الآن` : `${storeName}: back in stock`;
    return contactLink(request, message, subject);
  };

  /** Runs a change, tells the member of staff how it went and refreshes the lists. */
  const run = async (change: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await change();
      toast.success(done);
    } catch (error) {
      toast.error(isAr ? "تعذّر حفظ التغيير." : "The change was not saved.", {
        description: getFriendlyErrorMessage(error),
      });
    } finally {
      await invalidateLeads(qc, brandId);
      setBusy(false);
    }
  };

  const tell = (group: WaitingGroup, request: WaitingRequest) => {
    const link = linkFor(group, request);
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    void run(
      () => setBackInStockTold(brandId, [request.id]),
      isAr ? "تم تسجيل أنه أُخبر." : "Marked as told.",
    );
  };

  const download = () => {
    const file = new Blob([subscribersCsv(subscribers)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${brand.slug}-newsletter.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(subscribers.map((row) => row.contact).join("\n"));
      toast.success(isAr ? "تم نسخ القائمة." : "List copied.");
    } catch {
      toast.error(isAr ? "تعذّر النسخ." : "Could not copy the list.");
    }
  };

  const queries = [requestsQ, subscribersQ, productsQ, variantsQ];
  const loadState = combinedLoadState(queries);

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-3xl space-y-4 p-2 pb-32 sm:p-4 sm:pb-16"
      dir={isAr ? "rtl" : "ltr"}
    >
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="break-words font-display text-lg font-bold text-foreground">
            {isAr ? "المشتركون وقائمة الانتظار" : "Sign-ups & waiting list"}
          </h1>
          <p className="break-words text-xs text-muted-foreground">
            {isAr
              ? "من طلب إشعاره عند توفر منتج، ومن اشترك في أخبار المتجر. أنت من يراسلهم."
              : "Who asked to be told when a product is back, and who signed up for your news. You write to them."}
          </p>
        </div>
      </header>

      {loadState === "loading" ? (
        <RoutePendingSkeleton />
      ) : loadState === "failed" ? (
        <OsLoadFailedState
          isAr={isAr}
          title={isAr ? "تعذّر تحميل القوائم" : "The lists could not be loaded"}
          description={
            isAr
              ? "لم يتغير شيء. تحقق من الاتصال ثم أعد المحاولة."
              : "Nothing was changed. Check the connection and try again."
          }
          queries={queries}
        />
      ) : (
        <Tabs defaultValue="waiting">
          <TabsList className="h-auto max-w-full flex-wrap justify-start">
            <TabsTrigger value="waiting" className="text-xs">
              {isAr ? `قائمة الانتظار (${waiting})` : `Waiting list (${waiting})`}
            </TabsTrigger>
            <TabsTrigger value="newsletter" className="text-xs">
              {isAr ? `المشتركون (${subscribers.length})` : `Newsletter (${subscribers.length})`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="waiting">
            <WaitingListTab
              groups={groups}
              told={told}
              lang={lang}
              busy={busy}
              linkFor={linkFor}
              onTell={tell}
              onMarkTold={(ids) =>
                void run(
                  () => setBackInStockTold(brandId, ids),
                  isAr ? "تم تسجيل أنه أُخبر." : "Marked as told.",
                )
              }
              onWaitAgain={(id) =>
                void run(
                  () => setBackInStockTold(brandId, [id], false),
                  isAr ? "أُعيد إلى قائمة الانتظار." : "Back on the waiting list.",
                )
              }
              onRemove={(ids) =>
                void run(
                  () => deleteBackInStockRequests(brandId, ids),
                  isAr ? "تم حذف الطلب." : "Request removed.",
                )
              }
            />
          </TabsContent>
          <TabsContent value="newsletter">
            <NewsletterTab
              subscribers={subscribers}
              lang={lang}
              busy={busy}
              onDownload={download}
              onCopy={() => void copy()}
              onRemove={setRemoving}
            />
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isAr ? "إزالة من قائمة المشتركين" : "Remove from the newsletter list"}
            </AlertDialogTitle>
            <AlertDialogDescription className="break-all">
              {isAr
                ? `لن يكون ${removing?.contact ?? ""} ضمن القائمة بعد الآن.`
                : `${removing?.contact ?? ""} will no longer be on the list.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const subscriber = removing;
                setRemoving(null);
                if (!subscriber) return;
                void run(
                  () => deleteNewsletterSubscriber(brandId, subscriber.id),
                  isAr ? "تمت الإزالة." : "Removed.",
                );
              }}
            >
              {isAr ? "إزالة" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
