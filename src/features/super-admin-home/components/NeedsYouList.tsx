import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NeedsYouLine, NeedsYouTarget } from "../lib/needs-you";

type Lang = "ar" | "en";

const TONE_DOT: Record<NeedsYouLine["tone"], string> = {
  urgent: "bg-destructive",
  warning: "bg-warning",
  info: "bg-primary",
};

/** What needs the super admin today, one line each, the most pressing first. */
export function NeedsYouList({
  lines,
  loading,
  lang,
  onOpen,
}: {
  lines: NeedsYouLine[];
  loading: boolean;
  lang: Lang;
  /** A line that acts on this page (a tab, a filter of the stores). */
  onOpen: (target: NeedsYouTarget) => void;
}) {
  const ar = lang === "ar";
  const Chevron = ar ? ChevronLeft : ChevronRight;
  const row =
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/50 pointer-coarse:min-h-11 sm:px-4";
  const body = (line: NeedsYouLine) => (
    <>
      <span
        className={cn("size-2 shrink-0 rounded-full", TONE_DOT[line.tone])}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-foreground">
          {line.title}
        </span>
        {line.detail && (
          <span className="block break-words text-xs text-muted-foreground">{line.detail}</span>
        )}
      </span>
      <Chevron className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );

  return (
    <section aria-labelledby="needs-you-title" className="rounded-xl border border-border bg-card">
      <h2
        id="needs-you-title"
        className="border-b border-border px-3 py-2.5 text-sm font-bold sm:px-4"
      >
        {ar ? "يحتاجك اليوم" : "Needs you today"}
      </h2>
      {loading && lines.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">
          {ar ? "جارٍ التحميل..." : "Loading..."}
        </p>
      ) : lines.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
          <CircleCheck className="size-4 text-success" aria-hidden="true" />
          {ar ? "لا شيء ينتظرك الآن." : "Nothing is waiting for you."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.key}>
              {line.target.kind === "requests" ? (
                <Link to="/admin/super/requests" className={row}>
                  {body(line)}
                </Link>
              ) : line.target.kind === "health" ? (
                <Link to="/admin/super/health" className={row}>
                  {body(line)}
                </Link>
              ) : line.target.kind === "responses" ? (
                <Link
                  to="/admin/super/responses/$id"
                  params={{ id: line.target.pageId }}
                  className={row}
                >
                  {body(line)}
                </Link>
              ) : (
                <button type="button" className={row} onClick={() => onOpen(line.target)}>
                  {body(line)}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
