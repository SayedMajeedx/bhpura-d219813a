import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFriendlyErrorMessage(err: unknown): string {
  if (!err) return "";
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // An account that has not verified its email cannot pay or invite (src/lib/owner-email.ts).
  if (text.includes("OWNER_EMAIL_NOT_VERIFIED")) {
    return "Verify your email first (the banner at the top of the page), then try again. | أكّد بريدك الإلكتروني أولاً (اللافتة أعلى الصفحة) ثم أعد المحاولة.";
  }
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  return String(err);
}
