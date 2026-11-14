/**
 * A product's name as a post says it. A store that writes its names as a catalogue line, the kind
 * first ("عباية | وتر", "Abaya | Watar"), gets the piece's own name large and its kind small above
 * it; a post once printed the pipe, and twice. A name with no such divider stays whole.
 */
export type PostName = {
  /** What the piece is ("عباية"), or null when the name does not say. */
  kind: string | null;
  /** The piece's own name ("وتر"). */
  name: string;
  /** Both, as a sentence says them ("عباية وتر"). */
  label: string;
};

const DIVIDER = /\s*[|｜/·•]\s*/;

export function postName(full: string | null | undefined): PostName {
  const whole = (full ?? "").replace(/\s+/g, " ").trim();
  const parts = whole
    .split(DIVIDER)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return { kind: null, name: whole, label: whole };
  const kind = parts[0];
  const name = parts.slice(1).join(" ");
  return { kind, name, label: `${kind} ${name}` };
}
