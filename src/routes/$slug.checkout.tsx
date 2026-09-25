import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { User } from "lucide-react";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { isCatalogMode } from "@/lib/storefront-mode";
import { calculateShippingFee } from "@/lib/shipping";
import { usePaymentReturnError } from "@/features/checkout/hooks/use-payment-return-error";
import { useCheckoutForm } from "@/features/checkout/hooks/use-checkout-form";
import { useCustomerPrefill } from "@/features/checkout/hooks/use-customer-prefill";
import { useRegisteredAccountCheck } from "@/features/checkout/hooks/use-registered-account-check";
import { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import { usePickupAndDigital } from "@/features/checkout/hooks/use-pickup-and-digital";
import { usePromoCode } from "@/features/checkout/hooks/use-promo-code";
import { useAbandonedCart } from "@/features/checkout/hooks/use-abandoned-cart";
import { useCheckoutLoyalty } from "@/features/checkout/hooks/use-checkout-loyalty";
import { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";
import { PaymentFailedCard } from "@/features/checkout/components/PaymentFailedCard";
import { CustomerDetailsCard } from "@/features/checkout/components/CustomerDetailsCard";
import { FulfillmentMethodCard } from "@/features/checkout/components/FulfillmentMethodCard";
import { PickupBranchCard } from "@/features/checkout/components/PickupBranchCard";
import { DigitalDeliveryCard } from "@/features/checkout/components/DigitalDeliveryCard";
import { DeliveryAddressCard } from "@/features/checkout/components/DeliveryAddressCard";
import { PaymentMethodCard } from "@/features/checkout/components/PaymentMethodCard";
import { OrderSummaryCard } from "@/features/checkout/components/OrderSummaryCard";
import { MobileCheckoutBar } from "@/features/checkout/components/MobileCheckoutBar";
import { AccountExistsDialog } from "@/features/checkout/components/AccountExistsDialog";

export const Route = createFileRoute("/$slug/checkout")({
  component: Checkout,
});

function Checkout() {
  const { brand, settings, cart, cartTotal, currency, lang, t, clearCart, addToCart, session } =
    useStorefront();
  const navigate = useNavigate();

  useEffect(() => {
    if (isCatalogMode(settings)) {
      void navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
    }
  }, [brand.slug, navigate, settings]);

  const [shareOpen, setShareOpen] = useState(false);
  const { paymentErrorState, mounted } = usePaymentReturnError(t);

  const [marketingConsent, setMarketingConsent] = useState<boolean>(true);

  const {
    form,
    setForm,
    isGift,
    setIsGift,
    giftRecipient,
    setGiftRecipient,
    giftMessage,
    setGiftMessage,
  } = useCheckoutForm();
  const {
    customerId,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    handleAddressChange,
  } = useCustomerPrefill({ brand, session, setForm });
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [whatsappOrderUpdates, setWhatsappOrderUpdates] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const {
    showAccountPopup,
    setShowAccountPopup,
    setIgnoredAccountWarning,
    checkRegisteredAccount,
  } = useRegisteredAccountCheck({ brand, session });

  const {
    fulfillmentOptions,
    fulfillment,
    setFulfillment,
    selectedDestination,
    setSelectedDestination,
    zones,
    selectedCountryCode,
    setSelectedCountryCode,
    selectedZone,
    availableMethods,
    method,
    setMethod,
    estimatedDeliveryText,
  } = useCheckoutFulfillment({ settings, lang });

  const {
    branches,
    branchId,
    setBranchId,
    digitalChannel,
    setDigitalChannel,
    digitalContact,
    setDigitalContact,
    branchLabel,
    branchLoc,
  } = usePickupAndDigital({ brand, settings, lang });

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("checkout_form", JSON.stringify(form));
      sessionStorage.setItem("checkout_method", method);
      sessionStorage.setItem("checkout_fulfillment", fulfillment);
      sessionStorage.setItem("checkout_branchId", branchId);
      sessionStorage.setItem("checkout_digitalChannel", digitalChannel);
      sessionStorage.setItem("checkout_digitalContact", digitalContact);
    }
  }, [form, method, fulfillment, branchId, digitalChannel, digitalContact]);
  const { promoInput, setPromoInput, appliedPromo, setAppliedPromo, checkingPromo, applyPromo } =
    usePromoCode({ brand, cart, cartTotal, currency, lang, t });
  const [benefitReceipt, setBenefitReceipt] = useState<File | null>(null);

  // Total quantity of items in cart for per-piece / bundle shipping formula
  const totalCartQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.qty || 1), 0);
  }, [cart]);

  const shipping = useMemo(() => {
    if (fulfillment !== "delivery") return 0;
    return calculateShippingFee(
      selectedZone,
      totalCartQuantity,
      Number(settings.delivery_fee || 0),
    );
  }, [fulfillment, selectedZone, totalCartQuantity, settings.delivery_fee]);

  const { cartSessionId } = useAbandonedCart({
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
  });

  const promoDiscount = Math.min(appliedPromo?.amount ?? 0, cartTotal);

  const {
    loyaltyAccount,
    loyaltyProgram,
    pointsToRedeemInput,
    setPointsToRedeemInput,
    redeemedPoints,
    effectiveRedeemedPoints,
    loyaltyDiscount,
    estimatedPointsToEarn,
    handleApplyPoints,
    handleRemovePoints,
  } = useCheckoutLoyalty({ brand, customerId, cartTotal, promoDiscount, currency, lang });

  const grandTotal = Math.max(0, cartTotal - promoDiscount - loyaltyDiscount) + shipping;

  useEffect(() => {
    if (!cart.length) return;
    trackStorefrontEvent(
      "begin_checkout",
      {
        currency,
        value: Number(cartTotal.toFixed(3)),
        items: cart.map((item) => ({
          item_id: item.product_id,
          item_name: item.name,
          price: item.price,
          quantity: item.qty,
        })),
      },
      cart.map((item) => `${item.cart_line_id}:${item.qty}`).join("|"),
    );
  }, [cart, cartTotal, currency]);

  const { submitting, submit } = usePlaceOrder({
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
  });

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <OsEmptyState
          icon={ShoppingBag}
          title={t("السلة فارغة", "Your cart is empty")}
          description={t(
            "يبدو أنك لم تضف أي منتجات إلى سلتك بعد.",
            "Looks like you haven't added any items to your cart yet.",
          )}
          action={
            <Button variant="default" asChild>
              <Link to="/$slug" params={{ slug: brand.slug }}>
                {t("تصفح المنتجات", "Browse products")}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (isCatalogMode(settings)) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-8 pb-28 md:py-8 grid md:grid-cols-[1fr_360px] gap-6">
      <h1 className="sr-only">{t("إتمام الطلب", "Checkout")}</h1>
      <div className="space-y-4">
        {paymentErrorState && (
          <PaymentFailedCard setMethod={setMethod} submit={submit} submitting={submitting} t={t} />
        )}
        {!session && (
          <Card className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-primary/30 bg-primary/5">
            <div className="flex min-w-0 items-center gap-3">
              <User className="h-5 w-5 shrink-0" />
              <p className="text-sm min-w-0 break-words">
                {t(
                  "لديك حساب؟ سجّل الدخول لملء البيانات تلقائيًا.",
                  "Have an account? Sign in to prefill your details.",
                )}
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link
                to="/$slug/auth"
                params={{ slug: brand.slug }}
                search={{ redirect: mounted ? window.location.pathname : "" }}
              >
                {t("سجّل الدخول", "Sign in")}
              </Link>
            </Button>
          </Card>
        )}

        <CustomerDetailsCard
          brand={brand}
          checkRegisteredAccount={checkRegisteredAccount}
          form={form}
          fulfillment={fulfillment}
          giftMessage={giftMessage}
          giftRecipient={giftRecipient}
          isGift={isGift}
          saveToProfile={saveToProfile}
          session={session}
          setForm={setForm}
          setGiftMessage={setGiftMessage}
          setGiftRecipient={setGiftRecipient}
          setIsGift={setIsGift}
          setSaveToProfile={setSaveToProfile}
          setWhatsappOrderUpdates={setWhatsappOrderUpdates}
          t={t}
          whatsappOrderUpdates={whatsappOrderUpdates}
        />

        {fulfillmentOptions.length > 0 && (
          <FulfillmentMethodCard
            currency={currency}
            estimatedDeliveryText={estimatedDeliveryText}
            fulfillment={fulfillment}
            fulfillmentOptions={fulfillmentOptions}
            lang={lang}
            setFulfillment={setFulfillment}
            settings={settings}
            t={t}
          />
        )}

        {fulfillment === "pickup" && (
          <PickupBranchCard
            branchId={branchId}
            branchLabel={branchLabel}
            branchLoc={branchLoc}
            branches={branches}
            lang={lang}
            setBranchId={setBranchId}
            t={t}
          />
        )}

        {fulfillment === "digital" && (
          <DigitalDeliveryCard
            digitalChannel={digitalChannel}
            digitalContact={digitalContact}
            setDigitalChannel={setDigitalChannel}
            setDigitalContact={setDigitalContact}
            t={t}
          />
        )}

        {fulfillment === "delivery" && (
          <DeliveryAddressCard
            currency={currency}
            form={form}
            handleAddressChange={handleAddressChange}
            lang={lang}
            savedAddresses={savedAddresses}
            selectedAddressId={selectedAddressId}
            selectedCountryCode={selectedCountryCode}
            selectedDestination={selectedDestination}
            selectedZone={selectedZone}
            setForm={setForm}
            setSelectedAddressId={setSelectedAddressId}
            setSelectedCountryCode={setSelectedCountryCode}
            setSelectedDestination={setSelectedDestination}
            settings={settings}
            t={t}
            totalCartQuantity={totalCartQuantity}
            zones={zones}
          />
        )}

        <PaymentMethodCard
          availableMethods={availableMethods}
          benefitReceipt={benefitReceipt}
          brand={brand}
          fulfillment={fulfillment}
          lang={lang}
          method={method}
          selectedDestination={selectedDestination}
          setBenefitReceipt={setBenefitReceipt}
          setMethod={setMethod}
          settings={settings}
          t={t}
        />
      </div>

      <div>
        <OrderSummaryCard
          acceptedTerms={acceptedTerms}
          appliedPromo={appliedPromo}
          applyPromo={applyPromo}
          availableMethods={availableMethods}
          benefitReceipt={benefitReceipt}
          brand={brand}
          cart={cart}
          cartTotal={cartTotal}
          checkingPromo={checkingPromo}
          currency={currency}
          estimatedDeliveryText={estimatedDeliveryText}
          estimatedPointsToEarn={estimatedPointsToEarn}
          fulfillment={fulfillment}
          fulfillmentOptions={fulfillmentOptions}
          grandTotal={grandTotal}
          handleApplyPoints={handleApplyPoints}
          handleRemovePoints={handleRemovePoints}
          lang={lang}
          loyaltyAccount={loyaltyAccount}
          loyaltyDiscount={loyaltyDiscount}
          loyaltyProgram={loyaltyProgram}
          marketingConsent={marketingConsent}
          method={method}
          pointsToRedeemInput={pointsToRedeemInput}
          promoDiscount={promoDiscount}
          promoInput={promoInput}
          redeemedPoints={redeemedPoints}
          setAcceptedTerms={setAcceptedTerms}
          setAppliedPromo={setAppliedPromo}
          setMarketingConsent={setMarketingConsent}
          setPointsToRedeemInput={setPointsToRedeemInput}
          setPromoInput={setPromoInput}
          setShareOpen={setShareOpen}
          shareOpen={shareOpen}
          shipping={shipping}
          submit={submit}
          submitting={submitting}
          t={t}
        />
      </div>

      <MobileCheckoutBar
        acceptedTerms={acceptedTerms}
        availableMethods={availableMethods}
        benefitReceipt={benefitReceipt}
        currency={currency}
        fulfillmentOptions={fulfillmentOptions}
        grandTotal={grandTotal}
        lang={lang}
        method={method}
        submit={submit}
        submitting={submitting}
        t={t}
      />

      <AccountExistsDialog
        brand={brand}
        lang={lang}
        mounted={mounted}
        setIgnoredAccountWarning={setIgnoredAccountWarning}
        setShowAccountPopup={setShowAccountPopup}
        showAccountPopup={showAccountPopup}
        t={t}
      />
    </div>
  );
}
