import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { storefrontQueries } from "@/lib/data/storefront";
import { advanceRulesQueries } from "@/lib/data/advance-rules";
import { ruleDefFromRow } from "@/lib/payments/advance-rule-form";
import {
  advanceForOrder,
  advanceRuleFrom,
  methodsUnderAdvance,
} from "@/lib/payments/advance-payment";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { User } from "lucide-react";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { isCatalogMode } from "@/lib/storefront-mode";
import { calculateShippingFee } from "@/lib/shipping";
import { bookingOfCart } from "@/lib/bookings/cart";
import { advanceLinesOfCart } from "@/features/checkout/lib/advance-cart-lines";
import { cartEstimateKinds } from "@/lib/delivery-estimate";
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
import { BookingHoldBanner } from "@/features/storefront-booking/components/BookingHoldBanner";
import { CustomerDetailsCard } from "@/features/checkout/components/CustomerDetailsCard";
import { FulfillmentMethodCard } from "@/features/checkout/components/FulfillmentMethodCard";
import { PickupBranchCard } from "@/features/checkout/components/PickupBranchCard";
import { DigitalDeliveryCard } from "@/features/checkout/components/DigitalDeliveryCard";
import { DeliveryAddressCard } from "@/features/checkout/components/DeliveryAddressCard";
import { PaymentMethodCard } from "@/features/checkout/components/PaymentMethodCard";
import { OrderSummaryCard } from "@/features/checkout/components/OrderSummaryCard";
import { MobileCheckoutBar } from "@/features/checkout/components/MobileCheckoutBar";
import { AccountExistsDialog } from "@/features/checkout/components/AccountExistsDialog";
import { AppointmentDetailsCard } from "@/features/checkout/components/AppointmentDetailsCard";
import {
  appointmentCheckoutForm,
  appointmentFormApplied,
} from "@/features/checkout/lib/appointment-checkout";

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

  // A cart finishing a booking is a service appointment, not a delivery.
  const appointment = bookingOfCart(cart);
  // Its details came with the booking: they fill the form once and are not asked again.
  useEffect(() => {
    if (!appointment || appointmentFormApplied(form, appointment)) return;
    setForm((current) => appointmentCheckoutForm(current, appointment));
  }, [appointment, form, setForm]);
  // Which products are made to order: the advance rule reads it, and so does the delivery estimate.
  const catalog = useQuery(storefrontQueries.products(brand)).data;
  const madeToOrderIds = useMemo(
    () =>
      new Set(
        (catalog ?? [])
          .filter((p) => p.is_made_to_order || p.item_kind === "service")
          .map((p) => p.id),
      ),
    [catalog],
  );
  const estimateKinds = useMemo(
    () => cartEstimateKinds(cart, madeToOrderIds),
    [cart, madeToOrderIds],
  );
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
    availableMethods: allMethods,
    method,
    setMethod,
    estimatedDeliveryLines,
    homeEstimateLines,
  } = useCheckoutFulfillment({ settings, lang, appointment, kinds: estimateKinds });

  // A booking happens at its own place: not picked up, not delivered, not digital.
  useEffect(() => {
    if (appointment && fulfillment !== "delivery") setFulfillment("delivery");
  }, [appointment, fulfillment, setFulfillment]);

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

  const deliveryFee = useMemo(() => {
    if (fulfillment !== "delivery") return 0;
    // A booking pays the trip to its event's area (the server sets the real
    // fee from the same table), not the store's shipping settings.
    if (appointment) return Number(appointment.travelFee ?? 0);
    return calculateShippingFee(
      selectedZone,
      totalCartQuantity,
      Number(settings.delivery_fee || 0),
    );
  }, [fulfillment, appointment, selectedZone, totalCartQuantity, settings.delivery_fee]);

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
  // The booking's own offer (last minute, early bird): the order carries it too.
  const bookingDiscount = Math.min(Number(appointment?.discount ?? 0), cartTotal);

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
    freeShipping,
  } = useCheckoutLoyalty({
    brand,
    customerId,
    cartTotal,
    promoDiscount: promoDiscount + bookingDiscount,
    currency,
    lang,
  });
  // A member whose loyalty tier has free shipping pays none (so does the order).
  const shipping = freeShipping ? 0 : deliveryFee;

  const grandTotal =
    Math.max(0, cartTotal - promoDiscount - bookingDiscount - loyaltyDiscount) +
    Number(appointment?.optionsTotal ?? 0) +
    shipping;

  // The store's advance-payment rule, worked out for this cart: which lines are made to order
  // (the catalog says; a booked service always is), how the order is fulfilled and what it costs.
  const categoryById = useMemo(
    () => new Map((catalog ?? []).map((p) => [p.id, p.category ?? null])),
    [catalog],
  );
  // The store's own rules, tried before its general rule (only read while the rule is on).
  const ownRules = useQuery(
    advanceRulesQueries.public(brand.id, settings.advance_payment_enabled),
  ).data;
  const ownRuleDefs = useMemo(() => (ownRules ?? []).map(ruleDefFromRow), [ownRules]);
  // Only a signed-in customer can be asked about, and only a rule that tells new customers
  // from returning ones needs it (a guest shows as new; the database decides at placement).
  const needsCustomerKind = ownRuleDefs.some((rule) => rule.customer !== "any");
  const returning =
    useQuery(advanceRulesQueries.returning(brand.slug, needsCustomerKind && Boolean(session?.user)))
      .data === true;
  const advance = useMemo(
    () =>
      advanceForOrder(
        {
          total: grandTotal,
          shipping,
          fulfillment: appointment ? "appointment" : fulfillment,
          returning,
          // Where a delivery goes, as the order will carry it (none for a pickup or a booking).
          country:
            fulfillment === "delivery" && !appointment
              ? selectedDestination === "BH"
                ? "BH"
                : selectedCountryCode
              : null,
          lines: advanceLinesOfCart(cart, madeToOrderIds, categoryById),
        },
        advanceRuleFrom(settings, ownRuleDefs),
      ),
    [
      grandTotal,
      shipping,
      appointment,
      fulfillment,
      cart,
      madeToOrderIds,
      categoryById,
      ownRuleDefs,
      returning,
      selectedDestination,
      selectedCountryCode,
      settings,
    ],
  );
  // Where it applies, cash on delivery is not offered: the order is completed by paying the
  // advance by card or BenefitPay (the database refuses cod too).
  const availableMethods = useMemo(
    () => methodsUnderAdvance(allMethods, advance.applies),
    [allMethods, advance.applies],
  );
  useEffect(() => {
    if (advance.applies && method === "cod") setMethod(availableMethods[0]?.id ?? "");
  }, [advance.applies, method, availableMethods, setMethod]);

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
        <BookingHoldBanner />
        {paymentErrorState && (
          <PaymentFailedCard setMethod={setMethod} submit={submit} submitting={submitting} t={t} />
        )}
        {!session && !appointment && (
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

        {appointment && (
          <AppointmentDetailsCard appointment={appointment} brand={brand} lang={lang} t={t} />
        )}

        {!appointment && (
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
        )}

        {!appointment && fulfillmentOptions.length > 0 && (
          <FulfillmentMethodCard
            appointment={Boolean(appointment)}
            currency={currency}
            estimatedDeliveryLines={estimatedDeliveryLines}
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

        {fulfillment === "delivery" && !appointment && (
          <DeliveryAddressCard
            appointment={Boolean(appointment)}
            currency={currency}
            form={form}
            handleAddressChange={handleAddressChange}
            homeEstimateLines={homeEstimateLines}
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
          advance={advance}
          currency={currency}
          appointment={Boolean(appointment)}
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
          estimatedDeliveryLines={estimatedDeliveryLines}
          estimatedPointsToEarn={estimatedPointsToEarn}
          fulfillment={fulfillment}
          fulfillmentOptions={fulfillmentOptions}
          advance={advance}
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
          appointment={appointment}
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
