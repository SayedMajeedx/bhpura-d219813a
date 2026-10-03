import type { RejectReason } from "./entry-rules";

/**
 * What the screen says for an error code the `instagram-giveaway` function returns.
 * `detail` is the function's own message (for an Instagram refusal, Instagram's
 * words); it is added where the code alone does not say what went wrong.
 */
export function giveawayErrorMessage(
  code: string | undefined,
  isAr: boolean,
  detail?: string,
): string {
  const more = detail?.trim() ? ` (${detail.trim().slice(0, 240)})` : "";
  switch (code) {
    case "not_connected":
      return isAr
        ? "حساب انستغرام غير مربوط. اربطه أولاً."
        : "Instagram is not connected. Connect it first.";
    case "token_expired":
      return isAr
        ? "انتهت صلاحية رمز انستغرام. أنشئ رمزاً جديداً من لوحة Meta والصقه هنا."
        : "The Instagram token has expired. Make a new one in Meta's dashboard and paste it here.";
    case "rate_limited":
      return isAr
        ? "انستغرام طلب التمهل. انتظر بضع دقائق ثم أكمل."
        : "Instagram asked to slow down. Wait a few minutes, then continue.";
    case "forbidden":
      return isAr
        ? "ليس لديك صلاحية إدارة المسابقات."
        : "You do not have permission to manage giveaways.";
    case "instagram_error":
      return isAr
        ? `رفض انستغرام الطلب. تأكد أن الحساب Business أو Creator وأن الصلاحيات ممنوحة.${more}`
        : `Instagram refused the request. Check the account is Business or Creator and the permissions are granted.${more}`;
    case "missing_username":
      return isAr
        ? "أرسل انستغرام التعليقات بدون أسماء أصحابها، لأن الرمز لا يملك صلاحية قراءة التعليقات. أنشئ رمزاً جديداً من Meta وتأكد من تفعيل instagram_business_manage_comments ثم الصقه هنا."
        : "Instagram sent the comments without usernames because the token cannot read comments. Make a new token in Meta with instagram_business_manage_comments ticked, then paste it here.";
    case "no_comments":
      return isAr
        ? "لم يُرجع انستغرام أي تعليق رغم أن البوست عليه تعليقات. هذا يحدث عادة لأن تطبيق Meta ما زال في وضع Development، فيعرض تعليقات أصحاب الأدوار على التطبيق فقط. حوّل تطبيق Boutq-IG إلى وضع Live من لوحة Meta ثم أنشئ رمزاً جديداً وأعد السحب."
        : "Instagram returned no comments although the post has some. This usually means the Meta app is still in Development mode, which only shows comments from people with a role on the app. Switch Boutq-IG to Live in Meta, make a new token, then pull again.";
    case "network":
      return isAr
        ? "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى."
        : "Could not connect. Check your internet and try again.";
    default:
      return isAr
        ? `حدث خطأ. حاول مرة أخرى.${more}`
        : `Something went wrong. Please try again.${more}`;
  }
}

const REJECT_LABELS: Record<RejectReason, { en: string; ar: string }> = {
  excluded: { en: "Excluded accounts", ar: "حسابات مستبعدة" },
  outside_window: { en: "Outside the time window", ar: "خارج الفترة الزمنية" },
  missing_text: { en: "Missing the required word", ar: "بدون الكلمة المطلوبة" },
  few_mentions: { en: "Too few friends mentioned", ar: "منشن أقل من المطلوب" },
  duplicate: { en: "Extra comments from the same account", ar: "تعليقات مكررة من نفس الحساب" },
};

export function rejectLabel(reason: RejectReason, isAr: boolean): string {
  return isAr ? REJECT_LABELS[reason].ar : REJECT_LABELS[reason].en;
}

/** An ISO time as the value of a datetime-local input (the browser's own time zone). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The ISO time for a datetime-local input's value, or null when it is empty or unreadable. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** What the screen says when Instagram sends the browser back with a failed connection. */
export function instagramOAuthMessage(code: string, isAr: boolean): string {
  switch (code) {
    case "denied":
      return isAr
        ? "لم تتم الموافقة على الوصول في انستغرام، فلم يتم الربط."
        : "Access was not approved on Instagram, so nothing was connected.";
    case "invalid_state":
    case "missing_code":
      return isAr
        ? "انتهت صلاحية رابط الربط أو لم يكتمل. اضغط «ربط انستغرام» وحاول مرة أخرى."
        : "The connection link expired or was incomplete. Press Connect with Instagram and try again.";
    case "not_configured":
      return isAr
        ? "ربط انستغرام غير مفعّل على الخادم: ينقص INSTAGRAM_APP_ID أو INSTAGRAM_APP_SECRET."
        : "Instagram is not set up on the server: INSTAGRAM_APP_ID or INSTAGRAM_APP_SECRET is missing.";
    case "missing_comments_permission":
      return isAr
        ? "تم الاتصال بانستغرام لكن لم تُمنح صلاحية إدارة التعليقات. أعد الربط ووافق على صلاحية التعليقات."
        : "Instagram connected, but the comment-management permission was not granted. Reconnect and approve comment access.";
    case "exchange_failed":
    case "long_lived_failed":
    case "profile_failed":
      return isAr
        ? "رفض انستغرام إكمال الربط. حاول مرة أخرى، وإن تكرر الأمر تحقق من إعدادات تطبيق Meta."
        : "Instagram refused to complete the connection. Try again, and if it repeats check the Meta app settings.";
    case "save_failed":
      return isAr
        ? "نجح الربط لكن تعذر حفظ الرمز. حاول مرة أخرى."
        : "The connection worked but the token could not be saved. Try again.";
    case "unauthorized":
    case "forbidden":
      return isAr
        ? "ليس لديك صلاحية ربط انستغرام لهذا المتجر."
        : "You do not have permission to connect Instagram for this store.";
    default:
      return isAr
        ? "تعذر ربط انستغرام. حاول مرة أخرى."
        : "Instagram could not be connected. Please try again.";
  }
}
