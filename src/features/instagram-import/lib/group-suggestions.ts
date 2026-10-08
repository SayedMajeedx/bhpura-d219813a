import type { MergeableDraft } from "./merge-drafts";

/**
 * Which posts belong to the same product, worked out from the posts themselves.
 *
 * A store that puts one product up as several posts does it in a burst (a few minutes apart) and
 * often writes the details under one of them. So two neighbouring posts are linked by how close in
 * time they were posted and how alike their captions are (or by one having no caption of its own),
 * and kept apart by a clear difference: two different prices or two different names. This is a
 * suggestion for the merchant to look at, never an automatic merge.
 */

export type GroupSuggestion = {
  /** The drafts of the group, in feed order. */
  ids: string[];
  reason: "time" | "caption" | "time-and-caption";
  /** "high": posted together and alike. "medium": worth a look. */
  confidence: "high" | "medium";
};

export type SuggestOptions = {
  /** The most posts one product can have. */
  maxGroupSize?: number;
};

const MINUTE = 60_000;
/** Posts linked at or above this score are the same product. */
const LINK_THRESHOLD = 3;
/** A group is "sure" when some link in it has both the time and the words to back it. */
const HIGH_CONFIDENCE = 4;
const SHORT_CAPTION = 15;

/** Arabic and Latin text compared without marks, letter variants, links, tags and emoji. */
export function normalizeCaption(text: string | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\p{L}\p{N}_.]+/gu, " ")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = (text: string) => new Set(text.split(" ").filter((word) => word.length > 1));

/** How alike two captions are, 0 to 1 (0 when either has nothing to compare). */
export function captionSimilarity(a: string | undefined, b: string | undefined): number {
  const first = tokens(normalizeCaption(a));
  const second = tokens(normalizeCaption(b));
  if (first.size === 0 || second.size === 0) return 0;
  let shared = 0;
  for (const word of first) if (second.has(word)) shared++;
  return shared / (first.size + second.size - shared);
}

const hasPrice = (draft: MergeableDraft) => typeof draft.price === "number" && draft.price > 0;
const isShort = (draft: MergeableDraft) => normalizeCaption(draft.caption).length < SHORT_CAPTION;
const minutesBetween = (a: MergeableDraft, b: MergeableDraft): number | null => {
  const first = a.postedAt ? Date.parse(a.postedAt) : NaN;
  const second = b.postedAt ? Date.parse(b.postedAt) : NaN;
  return Number.isNaN(first) || Number.isNaN(second) ? null : Math.abs(first - second) / MINUTE;
};

type Link = { score: number; time: boolean; caption: boolean };

/** How strongly `next` belongs with the group so far (its last post and what the group says). */
function link(
  group: { last: MergeableDraft; price: number | null; title: string },
  next: MergeableDraft,
): Link {
  let score = 0;
  let time = false;
  let caption = false;

  const gap = minutesBetween(group.last, next);
  if (gap !== null) {
    if (gap <= 10) [score, time] = [score + 3, true];
    else if (gap <= 45) [score, time] = [score + 2, true];
    else if (gap <= 180) [score, time] = [score + 1, true];
    else if (gap >= 720) score -= 3;
  }

  const similarity = captionSimilarity(group.last.caption, next.caption);
  if (similarity >= 0.85) [score, caption] = [score + 3, true];
  else if (similarity >= 0.5) [score, caption] = [score + 1, true];
  else if (isShort(group.last) !== isShort(next)) [score, caption] = [score + 1, true];

  // A clear difference keeps two posts apart.
  if (group.price !== null && hasPrice(next) && Math.abs(group.price - (next.price ?? 0)) > 0.01) {
    score -= 6;
  }
  const nextTitle = normalizeCaption(next.title);
  if (
    group.title &&
    nextTitle &&
    group.title !== nextTitle &&
    !group.title.includes(nextTitle) &&
    !nextTitle.includes(group.title) &&
    next.fieldConfidence.name >= 0.6
  ) {
    score -= 5;
  }
  return { score, time, caption };
}

/**
 * Groups of two or more neighbouring posts that look like one product. Products already merged are
 * left out (and end a run), so what the merchant arranged by hand is never reshuffled.
 */
export function suggestGroups(
  drafts: MergeableDraft[],
  options: SuggestOptions = {},
): GroupSuggestion[] {
  const maxSize = Math.max(2, options.maxGroupSize ?? 8);
  const suggestions: GroupSuggestion[] = [];

  type Group = {
    members: MergeableDraft[];
    last: MergeableDraft;
    price: number | null;
    title: string;
    strongest: number;
    time: boolean;
    caption: boolean;
  };
  // Held in an object so the helpers below and the loop see the same, current group.
  const state: { group: Group | null } = { group: null };

  const close = () => {
    const group = state.group;
    if (group && group.members.length >= 2) {
      suggestions.push({
        ids: group.members.map((draft) => draft.id),
        reason: group.time && group.caption ? "time-and-caption" : group.time ? "time" : "caption",
        confidence: group.strongest >= HIGH_CONFIDENCE ? "high" : "medium",
      });
    }
    state.group = null;
  };

  const open = (draft: MergeableDraft) => {
    state.group = {
      members: [draft],
      last: draft,
      price: hasPrice(draft) ? (draft.price as number) : null,
      title: normalizeCaption(draft.title),
      strongest: 0,
      time: false,
      caption: false,
    };
  };

  for (const draft of drafts) {
    if (draft.mergedFrom?.length) {
      close();
      continue;
    }
    const group = state.group;
    if (!group) {
      open(draft);
      continue;
    }
    const result = link(group, draft);
    if (result.score >= LINK_THRESHOLD && group.members.length < maxSize) {
      group.members.push(draft);
      group.last = draft;
      group.strongest = Math.max(group.strongest, result.score);
      group.time ||= result.time;
      group.caption ||= result.caption;
      if (group.price === null && hasPrice(draft)) group.price = draft.price;
      if (!group.title) group.title = normalizeCaption(draft.title);
    } else {
      close();
      open(draft);
    }
  }
  close();
  return suggestions;
}
