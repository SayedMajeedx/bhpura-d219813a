const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "h4",
  "h1",
  "a",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
]);

const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|#|\/)/i;

/**
 * Sanitizes the small HTML subset produced by the page editor. This function is
 * deliberately DOM-independent so it is safe to call during server rendering.
 */
export function sanitizeRichTextHtml(value: string | null | undefined) {
  if (!value) return "";

  return (value.match(/<[^>]*>|[^<]+/g) ?? [])
    .map((token) => {
      if (!token.startsWith("<")) return token;
      if (/^<!--/.test(token)) return "";

      const closing = token.match(/^<\s*\/\s*([a-z0-9]+)\s*>$/i);
      if (closing) {
        const tag = closing[1].toLowerCase();
        return ALLOWED_TAGS.has(tag) && tag !== "br" ? `</${tag}>` : "";
      }

      const opening = token.match(/^<\s*([a-z0-9]+)([^>]*)>$/i);
      if (!opening) return "";
      const tag = opening[1].toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (tag === "br") return "<br>";
      if (tag !== "a") return `<${tag}>`;

      const hrefMatch = opening[2].match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const href = (hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
      if (!SAFE_LINK.test(href)) return "<a>";
      const escapedHref = href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">`;
    })
    .join("");
}

export function richTextHasContent(value: string | null | undefined) {
  return sanitizeRichTextHtml(value)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length > 0;
}

export function normalizeRichTextValue(value: string | null | undefined) {
  if (!value) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return sanitizeRichTextHtml(value);
  const escaped = value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
