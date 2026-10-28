import { formatMoney } from "@/lib/format";

const SNIPPET_LENGTH = 160;

type SnippetInput = {
  name: string;
  /** The product's description as written, in the page's language (else the other's). */
  description?: string | null;
  storeName: string;
  lang: "ar" | "en";
  /** What the product is, in the store's own words: "Fabric: Silk" (its facts, at most three used). */
  facts?: ReadonlyArray<{ label: string; value: string }>;
  /** The price a shopper pays (the cheapest size they can buy), and the dearest when sizes differ. */
  price?: { from: number; to: number } | null;
  currency?: string | null;
  /** False when the store hides its prices. */
  showPrice?: boolean;
  /** A service is booked, not bought. */
  service?: boolean;
};

const squash = (text: string) =>
  text
    .replace(/<[^>]*>?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The text cut at a word, with an ellipsis when something was left out. */
function cutAtWord(text: string, length: number): string {
  if (text.length <= length) return text;
  const cut = text.slice(0, length - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,،.:;-]+$/, "")}…`;
}

/**
 * What Google shows under a product's title. The product's own description when it wrote one;
 * otherwise a sentence made only of what the page says: the product, the store, what it is (its
 * facts) and its price. A product with no description once had just its name as its snippet.
 */
export function productSnippet(input: SnippetInput): string {
  const written = squash(input.description ?? "");
  if (written && written !== squash(input.name)) return cutAtWord(written, SNIPPET_LENGTH);

  const { lang, name, storeName } = input;
  const parts: string[] = [];
  if (input.service) {
    parts.push(lang === "ar" ? `احجز ${name} من ${storeName}.` : `Book ${name} with ${storeName}.`);
  } else {
    parts.push(lang === "ar" ? `${name} من ${storeName}.` : `${name} from ${storeName}.`);
  }

  const facts = (input.facts ?? []).slice(0, 3);
  if (facts.length)
    parts.push(`${facts.map((f) => `${f.label}: ${f.value}`).join(lang === "ar" ? "، " : ", ")}.`);

  const price = input.price;
  if (input.showPrice !== false && price && price.from > 0) {
    const currency = input.currency || "BHD";
    const from = formatMoney(price.from, currency, lang);
    const ranged = price.to > price.from;
    parts.push(
      lang === "ar"
        ? `${ranged ? "تبدأ من" : "السعر"} ${from}.`
        : `${ranged ? "From" : "Price"} ${from}.`,
    );
  }
  // A currency is written with a no-break space; a snippet is plain words.
  return cutAtWord(parts.join(" ").replace(/\u00a0/g, " "), SNIPPET_LENGTH);
}
