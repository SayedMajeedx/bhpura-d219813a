import { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, CreditCard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  PAYPAL_LIVE_CLIENT_ID,
  convertBhdToUsd,
  createPayPalSubscriptionOrder,
  capturePayPalSubscriptionOrder,
} from "@/lib/paypal-subscription.functions";

interface PayPalSubscriptionButtonProps {
  brandId: string;
  targetPlanId: string;
  planNameAr: string;
  planNameEn: string;
  bhdAmount: number;
  billingInterval: "monthly" | "annual";
  isAr: boolean;
  onSuccess: () => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export function PayPalSubscriptionButton({
  brandId,
  targetPlanId,
  planNameAr,
  planNameEn,
  bhdAmount,
  billingInterval,
  isAr,
  onSuccess,
}: PayPalSubscriptionButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadingSdk, setLoadingSdk] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const usdAmount = convertBhdToUsd(bhdAmount);

  useEffect(() => {
    let isMounted = true;

    const renderButtons = () => {
      if (!isMounted || !containerRef.current) return;
      if (!window.paypal?.Buttons) {
        if (isMounted) {
          setLoadError(
            isAr
              ? "مكونات أزرار الدفع غير متوفرة في PayPal SDK."
              : "PayPal Buttons component is not available.",
          );
          setLoadingSdk(false);
        }
        return;
      }

      containerRef.current.innerHTML = "";

      try {
        const buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "paypal",
            height: 44,
          },
          createOrder: async () => {
            try {
              const res = await createPayPalSubscriptionOrder({
                data: {
                  brandId,
                  targetPlanId,
                  billingInterval,
                },
              });
              return res.orderId;
            } catch (err: any) {
              const msg = err.message || "Failed to create PayPal order";
              toast.error(isAr ? "تعذر إنشاء جلسة الدفع في PayPal" : msg);
              throw err;
            }
          },
          onApprove: async (data: { orderID: string }) => {
            setIsProcessing(true);
            const toastId = toast.loading(
              isAr
                ? "جاري تأكيد عملية الدفع وتفعيل الباقة فورياً..."
                : "Confirming payment and activating your subscription...",
            );

            try {
              await capturePayPalSubscriptionOrder({
                data: {
                  brandId,
                  orderId: data.orderID,
                  targetPlanId,
                  billingInterval,
                },
              });

              toast.success(
                isAr
                  ? "تم استلام الدفعة وتفعيل الباقة بنجاح!"
                  : "Payment verified and subscription activated successfully!",
                { id: toastId },
              );

              onSuccess();
            } catch (err: any) {
              toast.error(
                isAr
                  ? "حدث خطأ أثناء إتمام الدفع. يرجى التواصل مع الدعم."
                  : (err.message ?? "Capture failed. Please contact support."),
                { id: toastId },
              );
            } finally {
              setIsProcessing(false);
            }
          },
          onError: (err: any) => {
            console.error("PayPal Smart Button error:", err);
            toast.error(
              isAr
                ? "حدث خطأ أثناء الدفع عبر PayPal. يرجى المحاولة مرة أخرى."
                : "PayPal checkout error. Please try again.",
            );
          },
          onCancel: () => {
            toast.info(
              isAr ? "تم إلغاء عملية الدفع في PayPal." : "PayPal checkout was cancelled.",
            );
          },
        });

        if (buttons.isEligible && !buttons.isEligible()) {
          if (isMounted) {
            setLoadError(
              isAr
                ? "طريقة الدفع غير مؤهلة في هذا المتصفح."
                : "Payment method not eligible in this browser.",
            );
            setLoadingSdk(false);
          }
          return;
        }

        buttons
          .render(containerRef.current)
          .then(() => {
            if (isMounted) setLoadingSdk(false);
          })
          .catch((err: any) => {
            console.error("PayPal render error:", err);
            if (isMounted) {
              setLoadError(err?.message || (isAr ? "تعذر عرض أزرار PayPal" : "Failed to render buttons"));
              setLoadingSdk(false);
            }
          });
      } catch (err: any) {
        if (isMounted) {
          setLoadError(err?.message || "Failed to initialize PayPal buttons");
          setLoadingSdk(false);
        }
      }
    };

    const desiredLocale = isAr ? "ar_BH" : "en_US";
    const scriptId = `paypal-sdk-script-${desiredLocale}`;
    const oppositeScriptId = `paypal-sdk-script-${isAr ? "en_US" : "ar_BH"}`;

    const oppositeScript = document.getElementById(oppositeScriptId);
    if (oppositeScript) {
      oppositeScript.remove();
      delete (window as any).paypal;
    }

    if (window.paypal?.Buttons && document.getElementById(scriptId)) {
      renderButtons();
      return () => {
        isMounted = false;
        if (containerRef.current) containerRef.current.innerHTML = "";
      };
    }

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      if (window.paypal?.Buttons) {
        renderButtons();
      } else {
        existingScript.addEventListener("load", renderButtons);
      }
      return () => {
        isMounted = false;
        existingScript.removeEventListener("load", renderButtons);
      };
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_LIVE_CLIENT_ID}&currency=USD&intent=capture&enable-funding=card&locale=${desiredLocale}`;
    script.async = true;

    script.onload = () => {
      renderButtons();
    };

    script.onerror = (e) => {
      console.error("PayPal SDK script load error:", e);
      if (isMounted) {
        setLoadError(
          isAr
            ? "تعذر تحميل مكتبة PayPal. يرجى التحقق من اتصال الإنترنت أو إيقاف مانع الإعلانات (AdBlock)."
            : "Failed to load PayPal SDK. Please check internet connection or disable ad blockers.",
        );
        setLoadingSdk(false);
      }
    };

    document.body.appendChild(script);

    return () => {
      isMounted = false;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [brandId, targetPlanId, billingInterval, isAr, onSuccess]);

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {/* Price Summary Badge */}
      <div className="p-3.5 rounded-xl border border-border/60 bg-muted/30 flex items-center justify-between text-xs">
        <div className="space-y-0.5">
          <span className="text-muted-foreground block text-[11px]">
            {isAr ? "الباقة وفترة الاشتراك:" : "Plan & Interval:"}
          </span>
          <span className="font-semibold text-foreground">
            {isAr ? planNameAr : planNameEn} (
            {billingInterval === "monthly"
              ? isAr
                ? "شهري"
                : "Monthly"
              : isAr
                ? "سنوي"
                : "Annual"}
            )
          </span>
        </div>
        <div className="text-end" dir="ltr">
          <div className="font-mono font-bold text-sm text-foreground">
            ${usdAmount} USD
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            ≈ {bhdAmount.toFixed(3)} BHD
          </div>
        </div>
      </div>

      {/* Security & Accepted Cards Note */}
      <div className="p-3 rounded-xl border border-border/70 bg-card/60 space-y-1 text-[11px]">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>
            {isAr
              ? "دفع إلكتروني مشفّر وتفعيل فوري للباقة"
              : "Encrypted instant online payment & immediate activation"}
          </span>
        </div>
        <p className="text-muted-foreground leading-relaxed ps-6 text-[10px]">
          {isAr ? (
            <>
              يقبل جميع بطاقات الائتمان البحرينية <bdi dir="ltr">(Credit Cards)</bdi> وبطاقات الخصم المباشر <bdi dir="ltr">(Debit Cards)</bdi> الصادرة من بنوك البحرين كـ <bdi dir="ltr">ila</bdi> و <bdi dir="ltr">BBK</bdi> و <bdi dir="ltr">BisB</bdi> المفعلة للشراء أونلاين عبر <bdi dir="ltr">Visa / Mastercard</bdi>.
            </>
          ) : (
            "Accepts all Bahraini Credit Cards and online-enabled Debit Cards (e.g. ila Bank, BBK, BisB, NBB with Visa/Mastercard enabled)."
          )}
        </p>
      </div>

      {/* Loading state */}
      {loadingSdk && !loadError && (
        <div className="h-28 rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>{isAr ? "جاري تحميل خيارات الدفع الآمنة..." : "Loading secure payment options..."}</span>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-xs font-semibold text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isAr ? "جاري تفعيل الباقة..." : "Activating your subscription..."}</span>
        </div>
      )}

      {/* Error state */}
      {loadError && (
        <div className="p-3 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl flex items-center justify-between gap-2">
          <span>{loadError}</span>
        </div>
      )}

      {/* PayPal Smart Buttons target container */}
      <div
        ref={containerRef}
        dir={isAr ? "rtl" : "ltr"}
        className="w-full min-h-[44px] transition-all"
      />
    </div>
  );
}
