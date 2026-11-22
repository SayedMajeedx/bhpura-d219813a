import { useMemo, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { AdminPageAction, AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { OsStatusPill } from "@/components/os/os-status-pill";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { textOf, type Lang } from "@/lib/platform-pages/page";
import {
  platformPagesAdminKeys,
  platformPagesAdminQueries,
  savePage,
  setPageStatus,
  type AdminPage,
} from "@/lib/data/platform-pages/admin";
import { platformPagesKeys } from "@/lib/data/platform-pages";
import {
  pageAddress,
  pageProblems,
  sameDraft,
  type PageDraft,
  type PageStatus,
} from "../lib/editor";
import { BlocksEditor } from "./BlocksEditor";
import { FormEditor } from "./FormEditor";
import { SettingsEditor } from "./SettingsEditor";
import { PlatformPageView } from "./PlatformPageView";
import { STATUS_WORDS } from "./PlatformPagesList";

/** The super admin's editor of one platform page, with its live preview. */
export function PageEditor({ id, lang }: { id: string; lang: "ar" | "en" }) {
  const { data: page, isLoading } = useQuery(platformPagesAdminQueries.page(id));
  if (isLoading) {
    return (
      <div className="grid min-h-60 place-items-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (!page) {
    return (
      <p className="p-6 text-sm text-muted-foreground">
        {lang === "ar" ? "لم تُعثر على الصفحة." : "This page was not found."}
      </p>
    );
  }
  // The draft starts again from the stored page when another page is opened.
  return <EditorBody key={page.id} page={page} lang={lang} />;
}

function EditorBody({ page, lang }: { page: AdminPage; lang: "ar" | "en" }) {
  const ar = lang === "ar";
  const qc = useQueryClient();
  const stored: PageDraft = useMemo(
    () => ({ blocks: page.blocks, form: page.form, settings: page.settings }),
    [page],
  );
  const [draft, setDraft] = useState<PageDraft>(stored);
  const [savedDraft, setSavedDraft] = useState<PageDraft>(stored);
  const [status, setStatus] = useState<PageStatus>(page.status);
  const [previewLang, setPreviewLang] = useState<Lang>("ar");
  const [phone, setPhone] = useState(true);
  const dirty = !sameDraft(draft, savedDraft);
  const problems = pageProblems(draft);

  useBlocker({
    shouldBlockFn: async () => {
      if (!dirty) return false;
      const leave = await confirmDialog({
        title: ar ? "مغادرة الصفحة دون حفظ؟" : "Leave without saving?",
        description: ar
          ? "لديك تغييرات غير محفوظة، وستضيع إن غادرت."
          : "You have unsaved changes, and they will be lost.",
        confirmLabel: ar ? "مغادرة" : "Leave",
        destructive: true,
      });
      return !leave;
    },
    enableBeforeUnload: () => dirty,
  });

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: platformPagesAdminKeys.list() }),
      qc.invalidateQueries({ queryKey: platformPagesKeys.page(page.slug) }),
    ]);

  const save = useMutation({
    mutationFn: () => savePage(page.id, draft),
    onSuccess: async () => {
      setSavedDraft(draft);
      await refresh();
      toast.success(ar ? "تم الحفظ" : "Saved");
    },
    onError: () => toast.error(ar ? "تعذّر الحفظ" : "Could not save"),
  });

  const changeStatus = useMutation({
    mutationFn: async (next: PageStatus) => {
      if (dirty) {
        await savePage(page.id, draft);
        setSavedDraft(draft);
      }
      await setPageStatus(page.id, next);
      return next;
    },
    onSuccess: async (next) => {
      setStatus(next);
      await refresh();
      toast.success(
        next === "published"
          ? ar
            ? "نُشرت الصفحة"
            : "The page is published"
          : next === "closed"
            ? ar
              ? "أُغلقت الصفحة"
              : "The page is closed"
            : ar
              ? "عادت الصفحة مسودة"
              : "The page is a draft again",
      );
    },
    onError: () =>
      toast.error(ar ? "تعذّر تغيير حالة الصفحة" : "Could not change the page's state"),
  });

  const publish = async () => {
    if (problems.length > 0) {
      toast.error(ar ? "أصلح ما في القائمة أولاً" : "Fix what the list says first");
      return;
    }
    const ok = await confirmDialog({
      title: ar ? "نشر الصفحة؟" : "Publish the page?",
      description: ar
        ? "يستطيع أي شخص لديه الرابط فتحها وإرسال النموذج."
        : "Anyone with the link can open it and send the form.",
      confirmLabel: ar ? "نشر" : "Publish",
      facts: [
        { label: ar ? "الرابط" : "Link", value: <span dir="ltr">{pageAddress(page.slug)}</span> },
      ],
    });
    if (ok) changeStatus.mutate("published");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pageAddress(page.slug));
      toast.success(ar ? "تم نسخ الرابط" : "Link copied");
    } catch {
      toast.error(ar ? "تعذّر النسخ" : "Could not copy");
    }
  };

  const hero = draft.blocks.find((b) => b.kind === "hero");
  const title = (hero && textOf(hero.title, "ar")) || page.slug;
  const busy = save.isPending || changeStatus.isPending;
  const BackIcon = ar ? ArrowRight : ArrowLeft;
  const preview = (
    <PreviewPane
      draft={draft}
      slug={page.slug}
      status={status}
      lang={previewLang}
      onLang={setPreviewLang}
      phone={phone}
      onPhone={setPhone}
      ar={ar}
    />
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6" dir={ar ? "rtl" : "ltr"}>
      <Link
        to="/admin/super/pages"
        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="size-3.5" />
        {ar ? "صفحات المنصة" : "Platform pages"}
      </Link>
      <AdminPageHeader
        icon={FileText}
        title={title}
        badges={
          <OsStatusPill variant={STATUS_WORDS[status].tone}>
            {STATUS_WORDS[status][lang]}
          </OsStatusPill>
        }
        actions={
          <>
            <AdminPageAction
              icon={Save}
              label={ar ? "حفظ" : "Save"}
              variant={dirty ? "default" : "outline"}
              disabled={!dirty || busy}
              busy={save.isPending}
              onClick={() => save.mutate()}
            />
            {status === "draft" && (
              <AdminPageAction
                icon={Send}
                label={ar ? "نشر" : "Publish"}
                variant="outline"
                iconOnPhone
                disabled={busy}
                onClick={() => void publish()}
              />
            )}
            {status === "published" && (
              <AdminPageAction
                icon={Lock}
                label={ar ? "إغلاق التقديم" : "Close"}
                variant="outline"
                iconOnPhone
                disabled={busy}
                onClick={() => changeStatus.mutate("closed")}
              />
            )}
            {status === "closed" && (
              <AdminPageAction
                icon={RotateCcw}
                label={ar ? "إعادة الفتح" : "Reopen"}
                variant="outline"
                iconOnPhone
                disabled={busy}
                onClick={() => void publish()}
              />
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span dir="ltr" className="font-mono">
          {pageAddress(page.slug).replace("https://", "")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1"
          onClick={() => void copy()}
        >
          <Copy className="size-3.5" />
          {ar ? "نسخ" : "Copy"}
        </Button>
        {status !== "draft" && (
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1">
            <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              {ar ? "فتح" : "Open"}
            </a>
          </Button>
        )}
        {status !== "draft" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={() => changeStatus.mutate("draft")}
          >
            {ar ? "إرجاعها مسودة" : "Back to draft"}
          </Button>
        )}
      </div>

      {problems.length > 0 && (
        <div
          role="status"
          className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-foreground"
        >
          <p className="mb-1 flex items-center gap-1.5 font-bold">
            <AlertTriangle className="size-4 text-warning" />
            {ar ? "قبل النشر:" : "Before publishing:"}
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {problems.map((problem, i) => (
              <li key={i}>{problem[lang]}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Tabs defaultValue="content" className="min-w-0">
          <TabsList className="mb-3 flex w-full overflow-x-auto">
            <TabsTrigger value="content">{ar ? "المحتوى" : "Content"}</TabsTrigger>
            <TabsTrigger value="form">{ar ? "النموذج" : "Form"}</TabsTrigger>
            <TabsTrigger value="settings">{ar ? "الإعدادات" : "Settings"}</TabsTrigger>
            <TabsTrigger value="preview" className="lg:hidden">
              {ar ? "المعاينة" : "Preview"}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="content">
            <BlocksEditor
              blocks={draft.blocks}
              onChange={(blocks) => setDraft({ ...draft, blocks })}
              lang={lang}
            />
          </TabsContent>
          <TabsContent value="form">
            <FormEditor
              form={draft.form}
              onChange={(form) => setDraft({ ...draft, form })}
              lang={lang}
            />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsEditor
              settings={draft.settings}
              onChange={(settings) => setDraft({ ...draft, settings })}
              lang={lang}
            />
          </TabsContent>
          <TabsContent value="preview" className="lg:hidden">
            {preview}
          </TabsContent>
        </Tabs>
        <div className="hidden min-w-0 lg:block">
          <div className="sticky top-4">{preview}</div>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  draft,
  slug,
  status,
  lang,
  onLang,
  phone,
  onPhone,
  ar,
}: {
  draft: PageDraft;
  slug: string;
  status: PageStatus;
  lang: Lang;
  onLang: (lang: Lang) => void;
  phone: boolean;
  onPhone: (phone: boolean) => void;
  ar: boolean;
}) {
  const page = {
    slug,
    status: status === "closed" ? ("closed" as const) : ("published" as const),
    ...draft,
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-muted-foreground">{ar ? "المعاينة" : "Preview"}</p>
        <div className="flex gap-1.5">
          <Segmented
            options={[
              { value: "ar", label: "عربي" },
              { value: "en", label: "English" },
            ]}
            value={lang}
            onChange={(value) => onLang(value as Lang)}
            name={ar ? "لغة المعاينة" : "Preview language"}
          />
          <Segmented
            options={[
              { value: "phone", label: ar ? "جوال" : "Phone" },
              { value: "wide", label: ar ? "كمبيوتر" : "Laptop" },
            ]}
            value={phone ? "phone" : "wide"}
            onChange={(value) => onPhone(value === "phone")}
            name={ar ? "عرض المعاينة" : "Preview width"}
          />
        </div>
      </div>
      <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-border bg-background">
        <div className={cn("mx-auto", phone ? "max-w-[390px]" : "w-full")}>
          {/* A new key per language restarts the form, as a visitor's page would. */}
          <PlatformPageView key={lang} page={page} lang={lang} preview />
        </div>
      </div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  name: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="inline-flex rounded-md border border-border p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2 py-1 text-xs font-semibold",
            option.value === value ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
