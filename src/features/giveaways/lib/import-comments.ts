import { cleanUsername } from "./entry-rules";

/**
 * Comments a merchant brings in by hand (a CSV from an export tool, or text
 * pasted from a spreadsheet) when Instagram's API does not hand them over. Pure:
 * text in, comments out, with a count of the lines that could not be read.
 *
 * Two shapes are read:
 *  - a table (CSV, semicolon or tab separated) whose first row names the columns:
 *    username / user / owner / author ..., text / comment / message ..., and
 *    optionally date / timestamp ...;
 *  - a plain list, one comment per line: the account first, then what it wrote
 *    ("@sara.k @a @b done").
 */

export type ImportedComment = {
  /** Lowercase, without the @. */
  username: string;
  body: string;
  /** ISO time, or null when the file had none or it was unreadable. */
  commented_at: string | null;
};

export type ImportResult = {
  comments: ImportedComment[];
  /** Non-empty lines that held no readable account. */
  skipped: number;
};

/** Most a giveaway holds: far more than a post's comments, and a bound on the request. */
export const MAX_IMPORT = 50_000;

const USERNAME = /^[a-z0-9._]{1,30}$/;

const USER_COLUMNS = [
  "username",
  "user",
  "owner",
  "ownerusername",
  "author",
  "authorusername",
  "from",
  "profile",
  "handle",
  "account",
  "accountname",
  "commenter",
];
const TEXT_COLUMNS = ["text", "comment", "commenttext", "message", "body", "content"];
const DATE_COLUMNS = [
  "timestamp",
  "date",
  "time",
  "createdat",
  "created",
  "commentedat",
  "datetime",
];

const columnKey = (name: string) => name.toLowerCase().replace(/[^a-z]/g, "");

/** One CSV record per row; quotes may hold the separator, a doubled quote, and new lines. */
function parseTable(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function readDate(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The separator that splits the first line into the most columns. */
function pickSeparator(firstLine: string): string {
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function fromTable(text: string): ImportResult | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = pickSeparator(firstLine);
  const rows = parseTable(text, separator);
  if (rows.length === 0) return null;

  const keys = rows[0].map(columnKey);
  const userAt = keys.findIndex((k) => USER_COLUMNS.includes(k));
  // Without a named account column the text is a plain list, not a table.
  if (userAt === -1) return null;
  const textAt = keys.findIndex((k) => TEXT_COLUMNS.includes(k));
  const dateAt = keys.findIndex((k) => DATE_COLUMNS.includes(k));

  const comments: ImportedComment[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const username = cleanUsername(row[userAt] ?? "");
    if (!USERNAME.test(username)) {
      skipped += 1;
      continue;
    }
    comments.push({
      username,
      body: textAt === -1 ? "" : (row[textAt] ?? "").trim(),
      commented_at: dateAt === -1 ? null : readDate(row[dateAt]),
    });
  }
  return { comments, skipped };
}

function fromList(text: string): ImportResult {
  const comments: ImportedComment[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /^@?([A-Za-z0-9._]{1,30})(?:[\s:,;\t|-]+([\s\S]*))?$/.exec(trimmed);
    if (!match) {
      skipped += 1;
      continue;
    }
    comments.push({
      username: match[1].toLowerCase(),
      body: (match[2] ?? "").trim(),
      commented_at: null,
    });
  }
  return { comments, skipped };
}

/** Reads the comments out of pasted or uploaded text. */
export function parseImportedComments(input: string): ImportResult {
  // A spreadsheet export may start with a byte-order mark (U+FEFF).
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).trim();
  if (!text) return { comments: [], skipped: 0 };
  const result = fromTable(text) ?? fromList(text);
  return { ...result, comments: result.comments.slice(0, MAX_IMPORT) };
}
