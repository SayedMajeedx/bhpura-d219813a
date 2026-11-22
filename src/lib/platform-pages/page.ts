/**
 * A platform page (`boutq.store/p/<slug>`) as a visitor reads it (`platform_page_public`): its
 * blocks, its form and its settings, made in the super admin. Read only through `readPage`, which
 * keeps what has the right shape and drops the rest, so a page saved by an older or a newer
 * editor never breaks the visitor's page.
 */

export type Lang = "ar" | "en";
/** Words in each language; a language left empty falls back to the other (`textOf`). */
export type Words = { ar?: string; en?: string };

export type HeroBlock = {
  kind: "hero";
  badge?: Words;
  title: Words;
  lead?: Words;
  image_url?: string;
  points: Words[];
};
export type TextBlock = { kind: "text"; title?: Words; body: Words };
export type BenefitsBlock = {
  kind: "benefits";
  title?: Words;
  items: { title: Words; body?: Words }[];
};
export type FaqBlock = { kind: "faq"; title?: Words; items: { question: Words; answer: Words }[] };
export type Block = HeroBlock | TextBlock | BenefitsBlock | FaqBlock;

export const QUESTION_TYPES = [
  "text",
  "long_text",
  "instagram",
  "phone",
  "cards",
  "choices",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type QuestionOption = { id: string; title: Words; body?: Words; tag?: Words; icon?: string };
export type Question = {
  key: string;
  type: QuestionType;
  required: boolean;
  label: Words;
  help?: Words;
  placeholder?: Words;
  /** Shown back to the visitor on the thank-you card. */
  in_summary?: boolean;
  /** How a choice's cards are laid out: small tiles, a list, or a grid of two. */
  layout?: "tiles" | "list" | "grid";
  options: QuestionOption[];
};
export type Step = { short?: Words; title: Words; lead?: Words; questions: Question[] };
export type PageForm = { steps: Step[]; submit_label?: Words };

export type PageSettings = {
  thank_you: { badge?: Words; title: Words; body?: Words; share_label?: Words };
  closed_message: { title: Words; body?: Words };
  closes_at: string | null;
  share: { title?: Words; description?: Words; image_url?: string };
  footer: Words[];
};

export type PlatformPage = {
  slug: string;
  status: "published" | "closed";
  blocks: Block[];
  form: PageForm;
  settings: PageSettings;
};

/** A language's words, else the other language's, else nothing. */
export function textOf(words: Words | null | undefined, lang: Lang): string {
  if (!words) return "";
  const own = words[lang]?.trim();
  if (own) return own;
  return (lang === "ar" ? words.en : words.ar)?.trim() ?? "";
}

/** Whether a page has anything in English to show (else it is shown in Arabic only). */
export function hasEnglish(page: PlatformPage): boolean {
  const all = JSON.stringify({ blocks: page.blocks, form: page.form });
  return /"en":"[^"]*\S/.test(all);
}

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function words(value: unknown): Words | undefined {
  if (!isObject(value)) return undefined;
  const out: Words = {};
  if (typeof value.ar === "string") out.ar = value.ar;
  if (typeof value.en === "string") out.en = value.en;
  return out.ar || out.en ? out : undefined;
}
const url = (value: unknown) =>
  typeof value === "string" && /^(https:\/\/|\/)[^\s"'<>]*$/.test(value) ? value : undefined;

function block(raw: unknown): Block | null {
  if (!isObject(raw)) return null;
  switch (raw.kind) {
    case "hero": {
      const title = words(raw.title);
      if (!title) return null;
      return {
        kind: "hero",
        title,
        badge: words(raw.badge),
        lead: words(raw.lead),
        image_url: url(raw.image_url),
        points: list(raw.points)
          .map(words)
          .filter((w): w is Words => Boolean(w)),
      };
    }
    case "text": {
      const body = words(raw.body);
      return body ? { kind: "text", title: words(raw.title), body } : null;
    }
    case "benefits": {
      const items = list(raw.items).flatMap((item) => {
        const title = isObject(item) ? words(item.title) : undefined;
        return title && isObject(item) ? [{ title, body: words(item.body) }] : [];
      });
      return items.length ? { kind: "benefits", title: words(raw.title), items } : null;
    }
    case "faq": {
      const items = list(raw.items).flatMap((item) => {
        if (!isObject(item)) return [];
        const question = words(item.question);
        const answer = words(item.answer);
        return question && answer ? [{ question, answer }] : [];
      });
      return items.length ? { kind: "faq", title: words(raw.title), items } : null;
    }
    default:
      return null;
  }
}

function question(raw: unknown): Question | null {
  if (!isObject(raw)) return null;
  const key = typeof raw.key === "string" ? raw.key : "";
  const type = QUESTION_TYPES.find((t) => t === raw.type);
  const label = words(raw.label);
  if (!/^[a-z0-9_]{1,40}$/.test(key) || !type || !label) return null;
  const options = list(raw.options).flatMap((option) => {
    if (!isObject(option) || typeof option.id !== "string") return [];
    const title = words(option.title);
    if (!title) return [];
    return [
      {
        id: option.id,
        title,
        body: words(option.body),
        tag: words(option.tag),
        icon: typeof option.icon === "string" ? option.icon : undefined,
      },
    ];
  });
  if ((type === "cards" || type === "choices") && options.length === 0) return null;
  const layout = (["tiles", "list", "grid"] as const).find((l) => l === raw.layout);
  return {
    key,
    type,
    required: raw.required === true,
    label,
    help: words(raw.help),
    placeholder: words(raw.placeholder),
    in_summary: raw.in_summary === true,
    layout,
    options,
  };
}

/** The page a visitor reads, from `platform_page_public`'s answer; null when it is not one. */
export function readPage(raw: unknown): PlatformPage | null {
  if (!isObject(raw) || typeof raw.slug !== "string") return null;
  if (raw.status !== "published" && raw.status !== "closed") return null;
  const content = isObject(raw.content) ? raw.content : {};
  const form = isObject(raw.form) ? raw.form : {};
  const settings = isObject(raw.settings) ? raw.settings : {};
  const thankYou = isObject(settings.thank_you) ? settings.thank_you : {};
  const closed = isObject(settings.closed_message) ? settings.closed_message : {};
  const share = isObject(settings.share) ? settings.share : {};
  return {
    slug: raw.slug,
    status: raw.status,
    blocks: list(content.blocks)
      .map(block)
      .filter((b): b is Block => b !== null),
    form: {
      submit_label: words(form.submit_label),
      steps: list(form.steps).flatMap((step) => {
        if (!isObject(step)) return [];
        const title = words(step.title);
        const questions = list(step.questions)
          .map(question)
          .filter((q): q is Question => q !== null);
        return title && questions.length
          ? [{ title, short: words(step.short), lead: words(step.lead), questions }]
          : [];
      }),
    },
    settings: {
      thank_you: {
        badge: words(thankYou.badge),
        title: words(thankYou.title) ?? { ar: "شكراً لكم", en: "Thank you" },
        body: words(thankYou.body),
        share_label: words(thankYou.share_label),
      },
      closed_message: {
        title: words(closed.title) ?? { ar: "انتهى التقديم", en: "This page is closed" },
        body: words(closed.body),
      },
      closes_at: typeof settings.closes_at === "string" ? settings.closes_at : null,
      share: {
        title: words(share.title),
        description: words(share.description),
        image_url: url(share.image_url),
      },
      footer: list(settings.footer)
        .map(words)
        .filter((w): w is Words => Boolean(w)),
    },
  };
}

/** The page's head: its title, its description and the picture a shared link shows. */
export function platformPageHead(page: PlatformPage | null, lang: Lang) {
  if (!page) return { meta: [{ title: "Boutq OS" }, { name: "robots", content: "noindex" }] };
  const hero = page.blocks.find((b): b is HeroBlock => b.kind === "hero");
  const title = textOf(page.settings.share.title, lang) || textOf(hero?.title, lang) || "Boutq OS";
  const description =
    textOf(page.settings.share.description, lang) || textOf(hero?.lead, lang) || "";
  const image = page.settings.share.image_url ?? hero?.image_url;
  const picture = image?.startsWith("/") ? `https://boutq.store${image}` : image;
  return {
    meta: [
      { title },
      ...(description ? [{ name: "description", content: description }] : []),
      { property: "og:title", content: title },
      ...(description ? [{ property: "og:description", content: description }] : []),
      ...(picture ? [{ property: "og:image", content: picture }] : []),
      { property: "og:url", content: `https://boutq.store/p/${page.slug}` },
      { name: "twitter:card", content: picture ? "summary_large_image" : "summary" },
    ],
  };
}
