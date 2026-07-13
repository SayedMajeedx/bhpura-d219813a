import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { ChevronLeft } from "lucide-react";
import { richTextHasContent, sanitizeRichTextHtml } from "@/lib/rich-text";

export const Route = createFileRoute("/$slug/page/$idx")({
  component: PageView,
  notFoundComponent: PageMissing,
});

function PageView() {
  const { idx } = Route.useParams();
  const n = Number(idx);
  const { settings, lang, brand, t } = useStorefront();
  if (!Number.isInteger(n) || n < 1 || n > settings.pages.length) throw notFound();

  const page = settings.pages[n - 1];
  const title = lang === "ar" ? (page.title_ar || page.title_en) : (page.title_en || page.title_ar);
  const content = lang === "ar" ? (page.content_ar || page.content_en) : (page.content_en || page.content_ar);
  const safeContent = sanitizeRichTextHtml(content);

  if (!title && !richTextHasContent(safeContent)) return <PageMissing />;

  return (
    <article className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-14">
      <Link
        to="/$slug"
        params={{ slug: brand.slug }}
        className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"
        style={{ color: "var(--sf-link)" }}
      >
        <ChevronLeft className="h-4 w-4" />
        {t("العودة إلى المتجر", "Back to store")}
      </Link>
      {page.image_url && page.image_position === "top" && (
        <img src={page.image_url} alt={title ?? ""} className="mb-8 h-auto max-h-[350px] w-full rounded-xl object-cover" />
      )}
      {title && (
        <h1 className="font-display text-3xl sm:text-4xl mb-6" style={{ color: "var(--sf-heading)" }}>
          {title}
        </h1>
      )}
      {richTextHasContent(safeContent) && (
        <div className="max-w-full overflow-x-auto">
          <div
            dir={lang === "ar" ? "rtl" : "ltr"}
            className="max-w-none text-base leading-8 [&_a]:text-[var(--sf-link)] [&_a]:underline [&_h1]:mb-5 [&_h1]:mt-8 [&_h1]:font-display [&_h1]:text-4xl [&_h2]:mb-4 [&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-3xl [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:font-display [&_h3]:text-2xl [&_h4]:mb-2 [&_h4]:mt-5 [&_h4]:text-xl [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:ps-7 [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:ps-7 [&_table]:my-6 [&_table]:min-w-full [&_table]:border-collapse [&_th]:whitespace-nowrap [&_th]:border [&_th]:bg-black/5 [&_th]:p-3 [&_th]:font-semibold [&_td]:border [&_td]:p-3"
            dangerouslySetInnerHTML={{ __html: safeContent }}
          />
        </div>
      )}
      {page.image_url && page.image_position === "bottom" && (
        <img src={page.image_url} alt={title ?? ""} className="mt-8 h-auto w-full rounded-xl object-contain" />
      )}
    </article>
  );
}

function PageMissing() {
  const { t } = useStorefront();
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">{t("الصفحة غير متوفرة", "This page is not available")}</p>
      </Card>
    </div>
  );
}
