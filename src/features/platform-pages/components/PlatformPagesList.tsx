import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminPageCount,
  AdminPageHeader,
  AdminPageAction,
} from "@/components/admin/AdminPageHeader";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { OsStatusPill, type OsStatusVariant } from "@/components/os/os-status-pill";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOpenSession } from "@/hooks/use-open-session";
import { countOf } from "@/lib/arabic-count";
import {
  createPage,
  deletePage,
  platformPagesAdminKeys,
  platformPagesAdminQueries,
  slugTaken,
  type AdminPageSummary,
} from "@/lib/data/platform-pages/admin";
import { blankDraft, pageAddress, SLUG_PATTERN, slugFrom, type PageStatus } from "../lib/editor";

type Lang = "ar" | "en";

export const STATUS_WORDS: Record<PageStatus, { ar: string; en: string; tone: OsStatusVariant }> = {
  draft: { ar: "مسودة", en: "Draft", tone: "neutral" },
  published: { ar: "منشورة", en: "Published", tone: "success" },
  closed: { ar: "مغلقة", en: "Closed", tone: "warning" },
};

/** Boutq's own pages (`boutq.store/p/<name>`): each with its state, address and responses. */
export function PlatformPagesList({ lang }: { lang: Lang }) {
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const { data: pages = [], isLoading } = useQuery(platformPagesAdminQueries.list());

  const remove = useMutation({
    mutationFn: deletePage,
    onSuccess: () => qc.invalidateQueries({ queryKey: platformPagesAdminKeys.list() }),
    onError: () => toast.error(isAr ? "تعذّر حذف الصفحة" : "The page could not be deleted"),
  });

  const askDelete = async (page: AdminPageSummary) => {
    const ok = await confirmDialog({
      title: isAr ? `حذف «${page.title}»؟` : `Delete “${page.title}”?`,
      description: isAr
        ? "تُحذف الصفحة وكل ردودها نهائياً، ويتوقف رابطها."
        : "The page and all its responses are deleted for good, and its link stops working.",
      destructive: true,
      facts: [
        {
          label: isAr ? "الردود" : "Responses",
          value: countOf(page.responses, "response", lang),
        },
      ],
    });
    if (ok) remove.mutate(page.id);
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(pageAddress(slug));
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied");
    } catch {
      toast.error(isAr ? "تعذّر النسخ" : "Could not copy");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
      <AdminPageHeader
        icon={FileText}
        title={isAr ? "صفحات المنصة" : "Platform pages"}
        badges={pages.length > 0 && <AdminPageCount>{pages.length}</AdminPageCount>}
        description={
          isAr
            ? "صفحات Boutq الخاصة مثل استبيان المنحة: محتواها ونموذجها ورابطها boutq.store/p/…"
            : "Boutq's own pages, like the grant survey: their content, form and link boutq.store/p/…"
        }
        actions={
          <AdminPageAction
            icon={Plus}
            label={isAr ? "صفحة جديدة" : "New page"}
            short={isAr ? "جديدة" : "New"}
            onClick={() => setCreating(true)}
          />
        }
      />

      {isLoading ? null : pages.length === 0 ? (
        <OsEmptyState
          icon={FileText}
          title={isAr ? "لا توجد صفحات بعد" : "No pages yet"}
          description={
            isAr
              ? "أنشئ صفحة لحملة أو استبيان وشارك رابطها."
              : "Make a page for a campaign or a survey and share its link."
          }
        />
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-card">
          {pages.map((page) => (
            <li key={page.id} className="flex items-center gap-3 p-3 sm:p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link
                    to="/admin/super/pages/$id"
                    params={{ id: page.id }}
                    className="line-clamp-2 min-w-0 break-words text-sm font-bold text-foreground hover:underline"
                  >
                    {page.title}
                  </Link>
                  <OsStatusPill variant={STATUS_WORDS[page.status].tone}>
                    {STATUS_WORDS[page.status][lang]}
                  </OsStatusPill>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span dir="ltr" className="font-mono">
                    /p/{page.slug}
                  </span>
                  <span>{countOf(page.responses, "response", lang)}</span>
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                <Link to="/admin/super/pages/$id" params={{ id: page.id }}>
                  <Pencil className="size-3.5" />
                  <span className="hidden sm:inline">{isAr ? "تعديل" : "Edit"}</span>
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-9"
                    aria-label={isAr ? `خيارات ${page.title}` : `Options for ${page.title}`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void copy(page.slug)}>
                    <Copy className="me-2 size-4" />
                    {isAr ? "نسخ الرابط" : "Copy link"}
                  </DropdownMenuItem>
                  {page.status !== "draft" && (
                    <DropdownMenuItem asChild>
                      <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="me-2 size-4" />
                        {isAr ? "فتح الصفحة" : "Open page"}
                      </a>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => void askDelete(page)}
                  >
                    <Trash2 className="me-2 size-4" />
                    {isAr ? "حذف" : "Delete"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      <NewPageDialog open={creating} onOpenChange={setCreating} lang={lang} />
    </div>
  );
}

function NewPageDialog({
  open,
  onOpenChange,
  lang,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Lang;
}) {
  const isAr = lang === "ar";
  const session = useOpenSession(open);
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} kind="form" size="sm">
      <NewPageForm key={session} isAr={isAr} onDone={() => onOpenChange(false)} />
    </AppDialog>
  );
}

function NewPageForm({ isAr, onDone }: { isAr: boolean; onDone: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => createPage(slug, blankDraft(title.trim())),
    onSuccess: async (id) => {
      await qc.invalidateQueries({ queryKey: platformPagesAdminKeys.list() });
      onDone();
      void navigate({ to: "/admin/super/pages/$id", params: { id } });
    },
    onError: (err) =>
      setError(
        slugTaken(err)
          ? isAr
            ? "هذا الرابط مستخدم لصفحة أخرى"
            : "Another page uses this address"
          : isAr
            ? "تعذّر إنشاء الصفحة"
            : "The page could not be created",
      ),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError(isAr ? "اكتب عنوان الصفحة" : "Write the page's title");
    if (!SLUG_PATTERN.test(slug)) {
      return setError(
        isAr
          ? "الرابط حروف إنجليزية صغيرة وأرقام وشرطات"
          : "The address is small Latin letters, digits and dashes",
      );
    }
    setError(null);
    create.mutate();
  };
  return (
    <form onSubmit={submit} className="contents">
      <AppDialogHeader
        title={isAr ? "صفحة جديدة" : "New page"}
        description={
          isAr
            ? "تبدأ مسودة، ولا يراها أحد حتى تنشرها."
            : "It starts as a draft no one sees until you publish it."
        }
      />
      <AppDialogBody className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-page-title">{isAr ? "العنوان" : "Title"}</Label>
          <Input
            id="new-page-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isAr ? "مثال: برنامج انطلاقة" : "e.g. Launch programme"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-page-slug">{isAr ? "الرابط" : "Address"}</Label>
          <div
            className="flex min-h-10 items-center overflow-hidden rounded-md border border-input"
            dir="ltr"
          >
            <span className="shrink-0 border-e border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
              boutq.store/p/
            </span>
            <input
              id="new-page-slug"
              value={slug}
              onChange={(e) => setSlug(slugFrom(e.target.value))}
              placeholder="launch-2027"
              className="min-w-0 flex-1 bg-transparent px-2.5 text-sm focus:outline-none"
            />
          </div>
        </div>
      </AppDialogBody>
      <AppDialogFooter error={error}>
        <Button type="submit" disabled={create.isPending}>
          {isAr ? "إنشاء" : "Create"}
        </Button>
      </AppDialogFooter>
    </form>
  );
}
