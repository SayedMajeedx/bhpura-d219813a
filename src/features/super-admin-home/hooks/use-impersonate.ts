import { toast } from "sonner";
import { startImpersonationSession } from "@/lib/impersonation.functions";

/**
 * Opens a store's admin as its support: the session is recorded in the audit log first, then the
 * store's dashboard opens with the session's cookie.
 */
export function useImpersonate(lang: "ar" | "en") {
  return async (brandId: string, slug: string) => {
    // A stale read-only session must not block a fresh, explicitly chosen one.
    document.cookie = "boutq_impersonation_token=; path=/; max-age=0; samesite=lax";
    const toastId = toast.loading(
      lang === "ar" ? "جارٍ فتح لوحة المتجر..." : "Opening the store's admin...",
    );
    try {
      const res = await startImpersonationSession({ data: { targetTenantId: brandId } });
      if (res && "token" in res && res.token) {
        const secure = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `boutq_impersonation_token=${res.token}; path=/; max-age=${60 * 60 * 24}; samesite=lax${secure}`;
      }
      toast.success(
        lang === "ar" ? "سُجّلت الجلسة في سجل التدقيق" : "Session recorded in the audit log",
        { id: toastId },
      );
      window.location.href = `/admin/b/${slug}/dashboard`;
    } catch (error) {
      console.error(error);
      toast.error(
        lang === "ar"
          ? "تعذر فتح لوحة المتجر. تحقق من سماح المتجر بوصول الدعم ثم حاول مجدداً."
          : "Unable to open the store's admin. Check the store allows support access and try again.",
        { id: toastId },
      );
    }
  };
}
