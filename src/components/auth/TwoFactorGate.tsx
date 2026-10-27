import { useEffect, useId, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RoutePendingSkeleton } from "@/components/os/route-pending-skeleton";
import { signOut } from "@/lib/auth/session";
import { giveSignInCode, isCode, twoFactorStatus } from "@/lib/auth/mfa";
import { useI18n } from "@/lib/i18n";

/**
 * Before the admin opens: a member who turned two-factor on gives the code from their app, after
 * signing in with a password or a passkey (and again for a session that has not given it). Until
 * then the database grants the session nothing (migration 20261027150000), so the admin is not
 * shown. A member without two-factor never sees this.
 */
export function TwoFactorGate({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const id = useId();
  const [needsCode, setNeedsCode] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    twoFactorStatus()
      .then((status) => live && setNeedsCode(status.needsCode))
      // A failed check never locks a member out of what the database would still refuse.
      .catch(() => live && setNeedsCode(false));
    return () => {
      live = false;
    };
  }, []);

  if (needsCode === null) return <RoutePendingSkeleton />;
  if (!needsCode) return <>{children}</>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isCode(code)) {
      setError(isAr ? "اكتب الرمز المكوّن من 6 أرقام." : "Type the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await giveSignInCode(code);
      // Everything read before the code was refused: read it again.
      await qc.invalidateQueries();
      setNeedsCode(false);
    } catch {
      setError(
        isAr
          ? "الرمز غير صحيح أو انتهت صلاحيته. جرّب الرمز الجديد."
          : "That code is wrong or expired. Try the current one.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="grid min-h-dvh place-items-center bg-background p-4"
      dir={isAr ? "rtl" : "ltr"}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold">
            {isAr ? "التحقق بخطوتين" : "Two-factor sign-in"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr
              ? "اكتب الرمز الذي يظهر في تطبيق المصادقة."
              : "Type the code your authenticator app shows."}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-code`}>{isAr ? "الرمز" : "Code"}</Label>
          <Input
            id={`${id}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            dir="ltr"
            className="text-center font-mono text-lg tracking-[0.3em]"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {isAr ? "تحقق" : "Verify"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={async () => {
            await signOut();
            window.location.assign("/auth");
          }}
        >
          {isAr ? "تسجيل الخروج" : "Sign out"}
        </Button>
      </form>
    </main>
  );
}
