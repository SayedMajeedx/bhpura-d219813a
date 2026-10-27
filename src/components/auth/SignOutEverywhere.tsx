import { useId, useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { signOutEverywhere } from "@/lib/auth/session";
import { useI18n } from "@/lib/i18n";

/**
 * In the account settings: end every session this person has, on every device (a lost phone, a
 * shared computer). A normal sign-out ends this browser's only (`signOut`).
 */
export function SignOutEverywhere() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const id = useId();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const ok = await confirmDialog({
      title: isAr ? "تسجيل الخروج من كل الأجهزة؟" : "Sign out of every device?",
      description: isAr
        ? "ستحتاج لتسجيل الدخول من جديد على كل جهاز، ومنها هذا الجهاز."
        : "You will need to sign in again on every device, this one included.",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await signOutEverywhere();
      await navigate({ to: "/auth" });
    } catch {
      toast.error(isAr ? "تعذّر تسجيل الخروج من كل الأجهزة" : "Could not sign out everywhere");
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby={`${id}-t`}>
      <div className="flex items-start gap-2">
        <LogOut className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-sm font-semibold">
            {isAr ? "الأجهزة المسجّل دخولها" : "Signed-in devices"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "تسجيل الخروج العادي ينهي هذا الجهاز فقط. لجهاز مفقود أو مشترك، أنهِ كل الجلسات."
              : "Signing out ends this device only. For a lost or shared device, end every session."}
          </p>
        </div>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={run}>
        {isAr ? "تسجيل الخروج من كل الأجهزة" : "Sign out of all devices"}
      </Button>
    </section>
  );
}
