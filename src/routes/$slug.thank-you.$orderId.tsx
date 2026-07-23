import { createFileRoute, Link } from "@tanstack/react-router";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Fingerprint, Sparkles, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/$slug/thank-you/$orderId")({
  validateSearch: (search: Record<string, unknown>) => ({
    fulfillment: search.fulfillment === "pickup" ? ("pickup" as const) : search.fulfillment === "digital" ? ("digital" as const) : ("delivery" as const),
    channel: search.channel === "whatsapp" ? ("whatsapp" as const) : ("email" as const),
  }),
  component: ThankYou,
});

function ThankYou() {
  const { brand, settings, t, session, clearCart } = useStorefront();
  const { fulfillment, channel } = Route.useSearch();
  const isPickup = fulfillment === "pickup";
  const isDigital = fulfillment === "digital";

  useEffect(() => {
    clearCart();
  }, []);

  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    // Determine platform-biometric capabilities via WebAuthn
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => {
          setPasskeySupported(available);
        })
        .catch(() => setPasskeySupported(false));
    }
    
    // Read local registration marker
    const isRegistered = localStorage.getItem(`passkey_registered_${brand.slug}`) === "true";
    setPasskeyRegistered(isRegistered);
  }, [brand.slug]);

  const enablePasskey = async () => {
    if (!session?.user) {
      toast.error(t(
        "يرجى تسجيل الدخول أو إنشاء حساب أولاً لتفعيل الدخول بالوجه.",
        "Please sign in or create an account first to enable Face ID login.",
      ));
      return;
    }
    setRegistering(true);
    try {
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const userId = new TextEncoder().encode(session.user.id);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: brand.name_en,
            id: window.location.hostname === "localhost" ? "localhost" : window.location.hostname,
          },
          user: {
            id: userId,
            name: session.user.email ?? "customer",
            displayName: session.user.user_metadata?.name || session.user.email || "Customer",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
        },
      });

      if (credential) {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (currentSession?.refresh_token) {
          localStorage.setItem(`passkey_token_${brand.slug}`, currentSession.refresh_token);
          localStorage.setItem(`passkey_registered_${brand.slug}`, "true");
          setPasskeyRegistered(true);
          toast.success(t(
            "تم تفعيل تسجيل الدخول السريع بـ Face ID بنجاح!",
            "Face ID fast checkout enabled successfully!",
          ));
        } else {
          throw new Error("Active session refresh token unavailable.");
        }
      }
    } catch (err: any) {
      console.warn("Passkey registration cancelled or failed", err);
      if (err.name !== "NotAllowedError") {
        toast.error(t(
          "حدث خطأ أثناء إعداد تسجيل الدخول السريع بالوجه.",
          "An error occurred during Face ID checkout setup.",
        ));
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 sm:p-8 animate-in fade-in duration-500">
      <Card className="p-6 sm:p-8 text-center relative overflow-hidden">
        {/* Ambient top design flourish */}
        <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: settings.primary_color }}></div>
        
        <CheckCircle2 className="h-14 w-14 mx-auto mb-4 animate-bounce duration-1000" style={{ color: settings.primary_color }} />
        <h1 className="font-display text-2xl sm:text-3xl mb-2">{t("شكراً لطلبك!", "Thank you for your order!")}</h1>
        <p className="text-sm sm:text-base text-muted-foreground mb-6 leading-relaxed">
          {isDigital
            ? channel === "whatsapp"
              ? t(
                  "تم استلام طلبك وسيتم إرسال المنتج الرقمي إليك عبر واتساب بعد تجهيز الطلب.",
                  "We received your order. Your digital product will be sent through WhatsApp once it is ready.",
                )
              : t(
                  "تم استلام طلبك وسيتم إرسال المنتج الرقمي إلى بريدك الإلكتروني بعد تجهيز الطلب.",
                  "We received your order. Your digital product will be sent to your email once it is ready.",
                )
            : isPickup
            ? t(
                "تم استلام طلبكم وسيتم التواصل معكم فور تجهيز الطلب للاستلام من الفرع.",
                "We received your order and will contact you as soon as it is ready for pickup from the branch.",
              )
            : t(
                "تم استلام طلبك وسيتم التواصل معك قريباً لتأكيد التوصيل.",
                "We received your order and will contact you shortly to confirm delivery.",
              )}
        </p>

        <Link
          to="/$slug"
          params={{ slug: brand.slug }}
          className="inline-flex px-8 py-3 rounded-full text-white font-medium active:scale-95 transition-all shadow-md hover:shadow-lg"
          style={{ backgroundColor: settings.primary_color }}
        >
          {t("متابعة التسوق", "Continue shopping")}
        </Link>

        {/* -------------------- PASSKEY / FACE ID UPGRADE PROMPT -------------------- */}
        {passkeySupported && !passkeyRegistered && session && (
          <div className="mt-8 border rounded-2xl p-5 sm:p-6 bg-slate-50/50 backdrop-blur-sm shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md text-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Soft decorative background spotlight */}
            <div className="absolute -right-12 -top-12 w-24 h-24 rounded-full bg-primary/5 blur-xl pointer-events-none" style={{ backgroundColor: `${settings.primary_color}08` }}></div>
            
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-800 relative">
                <Fingerprint className="h-6 w-6 animate-pulse" style={{ color: settings.primary_color }} />
                <Sparkles className="absolute -top-1 -right-1 h-4.5 w-4.5 text-amber-500 animate-spin duration-3000" />
              </div>
              
              <div className="space-y-1 text-center sm:text-start flex-1 min-w-0">
                <h3 className="font-semibold text-sm sm:text-base text-slate-900 flex items-center justify-center sm:justify-start gap-1.5">
                  {t("تفعيل الدخول السريع بالوجه", "Enable 1-touch checkout with Face ID")}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {t(
                    "تخطى كتابة البريد الإلكتروني أو الروابط المرة القادمة. سجّل بصمتك لتأكيد الشراء بلمسة واحدة سريعة.",
                    "Skip credentials or confirmation links next time. Register biometrics to checkout instantly with one touch.",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPasskeySupported(false); // Squelch/dismiss
                  localStorage.setItem(`passkey_dismissed_${brand.slug}`, "true");
                }}
                className="w-full sm:w-auto h-9 text-xs font-medium rounded-xl text-slate-500"
              >
                {t("ليس الآن", "Maybe later")}
              </Button>
              <Button
                onClick={enablePasskey}
                disabled={registering}
                size="sm"
                className="w-full sm:w-auto h-9 text-xs font-semibold rounded-xl text-white gap-1.5 active:scale-95 transition-all shadow-sm"
                style={{ backgroundColor: settings.primary_color }}
              >
                {registering ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    {t("جاري التفعيل...", "Enabling...")}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    {t("تفعيل بالبصمة", "Enable Passkey")}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {passkeySupported && passkeyRegistered && (
          <div className="mt-8 border border-emerald-100 rounded-2xl p-5 bg-emerald-50/20 text-emerald-800 text-start flex items-center gap-3.5 animate-in fade-in duration-300">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100/80 text-emerald-600">
              <ShieldCheck className="h-5.5 w-5.5" />
            </div>
            <div className="space-y-0.5 text-sm min-w-0">
              <div className="font-semibold text-emerald-900">{t("ميزة الدخول بالبصمة مفعلة", "Face ID login is enabled")}</div>
              <p className="text-xs text-emerald-700/85 leading-relaxed">{t("حسابك محمي وجاهز لعمليات دفع فائقة السرعة بلمسة واحدة في زيارتك القادمة.", "Your account is secure and optimized for 1-touch checkout on your next visit.")}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
