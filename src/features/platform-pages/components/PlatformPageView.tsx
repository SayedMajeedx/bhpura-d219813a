import { useState } from "react";
import { Check, Crown, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  textOf,
  type Block,
  type HeroBlock,
  type Lang,
  type PlatformPage,
} from "@/lib/platform-pages/page";
import { PageForm } from "./PageForm";

/**
 * A platform page (`boutq.store/p/<slug>`): its blocks in their order, its form, and its footer.
 * A closed page (closed by the super admin, or past its closing day) shows its closed message in
 * place of the form, and a form refused as closed while open turns into it.
 */
export function PlatformPageView({
  page,
  lang,
  preview = false,
}: {
  page: PlatformPage;
  lang: Lang;
  /** Drawn inside the super admin's editor: no page-wide glow, and the form sends nothing. */
  preview?: boolean;
}) {
  const [closed, setClosed] = useState(page.status === "closed");
  const hero = page.blocks.find((b): b is HeroBlock => b.kind === "hero");
  const rest = page.blocks.filter((b) => b.kind !== "hero");
  return (
    <main
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className={
        preview
          ? "relative overflow-hidden bg-muted/30 text-foreground"
          : "min-h-screen bg-muted/30 text-foreground"
      }
    >
      <div
        className={
          preview
            ? "pointer-events-none absolute inset-0 overflow-hidden"
            : "pointer-events-none fixed inset-0 overflow-hidden"
        }
      >
        <div className="absolute start-1/2 top-0 h-[350px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px] rtl:translate-x-1/2" />
      </div>
      <div className="relative mx-auto max-w-2xl space-y-8 px-4 py-8 sm:py-14">
        {hero && <Hero block={hero} lang={lang} />}
        {rest.map((block, i) => (
          <ContentBlock key={i} block={block} lang={lang} />
        ))}
        {closed ? (
          <ClosedCard page={page} lang={lang} />
        ) : page.form.steps.length > 0 ? (
          <PageForm page={page} lang={lang} preview={preview} onClosed={() => setClosed(true)} />
        ) : null}
        {page.settings.footer.length > 0 && (
          <footer className="space-y-1 border-t border-border-subtle pt-4 text-center text-xs text-muted-foreground">
            {page.settings.footer.map((line, i) => (
              <p key={i}>{textOf(line, lang)}</p>
            ))}
          </footer>
        )}
      </div>
    </main>
  );
}

function Hero({ block, lang }: { block: HeroBlock; lang: Lang }) {
  return (
    <header className="space-y-4 text-center">
      {block.image_url && (
        <div className="flex justify-center pb-1">
          <div className="inline-flex items-center justify-center rounded-2xl border border-border bg-card/80 p-1 shadow-md">
            <img
              src={block.image_url}
              alt=""
              className="h-11 w-auto rounded-xl object-contain sm:h-14"
              width={1024}
              height={320}
              loading="eager"
            />
          </div>
        </div>
      )}
      {block.badge && (
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
          <Crown className="size-3.5" />
          <span>{textOf(block.badge, lang)}</span>
        </div>
      )}
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        {textOf(block.title, lang)}
      </h1>
      {block.lead && (
        <p className="mx-auto max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
          {textOf(block.lead, lang)}
        </p>
      )}
      {block.points.length > 0 && (
        <ul className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs font-medium text-muted-foreground">
          {block.points.map((point, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1"
            >
              <Check className="size-3 text-primary" /> {textOf(point, lang)}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

function ContentBlock({ block, lang }: { block: Exclude<Block, HeroBlock>; lang: Lang }) {
  const title = "title" in block && block.title ? textOf(block.title, lang) : "";
  return (
    <section className="space-y-3">
      {title && <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>}
      {block.kind === "text" && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {textOf(block.body, lang)}
        </p>
      )}
      {block.kind === "benefits" && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {block.items.map((item, i) => (
            <li key={i} className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Check className="size-4 shrink-0 text-primary" />
                {textOf(item.title, lang)}
              </p>
              {item.body && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {textOf(item.body, lang)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {block.kind === "faq" && (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
          {block.items.map((item, i) => (
            <details key={i} className="group p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-foreground">
                {textOf(item.question, lang)}
              </summary>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {textOf(item.answer, lang)}
              </p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

function ClosedCard({ page, lang }: { page: PlatformPage; lang: Lang }) {
  const message = page.settings.closed_message;
  return (
    <Card className="rounded-2xl border-border bg-card shadow-xl">
      <CardContent className="space-y-3 p-6 text-center sm:p-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-6" />
        </div>
        <h2 className="font-heading text-xl font-bold text-foreground">
          {textOf(message.title, lang)}
        </h2>
        {message.body && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {textOf(message.body, lang)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
