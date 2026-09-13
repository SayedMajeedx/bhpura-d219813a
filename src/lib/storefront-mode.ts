export type StorefrontMode = "shop" | "catalog";

export interface StorefrontModeSettings {
  storefront_mode?: string | null;
  catalog_show_prices?: boolean | null;
  catalog_inquiry_message_en?: string | null;
  catalog_inquiry_message_ar?: string | null;
  whatsapp_number?: string | null;
  [key: string]: unknown;
}

export interface InquiryMessageContext {
  brandName?: string | null;
  productName?: string | null;
  productUrl?: string | null;
  variantLabel?: string | null;
  priceLabel?: string | null;
}

export const DEFAULT_CATALOG_INQUIRY_TEMPLATE_AR =
  "مرحباً {brand_name}، أود الاستفسار عن المنتج: {product_name} {variant} {price}\n{product_url}";

export const DEFAULT_CATALOG_INQUIRY_TEMPLATE_EN =
  "Hello {brand_name}, I would like to inquire about: {product_name} {variant} {price}\n{product_url}";

export const DEFAULT_CATALOG_INQUIRY_MESSAGE_AR = DEFAULT_CATALOG_INQUIRY_TEMPLATE_AR;
export const DEFAULT_CATALOG_INQUIRY_MESSAGE_EN = DEFAULT_CATALOG_INQUIRY_TEMPLATE_EN;

/**
 * Returns true if the storefront is in catalog mode (showcase & WhatsApp inquiry)
 * rather than direct checkout shop mode.
 */
export function isCatalogMode(settings?: StorefrontModeSettings | null): boolean {
  return settings?.storefront_mode === "catalog";
}

/**
 * Returns true if product prices should be displayed.
 * In shop mode, prices are always shown.
 * In catalog mode, prices are shown only if catalog_show_prices is not false.
 */
export function shouldShowPrices(settings?: StorefrontModeSettings | null): boolean {
  if (!isCatalogMode(settings)) return true;
  return settings?.catalog_show_prices !== false;
}

/**
 * Normalizes a phone number to standard international digits without leading '+' or '00',
 * automatically prefixing 973 for 8-digit Bahrain local numbers.
 */
export function normalizeWhatsAppDigits(raw?: string | null): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // Strip leading 00 if present (e.g. 00973 -> 973)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Strip leading 0 from local 9-digit numbers (e.g. 039123456 -> 39123456)
  if (digits.length === 9 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // If Bahrain 8-digit local mobile or landline (starts with 3, 6, 17), prepend 973
  if (
    digits.length === 8 &&
    (digits.startsWith("3") || digits.startsWith("6") || digits.startsWith("17"))
  ) {
    digits = `973${digits}`;
  }

  return digits;
}

/**
 * Interpolates context variables into an inquiry message template.
 */
export function renderInquiryMessage(template: string, ctx: InquiryMessageContext): string {
  if (!template) return "";
  const brandName = ctx.brandName?.trim() || "";
  const productName = ctx.productName?.trim() || "";
  const productUrl = ctx.productUrl?.trim() || "";
  const variantLabel = ctx.variantLabel?.trim() || "";
  const priceLabel = ctx.priceLabel?.trim() || "";

  let result = template
    .replace(/\{brand_name\}/g, brandName)
    .replace(/\{product_name\}/g, productName)
    .replace(/\{product_url\}/g, productUrl)
    .replace(/\{variant\}/g, variantLabel)
    .replace(/\{price\}/g, priceLabel);

  // Clean up any remaining unmatched placeholder tokens
  result = result.replace(/\{[a-zA-Z0-9_]+\}/g, "");
  // Clean up dangling empty parentheses e.g. "()" or "( )"
  result = result.replace(/\(\s*\)/g, "");
  // Collapse multiple spaces into single space per line, but preserve newlines
  result = result
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();

  return result;
}

export interface BuildWhatsAppInquiryUrlParams {
  number?: string | null;
  template?: string | null;
  lang?: string;
  ctx: InquiryMessageContext;
}

/**
 * Builds a direct wa.me link with encoded inquiry text.
 * Returns null if no valid phone number digits exist.
 */
export function buildWhatsAppInquiryUrl(params: BuildWhatsAppInquiryUrlParams): string | null {
  const digits = normalizeWhatsAppDigits(params.number);
  if (!digits) return null;

  const defaultTemplate =
    params.lang === "ar"
      ? DEFAULT_CATALOG_INQUIRY_TEMPLATE_AR
      : DEFAULT_CATALOG_INQUIRY_TEMPLATE_EN;
  const template = params.template?.trim() || defaultTemplate;
  const message = renderInquiryMessage(template, params.ctx);

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
