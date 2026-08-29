import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { Loader2, LogIn, MailCheck, User, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/$slug/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: StorefrontAuth,
});

export function safeStorefrontRedirect(redirect: string | undefined, slug: string) {
  if (!redirect) return undefined;
  const expectedPrefix = `/${slug}`;
  if (
    redirect.includes("\\") ||
    redirect.startsWith("//") ||
    !redirect.startsWith(expectedPrefix) ||
    (redirect.length > expectedPrefix.length && redirect[expectedPrefix.length] !== "/") ||
    redirect.includes("/auth")
  ) {
    return undefined;
  }
  return redirect;
}

function StorefrontAuth() {
  const { brand, settings, t, lang, session, isStoreMember, membershipLoading, refreshMembership } =
    useStorefront();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const performRedirect = () => {
    const safeRedirect = safeStorefrontRedirect(redirect, brand.slug);
    if (safeRedirect) {
      void navigate({ to: safeRedirect as any });
    } else {
      navigate({ to: "/$slug", params: { slug: brand.slug } });
    }
  };

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [working, setWorking] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" &&
        window.isSecureContext &&
        typeof window.PublicKeyCredential !== "undefined",
    );
  }, []);

  const signInWithGoogle = async () => {
    setWorking(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL(
          `/${encodeURIComponent(brand.slug)}/auth-confirmed`,
          window.location.origin,
        ).toString(),
      },
    });
    if (error) {
      setWorking(false);
      toast.error(translateAuthError(error, lang));
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.user) throw new Error("Passkey sign-in did not return a user.");

      const { data: member, error: membershipError } = await supabase.rpc(
        "has_storefront_membership",
        { p_brand_slug: brand.slug },
      );
      if (membershipError || member !== true) {
        await supabase.auth.signOut();
        setTab("signup");
        toast.error(
          t(
            "لا يوجد حساب مسجل بهذه البصمة، يرجى اختيار «إنشاء حساب» للتسجيل.",
            "No account found with this passkey. Please choose «Create account» to register.",
          ),
          { duration: 7000 },
        );
        return;
      }
      await refreshMembership();
      toast.success(t("مرحباً بعودتك!", "Welcome back!"));
      performRedirect();
    } catch (err: any) {
      const cancelled =
        err?.name === "NotAllowedError" || /cancel|not allowed/i.test(err?.message ?? "");
      toast.error(
        cancelled
          ? t("تم إلغاء تسجيل الدخول بالبصمة.", "Biometric sign-in was cancelled.")
          : translateAuthError(err, lang),
      );
    } finally {
      setPasskeyLoading(false);
    }
  };

  useEffect(() => {
    if (membershipLoading || !session) return;
    if (isStoreMember) {
      const safeRedirect = safeStorefrontRedirect(redirect, brand.slug);
      if (safeRedirect) {
        void navigate({ to: safeRedirect as any, replace: true });
      } else {
        navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
      }
    } else {
      setTab("signup");
      setForm((current) => ({ ...current, email: session.user.email ?? current.email }));
    }
  }, [brand.slug, isStoreMember, membershipLoading, navigate, session, redirect]);

  const activateMembership = async (): Promise<boolean> => {
    const { error } = await supabase.rpc("activate_storefront_membership", {
      p_brand_slug: brand.slug,
      p_name: form.name.trim() || undefined,
      p_phone: form.phone.trim() || undefined,
    });
    if (error) {
      console.error("Membership activation failed", error);
      toast.error(
        t(
          "تعذر تفعيل الحساب، يرجى المحاولة مرة أخرى.",
          "Could not activate your account. Please try again.",
        ),
      );
      return false;
    }
    await refreshMembership();
    return true;
  };

  const signIn = async () => {
    if (!form.email || !form.password)
      return toast.error(t("البريد الإلكتروني وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (error) {
      setWorking(false);
      return toast.error(translateAuthError(error, lang));
    }

    const { data: member, error: membershipError } = await supabase.rpc(
      "has_storefront_membership",
      { p_brand_slug: brand.slug },
    );
    if (membershipError || member !== true) {
      await supabase.auth.signOut();
      setWorking(false);
      setTab("signup");
      toast.error(
        t(
          "لا يوجد حساب مسجل بهذا البريد، يمكنك إنشاء حسابك الجديد الآن.",
          "No account found with this email. You can create your account now.",
        ),
        { duration: 7000 },
      );
      return;
    }
    await refreshMembership();
    setWorking(false);
    toast.success(t("مرحباً بعودتك!", "Welcome back!"));
    performRedirect();
  };

  const signUp = async () => {
    if (!form.email || (!session && !form.password))
      return toast.error(t("البريد الإلكتروني وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);

    if (session?.user) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم تفعيل حسابك بنجاح!", "Your account has been activated!"));
      performRedirect();
      return;
    }

    const existingLogin = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.password,
    });
    if (!existingLogin.error && existingLogin.data.session) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم تفعيل حسابك بنجاح!", "Your account has been activated!"));
      performRedirect();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: {
          name: form.name.trim() || undefined,
          phone: form.phone.trim() || undefined,
          storefront_slug: brand.slug,
        },
        emailRedirectTo: new URL(
          `/${encodeURIComponent(brand.slug)}/auth-confirmed`,
          window.location.origin,
        ).toString(),
      },
    });
    if (error) {
      setWorking(false);
      return toast.error(translateAuthError(error, lang));
    }
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setWorking(false);
      toast.error(
        t(
          "البريد مسجل مسبقاً، أدخل كلمة المرور لتسجيل الدخول.",
          "This email is already registered. Please enter your password to sign in.",
        ),
        { duration: 8000 },
      );
      return;
    }
    if (!data.session) {
      setWorking(false);
      setPendingVerification(form.email.trim());
      toast.success(t("تحقق من بريدك الإلكتروني لتأكيد الحساب.", "Check your email to verify your account."), {
        duration: 8000,
      });
      return;
    }
    const activated = await activateMembership();
    setWorking(false);
    if (!activated) return;
    toast.success(t("تم إنشاء حسابك بنجاح!", "Account created successfully!"));
    performRedirect();
  };

  if (session && membershipLoading)
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const storeName = (lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar) || "";

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="min-h-[75vh] w-full flex flex-col items-center justify-center px-4 py-8 sm:py-12 relative"
    >
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.02] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md relative z-10">
        <Card className="space-y-6 p-6 sm:p-8 bg-card border-border shadow-xl rounded-2xl sm:rounded-3xl text-card-foreground">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs transition-transform hover:scale-105">
              <User className="h-7 w-7" />
            </div>
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {t("مرحباً بك في", "Welcome to")}{" "}
                <span className="text-primary">{storeName}</span>
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {t(
                  "سجّل دخولك لمتابعة طلباتك، حفظ عناوينك، وتجربة تسوق أسرع وأسهل.",
                  "Sign in to track your orders, manage your addresses, and enjoy seamless shopping.",
                )}
              </p>
            </div>
          </div>

          {/* Email Verification Alert */}
          {pendingVerification && (
            <div
              className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-foreground shadow-xs"
              role="status"
            >
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="space-y-1 text-sm">
                <div className="font-semibold text-primary">
                  {t("تحقق من بريدك الإلكتروني", "Check your email")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("أرسلنا رابط التحقق إلى", "We sent a verification link to")}{" "}
                  <b className="text-foreground">{pendingVerification}</b>.
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-semibold text-primary hover:underline"
                  onClick={() => {
                    setPendingVerification(null);
                    setTab("signin");
                  }}
                >
                  {t("الذهاب لتسجيل الدخول", "Go to sign in")}
                </Button>
              </div>
            </div>
          )}

          {/* Fast SSO / Biometrics */}
          <div className="space-y-2.5">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-3 font-medium text-foreground border-border hover:bg-muted/60 active:scale-[0.99] rounded-xl transition-all shadow-xs"
              onClick={signInWithGoogle}
              disabled={working || passkeyLoading}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{t("المتابعة باستخدام Google", "Continue with Google")}</span>
            </Button>

            {passkeySupported && (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 font-medium text-foreground border-border hover:bg-muted/60 active:scale-[0.99] rounded-xl transition-all shadow-xs"
                onClick={() => void signInWithPasskey()}
                disabled={working || passkeyLoading}
              >
                {passkeyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <Fingerprint className="h-4 w-4 text-primary shrink-0" />
                )}
                <span>{t("تسجيل الدخول بالبصمة / Face ID", "Sign in with Face ID / Passkey")}</span>
              </Button>
            )}
          </div>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-border"></div>
            <span className="flex-shrink mx-3 text-xs uppercase tracking-wider text-muted-foreground font-medium">
              {t("أو عبر البريد الإلكتروني", "OR WITH EMAIL")}
            </span>
            <div className="flex-grow border-t border-border"></div>
          </div>

          {/* Tabs for Sign In vs Sign Up */}
          <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
            <TabsList className="grid h-11 w-full grid-cols-2 p-1 bg-muted rounded-xl">
              <TabsTrigger
                className="h-9 text-xs sm:text-sm font-semibold rounded-lg transition-all"
                value="signin"
              >
                {t("تسجيل الدخول", "Sign in")}
              </TabsTrigger>
              <TabsTrigger
                className="h-9 text-xs sm:text-sm font-semibold rounded-lg transition-all"
                value="signup"
              >
                {t("إنشاء حساب جديد", "Create account")}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="signin"
              className="mt-4 space-y-3.5 animate-in fade-in-40 duration-200"
            >
              <Field
                label={t("البريد الإلكتروني", "Email")}
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(email) => setForm({ ...form, email })}
              />
              <Field
                label={t("كلمة المرور", "Password")}
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(password) => setForm({ ...form, password })}
              />
              <Button
                className="h-11 w-full font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm mt-2"
                onClick={signIn}
                disabled={working}
              >
                {working ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="me-2 h-4 w-4" />
                )}
                {t("تسجيل الدخول", "Sign in")}
              </Button>
            </TabsContent>

            <TabsContent
              value="signup"
              className="mt-4 space-y-3.5 animate-in fade-in-40 duration-200"
            >
              <Field
                label={t("الاسم الكامل", "Full name")}
                placeholder={t("مثال: سارة أحمد", "e.g. Sarah Ahmed")}
                value={form.name}
                onChange={(name) => setForm({ ...form, name })}
              />
              <Field
                label={t("رقم الهاتف", "Phone")}
                placeholder="+973 3900 0000"
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
              />
              <Field
                label={t("البريد الإلكتروني", "Email")}
                type="email"
                placeholder="name@example.com"
                value={form.email}
                disabled={Boolean(session)}
                onChange={(email) => setForm({ ...form, email })}
              />
              {!session && (
                <Field
                  label={t("كلمة المرور", "Password")}
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(password) => setForm({ ...form, password })}
                />
              )}
              <Button
                className="h-11 w-full font-semibold rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-all shadow-sm mt-2"
                onClick={signUp}
                disabled={working}
              >
                {working && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("إنشاء حساب جديد", "Create Account")}
              </Button>
            </TabsContent>
          </Tabs>

          {/* Footer guest link */}
          <div className="text-center pt-1 border-t border-border">
            <Link
              to="/$slug"
              params={{ slug: brand.slug }}
              className="inline-flex min-h-11 items-center text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              {t("المتابعة كزائر دون تسجيل", "Continue shopping as guest")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const autocomplete =
    type === "email" ? "email" : type === "password" ? "current-password" : undefined;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs sm:text-sm font-medium text-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        placeholder={placeholder}
        autoComplete={autocomplete}
        className="h-11 bg-background border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 text-foreground placeholder:text-muted-foreground/60 rounded-xl transition-all font-normal"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
