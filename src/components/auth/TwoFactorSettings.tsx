import { useEffect, useId, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmTwoFactor,
  isCode,
  startTwoFactorSetup,
  turnOffTwoFactor,
  twoFactorStatus,
  type TwoFactorSetup,
} from "@/lib/auth/mfa";
import { useI18n } from "@/lib/i18n";

/**
 * In the account settings: turn two-factor sign-in on (scan the QR code with an authenticator app,
 * then type its first code) or off. Optional, each member for themselves (the owner's decision of
 * 2026-10-27); passkeys work as before, with the code asked after them too.
 */
export function TwoFactorSettings() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const id = useId();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    twoFactorStatus()
      .then((status) => setFactorId(status.factorId))
      .catch(() => setFactorId(null));
  useEffect(() => {
    void load();
  }, []);

  const fail = () =>
    toast.error(isAr ? "تعذر الإكمال. حاول مرة أخرى." : "Could not finish. Please try again.");

  return (
    <section
      className="space-y-3 rounded-xl border border-border p-4"
      aria-labelledby={`${id}-title`}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            {isAr ? "التحقق بخطوتين" : "Two-factor sign-in"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "بعد كلمة المرور أو البصمة، رمز من تطبيق مصادقة على هاتفك (مثل Google Authenticator)."
              : "After your password or passkey, a code from an authenticator app on your phone (such as Google Authenticator)."}
          </p>
        </div>
      </div>

      {factorId === undefined ? null : factorId ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-success">
            {isAr ? "مفعّل لهذا الحساب" : "On for this account"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={async () => {
              const ok = await confirmDialog({
                title: isAr ? "إيقاف التحقق بخطوتين؟" : "Turn two-factor sign-in off?",
                description: isAr
                  ? "يكفي بعدها كلمة المرور أو البصمة لدخول حسابك."
                  : "Your password or passkey alone will then open your account.",
                destructive: true,
                confirmLabel: isAr ? "إيقاف" : "Turn off",
              });
              if (!ok) return;
              setBusy(true);
              try {
                await turnOffTwoFactor(factorId);
                toast.success(isAr ? "أُوقف التحقق بخطوتين." : "Two-factor sign-in is off.");
                await load();
              } catch {
                fail();
              } finally {
                setBusy(false);
              }
            }}
          >
            {isAr ? "إيقاف" : "Turn off"}
          </Button>
        </div>
      ) : setup ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!isCode(code)) {
              toast.error(isAr ? "اكتب الرمز المكوّن من 6 أرقام." : "Type the 6-digit code.");
              return;
            }
            setBusy(true);
            try {
              await confirmTwoFactor(setup.factorId, code);
              setSetup(null);
              setCode("");
              toast.success(isAr ? "فُعّل التحقق بخطوتين." : "Two-factor sign-in is on.");
              await load();
            } catch {
              toast.error(
                isAr
                  ? "الرمز غير صحيح. جرّب الرمز الحالي."
                  : "That code is wrong. Try the current one.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <ol className="list-decimal space-y-1 ps-5 text-xs text-muted-foreground">
            <li>
              {isAr ? "امسح الرمز بتطبيق المصادقة." : "Scan the code with your authenticator app."}
            </li>
            <li>
              {isAr ? "أو اكتب هذا المفتاح في التطبيق:" : "Or type this key into the app:"}{" "}
              <code dir="ltr" className="break-all font-mono text-foreground">
                {setup.secret}
              </code>
            </li>
            <li>{isAr ? "اكتب الرمز الذي يظهر في التطبيق." : "Type the code the app shows."}</li>
          </ol>
          <img
            src={setup.qrCode}
            alt={isAr ? "رمز QR لتطبيق المصادقة" : "QR code for the authenticator app"}
            className="h-40 w-40 rounded-lg border border-border bg-white p-2"
          />
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-code`} className="text-xs">
                {isAr ? "الرمز" : "Code"}
              </Label>
              <Input
                id={`${id}-code`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                dir="ltr"
                className="w-36 text-center font-mono tracking-[0.2em]"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {isAr ? "تفعيل" : "Turn on"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
              {isAr ? "إلغاء" : "Cancel"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setSetup(await startTwoFactorSetup());
            } catch {
              fail();
            } finally {
              setBusy(false);
            }
          }}
        >
          {isAr ? "تفعيل التحقق بخطوتين" : "Turn on two-factor sign-in"}
        </Button>
      )}
    </section>
  );
}
