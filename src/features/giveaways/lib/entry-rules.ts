/**
 * Which comments count as entries in a giveaway. Pure: the screen feeds in the
 * comments pulled from Instagram and the rules the merchant set, and gets back
 * the entries that qualify and why the others did not.
 *
 * Instagram's API cannot say who follows an account or who liked a post, so
 * those two conditions are not here: they are checked by hand on the winners
 * (see winners.ts).
 */

export type CommentEntry = {
  comment_id: string;
  /** Lowercase, without the @. */
  username: string;
  body: string;
  commented_at: string | null;
  like_count: number;
};

export type GiveawayRules = {
  winners: number;
  backups: number;
  /** One entry per account (the earliest qualifying comment) or one per qualifying comment. */
  onePerPerson: boolean;
  /** How many accounts a comment has to @mention (0 for none). */
  minMentions: number;
  /** The mentioned accounts have to be different from each other. */
  uniqueMentions: boolean;
  /** A comment must contain at least one of these words or hashtags (empty: no condition). */
  requiredText: string[];
  /** Comments before this moment do not count (ISO, or null). */
  startsAt: string | null;
  /** Comments after this moment do not count (ISO, or null). */
  endsAt: string | null;
  /** Accounts that cannot win (staff, partners, past winners), lowercase without the @. */
  excludeUsernames: string[];
  /** Staff check these on the winners by hand: Instagram does not expose them. */
  requireFollow: boolean;
  requireLike: boolean;
};

export const DEFAULT_RULES: GiveawayRules = {
  winners: 1,
  backups: 2,
  onePerPerson: true,
  minMentions: 0,
  uniqueMentions: true,
  requiredText: [],
  startsAt: null,
  endsAt: null,
  excludeUsernames: [],
  requireFollow: true,
  requireLike: false,
};

export type RejectReason =
  "excluded" | "outside_window" | "missing_text" | "few_mentions" | "duplicate";

export const REJECT_REASONS: RejectReason[] = [
  "excluded",
  "outside_window",
  "missing_text",
  "few_mentions",
  "duplicate",
];

export type EntriesResult = {
  /** The entries that go into the draw. */
  entries: CommentEntry[];
  rejected: Record<RejectReason, number>;
  totalComments: number;
  /** Accounts that commented at all. */
  uniqueAccounts: number;
  /** Accounts with at least one qualifying comment. */
  eligibleAccounts: number;
};

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

/** Cleans a handle the merchant typed: no @, no spaces, no profile URL, lowercase. */
export function cleanUsername(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .toLowerCase();
}

