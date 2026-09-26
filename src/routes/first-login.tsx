import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  Loader2,
  LogOut,
  Sparkles,
  CheckCircle2,
  Lock,
  Store,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { evaluatePasswordStrength } from "@/lib/team-credentials-utils";
import { fetchFirstLoginProfile, profilesKeys, updateProfile } from "@/lib/data/profiles";
import { getCurrentUser, signOut } from "@/lib/auth/session";
import { completeFirstSignInPasswordChange, updatePassword } from "@/lib/auth/sign-in";

export const Route = createFileRoute("/first-login")({
  ssr: false,
  beforeLoad: async () => {
    // A user that cannot be read comes back as none.
    const user = await getCurrentUser();

    if (!user) {
      throw redirect({ to: "/auth" });
    }

    const profile = await fetchFirstLoginProfile(user.id);

    const dashboardRoles = new Set(["super_admin", "admin", "brand_admin", "staff", "courier"]);
    if (!profile || profile.status !== "active" || !dashboardRoles.has(profile.role ?? "")) {
      throw redirect({ to: "/auth" });
    }

    const requiresPasswordChange =
      Boolean(profile?.must_change_password) || Boolean(user.user_metadata?.must_change_password);

    if (!requiresPasswordChange) {
      throw redirect({ to: "/admin" });
    }
  },
  loader: async () => {
    const user = await getCurrentUser();

    const profile = user ? await fetchFirstLoginProfile(user.id) : null;

    return { user: user!, profile };
  },
  component: FirstLoginPage,
});

