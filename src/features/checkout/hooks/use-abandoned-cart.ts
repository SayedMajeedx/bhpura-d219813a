import { useEffect, useState } from "react";
import { toast } from "sonner";
import { restoreAbandonedCart, syncStorefrontCartActivity } from "@/lib/abandoned-carts.functions";
import { getOrCreateCartSessionId } from "@/lib/abandoned-cart-session";
import type { CheckoutForm, SetCheckoutForm, Storefront } from "@/features/checkout/types";

/**
 * Abandoned-cart recovery: ?recover=TOKEN refills the cart (and ?coupon the
 * promo box), and the cart plus contact details are synced 1.5s after each
 * change so an unfinished checkout can be followed up.
 */
export function useAbandonedCart({
  brand,
  cart,
  cartTotal,
  currency,
  lang,
  clearCart,
  addToCart,
  customerId,
  form,
  setForm,
  setPromoInput,
  marketingConsent,
}: {
  brand: Pick<Storefront["brand"], "id" | "slug">;
  cart: Storefront["cart"];
  cartTotal: number;
  currency: string;
  lang: Storefront["lang"];
  clearCart: Storefront["clearCart"];
  addToCart: Storefront["addToCart"];
  customerId: string | null;
  form: CheckoutForm;
  setForm: SetCheckoutForm;
  setPromoInput: (value: string) => void;
  marketingConsent: boolean;
}) {
  const [cartSessionId] = useState<string>(() => getOrCreateCartSessionId(brand.id));
  // 2. Restore Abandoned Cart if ?recover=TOKEN in URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const recoverToken = params.get("recover");
    const couponParam = params.get("coupon");

    if (recoverToken) {
      (async () => {
        try {
          const res = await restoreAbandonedCart({
            brandSlug: brand.slug,
            recoveryToken: recoverToken,
          });
          if (res?.success && Array.isArray(res.items)) {
            clearCart();
            for (const item of res.items) {
              addToCart({
                cart_line_id: item.cart_line_id || crypto.randomUUID(),
                variant_id: item.variant_id ?? null,
                product_id: item.product_id,
                name: item.title || item.name || "Product",
                image: item.image_url || item.image || null,
                price: Number(item.price || item.unit_price || 0),
                size: item.size || null,
                color: item.color || null,
                fabric: item.fabric || null,
                qty: Number(item.qty || item.quantity || 1),
                max_stock: Number(item.stock_available || 999),
                custom_fields: Array.isArray(item.custom_fields) ? item.custom_fields : undefined,
              });
            }
            toast.success(
              lang === "ar"
                ? "تمت استعادة محتويات سلتك بنجاح!"
                : "Your abandoned cart has been restored!",
            );
            if (res.guest_name || res.guest_phone || res.guest_email) {
              setForm((prev) => ({
                ...prev,
                name: prev.name || res.guest_name || "",
                phone: prev.phone || res.guest_phone || "",
                email: prev.email || res.guest_email || "",
              }));
            }
            if (couponParam) {
              setPromoInput(couponParam.toUpperCase());
            }
          }
        } catch (e) {
          console.error("Cart restore error:", e);
        }
      })();
    }
  }, [addToCart, brand.slug, clearCart, lang, setForm, setPromoInput]);

  // 3. Debounced Sync of Active Cart Activity
  useEffect(() => {
    const timer = setTimeout(() => {
      syncStorefrontCartActivity({
        brandId: brand.id,
        sessionId: cartSessionId,
        customerId: customerId,
        guestEmail: form.email || undefined,
        guestPhone: form.phone || undefined,
        guestName: form.name || undefined,
        cartItems: cart.map((item) => ({
          cart_line_id: item.cart_line_id,
          product_id: item.product_id,
          variant_id: item.variant_id ?? null,
          name: item.name,
          title: item.name,
          image: item.image,
          image_url: item.image ?? null,
          qty: item.qty,
          quantity: item.qty,
          price: item.price,
          unit_price: item.price,
          line_total: Number((item.price * item.qty).toFixed(3)),
        })),
        subtotal: cartTotal,
        currency: currency,
        marketingConsent: marketingConsent,
      }).catch((err) => console.warn("Cart activity sync failed:", err));
    }, 1500);

    return () => clearTimeout(timer);
  }, [
    cart,
    cartTotal,
    customerId,
    form.name,
    form.phone,
    form.email,
    marketingConsent,
    brand.id,
    cartSessionId,
    currency,
  ]);

  return { cartSessionId };
}
