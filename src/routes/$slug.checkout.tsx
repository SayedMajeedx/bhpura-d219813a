import { termsPageSlug } from "@/lib/cms-pages";
import { useDeliveryTime } from "@/features/checkout/hooks/use-delivery-time";
import { DeliveryTimeCard } from "@/features/checkout/components/DeliveryTimeCard";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStorefront } from "@/lib/storefront-context";
import { storefrontQueries } from "@/lib/data/storefront";
import { advanceRulesQueries } from "@/lib/data/advance-rules";
import { ruleDefFromRow } from "@/lib/payments/advance-rule-form";
import {
  PAY_IN_FULL_RULE,
  advanceForOrder,
  advanceRuleFrom,
  canPayInFull,
  methodsUnderAdvance,
} from "@/lib/payments/advance-payment";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { isCatalogMode } from "@/lib/storefront-mode";
import { calculateShippingFee } from "@/lib/shipping";
import { orderTotals, storeTaxRule } from "@/lib/order-tax";
import { bookingOfCart } from "@/lib/bookings/cart";
import { bookingDepositSplit, depositTerms, upfrontSplit } from "@/lib/bookings/deposit";
import { bookingPoliciesQueries } from "@/lib/data/booking-policies";
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
import { useCheckoutOffers } from "@/features/checkout/hooks/use-checkout-offers";
import { useOrderIntake } from "@/features/storefront-shell/hooks/use-order-intake";
import { intakeSentence, intakeTakesOrders } from "@/lib/opening-hours";
import { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";
import { checkoutQueries } from "@/lib/data/checkout";
import { PaymentFailedCard } from "@/features/checkout/components/PaymentFailedCard";
import { BookingHoldBanner } from "@/features/storefront-booking/components/BookingHoldBanner";
import { CustomerDetailsCard } from "@/features/checkout/components/CustomerDetailsCard";
import { FulfillmentMethodCard } from "@/features/checkout/components/FulfillmentMethodCard";
import { PickupBranchCard } from "@/features/checkout/components/PickupBranchCard";
import { DigitalDeliveryCard } from "@/features/checkout/components/DigitalDeliveryCard";
import { DeliveryAddressCard } from "@/features/checkout/components/DeliveryAddressCard";
import { PaymentMethodCard } from "@/features/checkout/components/PaymentMethodCard";
import { OrderSummaryCard } from "@/features/checkout/components/OrderSummaryCard";
import { MobileCartPeek } from "@/features/checkout/components/MobileCartPeek";
import { MobileCheckoutBar } from "@/features/checkout/components/MobileCheckoutBar";
import { GiftCardBox, GiftCardLines } from "@/features/checkout/components/GiftCardBox";
import { useCheckoutGiftCard } from "@/features/checkout/hooks/use-checkout-gift-card";
import { advanceAfterGiftCard, giftCardPay } from "@/features/checkout/lib/gift-card-pay";
import { AccountExistsDialog } from "@/features/checkout/components/AccountExistsDialog";
import { AppointmentDetailsCard } from "@/features/checkout/components/AppointmentDetailsCard";
import {
  appointmentCheckoutForm,
  appointmentFormApplied,
} from "@/features/checkout/lib/appointment-checkout";
import { bookingWithCode } from "@/lib/bookings/booking-offer";

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

  // Marketing (offers, cart reminders) is the shopper's to opt into: the box starts unticked.
  const [marketingConsent, setMarketingConsent] = useState<boolean>(false);

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
  // Offered only by a store that can really send them (its WhatsApp connection is on).
  const whatsappUpdatesReady =
    useQuery(checkoutQueries.whatsappUpdatesReady(brand.id)).data === true;
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
    pickupPartners,
    partnerId,
    setPartnerId,
  } = usePickupAndDigital({ brand, settings, lang, cart, madeToOrderIds });

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
  const {
    promoInput,
    setPromoInput,
    appliedPromo,
    setAppliedPromo,
    checkingPromo,
    applyPromo,
    refusals: promoRefusals,
  } = usePromoCode({ brand, cart, cartTotal, currency, lang, t });
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

  // The store's automatic offers, as the order builder applies them: an offer that saves more
  // than the code replaces it (or the store's own combining rule), and free delivery.
  const offers = useCheckoutOffers({
    brand,
    cart,
    appliedPromo,
    fulfillment,
    country: selectedDestination === "BH" ? "BH" : selectedCountryCode,
    enabled: !appointment && !isCatalogMode(settings),
  });
  // Whether the store takes the order now: busy, or closed by its hours (a booking only waits
  // for a pause, never for the hours). The database refuses the same.
  const orderStatus = useOrderIntake();
  const intakeNote = orderStatus
    ? intakeSentence(orderStatus.intake, settings.opening_hours, orderStatus.now, lang)
    : null;
  const closedToOrders = orderStatus
    ? appointment
      ? orderStatus.intake.state === "paused"
      : !intakeTakesOrders(orderStatus.intake)
    : false;
  // A booking's discount and a typed code, as place_booking_order settles them: a booking offer
  // adds to the code, a store's automatic offer meets it by the store's rule (bookingWithCode).
  const withBooking = bookingWithCode({
    booking: Math.min(Number(appointment?.discount ?? 0), cartTotal),
    fromStoreOffer: Boolean(appointment?.discountFromOffer),
    code: Math.min(appliedPromo?.amount ?? 0, cartTotal),
    mode: appointment?.offersCombine,
  });
  const promoDiscount = Math.min(
    offers ? offers.code_discount : appointment ? withBooking.code : (appliedPromo?.amount ?? 0),
    cartTotal,
  );
  const offerDiscount = Math.min(
    offers?.offer_discount ?? 0,
    Math.max(cartTotal - promoDiscount, 0),
  );
  // The booking's offer (last minute, early bird, or the store's): the order carries it too.
  const bookingDiscount = withBooking.booking;

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
    promoDiscount: promoDiscount + offerDiscount + bookingDiscount,
    currency,
    lang,
  });
  // A member whose loyalty tier has free shipping pays none (so does the order).
  const shipping = freeShipping || offers?.free_delivery ? 0 : deliveryFee;

  // What the order will charge, tax included (the order builder's own rule: orderTotals).
  const taxRule = storeTaxRule(settings);
  const totals = orderTotals(
    {
      subtotal: cartTotal + Number(appointment?.optionsTotal ?? 0),
      discount: promoDiscount + offerDiscount + bookingDiscount,
      shipping,
      loyaltyDiscount,
    },
    taxRule,
  );
  const grandTotal = totals.total;

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
  const advanceOrder = useMemo(
    () => ({
      total: grandTotal,
      shipping,
      fulfillment: appointment ? ("appointment" as const) : fulfillment,
      returning,
      // Where a delivery goes, as the order will carry it (none for a pickup or a booking).
      country:
        fulfillment === "delivery" && !appointment
          ? selectedDestination === "BH"
            ? "BH"
            : selectedCountryCode
          : null,
      lines: advanceLinesOfCart(cart, madeToOrderIds, categoryById),
    }),
    [
      grandTotal,
      shipping,
      appointment,
      fulfillment,
      cart,
      madeToOrderIds,
      categoryById,
      returning,
      selectedDestination,
      selectedCountryCode,
    ],
  );
  const advanceBase = useMemo(
    () => advanceForOrder(advanceOrder, advanceRuleFrom(settings, ownRuleDefs)),
    [advanceOrder, ownRuleDefs, settings],
  );
  // The shopper may pay the whole total now instead of the advance, when the store allows it.
  const advanceFull = useMemo(
    () => advanceForOrder(advanceOrder, PAY_IN_FULL_RULE),
    [advanceOrder],
  );
  const [payInFullChoice, setPayInFullChoice] = useState(false);
  const fullOffered = canPayInFull(
    advanceBase,
    settings.advance_allow_full_payment,
    Boolean(appointment),
  );
  const payInFull = fullOffered && payInFullChoice;
  // A booking no advance rule reaches pays its own deposit by card or BenefitPay, the rest by the
  // store's booking terms (the database writes the same amount: place_booking_order).
  const bookingPolicy = useQuery({
    ...bookingPoliciesQueries.policy(brand.id),
    enabled: Boolean(appointment),
  }).data;
  const depositSplit = appointment
    ? bookingDepositSplit(
        grandTotal,
        depositTerms({ deposit_percent: appointment.depositPercent }, settings, bookingPolicy),
      )
    : null;
  const advance = upfrontSplit(payInFull ? advanceFull : advanceBase, depositSplit);
  // Where it applies, cash on delivery is not offered: the order is completed by paying the
  // advance or the booking's deposit by card or BenefitPay (the database refuses cod too).
  const availableMethods = useMemo(
    () => methodsUnderAdvance(allMethods, advance.applies),
    [allMethods, advance.applies],
  );
  useEffect(() => {
    if (advance.applies && method === "cod") setMethod(availableMethods[0]?.id ?? "");
  }, [advance.applies, method, availableMethods, setMethod]);

  // A gift card is a payment: the total stays, the card pays toward what is asked now first.
  const giftCard = useCheckoutGiftCard(brand, currency);
  const giftPay = giftCardPay(giftCard.card, grandTotal, advance, method);

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

  // The day and time the shopper wants it, by the store's delivery schedule.
  const deliveryTime = useDeliveryTime({
    schedule: settings?.delivery_schedule,
    fulfillment,
    appointment: Boolean(appointment),
    t,
  });

  const { submitting, submit } = usePlaceOrder({
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
    partnerId,
    digitalChannel,
    digitalContact,
    appliedPromo,
    setAppliedPromo,
    customerId,
    effectiveRedeemedPoints,
    cartSessionId,
    paymentErrorState,
    payInFull,
    requestedTime: deliveryTime.requested,
    giftCardCode: giftPay ? giftCard.card?.code : null,
    giftCardCoversNow: Boolean(giftPay?.coversNow),
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
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-8 pb-28 md:py-8 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px] gap-6">
      <div className="space-y-4">
        {/* The page says what it is, and a shopper with an account can bring their details in
            one tap, in a line under it rather than a card above the form. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="font-display text-2xl sm:text-3xl">
            {appointment ? t("تأكيد الحجز", "Confirm your booking") : t("إتمام الطلب", "Checkout")}
          </h1>
          {!session && !appointment && (
            <p className="text-sm text-muted-foreground">
              {t("لديك حساب؟", "Have an account?")}{" "}
              <Link
                to="/$slug/auth"
                params={{ slug: brand.slug }}
                search={{ redirect: mounted ? window.location.pathname : "" }}
                className="font-semibold text-foreground underline underline-offset-4"
              >
                {t("سجّل الدخول لملء بياناتك", "Sign in to fill in your details")}
              </Link>
            </p>
          )}
        </div>
        <BookingHoldBanner />
        {/* On a phone the summary falls to the foot of the form: what is being bought shows first. */}
        {!appointment && (
          <MobileCartPeek
            cart={cart}
            grandTotal={grandTotal}
            currency={currency}
            lang={lang}
            t={t}
          />
        )}
        {paymentErrorState && (
          <PaymentFailedCard setMethod={setMethod} submit={submit} submitting={submitting} t={t} />
        )}

        {appointment && (
          <AppointmentDetailsCard appointment={appointment} brand={brand} lang={lang} t={t} />
        )}

        {!appointment && (
          <CustomerDetailsCard
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
            whatsappUpdatesReady={whatsappUpdatesReady}
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
            pickupPartners={pickupPartners}
            partnerId={partnerId}
            setPartnerId={setPartnerId}
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

        <DeliveryTimeCard time={deliveryTime} fulfillment={fulfillment} lang={lang} t={t} />

        <PaymentMethodCard
          availableMethods={availableMethods}
          benefitReceipt={benefitReceipt}
          brand={brand}
          fulfillment={fulfillment}
          advance={advance}
          fullChoice={
            fullOffered
              ? {
                  base: advanceBase,
                  full: advanceFull,
                  payInFull,
                  onChange: setPayInFullChoice,
                }
              : null
          }
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
          termsPage={termsPageSlug(settings.pages)}
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
          advance={advanceAfterGiftCard(advance, giftPay)}
          grandTotal={grandTotal}
          giftCardBox={
            giftCard.offered || giftCard.card ? (
              <GiftCardBox giftCard={giftCard} currency={currency} lang={lang} t={t} />
            ) : null
          }
          giftCardLines={
            giftPay && giftCard.card ? (
              <GiftCardLines
                pay={giftPay}
                code={giftCard.card.code}
                method={method}
                appointment={Boolean(appointment)}
                currency={currency}
                lang={lang}
                t={t}
              />
            ) : null
          }
          receiptRequired={!giftPay?.coversNow}
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
          offers={offers}
          bookingDiscount={appointment ? bookingDiscount : null}
          bookingCodeDropped={withBooking.codeDropped}
          promoInput={promoInput}
          promoRefusals={promoRefusals}
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
          tax={{ amount: totals.tax, added: totals.added, rate: taxRule.rate }}
          submit={submit}
          submitting={submitting}
          closedToOrders={closedToOrders}
          intakeNote={appointment && orderStatus?.intake.state === "closed" ? null : intakeNote}
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
        closedToOrders={closedToOrders}
        receiptRequired={!giftPay?.coversNow}
        leftToPay={giftPay ? giftPay.left : null}
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
