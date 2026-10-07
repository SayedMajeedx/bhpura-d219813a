import { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile-context";
import { getAccessToken } from "@/lib/auth/session";
import { sendEmailCode, verifyEmailCode } from "@/lib/auth/sign-in";
import { claimsOfAccessToken, emailProofIsFresh } from "@/lib/owner-email";
import { confirmOwnerEmail } from "@/lib/owner-verification.functions";

/**
 * Shown to an account that has not proved it owns its email (the instant trial's owner): it can run
 * the trial, but paying for a plan and inviting staff wait for this. They ask for a code, type it,
 * and the server marks the account verified. A link clicked from the same email also works: it
 * arrives as a fresh session and is confirmed without typing anything.
 */
export function OwnerEmailVerificationBanner() {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const { profile, refreshProfile } = useProfile();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const email = profile?.email ?? "";
  const unverified = profile?.email_verified_at === null;
  const triedLink = useRef(false);

  const finish = useCallback(async () => {
    await confirmOwnerEmail();
    await refreshProfile();
    toast.success(isAr ? "تم تأكيد بريدك الإلكتروني." : "Your email is verified.");
  }, [isAr, refreshProfile]);

  useEffect(() => {
    if (!unverified || triedLink.current) return;
    triedLink.current = true;
    void getAccessToken().then((token) => {
      if (emailProofIsFresh(claimsOfAccessToken(token))) void finish().catch(() => undefined);
    });
  }, [unverified, finish]);

  if (!unverified) return null;

  const send = async () => {
    setBusy(true);
    const { error } = await sendEmailCode(email);
    setBusy(false);
    if (error) {
      toast.error(
        isAr ? "تعذّر إرسال الرمز. حاول بعد قليل." : "Could not send the code. Try again shortly.",
      );
      return;
    }
    setSent(true);
    toast.success(isAr ? "أرسلنا رمزاً إلى بريدك." : "We emailed you a code.");
  };

  const verify = async () => {
    setBusy(true);
    try {
      const { error } = await verifyEmailCode(email, code.trim());
      if (error) throw error;
      await finish();
    } catch {
      toast.error(isAr ? "الرمز غير صحيح أو انتهت مدته." : "That code is wrong or has expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      className="no-print flex shrink-0 flex-col gap-2 border-b border-amber-300/50 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-center gap-2 font-medium">
        <MailCheck className="h-4 w-4 shrink-0" />
        {isAr
          ? `أكّد بريدك الإلكتروني (${email}) لتتمكن من الاشتراك في باقة ودعوة فريقك.`
          : `Verify your email (${email}) to pay for a plan and invite your team.`}
      </span>
      <span className="flex items-center gap-2">
        {sent ? (
          <>
            <Input
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))}
              placeholder={isAr ? "الرمز" : "Code"}
              aria-label={isAr ? "رمز التأكيد" : "Verification code"}
              className="h-8 w-28 bg-white text-center text-xs"
            />
            <Button size="sm" className="h-8" disabled={busy || code.length < 6} onClick={verify}>
              {isAr ? "تأكيد" : "Verify"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={send}>
              {isAr ? "إعادة الإرسال" : "Resend"}
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-8" disabled={busy || !email} onClick={send}>
            {isAr ? "أرسل الرمز" : "Send code"}
          </Button>
        )}
      </span>
    </div>
  );
}
