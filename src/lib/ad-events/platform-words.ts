import type { AdPlatformKey } from "./platforms";
import type { SendResult } from "./shared";
import { validPixelId } from "./meta-conversions";
import { validTiktokPixel } from "./tiktok-events";
import { validSnapPixel } from "./snap-conversions";

/**
 * The Integrations page's words for each ad platform's pixel and server events, in Arabic and
 * English, and what stops the tracking form from saving. Pure.
 */

type Words = { ar: string; en: string };

export type PlatformWords = {
  name: string;
  pixelHint: Words;
  pixelPlaceholder: string;
  serverLabel: Words;
  serverHelp: Words;
  tokenPlaceholder: string;
  /** Whether the test asks for a code from the platform's events tool (Snapchat validates). */
  testNeedsCode: boolean;
  testCodeHelp: Words;
  received: Words;
};

export const PLATFORM_WORDS: Record<AdPlatformKey, PlatformWords> = {
  meta: {
    name: "Meta Pixel",
    pixelHint: { ar: "معرّف رقمي فقط", en: "Numeric pixel ID only" },
    pixelPlaceholder: "123456789012345",
    serverLabel: { ar: "واجهة التحويلات (من الخادم)", en: "Conversions API (server-side)" },
    serverHelp: {
      ar: "يرسل خادم المتجر المشتريات وأحداث التسوّق إلى Meta، فتُحسب حتى حين يُحجب البكسل على آيفون أو داخل إنستغرام. أنشئ الرمز من مدير الأحداث ← الإعدادات ← واجهة التحويلات.",
      en: "The store's server sends Meta every purchase and shopping step, so sales count even when the pixel is blocked on an iPhone or inside Instagram. Create the token in Events Manager → Settings → Conversions API.",
    },
    tokenPlaceholder: "EAAG…",
    testNeedsCode: true,
    testCodeHelp: {
      ar: "انسخ رمز الاختبار من تبويب «اختبار الأحداث» في مدير الأحداث.",
      en: "Copy the test code from the Test events tab in Events Manager.",
    },
    received: {
      ar: "وصل الحدث. افتح «اختبار الأحداث» في مدير الأحداث لتراه.",
      en: "Meta received the event. Open Test events in Events Manager to see it.",
    },
  },
  tiktok: {
    name: "TikTok Pixel",
    pixelHint: {
      ar: "رمز البكسل: حروف إنجليزية كبيرة وأرقام",
      en: "Pixel code: capital letters and digits",
    },
    pixelPlaceholder: "C4ABCD1234567890ABCD",
    serverLabel: { ar: "واجهة الأحداث (من الخادم)", en: "Events API (server-side)" },
    serverHelp: {
      ar: "يرسل خادم المتجر المشتريات وأحداث التسوّق إلى تيك توك، فتُحسب حتى حين يُحجب البكسل. أنشئ الرمز من مدير إعلانات تيك توك ← الأدوات ← الأحداث ← البكسل ← الإعدادات ← إنشاء رمز وصول.",
      en: "The store's server sends TikTok every purchase and shopping step, so sales count even when the pixel is blocked. Create the token in TikTok Ads Manager → Tools → Events → your pixel → Settings → Generate access token.",
    },
    tokenPlaceholder: "a1b2c3…",
    testNeedsCode: true,
    testCodeHelp: {
      ar: "انسخ رمز الاختبار من تبويب «اختبار الأحداث» في مدير أحداث تيك توك.",
      en: "Copy the test code from the Test events tab in TikTok's Events Manager.",
    },
    received: {
      ar: "وصل الحدث. افتح «اختبار الأحداث» في مدير أحداث تيك توك لتراه.",
      en: "TikTok received the event. Open Test events in TikTok's Events Manager to see it.",
    },
  },
  snap: {
    name: "Snap Pixel",
    pixelHint: { ar: "معرّف البكسل كما يظهر في سناب شات", en: "Pixel ID as Snapchat shows it" },
    pixelPlaceholder: "5c1a2b3d-0000-4000-8000-abcdef012345",
    serverLabel: { ar: "واجهة التحويلات (من الخادم)", en: "Conversions API (server-side)" },
    serverHelp: {
      ar: "يرسل خادم المتجر المشتريات وأحداث التسوّق إلى سناب شات، فتُحسب حتى حين يُحجب البكسل. أنشئ الرمز من مدير إعلانات سناب شات ← إعدادات الأعمال ← رموز واجهة التحويلات.",
      en: "The store's server sends Snapchat every purchase and shopping step, so sales count even when the pixel is blocked. Create the token in Snapchat Ads Manager → Business Settings → Conversions API Tokens.",
    },
    tokenPlaceholder: "eyJhbGci…",
    testNeedsCode: false,
    testCodeHelp: {
      ar: "يتحقق سناب شات من الحدث دون أن يسجّله.",
      en: "Snapchat checks the event without recording it.",
    },
    received: {
      ar: "تحقق سناب شات من الحدث ووجده سليماً.",
      en: "Snapchat checked the event and found it valid.",
    },
  },
};

/** What a test answered, in the merchant's language. */
export function testResultText(key: AdPlatformKey, result: SendResult, isAr: boolean): string {
  const words = PLATFORM_WORDS[key];
  if (result.sent) return isAr ? words.received.ar : words.received.en;
  if (result.reason === "off")
    return isAr
      ? `شغّل ${words.name} واحفظ رمز الوصول أولاً.`
      : `Turn on the ${words.name} and save the access token first.`;
  if (result.reason === "refused") {
    const who = words.name.replace(/ Pixel$/, "");
    return isAr
      ? `رُفض الحدث: ${result.detail ?? ""}`
      : `${who} refused the event: ${result.detail ?? ""}`;
  }
  return isAr
    ? "تعذّر الوصول إلى المنصّة، حاول لاحقاً."
    : "Could not reach the platform. Try again later.";
}

/** A pixel id typed in, kept to the characters its platform uses. */
export function typedPixel(key: AdPlatformKey, value: string): string {
  if (key === "meta") return value.replace(/\D/g, "");
  if (key === "tiktok") return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return value.toLowerCase().replace(/[^0-9a-f-]/g, "");
}

export function validPixelFor(key: AdPlatformKey, value: string): boolean {
  if (key === "meta") return validPixelId(value);
  if (key === "tiktok") return validTiktokPixel(value);
  return validSnapPixel(value);
}

export type PixelForm = { enabled: boolean; id: string };

/** Why the tracking form cannot be saved, in the merchant's language, or null. */
export function trackingProblem(
  form: { google_analytics_enabled: boolean; google_analytics_id: string } & Record<
    AdPlatformKey,
    PixelForm
  >,
  isAr: boolean,
): string | null {
  if (
    form.google_analytics_enabled &&
    !/^G-[A-Z0-9]+$/.test(form.google_analytics_id.trim().toUpperCase())
  )
    return isAr
      ? "أدخل معرّف GA4 صحيحاً مثل G-XXXXXXXXXX"
      : "Enter a valid GA4 ID such as G-XXXXXXXXXX";
  for (const key of ["meta", "tiktok", "snap"] as const) {
    const pixel = form[key];
    if (pixel.enabled && !validPixelFor(key, pixel.id.trim())) {
      const words = PLATFORM_WORDS[key];
      return isAr
        ? `معرّف ${words.name} غير صحيح: ${words.pixelHint.ar}`
        : `The ${words.name} ID is not valid: ${words.pixelHint.en}`;
    }
  }
  return null;
}