function FirstLoginPage() {
  const { lang, setLang } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const loaderData = Route.useLoaderData();
  const { user, profile } = loaderData;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const isAr = lang === "ar";
  const evaluation = evaluatePasswordStrength(password, confirmPassword);

  const displayName =
    profile?.name ||
    profile?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    (isAr ? "عضو الفريق" : "Team Member");

  const brandData = (profile as any)?.brand;
  const brandName = isAr
    ? brandData?.name_ar || brandData?.name_en || "المتجر"
    : brandData?.name_en || brandData?.name_ar || "The Store";

  const getRoleLabel = (role?: string | null) => {
    switch (role) {
      case "super_admin":
        return isAr ? "مدير عام" : "Super Admin";
      case "brand_admin":
        return isAr ? "مدير علامة تجارية" : "Brand Admin";
      case "admin":
        return isAr ? "مدير" : "Admin";
      case "courier":
        return isAr ? "مندوب توصيل" : "Courier";
      default:
        return isAr ? "عضو فريق" : "Staff Member";
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      queryClient.clear();
      navigate({ to: "/auth" });
    } catch {
      navigate({ to: "/auth" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!evaluation.checks.minLength) {
      toast.error(
        isAr
          ? "يجب أن تتكون كلمة المرور من 8 خانات على الأقل"
          : "Password must be at least 8 characters",
      );
      return;
    }
    if (!evaluation.checks.hasLetter || !evaluation.checks.hasNumberOrSymbol) {
      toast.error(
        isAr
          ? "يجب أن تحتوي كلمة المرور على أحرف وأرقام أو رموز"
          : "Password must contain letters and numbers or symbols",
      );
      return;
    }
    if (!evaluation.checks.matches) {
      toast.error(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Update user password and clear must_change_password in user_metadata
      const { error: authError } = await updatePassword(password, {
        must_change_password: false,
      });
      if (authError) throw authError;

      // 2. Clear must_change_password in profiles via RPC
      const { error: rpcError } = await completeFirstSignInPasswordChange();
      if (rpcError) {
        // Fallback direct update on profile (best-effort, as before)
        await updateProfile(user.id, {
          must_change_password: false,
          updated_at: new Date().toISOString(),
        }).catch(() => undefined);
      }

      // 3. Invalidate relevant queries so the router layout recognizes the change
      await queryClient.invalidateQueries({ queryKey: ["auth_user"] });
      await queryClient.invalidateQueries({ queryKey: profilesKeys.callers() });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });

      setIsSuccess(true);
      toast.success(
        isAr
          ? "تم تحديث كلمة المرور بنجاح! مرحباً بك في Boutq OS"
          : "Password set successfully! Welcome to Boutq OS",
      );

      // Short cinematic delay for smooth UX transition
      setTimeout(() => {
        navigate({ to: "/admin" });
      }, 1400);
    } catch (err: any) {
      toast.error(
        err?.message ||
          (isAr
            ? "حدث خطأ أثناء تحديث كلمة المرور. يرجى المحاولة مرة أخرى."
            : "Failed to update password. Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="min-h-screen flex flex-col justify-between bg-background text-foreground relative selection:bg-primary selection:text-primary-foreground overflow-x-hidden"
    >
      {/* Background ambient aesthetic */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background pointer-events-none" />

      {/* Header bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-xs">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="font-display font-bold text-lg text-foreground tracking-tight">
              Boutq OS
            </div>
            <div className="text-xs text-muted-foreground">
              {isAr ? "بوابة الأمان والتحقق" : "Security & Access Portal"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(isAr ? "en" : "ar")}
            className="text-xs text-muted-foreground hover:text-foreground font-medium"
          >
            {isAr ? "English" : "العربية"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="text-xs border-border-subtle hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <LogOut className="h-3.5 w-3.5 me-1.5" />
            {isAr ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </div>
      </header>

      {/* Main card */}
      <main className="relative z-10 w-full max-w-lg mx-auto px-4 py-4 sm:py-8 flex-1 flex flex-col justify-center">
        <Card className="p-6 sm:p-8 border border-border shadow-2xl rounded-2xl bg-card">
          {isSuccess ? (
            <div className="py-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shadow-lg">
                <CheckCircle2 className="h-9 w-9 animate-bounce" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold font-display text-foreground">
                  {isAr ? "تم تعيين كلمة المرور بنجاح!" : "Password Set Successfully!"}
                </h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {isAr
                    ? "أصبحت جاهزاً الآن للبدء. جاري نقلك تلقائياً إلى لوحة التحكم..."
                    : "You are all set! Taking you directly to your dashboard now..."}
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Context header */}
              <div className="space-y-2 text-start">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                  <KeyRound className="h-3.5 w-3.5" />
                  {isAr ? "إعداد كلمة المرور لأول دخول" : "First Sign-In Password Setup"}
                </div>
                <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground tracking-tight">
                  {isAr ? `أهلاً بك يا ${displayName} 👋` : `Welcome, ${displayName} 👋`}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {isAr
                    ? `تم تزويدك بكلمة مرور مؤقتة من قِبل إدارة المتجر. لأمان حسابك، يُرجى تعيين كلمة مرور شخصية قوية لمتابعة الدخول.`
                    : `You were given a temporary password by your store administrator. For your security, please create a new private password to continue.`}
                </p>
              </div>

              {/* Account summary pill */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 truncate">
                  <UserCheck className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-mono text-muted-foreground truncate" dir="ltr">
                    {user?.email}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-xs">
                    {getRoleLabel(profile?.role)}
                  </span>
                  {brandName && (
                    <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium text-xs flex items-center gap-1">
                      <Store className="h-3 w-3" />
                      {brandName}
                    </span>
                  )}
                </div>
              </div>

              {/* Password change form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* New password input */}
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">
                    {isAr ? "كلمة المرور الجديدة" : "New Password"}
                  </Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </div>
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="ps-9 pe-10 font-mono text-start"
                      autoFocus
                      required
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password input */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">
                    {isAr ? "تأكيد كلمة المرور الجديدة" : "Confirm New Password"}
                  </Label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-muted-foreground">
                      <Lock className="h-4 w-4" />
                    </div>
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="ps-9 pe-10 font-mono text-start"
                      required
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Password strength & validation checklist */}
                {password.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-secondary/30 border border-border space-y-3">
                    {/* Visual strength meter */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground font-medium">
                          {isAr ? "قوة كلمة المرور:" : "Password strength:"}
                        </span>
                        <span
                          className={`font-semibold ${
                            evaluation.strengthKey === "strong"
                              ? "text-emerald-500"
                              : evaluation.strengthKey === "good"
                                ? "text-blue-500"
                                : evaluation.strengthKey === "fair"
                                  ? "text-amber-500"
                                  : "text-destructive"
                          }`}
                        >
                          {isAr
                            ? evaluation.strengthKey === "strong"
                              ? "قوية جداً"
                              : evaluation.strengthKey === "good"
                                ? "جيدة"
                                : evaluation.strengthKey === "fair"
                                  ? "متوسطة"
                                  : "ضعيفة"
                            : evaluation.strengthKey.toUpperCase()}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 h-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            evaluation.score >= 1
                              ? evaluation.strengthKey === "weak"
                                ? "bg-destructive"
                                : evaluation.strengthKey === "fair"
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              : "bg-muted"
                          }`}
                        />
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            evaluation.score >= 2
                              ? evaluation.strengthKey === "fair"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                              : "bg-muted"
                          }`}
                        />
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            evaluation.score >= 3 ? "bg-emerald-500" : "bg-muted"
                          }`}
                        />
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            evaluation.score >= 4 ? "bg-emerald-500" : "bg-muted"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Criteria checklist */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                      <div className="flex items-center gap-2">
                        {evaluation.checks.minLength ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={
                            evaluation.checks.minLength
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {isAr ? "8 خانات على الأقل" : "At least 8 characters"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {evaluation.checks.hasLetter ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={
                            evaluation.checks.hasLetter
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {isAr ? "تحتوي على أحرف" : "Contains letters"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {evaluation.checks.hasNumberOrSymbol ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={
                            evaluation.checks.hasNumberOrSymbol
                              ? "text-foreground font-medium"
                              : "text-muted-foreground"
                          }
                        >
                          {isAr ? "تحتوي على أرقام أو رموز" : "Contains numbers or symbols"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {evaluation.checks.matches ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        ) : confirmPassword.length > 0 ? (
                          <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={
                            evaluation.checks.matches
                              ? "text-emerald-600 dark:text-emerald-400 font-medium"
                              : confirmPassword.length > 0
                                ? "text-destructive font-medium"
                                : "text-muted-foreground"
                          }
                        >
                          {isAr ? "تطابق كلمتي المرور" : "Passwords match"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={!evaluation.isValid || submitting}
                  className="w-full h-11 text-base font-semibold shadow-md transition-all mt-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin me-2" />
                      {isAr ? "جاري حفظ وتأمين الحساب..." : "Saving & securing account..."}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 me-2" />
                      {isAr
                        ? "حفظ كلمة المرور ومتابعة للوحة التحكم"
                        : "Save Password & Open Dashboard"}
                    </>
                  )}
                </Button>
              </form>
            </div>
          )}
        </Card>
      </main>

      {/* Footer bar */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
        Boutq OS • {isAr ? "نظام إدارة المتاجر المتكامل" : "Unified Boutique Operating System"}
      </footer>
    </div>
  );
}