/** A list of handles from free text: separated by spaces, commas, or new lines. */
export function parseUsernames(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,؛;]+/)) {
    const name = cleanUsername(part);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** Words or hashtags from free text, one per line or comma. */
export function parseRequiredText(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\n,،;؛]+/)) {
    const word = part.trim();
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

/** Rules from whatever the database holds (jsonb): every field checked, defaults for the rest. */
export function parseRules(value: unknown): GiveawayRules {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strings = (input: unknown) =>
    Array.isArray(input) ? input.filter((v): v is string => typeof v === "string") : [];
  const bool = (input: unknown, fallback: boolean) =>
    typeof input === "boolean" ? input : fallback;
  const iso = (input: unknown) =>
    typeof input === "string" && Number.isFinite(Date.parse(input)) ? input : null;
  return {
    winners: clampInt(raw.winners, 1, 50, DEFAULT_RULES.winners),
    backups: clampInt(raw.backups, 0, 50, DEFAULT_RULES.backups),
    onePerPerson: bool(raw.onePerPerson, DEFAULT_RULES.onePerPerson),
    minMentions: clampInt(raw.minMentions, 0, 10, DEFAULT_RULES.minMentions),
    uniqueMentions: bool(raw.uniqueMentions, DEFAULT_RULES.uniqueMentions),
    requiredText: strings(raw.requiredText),
    startsAt: iso(raw.startsAt),
    endsAt: iso(raw.endsAt),
    excludeUsernames: strings(raw.excludeUsernames).map(cleanUsername).filter(Boolean),
    requireFollow: bool(raw.requireFollow, DEFAULT_RULES.requireFollow),
    requireLike: bool(raw.requireLike, DEFAULT_RULES.requireLike),
  };
}

const MARKS = /[ً-ٰٟـ]/g; // Arabic diacritics and tatweel

/**
 * Text prepared for matching: lowercase, Arabic diacritics and tatweel gone,
 * the alef and yeh variants merged, so "#مسابقة" matches "#مُسَابَقَة" and "أ" matches "ا".
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(MARKS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي");
}

const MENTION = /@([a-z0-9._]{1,30})/gi;

/**
 * The accounts a comment mentions, in order. The commenter themself and the
 * store's own account do not count as a friend.
 */
export function extractMentions(body: string, author: string, ownUsername?: string): string[] {
  const skip = new Set([author.toLowerCase(), (ownUsername ?? "").toLowerCase()]);
  const out: string[] = [];
  for (const match of body.matchAll(MENTION)) {
    const name = match[1].replace(/\.+$/, "").toLowerCase();
    if (name && !skip.has(name)) out.push(name);
  }
  return out;
}

type Verdict = RejectReason | null;

function verdictFor(
  comment: CommentEntry,
  rules: GiveawayRules,
  excluded: Set<string>,
  needles: string[],
  startMs: number | null,
  endMs: number | null,
  ownUsername?: string,
): Verdict {
  if (excluded.has(comment.username)) return "excluded";

  if (startMs !== null || endMs !== null) {
    const at = comment.commented_at ? Date.parse(comment.commented_at) : NaN;
    // A comment with no readable time cannot be placed in the window.
    if (!Number.isFinite(at)) return "outside_window";
    if (startMs !== null && at < startMs) return "outside_window";
    if (endMs !== null && at > endMs) return "outside_window";
  }

  if (needles.length > 0) {
    const haystack = normalizeText(comment.body);
    if (!needles.some((needle) => haystack.includes(needle))) return "missing_text";
  }

  if (rules.minMentions > 0) {
    const mentions = extractMentions(comment.body, comment.username, ownUsername);
    const count = rules.uniqueMentions ? new Set(mentions).size : mentions.length;
    if (count < rules.minMentions) return "few_mentions";
  }
  return null;
}

/** Earliest first; the comment id breaks a tie so the order never depends on input order. */
function byTime(a: CommentEntry, b: CommentEntry) {
  const ta = a.commented_at ? Date.parse(a.commented_at) : Infinity;
  const tb = b.commented_at ? Date.parse(b.commented_at) : Infinity;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.comment_id < b.comment_id ? -1 : a.comment_id > b.comment_id ? 1 : 0;
}

/** Applies the rules to the pulled comments. */
export function buildEntries(
  comments: CommentEntry[],
  rules: GiveawayRules,
  ownUsername?: string,
): EntriesResult {
  const excluded = new Set(rules.excludeUsernames.map(cleanUsername));
  if (ownUsername) excluded.add(cleanUsername(ownUsername));
  const needles = rules.requiredText.map(normalizeText).filter(Boolean);
  const startMs = rules.startsAt ? Date.parse(rules.startsAt) : null;
  const endMs = rules.endsAt ? Date.parse(rules.endsAt) : null;

  const rejected: Record<RejectReason, number> = {
    excluded: 0,
    outside_window: 0,
    missing_text: 0,
    few_mentions: 0,
    duplicate: 0,
  };
  const everyone = new Set<string>();
  const qualifying: CommentEntry[] = [];

  for (const comment of [...comments].sort(byTime)) {
    everyone.add(comment.username);
    const verdict = verdictFor(comment, rules, excluded, needles, startMs, endMs, ownUsername);
    if (verdict) rejected[verdict] += 1;
    else qualifying.push(comment);
  }

  const eligibleAccounts = new Set(qualifying.map((c) => c.username));
  let entries = qualifying;
  if (rules.onePerPerson) {
    const seen = new Set<string>();
    entries = [];
    for (const comment of qualifying) {
      if (seen.has(comment.username)) {
        rejected.duplicate += 1;
        continue;
      }
      seen.add(comment.username);
      entries.push(comment);
    }
  }

  return {
    entries,
    rejected,
    totalComments: comments.length,
    uniqueAccounts: everyone.size,
    eligibleAccounts: eligibleAccounts.size,
  };
}
