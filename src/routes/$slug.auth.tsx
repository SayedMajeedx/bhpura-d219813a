import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogIn, MailCheck, User } from "lucide-react";
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

function StorefrontAuth() {
  const { brand, settings, t, lang, session, isStoreMember, membershipLoading, refreshMembership } = useStorefront();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  const performRedirect = () => {
    if (redirect && !redirect.includes("/auth")) {
      void navigate({ to: redirect as any });
    } else {
      navigate({ to: "/$slug", params: { slug: brand.slug } });
    }
  };

  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [working, setWorking] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<string | null>(null);

  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [authenticatingPasskey, setAuthenticatingPasskey] = useState(false);

  useEffect(() => {
    if (window.PublicKeyCredential && !session) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => {
          if (available && localStorage.getItem(`passkey_registered_${brand.slug}`) === "true") {
            setPasskeyAvailable(true);
            // Ambient premium UX delay before triggering biometric check
            const timer = setTimeout(() => {
              void signInWithPasskey();
            }, 800);
            return () => clearTimeout(timer);
          }
        })
        .catch(console.error);
    }
  }, [brand.slug, session]);

  const signInWithGoogle = async () => {
    setWorking(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL(`/${encodeURIComponent(brand.slug)}/auth-confirmed`, window.location.origin).toString(),
      },
    });
    if (error) {
      setWorking(false);
      toast.error(translateAuthError(error, lang));
    }
  };

  const signInWithPasskey = async () => {
    if (authenticatingPasskey) return;
    setAuthenticatingPasskey(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname === "localhost" ? "localhost" : window.location.hostname,
          userVerification: "required",
        },
      });

      if (assertion) {
        const storedToken = localStorage.getItem(`passkey_token_${brand.slug}`);
        if (storedToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: "",
            refresh_token: storedToken,
          });

          if (error) {
            localStorage.removeItem(`passkey_token_${brand.slug}`);
            localStorage.removeItem(`passkey_registered_${brand.slug}`);
            setPasskeyAvailable(false);
            throw error;
          }

          if (data.session) {
            localStorage.setItem(`passkey_token_${brand.slug}`, data.session.refresh_token);
            toast.success(t("مرحباً بعودتك! تم تسجيل الدخول بـ Face ID.", "Welcome back! Signed in with Face ID."));
            await refreshMembership();
            performRedirect();
          }
        } else {
          throw new Error("No stored credentials");
        }
      }
    } catch (err: any) {
      console.warn("Passkey login failed or bypassed", err);
      if (err.name !== "NotAllowedError") {
        toast.error(t(
          "فشل تسجيل الدخول بـ Face ID. الرجاء المحاولة مرة أخرى أو استخدام طريقة أخرى.",
          "Face ID sign-in failed. Please try again or use another sign-in method.",
        ));
      }
    } finally {
      setAuthenticatingPasskey(false);
    }
  };

  useEffect(() => {
    if (membershipLoading || !session) return;
    if (isStoreMember) {
      if (redirect && !redirect.includes("/auth")) {
        void navigate({ to: redirect as any, replace: true });
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
      toast.error(t("تعذر إنشاء حسابك في هذا المتجر. حاول مرة أخرى.", "Could not create your account for this store. Please try again."));
      return false;
    }
    await refreshMembership();
    return true;
  };

  const signIn = async () => {
    if (!form.email || !form.password) return toast.error(t("البريد وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
    if (error) { setWorking(false); return toast.error(translateAuthError(error, lang)); }

    const { data: member, error: membershipError } = await supabase.rpc("has_storefront_membership", { p_brand_slug: brand.slug });
    if (membershipError || member !== true) {
      await supabase.auth.signOut();
      setWorking(false);
      setTab("signup");
      toast.error(t(
        "لا يوجد حساب بهذا البريد في هذا المتجر. اختر «إنشاء حساب» للتسجيل لدى هذا المتجر.",
        "This email is not registered with this store. Choose Create account to register here.",
      ), { duration: 7000 });
      return;
    }
    await refreshMembership();
    setWorking(false);
    toast.success(t("مرحباً بعودتك!", "Welcome back!"));
    performRedirect();
  };

  const signUp = async () => {
    if (!form.email || (!session && !form.password)) return toast.error(t("البريد وكلمة المرور مطلوبان", "Email and password are required"));
    setWorking(true);

    // An existing authenticated identity must still explicitly choose Create account.
    if (session?.user) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم إنشاء حسابك في هذا المتجر!", "Your account for this store is ready!"));
      performRedirect();
      return;
    }

    // Correct credentials for an existing platform identity allow that person
    // to explicitly register with this otherwise unrelated brand.
    const existingLogin = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(), password: form.password,
    });
    if (!existingLogin.error && existingLogin.data.session) {
      const activated = await activateMembership();
      setWorking(false);
      if (!activated) return;
      toast.success(t("تم إنشاء حسابك في هذا المتجر!", "Your account for this store is ready!"));
      performRedirect();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        data: { name: form.name.trim() || undefined, phone: form.phone.trim() || undefined, storefront_slug: brand.slug },
        emailRedirectTo: new URL(`/${encodeURIComponent(brand.slug)}/auth-confirmed`, window.location.origin).toString(),
      },
    });
    if (error) { setWorking(false); return toast.error(translateAuthError(error, lang)); }
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setWorking(false);
      toast.error(t(
        "هذا البريد لديه حساب Boutq بالفعل. أدخل كلمة المرور الحالية الصحيحة للتسجيل في هذا المتجر.",
        "This email already has a Boutq login. Enter its correct existing password to register with this store.",
      ), { duration: 8000 });
      return;
    }
    if (!data.session) {
      setWorking(false);
      setPendingVerification(form.email.trim());
      toast.success(t("تحقق من بريدك لتأكيد الحساب.", "Check your email to verify your account."), { duration: 8000 });
      return;
    }
    const activated = await activateMembership();
    setWorking(false);
    if (!activated) return;
    toast.success(t("تم إنشاء الحساب!", "Account created!"));
    performRedirect();
  };

  if (session && membershipLoading) return <div className="grid min-h-[45vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  return <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
    <Card className="space-y-5 p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full" style={{ backgroundColor: `${settings.primary_color}15`, color: settings.primary_color }}><User className="h-6 w-6" /></div>
        <h1 className="font-display text-2xl">{t("حسابك في", "Your account at")} {lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("كل متجر مستقل، وسجلك وطلباتك خاصة بهذا المتجر فقط.", "Each store is independent; your profile and orders remain private to this store.")}</p>
      </div>

      {pendingVerification && <div className="flex items-start gap-3 rounded-lg border-2 bg-white p-4 text-slate-900" style={{ borderColor: settings.primary_color }} role="status">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: settings.primary_color }} />
        <div className="space-y-1 text-sm"><div className="font-semibold" style={{ color: settings.primary_color }}>{t("تحقق من بريدك الإلكتروني", "Check your email")}</div>
          <p>{t("أرسلنا رابط التفعيل إلى", "We sent a verification link to")} <b>{pendingVerification}</b>.</p>
          <button type="button" className="text-xs font-medium underline" onClick={() => { setPendingVerification(null); setTab("signin"); }}>{t("الذهاب لتسجيل الدخول", "Go to sign in")}</button>
        </div>
      </div>}

      {/* Passkey Fast Biometric Sign-In Method */}
      {passkeyAvailable && (
        <div className="space-y-3">
          <Button
            type="button"
            className="h-12 w-full gap-2 text-sm font-semibold text-white shadow-sm hover:shadow active:scale-95 transition-all relative overflow-hidden animate-in fade-in slide-in-from-top duration-500"
            style={{ backgroundColor: settings.primary_color }}
            onClick={signInWithPasskey}
            disabled={authenticatingPasskey || working}
          >
            {authenticatingPasskey ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 14a13.92 13.92 0 00-6 11c0 3.517 1.009 6.799 2.753 9.571m3.44-2.04A13.916 13.916 0 0014 9c0-3.517-1.009-6.799-2.753-9.571M12 11c0-3.517 1.009-6.799 2.753-9.571m-3.44-2.04C10.71 18.29 9 15.347 9 12m0 0V3m0 9h3m-3 0h-3" />
              </svg>
            )}
            {t("تسجيل الدخول السريع بـ Face ID", "Sign in with Face ID")}
          </Button>
          
          <div className="relative flex py-1.5 items-center">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-muted-foreground/80">{t("أو", "OR")}</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>
        </div>
      )}

      {/* Google Single-Sign-On Method */}
      <Button 
        type="button" 
        variant="outline" 
        className="h-11 w-full gap-2.5 font-medium border-slate-200 hover:bg-slate-50 hover:text-slate-900 active:scale-98 transition-all" 
        onClick={signInWithGoogle} 
        disabled={working || authenticatingPasskey}
      >
        <svg className="h-4.5 w-4.5 shrink-0" viewBox="0 0 24 24">
          <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l3.245-3.125C18.465 2.11 15.595 1 12.24 1 6.033 1 12.24S1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.99 0-.74-.08-1.3-.176-1.765l-10.617-.2h-.001Z"/>
        </svg>
        {t("متابعة باستخدام Google", "Continue with Google")}
      </Button>

      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-slate-100"></div>
        <span className="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-muted-foreground/80">{t("أو سجّل ببريدك", "OR SIGN IN WITH EMAIL")}</span>
        <div className="flex-grow border-t border-slate-100"></div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "signin" | "signup")}>
        <TabsList className="grid w-full grid-cols-2 bg-slate-50"><TabsTrigger value="signin">{t("تسجيل الدخول", "Sign in")}</TabsTrigger><TabsTrigger value="signup">{t("إنشاء حساب", "Create account")}</TabsTrigger></TabsList>
        <TabsContent value="signin" className="mt-4 space-y-3 animate-in fade-in-40 duration-200">
          <Field label={t("البريد الإلكتروني", "Email")} type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <Field label={t("كلمة المرور", "Password")} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
          <Button className="h-11 w-full text-white font-medium hover:opacity-95 active:scale-98 transition-all" style={{ backgroundColor: settings.primary_color }} onClick={signIn} disabled={working || authenticatingPasskey}>{working ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <LogIn className="me-2 h-4 w-4" />}{t("تسجيل الدخول", "Sign in")}</Button>
        </TabsContent>
        <TabsContent value="signup" className="mt-4 space-y-3 animate-in fade-in-40 duration-200">
          <Field label={t("الاسم الكامل", "Full name")} value={form.name} onChange={(name) => setForm({ ...form, name })} />
          <Field label={t("رقم الهاتف", "Phone")} value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          <Field label={t("البريد الإلكتروني", "Email")} type="email" value={form.email} disabled={Boolean(session)} onChange={(email) => setForm({ ...form, email })} />
          {!session && <Field label={t("كلمة المرور", "Password")} type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />}
          <Button className="h-11 w-full text-white font-medium hover:opacity-95 active:scale-98 transition-all" style={{ backgroundColor: settings.primary_color }} onClick={signUp} disabled={working || authenticatingPasskey}>{working && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("إنشاء حساب في هذا المتجر", "Create account for this store")}</Button>
        </TabsContent>
      </Tabs>
      <div className="text-center text-sm">
        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="text-muted-foreground underline underline-offset-4"
        >
          {t("متابعة كضيف", "Continue as guest")}
        </Link>
      </div>
    </Card>
  </div>;
}

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <div><Label>{label}</Label><Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}
