import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { OsEmptyState } from "@/components/os/os-empty-state";
import {
  Check,
  MessageCircle,
  Search,
  Megaphone,
  Users,
  ShieldAlert,
  Download,
} from "lucide-react";
import { isMarketingEligible } from "@/lib/marketing-eligibility";

import type { CampaignsPageState } from "@/features/campaigns/hooks/use-campaigns-page";
import { displayPhone } from "@/lib/invoice-display";

/** The audience: search, select, and send to one customer or start a bulk run. */
/** A customer's segment in the reader's language (the segment ids are English keys). */
function badgeLabel(badge: string, isAr: boolean): string {
  if (!isAr) return badge === "Churn Risk" ? "At risk" : badge === "New Buyer" ? "New" : badge;
  if (badge === "VIP") return "مميز";
  if (badge === "Churn Risk") return "معرض للتسرب";
  if (badge === "New Buyer") return "جديد";
  return badge;
}

export function CampaignAudienceCard({ page }: { page: CampaignsPageState }) {
  const {
    isAr,
    selectedCustomerIds,
    search,
    setSearch,
    sent,
    setSent,
    customerCrmStats,
    filtered,
    eligibleSelectedCount,
    toggleSelectAll,
    toggleSelectCustomer,
    send,
    launchBulkCampaign,
    exportBulkCampaignCsv,
  } = page;
  return (
    <>
      <Card className="overflow-hidden border border-border-subtle shadow-lg rounded-2xl bg-card">
        <div className="flex flex-col justify-between gap-3 border-b border-border-subtle bg-primary/5 p-3 sm:flex-row sm:items-center sm:p-4">
          <div className="relative w-full flex-1 sm:max-w-sm">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={isAr ? "ابحث عن عميل..." : "Search customer..."}
              placeholder={isAr ? "ابحث عن عميل..." : "Search customer..."}
              className="ps-9 text-start bg-background/50 focus:bg-background transition-colors duration-200"
            />
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-4">
            <div className="col-span-2 flex items-center justify-between gap-3 text-sm text-muted-foreground sm:col-span-1 sm:justify-start">
              <span>
                {Object.values(sent).filter(Boolean).length}/{filtered.length}{" "}
                {isAr ? "مرسلة" : "sent"}
              </span>
              {Object.keys(sent).length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSent({})}
                  className="shadow-sm transition-all duration-200 hover:shadow hover:scale-[1.01] active:scale-95"
                >
                  {isAr ? "إعادة تعيين" : "Reset"}
                </Button>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-auto min-h-9 whitespace-normal border-dashed font-medium shadow-sm transition-all duration-200 hover:scale-[1.01] hover:bg-secondary hover:shadow active:scale-95"
              onClick={exportBulkCampaignCsv}
              disabled={eligibleSelectedCount === 0}
            >
              <Download className="h-4 w-4 me-1.5" />
              {isAr ? "تصدير قائمة الرسائل (CSV)" : "Export Campaign CSV"}
            </Button>
            <Button
              size="sm"
              className="h-auto min-h-9 whitespace-normal bg-primary font-medium text-primary-foreground shadow-sm transition-all duration-200 hover:scale-[1.01] hover:bg-primary/90 hover:shadow active:scale-95"
              onClick={launchBulkCampaign}
              disabled={eligibleSelectedCount === 0}
            >
              <Megaphone className="h-4 w-4 me-1.5" />
              {isAr
                ? `إطلاق حملة جماعية (المؤهلون: ${eligibleSelectedCount})`
                : `Launch Bulk Campaign (Eligible: ${eligibleSelectedCount})`}
            </Button>
          </div>
        </div>

        {filtered.length > 0 && eligibleSelectedCount === 0 && (
          <div className="m-3 sm:m-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {isAr
                ? "لا يوجد مستلمون مؤهلون محددون. تشترط الحملات التسويقية موافقة تسويقية صريحة، ورقم هاتف صالح، وعدم إلغاء الاشتراك، ووجود طلب سابق."
                : "No eligible recipients selected. Marketing campaigns require explicit consent, a valid phone, no opt-out, and at least one prior order."}
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          <OsEmptyState
            compact
            icon={Users}
            title={isAr ? "لا يوجد عملاء" : "No customers found"}
            description={
              isAr
                ? "لم نتمكن من العثور على أي عملاء يطابقون فلتر البحث المحدد."
                : "No customer contacts match your selected search filter."
            }
          />
        ) : (
          <>
            {/* Mobile checklist view */}
            <div className="space-y-3 p-3 sm:hidden">
              <div className="flex items-center justify-between border-b pb-2 px-1 text-xs text-muted-foreground">
                <span className="font-semibold">{isAr ? "تحديد الكل" : "Select All"}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer"
                  checked={
                    filtered.filter(
                      (c) =>
                        isMarketingEligible(c, customerCrmStats.get(c.id)?.totalOrders ?? 0)
                          .eligible,
                    ).length > 0 &&
                    filtered
                      .filter(
                        (c) =>
                          isMarketingEligible(c, customerCrmStats.get(c.id)?.totalOrders ?? 0)
                            .eligible,
                      )
                      .every((c) => selectedCustomerIds.includes(c.id))
                  }
                  onChange={toggleSelectAll}
                />
              </div>
              {filtered.map((c) => {
                const isSent = !!sent[c.id];
                const stats = customerCrmStats.get(c.id);
                const orderCount = stats?.totalOrders ?? 0;
                const eligibility = isMarketingEligible(c, orderCount);
                const isChecked = selectedCustomerIds.includes(c.id);
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 transition-colors ${isChecked ? "border-primary/40 bg-primary/5" : "bg-background"} ${isSent ? "opacity-75" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          checked={isChecked}
                          onChange={() => toggleSelectCustomer(c)}
                          disabled={!eligibility.eligible}
                          title={
                            eligibility.eligible
                              ? undefined
                              : isAr
                                ? eligibility.reason_ar
                                : eligibility.reason
                          }
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-foreground truncate flex-wrap">
                            <span className="truncate">{c.name}</span>
                            {c.marketing_consent !== true && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400 shrink-0">
                                {isAr ? "بلا موافقة تسويقية" : "No consent"}
                              </span>
                            )}
                            {c.opted_out_at && (
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400 shrink-0">
                                {isAr ? "إلغاء اشتراك" : "Opted out"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                            {displayPhone(c.phone) || "—"}
                          </div>
                        </div>
                      </div>
                      {stats?.badge && (
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
                            stats.badge === "VIP"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                              : stats.badge === "Churn Risk"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                : stats.badge === "New Buyer"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {badgeLabel(stats.badge, isAr)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground border-t border-border-subtle pt-2">
                      <div className="flex items-center gap-1.5">
                        <span>{isAr ? "إجمالي الطلبات:" : "Total orders:"}</span>
                        {orderCount === 0 ? (
                          <span className="font-semibold text-amber-600 dark:text-amber-400">
                            0 ({isAr ? "بدون طلبات" : "No orders"})
                          </span>
                        ) : (
                          <span className="font-bold text-foreground">{orderCount}</span>
                        )}
                      </div>
                      <div>
                        {isSent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3 w-3" />
                            {isAr ? "تم الإرسال" : "Sent"}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            variant="outline"
                            onClick={() => send(c)}
                            disabled={!eligibility.eligible}
                            title={
                              eligibility.eligible
                                ? undefined
                                : isAr
                                  ? eligibility.reason_ar
                                  : eligibility.reason
                            }
                          >
                            <MessageCircle className="me-1 h-3 w-3" />
                            {isAr ? "إرسال" : "Send"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <tr>
                    <th className="p-4 w-12 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer"
                        checked={
                          filtered.filter(
                            (c) =>
                              isMarketingEligible(c, customerCrmStats.get(c.id)?.totalOrders ?? 0)
                                .eligible,
                          ).length > 0 &&
                          filtered
                            .filter(
                              (c) =>
                                isMarketingEligible(c, customerCrmStats.get(c.id)?.totalOrders ?? 0)
                                  .eligible,
                            )
                            .every((c) => selectedCustomerIds.includes(c.id))
                        }
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-4 font-semibold text-xs text-start">
                      {isAr ? "الاسم" : "Name"}
                    </th>
                    <th className="p-4 font-semibold text-xs text-start">
                      {isAr ? "الهاتف" : "Phone"}
                    </th>
                    <th className="p-4 font-semibold text-xs text-start">
                      {isAr ? "فئة العملاء" : "Customer Segment"}
                    </th>
                    <th className="p-4 font-semibold text-xs text-start">
                      {isAr ? "إجمالي الطلبات" : "Total Orders"}
                    </th>
                    <th className="p-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const isSent = !!sent[c.id];
                    const stats = customerCrmStats.get(c.id);
                    const orderCount = stats?.totalOrders ?? 0;
                    const eligibility = isMarketingEligible(c, orderCount);
                    const isChecked = selectedCustomerIds.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`border-t border-border transition-colors hover:bg-secondary/20 ${
                          isChecked ? "bg-primary/5 hover:bg-primary/10" : ""
                        } ${isSent ? "opacity-75" : ""}`}
                      >
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-input text-primary focus:ring-primary accent-primary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            checked={isChecked}
                            onChange={() => toggleSelectCustomer(c)}
                            disabled={!eligibility.eligible}
                            title={
                              eligibility.eligible
                                ? undefined
                                : isAr
                                  ? eligibility.reason_ar
                                  : eligibility.reason
                            }
                          />
                        </td>
                        <td className="p-4 font-medium">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span>{c.name}</span>
                            {c.marketing_consent !== true && (
                              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">
                                {isAr ? "بلا موافقة تسويقية" : "No consent"}
                              </span>
                            )}
                            {c.opted_out_at && (
                              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                                {isAr ? "إلغاء اشتراك" : "Opted out"}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-muted-foreground font-mono" dir="ltr">
                          {displayPhone(c.phone) || "—"}
                        </td>
                        <td className="p-4">
                          {stats?.badge ? (
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                                stats.badge === "VIP"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                  : stats.badge === "Churn Risk"
                                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                    : stats.badge === "New Buyer"
                                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                      : "bg-muted text-muted-foreground border border-border"
                              }`}
                            >
                              {badgeLabel(stats.badge, isAr)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-4 font-mono">
                          {orderCount === 0 ? (
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                              0 ({isAr ? "بدون طلبات" : "No orders"})
                            </span>
                          ) : (
                            <span className="text-foreground">{orderCount}</span>
                          )}
                        </td>
                        <td className="p-4 text-end">
                          {isSent ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium">
                              <Check className="h-3 w-3" /> {isAr ? "تم الإرسال" : "Sent"}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => send(c)}
                              disabled={!eligibility.eligible}
                              title={
                                eligibility.eligible
                                  ? undefined
                                  : isAr
                                    ? eligibility.reason_ar
                                    : eligibility.reason
                              }
                            >
                              <MessageCircle className="h-4 w-4 me-2" />
                              {isAr ? "إرسال عبر الواتساب" : "Send via WhatsApp"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
