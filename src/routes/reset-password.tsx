import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, KeyRound, AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

type LinkStatus = "verifying" | "valid" | "invalid" | "success";

function ResetPasswordPage() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<LinkStatus>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isRtl = lang === "ar";
  const BackArrow = isRtl ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let isMounted = true;

    // 1. Listen for Supabase Auth state changes (PASSWORD_RECOVERY or SIGNED_IN)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (
        event === "PASSWORD_RECOVERY" ||
        (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED"))
      ) {
        setStatus("valid");
      }
    });

    const initRecovery = async () => {
      try {
        if (typeof window === "undefined") return;

        const url = new URL(window.location.href);
        const searchParams = url.searchParams;
        const hashParams = new URLSearchParams(
          url.hash.startsWith("#") ? url.hash.slice(1) : url.hash,
        );

        // 2. Check for explicit error parameters passed by Supabase Auth server
        const error =
          searchParams.get("error") ||
          hashParams.get("error") ||
          searchParams.get("error_code") ||
          hashParams.get("error_code");
        const errorDescription =
          searchParams.get("error_description") || hashParams.get("error_description");

        if (error) {
          if (isMounted) {
            setStatus("invalid");
            setErrorMessage(
              errorDescription
                ? decodeURIComponent(errorDescription.replace(/\+/g, " "))
                : t("auth.invalidRecoveryLink"),
            );
          }
          return;
        }

        // 3. Handle Modern PKCE Flow (?code=...)
        const code = searchParams.get("code") || hashParams.get("code");
        if (code) {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) {
            console.error("PKCE Code exchange failed:", exchangeErr);
            if (isMounted) {
              setStatus("invalid");
              setErrorMessage(exchangeErr.message || t("auth.invalidRecoveryLink"));
            }
            return;
          }
          if (isMounted && data.session) {
            setStatus("valid");
            return;
          }
        }

        // 4. Handle OTP Token Hash Flow (?token_hash=...&type=recovery)
        const tokenHash = searchParams.get("token_hash") || hashParams.get("token_hash");
        const type = searchParams.get("type") || hashParams.get("type");
        if (tokenHash) {
          const otpType = (type === "recovery" ? "recovery" : "email") as any;
          const { data, error: otpErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (otpErr) {
            console.error("Token verification failed:", otpErr);
            if (isMounted) {
              setStatus("invalid");
              setErrorMessage(otpErr.message || t("auth.invalidRecoveryLink"));
            }
            return;
          }
          if (isMounted && data.session) {
            setStatus("valid");
            return;
          }
        }

        // 5. Handle Implicit Hash Fragments (#access_token=...&refresh_token=...)
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken) {
          const { data, error: sessionErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          });
          if (sessionErr) {
            console.error("Set session error:", sessionErr);
            if (isMounted) {
              setStatus("invalid");
              setErrorMessage(sessionErr.message || t("auth.invalidRecoveryLink"));
            }
            return;
          }
          if (isMounted && data.session) {
            setStatus("valid");
            return;
          }
        }

        // 6. Check if session already exists
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session) {
          if (isMounted) {
            setStatus("valid");
          }
          return;
        }

        // 7. Fallback timeout if no authentication mechanism resolved
        setTimeout(() => {
          if (isMounted) {
            setStatus((prev) => (prev === "verifying" ? "invalid" : prev));
          }
        }, 1500);
      } catch (err: any) {
        console.error("Recovery link initialization error:", err);
        if (isMounted) {
          setStatus("invalid");
          setErrorMessage(err?.message ?? t("auth.invalidRecoveryLink"));
        }
      }
    };

    void initRecovery();

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwordsDontMatch"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      await supabase.auth.signOut();
      setStatus("success");
      toast.success(t("auth.passwordUpdated"));
      setTimeout(() => {
        navigate({ to: "/auth" });
      }, 1500);
    } catch (err: any) {
      toast.error(err.message ?? t("auth.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen flex items-center justify-center bg-background px-4 py-8 relative selection:bg-primary selection:text-primary-foreground"
    >
      {/* Background glow ambiance */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs mb-1">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">{t("app.title")}</h1>
        </div>

        <Card className="p-6 sm:p-8 backdrop-blur-md bg-card/90 border border-border shadow-xl rounded-2xl">
          {status === "verifying" && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <div className="space-y-1">
                <h3 className="font-semibold text-base text-foreground">
                  {lang === "ar" ? "جاري التحقق من الرابط..." : "Verifying recovery link..."}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "يرجى الانتظار بينما نتأكد من صحة جلسة الاستعادة."
                    : "Please wait while we validate your recovery session."}
                </p>
              </div>
            </div>
          )}

          {status === "invalid" && (
            <div className="py-4 text-center space-y-5">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center border border-destructive/20">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold font-display text-foreground">
                  {lang === "ar" ? "رابط الاستعادة غير صالح" : "Recovery Link Expired or Invalid"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {errorMessage || t("auth.invalidRecoveryLink")}
                </p>
              </div>

              <div className="pt-2 space-y-3">
                <Button
                  asChild
                  className="w-full h-11 font-semibold rounded-lg shadow-sm"
                >
                  <Link to="/forgot-password">
                    {lang === "ar" ? "طلب رابط استعادة جديد" : "Request New Reset Link"}
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="ghost"
                  className="w-full h-10 text-xs font-semibold rounded-lg"
                >
                  <Link to="/auth" className="flex items-center justify-center gap-2">
                    <BackArrow className="h-3.5 w-3.5" />
                    <span>{t("auth.backToSignIn")}</span>
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="py-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-bold font-display text-foreground">
                  {lang === "ar" ? "تم تحديث كلمة المرور!" : "Password Updated!"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("auth.passwordUpdated")}
                </p>
              </div>
            </div>
          )}

          {status === "valid" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold font-display text-foreground">
                  {t("auth.resetTitle")}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {t("auth.resetSubtitle")}
                </p>
              </div>

              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t("auth.newPassword")}</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    autoComplete="new-password"
                    className="h-11 rounded-lg"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">{t("auth.confirmPassword")}</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    minLength={8}
                    value={confirm}
                    autoComplete="new-password"
                    className="h-11 rounded-lg"
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 font-semibold rounded-lg shadow-sm"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.pleaseWait")}
                    </span>
                  ) : (
                    t("auth.updatePassword")
                  )}
                </Button>
              </form>

              <div className="pt-2 text-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
                >
                  <BackArrow className="h-3 w-3" />
                  <span>{t("auth.backToSignIn")}</span>
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
