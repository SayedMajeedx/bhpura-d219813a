import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadBenefitReceipt } from "@/lib/benefit-receipt";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { awardOrderLoyaltyPoints, redeemLoyaltyPoints } from "@/lib/loyalty.functions";
import { markCartRecoveredOnOrder } from "@/lib/abandoned-carts.functions";
import type { ShippingZone } from "@/lib/shipping";
import type {
  AppliedPromo,
  CheckoutForm,
  Fulfillment,
  PaymentMethod,
  Storefront,
} from "@/features/checkout/types";
import { checkoutFormError } from "@/features/checkout/lib/checkout-validation";
import { placeOrderFailure, placeStorefrontOrderArgs } from "@/features/checkout/lib/place-order";

/**
 * Place order: validate, place the order once (a retried card payment reuses
 * the order), redeem and award loyalty points, mark the recovered cart, then
 * go to the card gateway or the thank-you page.
 */
export function usePlaceOrder({
  brand,
  session,
  cart,
  cartTotal,
  grandTotal,
  shipping,
  currency,
  lang,
  t,
  clearCart,
  form,
  acceptedTerms,
  saveToProfile,
  whatsappOrderUpdates,
  isGift,
  giftRecipient,
  giftMessage,
  fulfillment,
  selectedDestination,
  selectedCountryCode,
  selectedZone,
  method,
  benefitReceipt,
  branches,
  branchId,
  digitalChannel,
  digitalContact,
  appliedPromo,
  setAppliedPromo,
  customerId,
  effectiveRedeemedPoints,
  cartSessionId,
  paymentErrorState,
}: {
  brand: Pick<Storefront["brand"], "id" | "slug">;
  session: Storefront["session"];
  cart: Storefront["cart"];
  cartTotal: number;
  grandTotal: number;
  shipping: number;
  currency: string;
  lang: Storefront["lang"];
  t: Storefront["t"];
  clearCart: Storefront["clearCart"];
  form: CheckoutForm;
  acceptedTerms: boolean;
  saveToProfile: boolean;
  whatsappOrderUpdates: boolean;
  isGift: boolean;
  giftRecipient: string;
  giftMessage: string;
  fulfillment: Fulfillment;
  selectedDestination: string;
  selectedCountryCode: string;
  selectedZone: ShippingZone | undefined;
  method: PaymentMethod | "";
  benefitReceipt: File | null;
  branches: readonly unknown[];
  branchId: string;
  digitalChannel: "email" | "whatsapp";
  digitalContact: string;
  appliedPromo: AppliedPromo | null;
  setAppliedPromo: (promo: AppliedPromo | null) => void;
  customerId: string | null;
  effectiveRedeemedPoints: number;
  cartSessionId: string;
  paymentErrorState: { status: string; orderId: string } | null;
}) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const submit = async () => {
    const formError = checkoutFormError({
      form,
      fulfillment,
      acceptedTerms,
      selectedDestination,
      method,
      benefitReceipt,
      branches,
      branchId,
      digitalChannel,
      digitalContact,
      t,
    });
    if (formError) {
      toast.error(formError);
      return;
    }
    const customerEmail = form.email.trim();
    setSubmitting(true);
    try {
      let orderId = paymentErrorState?.orderId;
      let confirmationToken = null;

      if (method === "card" && paymentErrorState?.orderId) {
        orderId = paymentErrorState.orderId;
      } else {
        const benefitReceiptId =
          method === "benefit" && benefitReceipt
            ? await uploadBenefitReceipt(brand.id, benefitReceipt)
            : null;
        const { data, error } = await supabase.rpc(
          "place_storefront_order",
          placeStorefrontOrderArgs({
            brand,
            form,
            customerEmail,
            selectedDestination,
            selectedCountryCode,
            selectedZone,
            session,
            saveToProfile,
            cart,
            method,
            isGift,
            giftRecipient,
            giftMessage,
            fulfillment,
            branchId,
            digitalChannel,
            digitalContact,
            appliedPromo,
            benefitReceiptId,
            shipping,
            lang,
            idempotencyKey,
          }) as any,
        );
        if (error) throw error;
        orderId = (data as any)?.order_id;
        confirmationToken = (data as any)?.confirmation_email_token;
        if (brand.slug === "pura" && whatsappOrderUpdates && orderId && confirmationToken) {
          const { error: whatsappOptInError } = await supabase.rpc(
            "record_order_whatsapp_opt_in" as any,
            {
              p_order_id: orderId,
              p_confirmation_token: confirmationToken,
            },
          );
          if (whatsappOptInError) {
            console.warn("[checkout] WhatsApp order-update consent could not be recorded");
          }
        }

        // 1. Loyalty redemption
        if (effectiveRedeemedPoints > 0 && customerId && orderId) {
          try {
            await redeemLoyaltyPoints({
              brandId: brand.id,
              customerId,
              pointsToRedeem: effectiveRedeemedPoints,
              orderSubtotal: cartTotal,
              idempotencyKey: `${idempotencyKey}_redeem`,
              orderId: String(orderId),
            });
          } catch (ptsErr) {
            console.warn("Points redemption error:", ptsErr);
          }
        }

        // 2. Award points for order
        if (orderId) {
          try {
            await awardOrderLoyaltyPoints({
              brandId: brand.id,
              orderId: String(orderId),
              idempotencyKey: `${idempotencyKey}_award`,
            });
          } catch (ptsAwardErr) {
            console.warn("Points award error:", ptsAwardErr);
          }
        }

        // 3. Mark cart recovered
        if (orderId) {
          try {
            await markCartRecoveredOnOrder({
              brandId: brand.id,
              orderId: String(orderId),
              customerId: customerId || undefined,
              sessionId: cartSessionId,
              guestEmail: form.email || undefined,
              guestPhone: form.phone || undefined,
            });
          } catch (cartRecoverErr) {
            console.warn("Cart recovery mark error:", cartRecoverErr);
          }
        }
      }
      trackStorefrontEvent(
        "purchase",
        {
          transaction_id: String(orderId ?? ""),
          currency,
          value: Number(grandTotal.toFixed(3)),
          shipping: Number(shipping.toFixed(3)),
          coupon: appliedPromo?.code ?? undefined,
          items: cart.map((item) => ({
            item_id: item.product_id,
            item_name: item.name,
            price: item.price,
            quantity: item.qty,
          })),
        },
        String(orderId ?? ""),
      );
      // If they chose to pay via Card, redirect to payment gateway
      if (method === "card") {
        const toastId = toast.loading(
          t("جاري تحويلك لبوابة الدفع...", "Redirecting you to the payment gateway..."),
        );
        try {
          const chargeRes = await fetch("/api/public/payments/create-tap-charge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: String(orderId),
              brandId: brand.id,
              confirmationToken,
            }),
          });

          if (!chargeRes.ok) {
            const errData = await chargeRes.json<{ error?: string }>();
            throw new Error(errData.error || "Failed to initiate card payment.");
          }

          const { redirectUrl } = await chargeRes.json<{ redirectUrl: string }>();
          toast.dismiss(toastId);
          window.location.href = redirectUrl;
          return;
        } catch (paymentErr: any) {
          toast.dismiss(toastId);
          throw new Error(paymentErr.message || "Failed to initiate payment gateway.");
        }
      }

      toast.success(t("تم استلام طلبك!", "Order placed!"));
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("checkout_form");
        sessionStorage.removeItem("checkout_method");
        sessionStorage.removeItem("checkout_fulfillment");
        sessionStorage.removeItem("checkout_branchId");
        sessionStorage.removeItem("checkout_digitalChannel");
        sessionStorage.removeItem("checkout_digitalContact");
      }
      clearCart();
      await navigate({
        to: "/$slug/thank-you/$orderId",
        params: { slug: brand.slug, orderId: String(orderId ?? "") },
        search: { fulfillment, channel: fulfillment === "digital" ? digitalChannel : "email" },
      });
    } catch (e: any) {
      const failure = placeOrderFailure(String(e?.message ?? e), t);
      if (failure.clearPromo) setAppliedPromo(null);
      toast.error(failure.message);
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, submit };
}
