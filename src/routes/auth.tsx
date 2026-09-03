import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Fingerprint,
  Languages,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Lock,
  TrendingUp,
} from "lucide-react";
import { applyRememberMe } from "@/lib/session-persistence";
import { translateAuthError } from "@/lib/auth-errors";
import { readStorefrontOAuthReturn } from "@/lib/storefront-oauth-return";

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

  useEffect(() => {
    const returnPath = readStorefrontOAuthReturn();
    if (!returnPath) return;
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) window.location.replace(returnPath);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", user!.id)
        .maybeSingle();
      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
        await supabase.auth.signOut();
        throw new Error(
          lang === "ar"
            ? "هذا حساب عميل متجر وليس حساب لوحة تحكم."
            : "This is a storefront customer account, not a dashboard account.",
        );
      }
      applyRememberMe(remember);
      await new Promise((r) => setTimeout(r, 100));
      navigate({ to: "/admin" });
    } catch (err: any) {
      toast.error(translateAuthError(err, lang as any));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      if (!data.user) throw new Error("Passkey sign-in did not return a user.");
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", data.user.id)
        .maybeSingle();
      const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
      if (
        profileError ||
        !profile ||
        profile.status !== "active" ||
        !dashboardRoles.has(profile.role ?? "")
      ) {
        await supabase.auth.signOut();
        throw new Error(
          lang === "ar"
            ? "هذا الحساب غير مخوّل لدخول لوحة التحكم."
            : "This account is not authorized for dashboard access.",
        );
      }
      applyRememberMe(true);
      await navigate({ to: "/admin" });
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

  return (
    <div
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="min-h-screen w-full flex flex-col items-center justify-center relative bg-zinc-950 text-white px-4 py-8 overflow-hidden select-none"
    >
      {/* Dynamic Tech-Boutique Moving Luxury Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--os-accent-glow),transparent_60%)] z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(9,9,11,0.95))] z-0" />
      <div className="absolute top-[20%] right-[-5%] w-80 h-80 rounded-full bg-primary/10 blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-[20%] left-[-5%] w-96 h-96 rounded-full bg-primary/15 blur-3xl pointer-events-none" />

      {/* Subtle Grid Pattern Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff0d_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none z-0" />

      {/* Floating Tech-Boutique Apparel Canvas Elements in Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden hidden lg:block opacity-40">
        {/* Top-Left Floating Live Order Pill */}
        <div className="absolute top-[18%] left-10 bg-zinc-900/90 border border-emerald-500/30 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <div className="text-xs font-semibold text-zinc-200">
            {lang === "ar"
              ? "صوفيا آل خليفة • عباية حرير أورجانزا"
              : "Sofia Al Khalifa • Organza Silk Abaya"}
          </div>
          <span className="text-xs font-bold text-emerald-400">145.000 BHD</span>
        </div>

        {/* Bottom-Right Floating Sales Telemetry Card */}
        <div className="absolute bottom-[18%] right-10 bg-zinc-900/85 border border-border backdrop-blur-md p-4 rounded-2xl shadow-xl w-60">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-primary" />
              {lang === "ar" ? "مبيعات البوتيك" : "BOUTIQUE SALES"}
            </span>
            <span className="text-[9px] bg-rose-500/10 text-rose-300 font-bold border border-rose-500/20 px-2 py-0.5 rounded-full">
              LIVE
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-zinc-100">4,284.150 BHD</div>
          <div className="h-6 mt-2 flex items-end gap-1">
            {[40, 55, 45, 60, 75, 50, 70, 85, 90, 80, 95].map((h, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t transition-all duration-500 ${i === 10 ? "bg-primary" : "bg-zinc-800"}`}
                style={{
                  height: `${h}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Top Header Controls Bar */}
      <div className="w-full max-w-md flex justify-end mb-6 relative z-10">
        <div className="flex items-center gap-2 h-9 px-3.5 bg-zinc-900/80 backdrop-blur-xl border border-border rounded-2xl shadow-xs">
          <Languages className="h-4 w-4 text-primary" />
          <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
            <SelectTrigger className="h-7 border-0 bg-transparent text-xs font-bold text-zinc-200 focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 backdrop-blur-xl border-border text-zinc-200">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ar">العربية</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Center Auth Card Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Branding Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-primary/20 backdrop-blur-md border border-primary/40 text-primary-foreground font-mono text-xs font-bold uppercase tracking-widest shadow-xs">
            <Sparkles
              className="h-3.5 w-3.5 text-primary-foreground animate-spin"
              style={{ animationDuration: "6s" }}
            />
            <span>BOUTQ OS PORTAL</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black font-heading tracking-tight text-white drop-shadow-md">
            {t("app.title")}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium">
            {t("app.portalSubtitle")}
          </p>
        </div>

        {/* Semi-Glossy Tech-Boutique Glass Card */}
        <div className="backdrop-blur-xl bg-zinc-900/85 border border-border shadow-2xl rounded-3xl p-6 sm:p-8 relative overflow-hidden">
          {/* Top Sheen Highlight */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

          <div className="mb-6 space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold font-heading text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-rose-400 shrink-0" />
              <span>{t("auth.welcomeBack")}</span>
            </h2>
            <p className="text-xs text-zinc-200 leading-relaxed flex items-start gap-2 bg-zinc-950/90 p-3.5 rounded-2xl border border-zinc-800 shadow-inner">
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-emerald-400" />
              <span>
                {lang === "ar"
                  ? "يقتصر الدخول على الشركاء المعتمدين ومندوبي التوصيل. يرجى استخدام بيانات الاعتماد الصادرة عن إدارة البوتيك."
                  : "Access restricted to authorized partners and logistics couriers. Please use your credentials issued by the boutique administrator."}
              </span>
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold text-zinc-300">
                {t("auth.email")}
              </Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="partner@boutq.store"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 bg-zinc-950/90 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 rounded-xl transition-all font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-bold text-zinc-300">
                {t("auth.password")}
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 bg-zinc-950/90 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 rounded-xl transition-all font-medium"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 cursor-pointer select-none">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(v === true)}
                  className="border-zinc-600 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600 data-[state=checked]:text-white focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                />
                <span>{t("auth.rememberMe")}</span>
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-bold text-rose-300 hover:text-white underline transition-colors focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 rounded-sm"
              >
                {t("auth.forgotPassword")}
              </Link>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 font-bold text-white bg-rose-700 hover:bg-rose-600 active:bg-rose-800 shadow-lg active:scale-[0.99] rounded-xl transition-all duration-200 mt-2 border border-rose-500/40 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            >
              {loading ? (
                t("common.pleaseWait")
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>{t("auth.signIn")}</span>
                  <ArrowRight className={`h-4 w-4 ${lang === "ar" ? "rotate-180" : ""}`} />
                </span>
              )}
            </Button>
          </form>

          {passkeySupported && (
            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                <span className="h-px flex-1 bg-zinc-800" />
                <span>{lang === "ar" ? "أو باستخدام" : "or biometric"}</span>
                <span className="h-px flex-1 bg-zinc-800" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-12 w-full gap-2.5 border-zinc-700 bg-zinc-950/80 hover:bg-zinc-800 text-white font-semibold rounded-xl backdrop-blur-md shadow-xs transition-all active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                disabled={passkeyLoading || loading}
                onClick={() => void signInWithPasskey()}
              >
                <Fingerprint className="h-5 w-5 text-rose-400" />
                <span>
                  {passkeyLoading
                    ? t("common.pleaseWait")
                    : lang === "ar"
                      ? "تسجيل الدخول بالبصمة"
                      : "Sign in with Biometric"}
                </span>
              </Button>

              <p className="text-center text-[11px] font-medium text-zinc-400">
                {lang === "ar"
                  ? "استخدم Face ID أو Touch ID أو مفتاح أمان مسجّل."
                  : "Use a registered Face ID, Touch ID, device PIN, or security key."}
              </p>
            </div>
          )}
        </div>

        {/* Back Home Navigation */}
        <div className="text-center">
          <Link
            to="/"
            className="text-xs font-bold text-rose-300 hover:text-white transition-colors underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 rounded-sm"
          >
            {t("auth.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
