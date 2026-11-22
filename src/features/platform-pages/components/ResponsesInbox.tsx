import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Inbox,
  Instagram,
  Loader2,
  MessageCircle,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminPageAction,
  AdminPageCount,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { OsStatusPill } from "@/components/os/os-status-pill";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { countOf } from "@/lib/arabic-count";
import { cn } from "@/lib/utils";
import { whatsappChatUrl } from "@/lib/whatsapp-phone";
import { textOf, type PageForm } from "@/lib/platform-pages/page";
import { platformPagesAdminQueries } from "@/lib/data/platform-pages/admin";
import {
  deletePageResponse,
  platformPageResponsesKeys,
  platformPageResponsesQueries,
  updatePageResponse,
} from "@/lib/data/platform-pages/responses";
import {
  answerLines,
  contactOf,
  filterResponses,
  replyMessage,
  responsesSheet,
  RESPONSE_STATUSES,
  RESPONSE_STATUS_WORDS,
  statusCounts,
  type PageResponse,
  type ResponseStatus,
} from "../lib/responses";

type Lang = "ar" | "en";

const dayOf = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === "ar" ? "ar-BH-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** A platform page's responses: filtered by state, searched, answered on WhatsApp, exported. */
export function ResponsesInbox({ pageId, lang }: { pageId: string; lang: Lang }) {
  const ar = lang === "ar";
  const { data: page } = useQuery(platformPagesAdminQueries.page(pageId));
  const { data: responses = [], isLoading } = useQuery(platformPageResponsesQueries.page(pageId));
  const [status, setStatus] = useState<ResponseStatus | "all">("all");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const form: PageForm = useMemo(() => page?.form ?? { steps: [] }, [page]);
  const hero = page?.blocks.find((b) => b.kind === "hero");
  const title = (hero && textOf(hero.title, lang)) || page?.slug || "";
  const counts = statusCounts(responses);
  const shown = useMemo(
    () => filterResponses(responses, form, { status, term }, lang),
    [responses, form, status, term, lang],
  );
  const open = responses.find((r) => r.id === openId) ?? null;
  const BackIcon = ar ? ArrowRight : ArrowLeft;

  const exportFile = async () => {
    try {
      const { downloadWorkbook } = await import("@/features/finance-reports/lib/workbook");
      await downloadWorkbook(
        [responsesSheet(form, shown, lang)],
        `${page?.slug ?? "responses"}-responses.xlsx`,
      );
    } catch {
      toast.error(ar ? "تعذّر تنزيل الملف" : "The file could not be downloaded");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <Link
        to="/admin/super/pages/$id"
        params={{ id: pageId }}
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="size-3.5" />
        {ar ? "تعديل الصفحة" : "Edit the page"}
      </Link>
      <AdminPageHeader
        icon={Inbox}
        title={ar ? `ردود ${title}` : `${title}: responses`}
        badges={<AdminPageCount>{countOf(responses.length, "response", lang)}</AdminPageCount>}
        actions={
          <AdminPageAction
            icon={Download}
            label={ar ? "تنزيل Excel" : "Download Excel"}
            iconOnPhone
            disabled={shown.length === 0}
            onClick={() => void exportFile()}
          />
        }
      />

      <div
        className="flex gap-1.5 overflow-x-auto pb-1"
        role="tablist"
        aria-label={ar ? "الحالة" : "State"}
      >
        {(["all", ...RESPONSE_STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={status === value}
            onClick={() => setStatus(value)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold pointer-coarse:min-h-11",
              status === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "all" ? (ar ? "الكل" : "All") : RESPONSE_STATUS_WORDS[value][lang]} (
            {counts[value]})
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={ar ? "ابحث في الردود والملاحظات" : "Search answers and notes"}
          aria-label={ar ? "بحث في الردود" : "Search responses"}
          className="ps-9"
        />
      </div>

      {isLoading ? (
        <div className="grid min-h-40 place-items-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <OsEmptyState
          icon={Inbox}
          title={
            responses.length === 0
              ? ar
                ? "لا توجد ردود بعد"
                : "No responses yet"
              : ar
                ? "لا نتائج"
                : "Nothing matches"
          }
          description={
            responses.length === 0
              ? ar
                ? "تظهر هنا ردود الصفحة حين يرسلها الزوار."
                : "The page's responses show here as visitors send them."
              : ar
                ? "جرّب حالة أخرى أو كلمة بحث أخرى."
                : "Try another state or another search."
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((response) => (
            <ResponseCard
              key={response.id}
              response={response}
              form={form}
              pageTitle={title}
              pageId={pageId}
              lang={lang}
              onOpen={() => setOpenId(response.id)}
            />
          ))}
        </ul>
      )}

      <ResponseDialog
        key={open?.id ?? "none"}
        response={open}
        form={form}
        pageId={pageId}
        lang={lang}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

function useResponseUpdate(pageId: string, lang: Lang) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status?: ResponseStatus; notes?: string | null }) =>
      updatePageResponse(input.id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: platformPageResponsesKeys.page(pageId) }),
    onError: () => toast.error(lang === "ar" ? "تعذّر الحفظ" : "Could not save"),
  });
}

