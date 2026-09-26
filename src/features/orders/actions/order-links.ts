import { toast } from "sonner";
import { getCurrentSession } from "@/lib/auth/session";

export async function authenticatedJsonHeaders() {
  const session = await getCurrentSession();

  if (!session?.access_token) throw new Error("Your session has expired. Please sign in again.");

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function copyInvoiceLink(id: string, t: (k: string) => string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/invoice/${id}`;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success(t("orders.linkCopied"));
  } catch {
    toast.error(t("orders.linkFailed"));
  }
}
