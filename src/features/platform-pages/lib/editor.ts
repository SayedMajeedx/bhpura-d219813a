import type {
  Block,
  PageForm,
  PageSettings,
  PlatformPage,
  Question,
  QuestionType,
  Step,
  Words,
} from "@/lib/platform-pages/page";

/**
 * The super admin's editor of a platform page: what is edited (`PageDraft`), how it is stored
 * (`storedParts`, the shape `readParts` reads back), the new pieces it adds, and what stops a page
 * from being published (`pageProblems`). Pure, so the editor's rules are tested without a screen.
 */

export type PageStatus = "draft" | "published" | "closed";
export type PageDraft = Pick<PlatformPage, "blocks" | "form" | "settings">;

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/;

/** What the database stores for a draft: the blocks under `content`, the form, the settings. */
export function storedParts(draft: PageDraft) {
  return {
    content: { blocks: draft.blocks },
    form: draft.form,
    settings: draft.settings,
  };
}

/** Whether two drafts would be stored alike (the editor's "unsaved changes"). */
export function sameDraft(a: PageDraft, b: PageDraft): boolean {
  return JSON.stringify(storedParts(a)) === JSON.stringify(storedParts(b));
}

/** A slug made from words a person typed: Latin letters, digits and dashes, or empty. */
export function slugFrom(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

/** A question's key a page has not used: never changed once made, as responses are kept by it. */
export function newQuestionKey(form: PageForm): string {
  const used = new Set(form.steps.flatMap((s) => s.questions.map((q) => q.key)));
  let n = used.size + 1;
  while (used.has(`q_${n}`)) n += 1;
  return `q_${n}`;
}

export function newOptionId(question: Question): string {
  const used = new Set(question.options.map((o) => o.id));
  let n = question.options.length + 1;
  while (used.has(`o_${n}`)) n += 1;
  return `o_${n}`;
}

export const BLOCK_KINDS = ["hero", "text", "benefits", "faq"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export function newBlock(kind: BlockKind): Block {
  switch (kind) {
    case "hero":
      return { kind: "hero", title: { ar: "", en: "" }, points: [] };
    case "text":
      return { kind: "text", title: { ar: "", en: "" }, body: { ar: "", en: "" } };
    case "benefits":
      return { kind: "benefits", items: [{ title: { ar: "", en: "" } }] };
    case "faq":
      return { kind: "faq", items: [{ question: { ar: "", en: "" }, answer: { ar: "", en: "" } }] };
  }
}

export function newQuestion(form: PageForm, type: QuestionType): Question {
  const base: Question = {
    key: newQuestionKey(form),
    type,
    required: false,
    label: { ar: "", en: "" },
    options: [],
  };
  if (type === "cards" || type === "choices") {
    base.layout = "list";
    base.options = [
      { id: "o_1", title: { ar: "", en: "" } },
      { id: "o_2", title: { ar: "", en: "" } },
    ];
  }
  return base;
}

export function newStep(): Step {
  return { title: { ar: "", en: "" }, questions: [] };
}

/** A new page: a header with its title, an empty form, and the words every page needs. */
export function blankDraft(title: string): PageDraft {
  const settings: PageSettings = {
    thank_you: { title: { ar: "شكراً لكم", en: "Thank you" } },
    closed_message: { title: { ar: "انتهى التقديم", en: "This page is closed" } },
    closes_at: null,
    share: {},
    footer: [],
  };
  return {
    blocks: [{ kind: "hero", title: { ar: title, en: "" }, points: [] }],
    form: { steps: [] },
    settings,
  };
}

/** A list with one item moved up (-1) or down (+1); unchanged at an end. */
export function moved<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return [...list];
  const out = [...list];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
}

export function replaced<T>(list: readonly T[], index: number, item: T): T[] {
  return list.map((current, i) => (i === index ? item : current));
}

export function removed<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

const has = (words: Words | undefined) => Boolean(words?.ar?.trim() || words?.en?.trim());

export type PageProblem = { ar: string; en: string };

/**
 * What stops a page from being published: a page a visitor could not read or fill in. A draft is
 * saved with problems; publishing waits for none.
 */
export function pageProblems(draft: PageDraft): PageProblem[] {
  const problems: PageProblem[] = [];
  const hero = draft.blocks.find((b) => b.kind === "hero");
  if (!hero || !has(hero.title)) {
    problems.push({ ar: "للصفحة عنوان في رأسها", en: "The page needs a title in its header" });
  }
  draft.blocks.forEach((block, i) => {
    const n = i + 1;
    if (block.kind === "text" && !has(block.body)) {
      problems.push({ ar: `القسم ${n}: النص فارغ`, en: `Section ${n}: the text is empty` });
    }
    if (block.kind === "benefits" && block.items.some((item) => !has(item.title))) {
      problems.push({
        ar: `القسم ${n}: ميزة بلا عنوان`,
        en: `Section ${n}: a benefit has no title`,
      });
    }
    if (
      block.kind === "faq" &&
      block.items.some((item) => !has(item.question) || !has(item.answer))
    ) {
      problems.push({
        ar: `القسم ${n}: سؤال بلا جواب`,
        en: `Section ${n}: a question has no answer`,
      });
    }
  });
  const keys = new Set<string>();
  draft.form.steps.forEach((step, s) => {
    const n = s + 1;
    if (!has(step.title)) {
      problems.push({ ar: `الخطوة ${n} بلا عنوان`, en: `Step ${n} has no title` });
    }
    if (step.questions.length === 0) {
      problems.push({ ar: `الخطوة ${n} بلا أسئلة`, en: `Step ${n} has no questions` });
    }
    step.questions.forEach((question, q) => {
      const where = { ar: `الخطوة ${n}، السؤال ${q + 1}`, en: `Step ${n}, question ${q + 1}` };
      if (keys.has(question.key)) {
        problems.push({ ar: `${where.ar}: مكرر`, en: `${where.en}: a duplicate` });
      }
      keys.add(question.key);
      if (!has(question.label)) {
        problems.push({ ar: `${where.ar}: بلا نص`, en: `${where.en}: has no words` });
      }
      if (question.type === "cards" || question.type === "choices") {
        if (question.options.length < 2) {
          problems.push({ ar: `${where.ar}: يحتاج خيارين`, en: `${where.en}: needs two choices` });
        }
        if (question.options.some((o) => !has(o.title))) {
          problems.push({
            ar: `${where.ar}: خيار بلا نص`,
            en: `${where.en}: a choice has no words`,
          });
        }
      }
    });
  });
  if (!has(draft.settings.thank_you.title)) {
    problems.push({ ar: "رسالة الشكر بلا عنوان", en: "The thank-you message has no title" });
  }
  return problems;
}

/** The page's address, as a visitor opens it. */
export function pageAddress(slug: string, origin = "https://boutq.store"): string {
  return `${origin}/p/${slug}`;
}
