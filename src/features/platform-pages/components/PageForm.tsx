import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { textOf, type Lang, type PlatformPage } from "@/lib/platform-pages/page";
import { cleanAnswersOf, type AnswerProblem } from "@/lib/platform-pages/answers";
import { sendPlatformPage } from "@/lib/platform-pages.functions";
import { QuestionField } from "./QuestionField";
import { problemText, word } from "../lib/words";

type Answers = Record<string, string | string[]>;

/**
 * A platform page's form, a step at a time: each step is checked by the form's own rule before
 * the next (`cleanAnswersOf`), and the whole again by the database when it is sent. A refusal
 * names the question, and the form opens its step with the words under it.
 */
export function PageForm({
  page,
  lang,
  preview = false,
  onClosed,
}: {
  page: PlatformPage;
  lang: Lang;
  /** The editor's preview: the last step shows the thank-you card and sends nothing. */
  preview?: boolean;
  onClosed: () => void;
}) {
  const steps = page.form.steps;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [problem, setProblem] = useState<AnswerProblem | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const step = steps[index];
  const last = index === steps.length - 1;
  const back = lang === "ar" ? ArrowRight : ArrowLeft;
  const forward = lang === "ar" ? ArrowLeft : ArrowRight;

  const showProblem = (found: AnswerProblem) => {
    const owner = steps.findIndex((s) => s.questions.some((q) => q.key === found.key));
    if (owner >= 0) setIndex(owner);
    setProblem(found);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-question="${found.key}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const next = async () => {
    const checked = cleanAnswersOf(step.questions, answers);
    if ("problem" in checked) return showProblem(checked.problem);
    setProblem(null);
    if (!last) {
      setIndex(index + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (preview) {
      setSent(true);
      return;
    }
    setSending(true);
    try {
      const result = await sendPlatformPage({ data: { slug: page.slug, answers } });
      if (result.ok) {
        setSent(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (result.reason === "answer") {
        showProblem(result.problem);
      } else if (result.reason === "closed" || result.reason === "not_found") {
        onClosed();
      } else {
        toast.error(word(result.reason === "too_many" ? "tooMany" : "failed", lang));
      }
    } catch {
      toast.error(word("failed", lang));
    } finally {
      setSending(false);
    }
  };

  if (sent) return <ThankYou page={page} answers={answers} lang={lang} />;
  if (!step) return null;

  const BackIcon = back;
  const ForwardIcon = forward;
  return (
    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-xl">
      {steps.length > 1 && (
        <div className="border-b border-border-subtle bg-muted/20 px-6 py-4">
          <ol className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">
            {steps.map((s, i) => (
              <li key={i} className={cn(i <= index && "text-primary")}>
                {i + 1}. {textOf(s.short ?? s.title, lang)}
              </li>
            ))}
          </ol>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-(--motion-fast)"
              style={{ width: `${Math.round(((index + 1) / steps.length) * 100)}%` }}
            />
          </div>
        </div>
      )}
      <CardContent className="p-6 sm:p-8">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
          className="space-y-6"
        >
          <div className="space-y-1">
            <h2 className="font-heading text-xl font-bold text-foreground">
              {steps.length > 1 &&
                `${word("stepOf", lang, { n: index + 1, total: steps.length })}: `}
              {textOf(step.title, lang)}
            </h2>
            {step.lead && (
              <p className="text-sm text-muted-foreground">{textOf(step.lead, lang)}</p>
            )}
          </div>
          <div className="space-y-5">
            {step.questions.map((question) => (
              <QuestionField
                key={question.key}
                question={question}
                value={answers[question.key]}
                onChange={(value) => {
                  setAnswers((current) => ({ ...current, [question.key]: value }));
                  if (problem?.key === question.key) setProblem(null);
                }}
                error={
                  problem?.key === question.key
                    ? problemText(problem, textOf(question.label, lang), lang)
                    : undefined
                }
                lang={lang}
              />
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            {index > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={sending}
                onClick={() => {
                  setProblem(null);
                  setIndex(index - 1);
                }}
                className="min-h-11 px-4 text-xs font-bold"
              >
                <BackIcon className="size-4" />
                {word("back", lang)}
              </Button>
            )}
            <Button type="submit" disabled={sending} className="min-h-11 flex-1 gap-2 font-bold">
              {sending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {word("sending", lang)}
                </>
              ) : last ? (
                <>
                  <Check className="size-4" />
                  {textOf(page.form.submit_label, lang) || word("send", lang)}
                </>
              ) : (
                <>
                  {word(index === steps.length - 2 ? "nextLast" : "next", lang)}
                  <ForwardIcon className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** The thank-you card: the page's words and what the visitor sent of the questions it names. */
function ThankYou({ page, answers, lang }: { page: PlatformPage; answers: Answers; lang: Lang }) {
  const thanks = page.settings.thank_you;
  const summary = page.form.steps
    .flatMap((step) => step.questions)
    .filter((q) => q.in_summary && typeof answers[q.key] === "string" && answers[q.key]);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(word("copied", lang));
    } catch {
      // Clipboard refused: nothing to do.
    }
  };
  return (
    <Card className="overflow-hidden rounded-2xl border-border bg-card shadow-xl">
      <div className="h-1.5 bg-primary" />
      <CardContent className="space-y-6 p-6 text-center sm:p-10">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
          <CheckCircle2 className="size-10" />
        </div>
        <div className="space-y-2">
          {thanks.badge && (
            <Badge variant="outline" className="border-primary/30 font-bold text-primary">
              {textOf(thanks.badge, lang)}
            </Badge>
          )}
          <h2 className="font-heading text-2xl font-extrabold text-foreground sm:text-3xl">
            {textOf(thanks.title, lang)}
          </h2>
          {thanks.body && (
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {textOf(thanks.body, lang)}
            </p>
          )}
        </div>
        {summary.length > 0 && (
          <dl className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 text-start text-sm text-muted-foreground">
            {summary.map((q) => {
              const raw = answers[q.key] as string;
              const shown = q.type === "instagram" ? `@${raw.replace(/^@/, "")}` : raw;
              const ltr = q.type === "instagram" || q.type === "phone";
              return (
                <div
                  key={q.key}
                  className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2 last:border-0 last:pb-0"
                >
                  <dt>{textOf(q.label, lang)}</dt>
                  <dd className="font-bold text-foreground" dir={ltr ? "ltr" : undefined}>
                    {shown}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={share}
            className="min-h-11 gap-2 px-6 font-bold"
          >
            <Share2 className="size-4" />
            {textOf(thanks.share_label, lang) || word("share", lang)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
