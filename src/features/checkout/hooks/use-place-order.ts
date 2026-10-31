import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { uploadBenefitReceipt } from "@/lib/benefit-receipt";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { redeemLoyaltyForOrder } from "@/lib/loyalty-checkout.functions";
import { redeemGiftCardAtCheckout } from "@/lib/gift-card-checkout.functions";
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
import { placeStorefrontOrder, recordOrderWhatsappOptIn } from "@/lib/data/checkout";
import { bookingOfCart } from "@/lib/bookings/cart";
import { confirmationFromCart, confirmationSearch } from "@/lib/bookings/confirmation";

/**
 * Place order: validate, place the order once (a retried card payment reuses
 * the order), redeem and award loyalty points, mark the recovered cart, then
 * go to the card gateway or the thank-you page.
 */
export function usePlaceOrder({
  brand,
  session,
  cart,
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
  partnerId = "",
  digitalChannel,
  digitalContact,
  appliedPromo,
  setAppliedPromo,
  customerId,
  effectiveRedeemedPoints,
  cartSessionId,
  paymentErrorState,
  payInFull = false,
  requestedTime = null,
  giftCardCode = null,
  giftCardCoversNow = false,
}: {
  brand: Pick<Storefront["brand"], "id" | "slug">;
  session: Storefront["session"];
  cart: Storefront["cart"];
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
  /** A partner's shop to collect at, instead of a branch. */
  partnerId?: string;
  digitalChannel: "email" | "whatsapp";
  digitalContact: string;
  appliedPromo: AppliedPromo | null;
  setAppliedPromo: (promo: AppliedPromo | null) => void;
  customerId: string | null;
  effectiveRedeemedPoints: number;
  cartSessionId: string;
  paymentErrorState: { status: string; orderId: string } | null;
  /** The shopper chose to pay the whole total now instead of only the advance. */
  payInFull?: boolean;
  /**
   * The day and time picked, when the store's delivery schedule applies (`useDeliveryTime`); its
   * `missing` says what is still to pick before the order can be placed.
   */
  requestedTime?: { date: string | null; slot: string | null; missing: string | null } | null;
  /** A gift card the shopper applied (`useCheckoutGiftCard`): it pays once the order is placed. */
  giftCardCode?: string | null;
  /** The card pays all that would be asked now: no transfer receipt is asked for. */
  giftCardCoversNow?: boolean;
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
      partnerId,
      digitalChannel,
      digitalContact,
      appointment: Boolean(bookingOfCart(cart)),
      receiptRequired: !giftCardCoversNow,
      t,
    });
    if (formError) {
      toast.error(formError);
      return;
    }
    if (requestedTime?.missing) {
      toast.error(requestedTime.missing);
      return;
    }
    const customerEmail = form.email.trim();
    setSubmitting(true);
    try {
      let orderId = paymentErrorState?.orderId;
      let confirmationToken = null;
      let giftCoveredAll = false;

      if (method === "card" && paymentErrorState?.orderId) {
        orderId = paymentErrorState.orderId;
      } else {
        const benefitReceiptId =
          method === "benefit" && benefitReceipt
            ? await uploadBenefitReceipt(brand.id, benefitReceipt)
            : null;
        const placed = await placeStorefrontOrder(
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
            partnerId,
            digitalChannel,
            digitalContact,
            appliedPromo,
            benefitReceiptId,
            shipping,
            lang,
            idempotencyKey,
            payInFull,
            requestedTime,
          }),
          bookingOfCart(cart),
        );
        orderId = placed.orderId;
        confirmationToken = placed.confirmationToken;
        if (whatsappOrderUpdates && orderId && confirmationToken) {
          const recorded = await recordOrderWhatsappOptIn(orderId, confirmationToken);
          if (!recorded) {
            console.warn("[checkout] WhatsApp order-update consent could not be recorded");
          }
        }

        // 1. Loyalty redemption: the server takes the points and lowers the order's own total
        // before any payment is asked for. If it cannot, the shopper is told, because the order
        // then costs what it did before the points.
        if (effectiveRedeemedPoints > 0 && customerId && orderId && session) {
          const notApplied = () =>
            toast.warning(
              t(
                "تعذّر تطبيق خصم النقاط، وإجمالي الطلب بدونه.",
                "Your points could not be applied: the order total does not include the points discount.",
              ),
            );
          try {
            const redeemed = await redeemLoyaltyForOrder({
              data: { orderId: String(orderId), points: effectiveRedeemedPoints },
            });
            if (!redeemed.applied) notApplied();
          } catch (ptsErr) {
            console.warn("Points redemption error:", ptsErr);
            notApplied();
          }
        }

        // 2. Gift card: after the points (which lower the total), before any other payment. The
        // database takes at most its balance and what is owed; the card charge and the transfer
        // approval then ask only for what it leaves. If it cannot, the shopper is told: the
        // order then costs what it shows without the card.
        if (giftCardCode && orderId && confirmationToken) {
          const notTaken = () =>
            toast.warning(
              t(
                "تعذّر استخدام بطاقة الهدية، والطلب يُدفع بدونها.",
                "The gift card could not be used: the order is paid without it.",
              ),
            );
          try {
            const taken = await redeemGiftCardAtCheckout({
              data: {
                orderId: String(orderId),
                brandId: brand.id,
                confirmationToken: String(confirmationToken),
                code: giftCardCode,
              },
            });
            if (!taken.applied) notTaken();
            else giftCoveredAll = taken.owed <= 0;
          } catch (giftErr) {
            console.warn("Gift card redemption error:", giftErr);
            notTaken();
          }
        }

        // The order's points are the database's: it gives them when the order is completed or
        // paid, whoever placed it, and takes them back if it is undone (migration 20261014110000).

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
      // If they chose to pay via Card, redirect to payment gateway (unless a gift card paid it all)
      if (method === "card" && !giftCoveredAll) {
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
            const errData = await chargeRes.json<{ error?: string; code?: string }>();
            // A gift card paid all the charge would have asked for (the advance or the deposit):
            // nothing goes to the gateway, and the order is placed.
            if (!(chargeRes.status === 409 && errData.code === "ORDER_ALREADY_PAID")) {
              throw new Error(errData.error || "Failed to initiate card payment.");
            }
            toast.dismiss(toastId);
          } else {
            const { redirectUrl } = await chargeRes.json<{ redirectUrl: string }>();
            toast.dismiss(toastId);
            window.location.href = redirectUrl;
            return;
          }
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
      // The appointment goes to the thank-you page with the order (the cart empties first).
      const cartBooking = bookingOfCart(cart);
      clearCart();
      await navigate({
        to: "/$slug/thank-you/$orderId",
        params: { slug: brand.slug, orderId: String(orderId ?? "") },
        search: {
          fulfillment,
          channel: fulfillment === "digital" ? digitalChannel : "email",
          ...(cartBooking ? confirmationSearch(confirmationFromCart(cartBooking)) : {}),
          ...(requestedTime?.date
            ? {
                for: requestedTime.date,
                ...(requestedTime.slot ? { slot: requestedTime.slot } : {}),
              }
            : {}),
        },
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
