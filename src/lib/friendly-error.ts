/**
 * What went wrong, in the reader's language: never the database's own sentence or a bare code.
 *
 * A failed request carries the system's words: an English Postgres sentence ("duplicate key value
 * violates unique constraint …"), a code a migration raised (`PRODUCT_HAS_STOCK`), or a browser's
 * "Failed to fetch". Shown as they come, an Arabic page read English system text. `friendlyError`
 * names the refusals every screen meets (permission, session, connection, a duplicate, a record in
 * use, the common codes), keeps a sentence a person wrote when it is in the reader's language, and
 * otherwise says the caller's own words (`fallback`), or a plain "something went wrong".
 *
 * A screen that knows its own codes (product removal, partner shops, supplier orders) still reads
 * the raw text with `errorText` and names them first; this is the net under every other screen.
 */
import { pageLanguage } from "@/lib/page-language";

type Lang = "ar" | "en";
type Words = { ar: string; en: string };

const GENERIC: Words = {
  ar: "حدث خطأ، حاول مرة أخرى.",
  en: "Something went wrong. Try again.",
};

/** The common refusals, by the code a migration raises. Feature screens name their own. */
const CODES: Record<string, Words> = {
  NOT_AUTHORIZED: {
    ar: "ليست لديك صلاحية لهذا. اطلب ذلك من صاحب المتجر.",
    en: "You do not have permission for this. Ask the store owner.",
  },
  UNAUTHORIZED: {
    ar: "ليست لديك صلاحية لهذا. اطلب ذلك من صاحب المتجر.",
    en: "You do not have permission for this. Ask the store owner.",
  },
  FORBIDDEN: {
    ar: "ليست لديك صلاحية لهذا. اطلب ذلك من صاحب المتجر.",
    en: "You do not have permission for this. Ask the store owner.",
  },
  OWNER_EMAIL_NOT_VERIFIED: {
    ar: "أكّد بريدك الإلكتروني أولاً (اللافتة أعلى الصفحة) ثم أعد المحاولة.",
    en: "Verify your email first (the banner at the top of the page), then try again.",
  },
  INSUFFICIENT_STOCK: {
    ar: "لا تكفي القطع المتوفرة في المخزون.",
    en: "There are not enough pieces in stock.",
  },
  INVALID_QUANTITY: {
    ar: "الكمية غير صحيحة.",
    en: "The quantity is not valid.",
  },
  PRODUCT_INACTIVE: {
    ar: "هذا المنتج مخفي من المتجر.",
    en: "This product is hidden from the store.",
  },
  PRODUCT_UNAVAILABLE: {
    ar: "هذا المنتج غير متاح الآن.",
    en: "This product is not available now.",
  },
  PRODUCT_HAS_STOCK: {
    ar: "في هذا المنتج قطع في المخزون. صفّر مخزونه أولاً.",
    en: "This product still has pieces in stock. Bring its stock to zero first.",
  },
  VARIANT_HAS_STOCK: {
    ar: "في هذا المقاس قطع في المخزون. صفّر مخزونه أولاً.",
    en: "This size still has pieces in stock. Bring its stock to zero first.",
  },
  PRODUCT_NEEDS_A_VARIANT: {
    ar: "يبقى للمنتج خيار واحد على الأقل.",
    en: "A product keeps at least one option.",
  },
  PAYMENT_METHOD_DISABLED: {
    ar: "طريقة الدفع هذه غير مفعّلة في المتجر.",
    en: "This payment method is turned off for the store.",
  },
  ORDERS_PAUSED: {
    ar: "استقبال الطلبات متوقف مؤقتاً.",
    en: "New orders are paused for now.",
  },
  STORE_CLOSED: {
    ar: "المتجر مغلق الآن حسب ساعات العمل.",
    en: "The store is closed now, by its opening hours.",
  },
  ORDER_NOT_DELETABLE: {
    ar: "لا يُحذف طلب مدفوع أو مسلَّم. ألغِه أو استرجع مبلغه بدلاً من ذلك.",
    en: "A paid or delivered order is not deleted. Cancel or refund it instead.",
  },
  ORDER_CANCELLED: {
    ar: "هذا الطلب ملغي.",
    en: "This order is cancelled.",
  },
  ORDER_LINE_HAS_ALTERATION: {
    ar: "على هذا السطر تعديل قائم. ألغِ التعديل أولاً.",
    en: "This line has an alteration. Cancel the alteration first.",
  },
  VALUE_TOO_LONG: {
    ar: "النص أطول من المسموح.",
    en: "The text is longer than allowed.",
  },
  IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD: {
    ar: "تغيّر الطلب أثناء الحفظ. حدّث الصفحة وأعد المحاولة.",
    en: "The request changed while saving. Refresh the page and try again.",
  },
};

