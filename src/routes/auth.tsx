import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ArrowLeft, ArrowRight, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { SignInBrandPanel } from "@/features/auth/components/SignInBrandPanel";
import { EmailField, LanguageSwitch, PasswordField } from "@/features/auth/components/SignInFields";
import { applyRememberMe } from "@/lib/session-persistence";
import { translateAuthError } from "@/lib/auth-errors";
import { fetchCallerProfile } from "@/lib/data/profiles";
import { getCurrentUser, signOut } from "@/lib/auth/session";
import { signInWithPasskey as signInWithPasskeyAuth, signInWithPassword } from "@/lib/auth/sign-in";
import { continueToStorefrontWhenSignedIn } from "@/lib/auth/storefront-return";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setPasskeySupported(
      window.isSecureContext && typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  // A shopper returning from Google sign-in goes back to their store.
  useEffect(() => continueToStorefrontWhenSignedIn((path) => window.location.replace(path)), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signInWithPassword(email, password);
      if (error) throw error;
      const user = await getCurrentUser();
      const profile = await fetchCallerProfile(user!.id);
      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
        await signOut();
        throw new Error(
          lang === "ar"
            ? "هذا حساب عميل متجر وليس حساب لوحة تحكم."
            : "This is a storefront customer account, not a dashboard account.",
        );
      }
      applyRememberMe(remember);
      await new Promise((r) => setTimeout(r, 100));

      const requiresPasswordChange =
        Boolean(profile?.must_change_password) ||
        Boolean(user?.user_metadata?.must_change_password);

      if (requiresPasswordChange) {
        navigate({ to: "/first-login" });
      } else {
        navigate({ to: "/admin" });
      }
    } catch (err: any) {
      toast.error(translateAuthError(err, lang as any));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data, error } = await signInWithPasskeyAuth();
      if (error) throw error;
      if (!data.user) throw new Error("Passkey sign-in did not return a user.");
      // A failed read comes back as no profile, which the check below rejects.
      const profile = await fetchCallerProfile(data.user.id);
      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
        await signOut();
        throw new Error(
          lang === "ar"
            ? "هذا الحساب غير مخوّل لدخول لوحة التحكم."
            : "This account is not authorized for dashboard access.",
        );
      }
      applyRememberMe(true);
      const requiresPasswordChange =
        Boolean(profile?.must_change_password) ||
        Boolean(data.user?.user_metadata?.must_change_password);

      if (requiresPasswordChange) {
        await navigate({ to: "/first-login" });
      } else {
        await navigate({ to: "/admin" });
      }
    } catch (err: any) {
      const cancelled =
        err?.name === "NotAllowedError" || /cancel|not allowed/i.test(err?.message ?? "");
      toast.error(
        cancelled
          ? lang === "ar"
            ? "تم إلغاء تسجيل الدخول بالبصمة."
            : "Biometric sign-in was cancelled."
          : translateAuthError(err, lang as any),
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  const isAr = lang === "ar";
  const rise = (ms: number) => ({ "--auth-delay": `${ms}ms` }) as React.CSSProperties;

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="grid min-h-dvh w-full bg-background text-foreground lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      {/* Brand side (the maroon canvas): wide screens only. */}
      <aside className="hidden lg:block" aria-hidden="true">
        <div className="sticky top-0 h-dvh">
          <SignInBrandPanel lang={isAr ? "ar" : "en"} title={t("app.title")} />
        </div>
      </aside>

      <main className="relative flex min-h-dvh flex-col overflow-hidden px-5 py-5 sm:px-10 sm:py-8">
        <header className="relative flex items-center justify-between gap-4">
          <Link
            to="/"
            className="group inline-flex min-h-11 items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ArrowLeft
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5"
              aria-hidden="true"
            />
            {isAr ? "العودة للرئيسية" : "Back home"}
          </Link>
          <LanguageSwitch lang={isAr ? "ar" : "en"} onChange={setLang} />
        </header>

        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">
            <div className="mb-8 lg:hidden">
              <SignInBrandPanel lang={isAr ? "ar" : "en"} title={t("app.title")} compact />
            </div>

            <div className="auth-rise space-y-3" style={rise(120)}>
              <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <span className="auth-live-dot h-1.5 w-1.5 rounded-full bg-primary" />
                {isAr ? "بوابة شركاء بوتيك" : "Boutq OS · Partner portal"}
              </p>
              <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
                {t("auth.welcomeBack")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? "سجّل الدخول لمتابعة الطلبات والمخزون والتوصيل."
                  : "Sign in to pick up your orders, stock and deliveries."}
              </p>
            </div>

            <form onSubmit={submit} className="mt-8 space-y-5">
              <div className="auth-rise" style={rise(220)}>
                <EmailField label={t("auth.email")} value={email} onChange={setEmail} />
              </div>

              <div className="auth-rise" style={rise(300)}>
                <PasswordField
                  label={t("auth.password")}
                  value={password}
                  onChange={setPassword}
                  isAr={isAr}
                  action={
                    <Link
                      to="/forgot-password"
                      className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t("auth.forgotPassword")}
                    </Link>
                  }
                />
              </div>

              <label
                className="auth-rise flex w-fit cursor-pointer items-center gap-2.5 text-sm text-muted-foreground"
                style={rise(360)}
              >
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                <span>{t("auth.rememberMe")}</span>
              </label>

              <div className="auth-rise" style={rise(420)}>
                <Button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="auth-sheen group h-12 w-full text-base font-semibold shadow-lg shadow-primary/20"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      {t("common.pleaseWait")}
                    </>
                  ) : (
                    <>
                      {t("auth.signIn")}
                      <ArrowRight
                        className="transition-transform duration-300 group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </Button>
              </div>
            </form>

            {passkeySupported && (
              <div className="auth-rise mt-6 space-y-4" style={rise(500)}>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span>{isAr ? "أو" : "or"}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="group h-12 w-full gap-2.5 text-base font-medium"
                  disabled={passkeyLoading || loading}
                  aria-busy={passkeyLoading}
                  onClick={() => void signInWithPasskey()}
                >
                  {passkeyLoading ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Fingerprint
                      className="text-primary transition-transform duration-300 group-hover:scale-110"
                      aria-hidden="true"
                    />
                  )}
                  {passkeyLoading
                    ? t("common.pleaseWait")
                    : isAr
                      ? "تسجيل الدخول بالبصمة"
                      : "Sign in with a passkey"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  {isAr
                    ? "استخدم Face ID أو Touch ID أو مفتاح أمان مسجّل."
                    : "Use a registered Face ID, Touch ID, device PIN, or security key."}
                </p>
              </div>
            )}
          </div>
        </div>

        <footer
          className="auth-rise relative mx-auto flex w-full max-w-[26rem] items-start gap-2.5 text-xs leading-relaxed text-muted-foreground"
          style={rise(600)}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <p>
            {isAr
              ? "يقتصر الدخول على الشركاء المعتمدين ومندوبي التوصيل، ببيانات الاعتماد الصادرة عن إدارة البوتيك."
              : "For authorised partners and couriers only, with the credentials issued by your boutique administrator."}
          </p>
        </footer>
      </main>
    </div>
  );
}