function StatusSelect({
  response,
  pageId,
  lang,
}: {
  response: PageResponse;
  pageId: string;
  lang: Lang;
}) {
  const update = useResponseUpdate(pageId, lang);
  return (
    <Select
      value={response.status}
      onValueChange={(value) => update.mutate({ id: response.id, status: value as ResponseStatus })}
    >
      <SelectTrigger
        className="h-9 w-36"
        aria-label={lang === "ar" ? "حالة الرد" : "Response state"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RESPONSE_STATUSES.map((value) => (
          <SelectItem key={value} value={value}>
            {RESPONSE_STATUS_WORDS[value][lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ContactButtons({
  response,
  form,
  pageTitle,
  lang,
}: {
  response: PageResponse;
  form: PageForm;
  pageTitle: string;
  lang: Lang;
}) {
  const ar = lang === "ar";
  const contact = contactOf(form, response.answers);
  const chat = whatsappChatUrl(contact.phone);
  return (
    <>
      {chat && (
        <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
          <a
            href={`${chat}?text=${encodeURIComponent(replyMessage(contact.name, pageTitle, lang))}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" />
            {ar ? "واتساب" : "WhatsApp"}
          </a>
        </Button>
      )}
      {contact.instagram && (
        <Button asChild variant="ghost" size="sm" className="h-9 gap-1.5">
          <a
            href={`https://instagram.com/${encodeURIComponent(contact.instagram)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Instagram className="size-4" />
            <span dir="ltr">@{contact.instagram}</span>
          </a>
        </Button>
      )}
    </>
  );
}

function ResponseCard({
  response,
  form,
  pageTitle,
  pageId,
  lang,
  onOpen,
}: {
  response: PageResponse;
  form: PageForm;
  pageTitle: string;
  pageId: string;
  lang: Lang;
  onOpen: () => void;
}) {
  const ar = lang === "ar";
  const lines = answerLines(form, response.answers, lang);
  const name = contactOf(form, response.answers).name ?? lines[0]?.value ?? "";
  return (
    <li className="space-y-3 rounded-xl border border-border-subtle bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="line-clamp-2 break-words text-sm font-bold text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">{dayOf(response.createdAt, lang)}</p>
        </div>
        <StatusSelect response={response} pageId={pageId} lang={lang} />
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        {lines.slice(1, 5).map((line) => (
          <div key={line.key} className="min-w-0">
            <dt className="text-muted-foreground">{line.label}</dt>
            <dd
              className="line-clamp-2 break-words font-semibold text-foreground"
              dir={line.ltr ? "ltr" : undefined}
            >
              {line.value}
            </dd>
          </div>
        ))}
      </dl>
      {response.notes && (
        <p className="line-clamp-2 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
          {response.notes}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <ContactButtons response={response} form={form} pageTitle={pageTitle} lang={lang} />
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onOpen}>
          {ar ? "التفاصيل والملاحظات" : "Details and notes"}
        </Button>
      </div>
    </li>
  );
}

function ResponseDialog({
  response,
  form,
  pageId,
  lang,
  onClose,
}: {
  response: PageResponse | null;
  form: PageForm;
  pageId: string;
  lang: Lang;
  onClose: () => void;
}) {
  const ar = lang === "ar";
  const qc = useQueryClient();
  const [notes, setNotes] = useState(response?.notes ?? "");
  const update = useResponseUpdate(pageId, lang);
  const remove = useMutation({
    mutationFn: (id: string) => deletePageResponse(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: platformPageResponsesKeys.page(pageId) });
      onClose();
    },
    onError: () => toast.error(ar ? "تعذّر الحذف" : "Could not delete"),
  });
  if (!response) return null;
  const lines = answerLines(form, response.answers, lang);
  const dirty = (response.notes ?? "") !== notes;
  return (
    <AppDialog
      open
      onOpenChange={(next) => !next && onClose()}
      kind="details"
      size="md"
      dirty={dirty}
      busy={update.isPending || remove.isPending}
    >
      <AppDialogHeader
        title={contactOf(form, response.answers).name ?? (ar ? "رد" : "Response")}
        description={dayOf(response.createdAt, lang)}
      />
      <AppDialogBody className="space-y-4">
        <OsStatusPill variant={RESPONSE_STATUS_WORDS[response.status].tone}>
          {RESPONSE_STATUS_WORDS[response.status][lang]}
        </OsStatusPill>
        <dl className="space-y-2 text-sm">
          {lines.map((line) => (
            <div key={line.key} className="border-b border-border-subtle pb-2 last:border-0">
              <dt className="text-xs text-muted-foreground">{line.label}</dt>
              <dd
                className="whitespace-pre-line break-words font-semibold text-foreground"
                dir={line.ltr ? "ltr" : undefined}
              >
                {line.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="response-notes">{ar ? "ملاحظاتك" : "Your notes"}</Label>
          <Textarea
            id="response-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </AppDialogBody>
      <AppDialogFooter>
        <Button
          type="button"
          variant="ghost"
          className="me-auto gap-1.5 text-destructive"
          onClick={async () => {
            const ok = await confirmDialog({
              title: ar ? "حذف هذا الرد؟" : "Delete this response?",
              description: ar ? "يُحذف نهائياً." : "It is deleted for good.",
              destructive: true,
            });
            if (ok) remove.mutate(response.id);
          }}
        >
          <Trash2 className="size-4" />
          {ar ? "حذف" : "Delete"}
        </Button>
        <Button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate({ id: response.id, notes })}
        >
          {ar ? "حفظ الملاحظات" : "Save notes"}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}
