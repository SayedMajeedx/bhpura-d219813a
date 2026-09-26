import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mail,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useT, useI18n } from "@/lib/i18n";
import { useBrand } from "@/lib/brand-context";
import { CustomerPushCenter } from "@/components/communications/CustomerPushCenter";
import { NotificationRecipientsEditor } from "@/features/settings/shared/NotificationRecipientsEditor";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/communications")({
  component: CommunicationsPage,
});

import { CommunicationsCommandHeader } from "@/components/communications/CommunicationsCommandHeader";
import {
  CommunicationsScopeSwitcher,
  type CommunicationsScope,
} from "@/components/communications/CommunicationsScopeSwitcher";
import { notificationRecipientsQueries } from "@/lib/data/notification-recipients";

function CommunicationsPage() {
  useT();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brand = useBrand();
  const brandId = brand.id;
  const [activeScope, setActiveScope] = useState<CommunicationsScope>("recipients");
  const [addingRecipient, setAddingRecipient] = useState(false);

  // The editor below reads the same list; a failed read counts as none.
  const recipientsQ = useQuery(notificationRecipientsQueries.list(brandId));

  return (
    <div className="space-y-3.5">
      {/* 1. Command Header */}
      <CommunicationsCommandHeader
        lang={isAr ? "ar" : "en"}
        brandName={(isAr ? brand.name_ar : brand.name_en) || brand.name_en || brand.slug}
        recipientCount={recipientsQ.data?.length ?? 0}
        onAddRecipient={() => {
          setActiveScope("recipients");
          setAddingRecipient(true);
        }}
      />

      {/* 2. Scope Switcher */}
      <CommunicationsScopeSwitcher
        lang={isAr ? "ar" : "en"}
        activeScope={activeScope}
        onScopeChange={(scope) => setActiveScope(scope)}
        recipientCount={recipientsQ.data?.length ?? 0}
      />

      {activeScope === "recipients" && (
        <NotificationRecipientsEditor
          brandId={brandId}
          isAr={isAr}
          externalAdding={addingRecipient}
          onResetAdding={() => setAddingRecipient(false)}
        />
      )}

      {activeScope === "push" && <CustomerPushCenter brandId={brandId} isAr={isAr} />}

      {activeScope === "logs" && <EmailActivityCard brandId={brandId} isAr={isAr} />}
    </div>
  );
}

type EmailActivityRow = {
  id: string;
  order_id: string | null;
  invoice_number: number | null;
  event_type: string;
  channel: "customer" | "admin";
  recipient: string | null;
  provider: string | null;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  created_at: string;
};

function EmailActivityCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const [channel, setChannel] = useState<"all" | "customer" | "admin">("all");
  const [sortField, setSortField] = useState<"created_at" | "event_type" | "recipient" | "status">(
    "created_at",
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(7);

  const q = useQuery({
    ...notificationRecipientsQueries.activity(brandId),
    select: (rows) => rows as EmailActivityRow[],
    refetchInterval: 30_000,
  });

  const filteredRows = useMemo(() => {
    return (q.data ?? []).filter((row) => channel === "all" || row.channel === channel);
  }, [q.data, channel]);

  useEffect(() => {
    setPage(1);
  }, [channel, sortField, sortDirection, pageSize]);

  const sortedRows = useMemo(() => {
    const list = [...filteredRows];
    list.sort((a, b) => {
      let valA: any = a[sortField] ?? "";
      let valB: any = b[sortField] ?? "";

      if (sortField === "created_at") {
        return sortDirection === "asc"
          ? new Date(valA).getTime() - new Date(valB).getTime()
          : new Date(valB).getTime() - new Date(valA).getTime();
      }

      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredRows, sortField, sortDirection]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [sortedRows, page, pageSize]);

  const totalPages = Math.ceil(sortedRows.length / pageSize) || 1;

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const labels = {
    title: isAr ? "سجل المراسلات والبريد" : "Communications & email activity",
    description: isAr
      ? "سجل لكل رسالة عميل أو تنبيه إداري: المزود والمستلم والنتيجة. حالة «تم القبول» تعني أن المزود قبل الإرسال؛ تعرض سجلات Zoho أو SendPulse حالة التسليم النهائية عند توفرها."
      : "A record of every customer email and internal alert, including provider, recipient, and outcome. “Accepted” means the provider accepted the send; Zoho or SendPulse delivery reports remain the source of final inbox, bounce, and reply status.",
    all: isAr ? "الكل" : "All messages",
    customer: isAr ? "رسائل العملاء" : "Customer emails",
    admin: isAr ? "تنبيهات الإدارة" : "Admin alerts",
    event: isAr ? "الحدث" : "Event",
    recipient: isAr ? "المستلم" : "Recipient",
    channel: isAr ? "النوع" : "Channel",
    provider: isAr ? "المزود" : "Provider",
    result: isAr ? "النتيجة" : "Result",
    order: isAr ? "الطلب" : "Order",
    details: isAr ? "التفاصيل" : "Details",
    time: isAr ? "الوقت" : "Time",
    empty: isAr
      ? "لا توجد رسائل مسجلة لهذه العلامة بعد."
      : "No email activity has been recorded for this brand yet.",
    refresh: isAr ? "تحديث" : "Refresh",
  };

  const eventLabel = (event: string) => {
    const arabicEvents: Record<string, string> = {
      order_placed: "تم استلام الطلب",
      benefit_payment_approved: "تم اعتماد دفعة بنفت",
      benefit_payment_rejected: "تم رفض دفعة بنفت",
      order_cancelled: "تم إلغاء الطلب",
      order_delivered: "تم توصيل الطلب",
    };
    if (isAr && arabicEvents[event]) return arabicEvents[event];
    const key = event.replaceAll("_", " ");
    return key.replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  const providerLabel = (provider: string | null) => {
    if (provider === "resend_customer_email" || provider === "resend") return "Resend";
    if (provider === "sendpulse_admin" || provider === "sendpulse") return "SendPulse";
    return provider || "—";
  };
  const statusLabel = (status: EmailActivityRow["status"]) => {
    if (isAr)
      return status === "sent" ? "تم قبول الإرسال" : status === "failed" ? "فشل" : "تم التخطي";
    return status === "sent" ? "Accepted" : status === "failed" ? "Failed" : "Skipped";
  };
  const detailLabel = (row: EmailActivityRow) => {
    if (row.error_message) return row.error_message;
    if (row.status !== "skipped") return "—";
    return row.channel === "admin"
      ? "No SendPulse request was made. Check this brand's SendPulse connection and active notification recipients."
      : "No email was sent because this message was not eligible for delivery.";
  };
  const statusClass = (status: EmailActivityRow["status"]) =>
    status === "sent"
      ? "bg-emerald-500/10 text-emerald-700"
      : status === "failed"
        ? "bg-destructive/10 text-destructive"
        : "bg-secondary text-muted-foreground";

  const renderSortIcon = (field: typeof sortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="ms-1.5 h-3.5 w-3.5 opacity-50 shrink-0" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    ) : (
      <ArrowDown className="ms-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    );
  };

  return (
    <Card
      className="overflow-hidden border-border-subtle shadow-lg rounded-2xl bg-card p-6"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <Mail className="h-5 w-5 mt-0.5 text-primary" />
          <div>
            <h2 className="font-display text-xl">{labels.title}</h2>
            <p className="text-sm text-muted-foreground max-w-3xl mt-1">{labels.description}</p>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as "all" | "customer" | "admin")}
          >
            <SelectTrigger className="h-9 flex-1 sm:w-[160px] sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{labels.all}</SelectItem>
              <SelectItem value="customer">{labels.customer}</SelectItem>
              <SelectItem value="admin">{labels.admin}</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => {
              void q.refetch();
            }}
            disabled={q.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            <span className="sr-only">{labels.refresh}</span>
          </Button>
        </div>
      </div>

      {q.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {isAr
            ? "تعذر تحميل سجل البريد. تأكد من تشغيل ترحيل سجل المراسلات."
            : "Could not load email activity. Ensure the communications-log migration has been applied."}
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-7 text-center text-sm text-muted-foreground">
          {labels.empty}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2.5 sm:hidden" aria-label={labels.title}>
            {paginatedRows.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-border-strong bg-background/75 p-3 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{eventLabel(row.event_type)}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground" dir="ltr">
                      {row.recipient || "—"}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border-subtle pt-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">{labels.channel}</dt>
                    <dd className="mt-0.5 font-semibold">
                      {row.channel === "customer" ? labels.customer : labels.admin}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{isAr ? "المزود" : "Provider"}</dt>
                    <dd className="mt-0.5 font-semibold">{providerLabel(row.provider)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{labels.order}</dt>
                    <dd className="mt-0.5 font-semibold">
                      {row.invoice_number ? `#${row.invoice_number}` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{labels.time}</dt>
                    <dd className="mt-0.5 font-semibold">
                      {new Date(row.created_at).toLocaleString(isAr ? "ar-BH-u-nu-latn" : "en-GB")}
                    </dd>
                  </div>
                </dl>
                {detailLabel(row) !== "—" && (
                  <p className="mt-3 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                    {detailLabel(row)}
                  </p>
                )}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border sm:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th
                    className="px-3 py-3 text-start cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => toggleSort("event_type")}
                  >
                    <div className="flex items-center">
                      {labels.event} {renderSortIcon("event_type")}
                    </div>
                  </th>
                  <th
                    className="px-3 py-3 text-start cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => toggleSort("recipient")}
                  >
                    <div className="flex items-center">
                      {labels.recipient} {renderSortIcon("recipient")}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-start">{labels.channel}</th>
                  <th className="px-3 py-3 text-start">{isAr ? "المزود" : "Provider"}</th>
                  <th
                    className="px-3 py-3 text-start cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => toggleSort("status")}
                  >
                    <div className="flex items-center">
                      {labels.result} {renderSortIcon("status")}
                    </div>
                  </th>
                  <th className="px-3 py-3 text-start">{labels.order}</th>
                  <th className="px-3 py-3 text-start">{labels.details}</th>
                  <th
                    className="px-3 py-3 text-start cursor-pointer hover:bg-muted transition-colors"
                    onClick={() => toggleSort("created_at")}
                  >
                    <div className="flex items-center">
                      {labels.time} {renderSortIcon("created_at")}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t align-top hover:bg-muted/35 transition-colors"
                  >
                    <td className="px-3 py-3 font-medium whitespace-nowrap">
                      {eventLabel(row.event_type)}
                    </td>
                    <td className="px-3 py-3" dir="ltr">
                      {row.recipient || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.channel === "customer" ? labels.customer : labels.admin}
                    </td>
                    <td className="px-3 py-3">{providerLabel(row.provider)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(row.status)}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {row.invoice_number ? `#${row.invoice_number}` : "—"}
                    </td>
                    <td className="px-3 py-3 max-w-[280px] break-words text-muted-foreground">
                      {detailLabel(row)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(row.created_at).toLocaleString(isAr ? "ar-BH-u-nu-latn" : "en-GB")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm border-t border-border">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {isAr ? "الأحداث لكل صفحة:" : "Events per page:"}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs ms-2">
                {isAr
                  ? `عرض ${Math.min((page - 1) * pageSize + 1, sortedRows.length)}-${Math.min(page * pageSize, sortedRows.length)} من ${sortedRows.length} حدث`
                  : `Showing ${Math.min((page - 1) * pageSize + 1, sortedRows.length)}-${Math.min(page * pageSize, sortedRows.length)} of ${sortedRows.length} events`}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page === 1}
              >
                {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                <span className="sr-only">{isAr ? "الصفحة السابقة" : "Previous page"}</span>
              </Button>
              <div className="text-xs px-2 text-muted-foreground">
                {isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
              >
                {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="sr-only">{isAr ? "الصفحة التالية" : "Next page"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