const NOT_FOUND: Words = {
  ar: "لم يُعثر عليه، ربما حُذف. حدّث الصفحة.",
  en: "It could not be found; it may have been removed. Refresh the page.",
};
const RATE_LIMITED: Words = {
  ar: "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة.",
  en: "Too many tries. Wait a minute and try again.",
};
const CONNECTION: Words = {
  ar: "تعذر الاتصال. تحقق من الإنترنت وأعد المحاولة.",
  en: "Could not connect. Check the internet and try again.",
};
const SESSION: Words = {
  ar: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
  en: "Your session ended. Sign in again.",
};
const PERMISSION = CODES.NOT_AUTHORIZED;
const DUPLICATE: Words = {
  ar: "يوجد سجل بالاسم أو الرمز نفسه.",
  en: "Something with the same name or code already exists.",
};
const IN_USE: Words = {
  ar: "مستخدم في مكان آخر، فلا يمكن حذفه أو تغييره.",
  en: "It is used elsewhere, so it cannot be removed or changed.",
};
const INVALID_VALUE: Words = {
  ar: "قيمة ناقصة أو غير مقبولة. راجع الحقول وأعد المحاولة.",
  en: "A value is missing or not allowed. Check the fields and try again.",
};
const TIMEOUT: Words = {
  ar: "استغرق الأمر وقتاً طويلاً. أعد المحاولة.",
  en: "It took too long. Try again.",
};

/** The raw text of an error, as the system sent it: for screens that read their own codes. */
export function errorText(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") return String(code);
  }
  return "";
}

function errorStatus(err: unknown): number | null {
  if (err && typeof err === "object") {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-z]/;

/** A code a migration raised: the first word of capitals and underscores, before any ":<id>". */
const CODE_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

/** Words that only the system writes: never shown to a merchant as they are. */
const SYSTEM_TEXT =
  /\b(relation|column|constraint|violates|syntax error|invalid input syntax|null value|does not exist|schema cache|PGRST\d*|JWT|jwt|Edge Function|non-2xx|undefined|null|is not a function|Cannot read|Unexpected token|stack|SQLSTATE|plpgsql|rpc|uuid)\b/;

function known(text: string, err: unknown): Words | null {
  const code = errorCode(err);
  const status = errorStatus(err);
  for (const token of text.match(CODE_TOKEN) ?? []) {
    if (CODES[token]) return CODES[token];
    if (token.endsWith("_NOT_FOUND")) return NOT_FOUND;
    if (token.endsWith("_RATE_LIMITED")) return RATE_LIMITED;
  }
  if (
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_network/i.test(
      text,
    )
  ) {
    return CONNECTION;
  }
  if (
    code === "PGRST301" ||
    status === 401 ||
    /jwt expired|invalid jwt|auth session missing|refresh token/i.test(text)
  ) {
    return SESSION;
  }
  if (code === "42501" || status === 403 || /permission denied|row-level security/i.test(text)) {
    return PERMISSION;
  }
  if (code === "23505" || /duplicate key/i.test(text)) return DUPLICATE;
  if (code === "23503" || /foreign key/i.test(text)) return IN_USE;
  if (["23502", "23514", "22P02", "22001", "22003"].includes(code)) return INVALID_VALUE;
  if (/violates (not-null|check) constraint|invalid input syntax|value too long/i.test(text)) {
    return INVALID_VALUE;
  }
  if (code === "57014" || /statement timeout|timed out|timeout/i.test(text)) return TIMEOUT;
  if (status === 429 || /too many requests/i.test(text)) return RATE_LIMITED;
  return null;
}

/** A sentence our own code wrote in both languages, "English | العربية": the reader's side. */
function sideOf(text: string, lang: Lang): string | null {
  const parts = text.split(" | ");
  if (parts.length !== 2) return null;
  const arabic = parts.find((p) => ARABIC.test(p));
  const english = parts.find((p) => !ARABIC.test(p));
  if (!arabic || !english) return null;
  return lang === "ar" ? arabic.trim() : english.trim();
}

function looksLikeSystem(text: string): boolean {
  if (SYSTEM_TEXT.test(text)) return true;
  // A message that is only a code, or starts with one ("CODE_TAKEN:4012").
  return /^[A-Z][A-Z0-9_]{3,}(\b|:)/.test(text.trim());
}

function inLanguage(text: string, lang: Lang): boolean {
  return lang === "ar" ? ARABIC.test(text) : !ARABIC.test(text) && LATIN.test(text);
}

/** An error hidden behind kinder words is still reported, so nothing is lost to support. */
function reportHidden(err: unknown) {
  if (typeof window === "undefined") return;
  window.__appEvents?.captureException?.(
    err,
    { source: "friendly_error", route: window.location.pathname },
    { mechanism: "manual", handled: true, severity: "warning" },
  );
}

/**
 * What went wrong, for a person to read: the refusal named in their language, a sentence a person
 * wrote when it is in their language, else the caller's `fallback`, else "something went wrong".
 */
export function friendlyError(
  err: unknown,
  { lang = pageLanguage(), fallback }: { lang?: Lang; fallback?: string } = {},
): string {
  const text = errorText(err).trim();
  const words = known(text, err);
  if (words) return words[lang];
  const side = sideOf(text, lang);
  if (side) return side;
  if (text && !looksLikeSystem(text)) {
    if (inLanguage(text, lang)) return text;
    // A person's sentence in the other language: the caller's own words read better, if it has
    // any; with none, the sentence still says more than "something went wrong".
    if (!fallback) return text;
  }
  if (text) reportHidden(err);
  return fallback || GENERIC[lang];
}
