import type { PageForm, Question } from "./page";

/**
 * The form's rule for a visitor's answers, the twin of the database's
 * `platform_page_clean_answers` (migration 20261218100000; tests/platform-pages-migration.test.ts
 * runs both over the same answers): a required answer is given, each type has its shape and size,
 * a choice is one of the page's own options, unknown keys are dropped. The page checks a step
 * before the next; the database checks the whole again when it is sent.
 */

export type Answers = Record<string, unknown>;
export type AnswerProblem = { key: string; kind: "missing" | "invalid" };
export type CleanResult =
  { answers: Record<string, string | string[]> } | { problem: AnswerProblem };

const MAX: Partial<Record<Question["type"], number>> = { text: 200, long_text: 2000 };

/** An Instagram account as typed (@name, a link to the profile) cut to its name. */
export function instagramName(raw: string): string {
  return raw
    .trim()
    .replace(/^(@|https?:\/\/(www\.)?instagram\.com\/)/i, "")
    .replace(/[/?].*$/, "")
    .trim();
}

/** A phone number as typed, digits and a leading "+" only. */
export function phoneDigits(raw: string): string {
  return raw.replace(/[^0-9+]/g, "");
}

function cleanOne(
  question: Question,
  raw: unknown,
): { value?: string | string[] } | { problem: AnswerProblem["kind"] } {
  const ids = question.options.map((option) => option.id);
  if (question.type === "choices") {
    if (raw === undefined || raw === null) {
      return question.required ? { problem: "missing" } : {};
    }
    if (!Array.isArray(raw)) return { problem: "invalid" };
    const picked: string[] = [];
    for (const item of raw) {
      if (typeof item !== "string" || !ids.includes(item)) return { problem: "invalid" };
      if (!picked.includes(item)) picked.push(item);
    }
    if (picked.length === 0) return question.required ? { problem: "missing" } : {};
    return { value: picked };
  }
  if (raw !== undefined && raw !== null && typeof raw !== "string") return { problem: "invalid" };
  let text = typeof raw === "string" ? raw.trim() : "";
  if (question.type === "instagram") text = instagramName(text);
  if (question.type === "phone") text = phoneDigits(text);
  if (!text) return question.required ? { problem: "missing" } : {};
  const max = MAX[question.type];
  const invalid =
    (max !== undefined && [...text].length > max) ||
    (question.type === "instagram" && !/^[A-Za-z0-9._]{1,30}$/.test(text)) ||
    (question.type === "phone" && !/^\+[0-9]{8,15}$/.test(text)) ||
    (question.type === "cards" && !ids.includes(text));
  return invalid ? { problem: "invalid" } : { value: text };
}

/** The answers to these questions, cleaned, or the first that stops them. */
export function cleanAnswersOf(questions: readonly Question[], answers: Answers): CleanResult {
  const out: Record<string, string | string[]> = {};
  for (const question of questions) {
    const result = cleanOne(question, answers[question.key]);
    if ("problem" in result) return { problem: { key: question.key, kind: result.problem } };
    if (result.value !== undefined) out[question.key] = result.value;
  }
  return { answers: out };
}

/** The whole form's answers, as the database cleans them when they are sent. */
export function cleanAnswers(form: PageForm, answers: Answers): CleanResult {
  return cleanAnswersOf(
    form.steps.flatMap((step) => step.questions),
    answers,
  );
}

/** The database's refusal read back as a problem the page can point to; null for any other. */
export function problemFromRefusal(message: string): AnswerProblem | null {
  const match = /ANSWER_(MISSING|INVALID):([a-z0-9_]+)/.exec(message);
  if (!match) return null;
  return { key: match[2], kind: match[1] === "MISSING" ? "missing" : "invalid" };
}
