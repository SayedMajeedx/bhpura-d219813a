/**
 * JSON to put inside a `<script>` element (structured data, or a value an inline script reads).
 *
 * `JSON.stringify` leaves `<`, `>` and `&` as they are, so a product, brand or category name that
 * contains `</script><script>…` would close the element and run its own code, on the origin every
 * store shares. These characters are written as `<`, `>` and `&` instead (the same
 * string once parsed, so search engines and `JSON.parse` read exactly what was meant), and the
 * two line separators that older script parsers reject are escaped as well.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

const ESCAPES: Array<[string, string]> = [
  ["<", "\\u003c"],
  [">", "\\u003e"],
  ["&", "\\u0026"],
  [LINE_SEPARATOR, "\\u2028"],
  [PARAGRAPH_SEPARATOR, "\\u2029"],
];

export function jsonForScript(value: unknown): string {
  let text = JSON.stringify(value) ?? "null";
  for (const [char, escaped] of ESCAPES) text = text.split(char).join(escaped);
  return text;
}
