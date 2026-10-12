import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { KeyRound, Copy, CheckCheck, ShieldCheck, MessageCircle } from "lucide-react";
import { formatTeamInviteMessage } from "@/lib/team-credentials-utils";

import type { TeamPageState } from "@/features/team/hooks/use-team-page";

/** The sign-in details of an account just made or reset, to copy or send to the member. */
export function StaffCredentialsDialog({ page }: { page: TeamPageState }) {
  const { isAr, credentialsModal, setCredentialsModal, copiedKey, copyToClipboard } = page;
  return (
    <>
      {/* Team Member Credentials Card Modal */}
      <Dialog
        open={Boolean(credentialsModal?.isOpen)}
        onOpenChange={(v) => {
          if (!v) setCredentialsModal(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary font-semibold text-xs mb-1">
              <ShieldCheck className="h-4 w-4" />
              {isAr ? "بطاقة بيانات الدخول الآمنة" : "Secure Member Credentials"}
            </div>
            <DialogTitle className="text-xl font-bold font-display">
              {isAr ? "بيانات تسجيل الدخول للعضو" : "Member Login Credentials"}
            </DialogTitle>
          </DialogHeader>

          {credentialsModal && (
            <div className="space-y-4 py-2">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
                <KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="leading-relaxed">
                  {credentialsModal.mustChangePassword
                    ? isAr
                      ? "تم تعيين كلمة المرور ككلمة مرور مؤقتة. سيُطلب من العضو تغييرها فور أول تسجيل دخول قبل الوصول للوحة التحكم."
                      : "This temporary password has been set. The member will be required to change it on their first login."
                    : isAr
                      ? "تم تحديث كلمة المرور بنجاح. يمكن للعضو الدخول بها مباشرة."
                      : "Password updated successfully. The member can use it to sign in directly."}
                </div>
              </div>

              {/* Credential rows */}
              <div className="space-y-2.5 rounded-xl border border-border bg-card p-3.5 text-xs">
                {/* Member Name */}
                {credentialsModal.name && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle">
                    <span className="text-muted-foreground">{isAr ? "الاسم:" : "Name:"}</span>
                    <span className="font-semibold text-foreground">{credentialsModal.name}</span>
                  </div>
                )}

                {/* Phone */}
                {credentialsModal.phone && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle">
                    <span className="text-muted-foreground">
                      {isAr ? "الهاتف / الواتساب:" : "Phone / WhatsApp:"}
                    </span>
                    <span
                      className="font-mono font-medium text-emerald-700 dark:text-emerald-400"
                      dir="ltr"
                    >
                      {credentialsModal.phone}
                    </span>
                  </div>
                )}

                {/* Email */}
                <div className="flex items-center justify-between py-1 border-b border-border-subtle">
                  <span className="text-muted-foreground">
                    {isAr ? "البريد الإلكتروني:" : "Email:"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium text-foreground" dir="ltr">
                      {credentialsModal.email}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => copyToClipboard(credentialsModal.email, "email")}
                    >
                      {copiedKey === "email" ? (
                        <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Temp Password */}
                {credentialsModal.tempPassword && (
                  <div className="flex items-center justify-between py-1 border-b border-border-subtle">
                    <span className="text-muted-foreground">
                      {isAr ? "كلمة المرور المؤقتة:" : "Temporary Password:"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary tracking-wider" dir="ltr">
                        {credentialsModal.tempPassword}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          copyToClipboard(credentialsModal.tempPassword || "", "password")
                        }
                      >
                        {copiedKey === "password" ? (
                          <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Login URL */}
                <div className="flex items-center justify-between py-1">
                  <span className="text-muted-foreground">
                    {isAr ? "رابط تسجيل الدخول:" : "Login URL:"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground text-xs" dir="ltr">
                      {window.location.origin}/auth
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground"
                      onClick={() => copyToClipboard(`${window.location.origin}/auth`, "url")}
                    >
                      {copiedKey === "url" ? (
                        <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Action Buttons for sharing */}
              <div className="space-y-2 pt-2">
                <Button
                  className="w-full gap-2 font-medium"
                  onClick={() => {
                    const msg = formatTeamInviteMessage({
                      name: credentialsModal.name,
                      storeName: credentialsModal.storeName,
                      email: credentialsModal.email,
                      tempPassword: credentialsModal.tempPassword,
                      loginUrl: `${window.location.origin}/auth`,
                      lang: isAr ? "ar" : "en",
                    });
                    copyToClipboard(msg, "full_message");
                  }}
                >
                  {copiedKey === "full_message" ? (
                    <>
                      <CheckCheck className="h-4 w-4 text-emerald-300" />
                      {isAr ? "تم نسخ نص الدعوة كاملاً!" : "Full Invitation Copied!"}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {isAr
                        ? "نسخ رسالة الترحيب والبيانات (جاهزة للمشاركة)"
                        : "Copy Welcome Message (Ready to share)"}
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  className="w-full gap-2 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={() => {
                    const msg = formatTeamInviteMessage({
                      name: credentialsModal.name,
                      storeName: credentialsModal.storeName,
                      email: credentialsModal.email,
                      tempPassword: credentialsModal.tempPassword,
                      loginUrl: `${window.location.origin}/auth`,
                      lang: isAr ? "ar" : "en",
                    });
                    const phoneDigits = credentialsModal.phone
                      ? credentialsModal.phone.replace(/\D/g, "")
                      : "";
                    const waUrl = phoneDigits
                      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`
                      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
                    window.open(waUrl, "_blank");
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {credentialsModal.phone
                    ? isAr
                      ? `إرسال عبر واتساب إلى ${credentialsModal.phone}`
                      : `Send via WhatsApp to ${credentialsModal.phone}`
                    : isAr
                      ? "مشاركة فورية عبر واتساب"
                      : "Share via WhatsApp"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setCredentialsModal(null)}
            >
              {isAr ? "إغلاق" : "Done"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
