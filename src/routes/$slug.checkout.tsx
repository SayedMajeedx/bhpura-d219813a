import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { displayVariantParts } from "@/lib/variant-sku-utils";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingBag } from "lucide-react";
import { OsEmptyState } from "@/components/os/os-empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Loader2,
  CreditCard,
  Truck,
  User,
  Download,
  Mail,
  MessageCircle,
  Copy,
  CheckCircle2,
  X,
  UploadCloud,
  Coins,
  Sparkles,
  Share2,
  Gift,
} from "lucide-react";
import { ShareCartModal } from "@/components/storefront/ShareCartModal";
import { trackStorefrontEvent } from "@/lib/storefront-analytics";
import { ResponsiveImage } from "@/components/responsive-media";
import { Checkbox } from "@/components/ui/checkbox";
import { isCatalogMode } from "@/lib/storefront-mode";
import { formatCustomFieldsList } from "@/lib/addons/custom-fields";
import { getCountryByCode, calculateShippingFee } from "@/lib/shipping";
import { CountryFlag } from "@/components/ui/country-flag";
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
          <Card className="p-5 border-destructive bg-destructive/5 space-y-4 col-span-full">
            <div className="flex items-start gap-3">
              <X className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-destructive">
                  {t("فشلت عملية الدفع أو تم إلغاؤها", "Payment failed or cancelled")}
                </h3>
                <p className="text-sm text-destructive/90 mt-1">
                  {t(
                    "لم يتم خصم أي مبلغ وتم حفظ سلتك. يرجى المحاولة مرة أخرى أو اختيار طريقة دفع أخرى.",
                    "Payment was declined or cancelled. Your cart has been saved and no charges were made.",
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setMethod("card");
                  setTimeout(submit, 100);
                }}
                disabled={submitting}
              >
                <CreditCard className="w-4 h-4 me-2 rtl:ms-2 rtl:me-0" />
                {t("إعادة المحاولة بالبطاقة", "Retry Payment")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const el = document.getElementById("payment-methods-section");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {t("اختر طريقة دفع أخرى", "Choose Another Payment Method")}
              </Button>
            </div>
          </Card>
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

        <Card className="p-5 space-y-4">
          <h2 className="font-display text-xl">{t("بيانات العميل", "Customer details")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="checkout-name">
                {t("الاسم الكامل", "Full name")}
                <span className="text-destructive font-bold ms-1" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="checkout-name"
                name="name"
                required
                autoComplete="name"
                className="h-11"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="checkout-phone">
                {t("رقم الهاتف", "Phone")}
                {fulfillment !== "digital" && (
                  <span className="text-destructive font-bold ms-1" aria-hidden="true">
                    *
                  </span>
                )}
              </Label>
              <Input
                id="checkout-phone"
                name="phone"
                required={fulfillment !== "digital"}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                className="h-11"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                onBlur={(e) => checkRegisteredAccount("phone", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="checkout-email">
                {t("البريد الإلكتروني (اختياري)", "Email (optional)")}
              </Label>
              <Input
                id="checkout-email"
                name="email"
                type="email"
                autoComplete="email"
                className="h-11"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onBlur={(e) => checkRegisteredAccount("email", e.target.value)}
              />
            </div>
          </div>
          {/* 🎁 Gift Option Box */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <Checkbox
                checked={isGift}
                onCheckedChange={(checked) => setIsGift(checked === true)}
              />
              <Gift className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                {t("هل ترغب في إرسال هذا الطلب كهدية؟ 🎁", "Send this order as a gift? 🎁")}
              </span>
            </label>
            {isGift && (
              <div className="space-y-3 pt-2 border-t border-primary/15 animate-in fade-in-50 duration-200">
                <div>
                  <Label htmlFor="gift-recipient" className="text-xs font-medium">
                    {t("اسم المستلم (اختياري)", "Recipient Name (Optional)")}
                  </Label>
                  <Input
                    id="gift-recipient"
                    type="text"
                    placeholder={t("مثال: سارة محمد", "e.g. Sarah Mohamed")}
                    value={giftRecipient}
                    onChange={(e) => setGiftRecipient(e.target.value)}
                    className="h-9 text-xs rounded-lg mt-1 bg-background"
                  />
                </div>
                <div>
                  <Label htmlFor="gift-card-message" className="text-xs font-medium">
                    {t("رسالة كرت الإهداء", "Gift Card Message")}
                  </Label>
                  <Textarea
                    id="gift-card-message"
                    placeholder={t(
                      "اكتب كلماتك الرقيقة لطباعتها في بطاقة الإهداء الفاخرة...",
                      "Write your warm message to print on our luxury gift card...",
                    )}
                    value={giftMessage}
                    onChange={(e) => setGiftMessage(e.target.value)}
                    className="min-h-[70px] text-xs rounded-lg mt-1 bg-background resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="checkout-notes">{t("ملاحظات", "Notes")}</Label>
            <Textarea
              id="checkout-notes"
              name="notes"
              className="min-h-[90px] rounded-xl shadow-2xs resize-y"
              placeholder={t(
                "أي ملاحظات خاصة بالطلب أو التوصيل...",
                "Any special instructions for order or delivery...",
              )}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {session?.user && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
              <Checkbox
                className="mt-0.5"
                checked={saveToProfile}
                onCheckedChange={(checked) => setSaveToProfile(checked === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t("حفظ الاسم ورقم الهاتف في ملفي", "Save name and phone to my profile")}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "لن تتغير بيانات ملفك ما لم تحدد هذا الخيار. تغيير البريد الإلكتروني يتطلب التحقق من الحساب.",
                    "Your profile stays unchanged unless selected. Email changes require account verification.",
                  )}
                </span>
              </span>
            </label>
          )}
          {brand.slug === "pura" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
              <Checkbox
                className="mt-0.5"
                checked={whatsappOrderUpdates}
                onCheckedChange={(checked) => setWhatsappOrderUpdates(checked === true)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t(
                    "أرسل لي تحديثات هذا الطلب عبر واتساب",
                    "Send me updates for this order on WhatsApp",
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t(
                    "سنستخدم رقم الهاتف أعلاه لإرسال تحديثات الطلب فقط. يمكنك إيقاف الرسائل في أي وقت.",
                    "We will use the phone number above for order updates only. You can opt out at any time.",
                  )}
                </span>
              </span>
            </label>
          )}
        </Card>

        {fulfillmentOptions.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="font-display text-xl">{t("طريقة التسليم", "Fulfillment method")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fulfillmentOptions.map((opt) => {
                const Icon = opt.icon;
                const active = fulfillment === opt.id;
                return (
                  <Button
                    key={opt.id}
                    type="button"
                    variant={active ? "outline" : "ghost"}
                    onClick={() => setFulfillment(opt.id)}
                    className={`text-start flex items-center justify-start gap-3 h-auto p-4 rounded-lg border transition-all ${
                      active ? "border-primary bg-primary/10" : ""
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-md grid place-items-center shrink-0 transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{lang === "ar" ? opt.ar : opt.en}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.fee > 0 ? formatPrice(opt.fee, currency, lang) : t("مجانًا", "Free")}
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
            {fulfillment === "delivery" && settings.delivery_estimate_enabled !== false && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 rounded-lg px-3 py-2 border border-primary/10 mt-2">
                <Truck className="h-4 w-4 text-primary shrink-0" />
                <span>
                  <strong className="text-foreground font-semibold">
                    {t("التوصيل المتوقع", "Estimated delivery")}:
                  </strong>{" "}
                  {estimatedDeliveryText}
                </span>
              </div>
            )}
          </Card>
        )}

        {fulfillment === "pickup" && (
          <Card className="p-5 space-y-3">
            <h2 className="font-display text-xl">{t("اختر الفرع", "Choose branch")}</h2>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("لا توجد فروع متاحة حاليًا.", "No branches available right now.")}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {branches.map((b) => {
                  const active = branchId === b.id;
                  return (
                    <Button
                      key={b.id}
                      type="button"
                      variant={active ? "outline" : "ghost"}
                      onClick={() => setBranchId(b.id)}
                      className={`relative text-start flex flex-col items-start justify-center h-auto p-4 rounded-xl border-2 transition-all hover:shadow-sm ${
                        active ? "border-primary bg-primary/10" : "border-border"
                      }`}
                      aria-pressed={active}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40"
                          }`}
                          aria-hidden
                        >
                          {active && (
                            <span className="h-2 w-2 rounded-full bg-primary-foreground" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{branchLabel(b)}</div>
                          {branchLoc(b) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {branchLoc(b)}
                            </div>
                          )}
                          {(lang === "ar" ? b.notes_ar : b.notes_en) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {lang === "ar" ? b.notes_ar : b.notes_en}
                            </div>
                          )}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {fulfillment === "digital" && (
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-xl">
                {t("طريقة استلام المنتج الرقمي", "Digital delivery channel")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "اختر طريقة واحدة وأدخل بيانات الاستلام المطلوبة.",
                  "Choose one channel and enter the required delivery contact.",
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["email", t("البريد الإلكتروني", "Email"), Mail],
                  ["whatsapp", t("واتساب", "WhatsApp"), MessageCircle],
                ] as const
              ).map(([channel, label, Icon]) => (
                <Button
                  key={channel}
                  type="button"
                  variant={digitalChannel === channel ? "outline" : "ghost"}
                  onClick={() => {
                    setDigitalChannel(channel);
                    setDigitalContact("");
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-3 h-auto justify-start ${
                    digitalChannel === channel ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
            <div>
              <Label htmlFor="digital-delivery-contact">
                {digitalChannel === "email"
                  ? t("البريد الإلكتروني", "Email address")
                  : t("رقم أو معرّف واتساب", "WhatsApp number or user ID")}
                <span className="text-destructive font-bold ms-1" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="digital-delivery-contact"
                name="digital-delivery-contact"
                required
                className="h-11"
                type={digitalChannel === "email" ? "email" : "text"}
                inputMode={digitalChannel === "email" ? "email" : "text"}
                autoComplete={digitalChannel === "email" ? "email" : "tel"}
                value={digitalContact}
                onChange={(e) => setDigitalContact(e.target.value)}
                placeholder={
                  digitalChannel === "email"
                    ? "name@example.com"
                    : t("مثال: +973… أو معرّف المستخدم", "e.g. +973… or user ID")
                }
              />
            </div>
          </Card>
        )}

        {fulfillment === "delivery" && (
          <Card className="p-5 space-y-4">
            <h2 className="font-display text-xl">{t("عنوان التوصيل", "Delivery address")}</h2>

            {savedAddresses.length > 0 && (
              <div className="mb-4">
                <Label htmlFor="saved-address">
                  {t("اختر من العناوين المحفوظة", "Choose from saved addresses")}
                </Label>
                <Select
                  name="saved-address"
                  value={selectedAddressId}
                  onValueChange={(v) => handleAddressChange(v)}
                >
                  <SelectTrigger id="saved-address" className="mt-1.5 h-11 w-full">
                    <SelectValue placeholder={t("اختر عنواناً", "Select an address")} />
                  </SelectTrigger>
                  <SelectContent>
                    {savedAddresses.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label || t("عنوان", "Address")} - {a.region}, {t("مجمع", "Block")}{" "}
                        {a.block}, {t("طريق", "Road")} {a.road}, {t("منزل", "House")} {a.house}
                      </SelectItem>
                    ))}
                    <SelectItem value="manual">
                      {t("إدخال يدوي / عنوان جديد", "Enter manually / New address")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Delivery Destination Options */}
            <div className="space-y-2 mb-4">
              <Label className="font-semibold text-sm mb-1.5 block">
                {t("وجهة التوصيل والشحن", "Delivery Destination")} *
              </Label>
              <div className="grid grid-cols-1 gap-2.5">
                {/* 1. Bahrain Domestic (Default) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedDestination("BH")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedDestination("BH");
                  }}
                  className={`p-3.5 sm:p-4 rounded-xl border text-sm transition-all text-start cursor-pointer hover:bg-secondary/10 flex flex-col justify-between ${
                    selectedDestination === "BH"
                      ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                      : "border-border bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Radio Circle */}
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                          selectedDestination === "BH"
                            ? "border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {selectedDestination === "BH" && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>

                      <CountryFlag
                        code="BH"
                        className="w-7 h-5 rounded-xs object-cover border border-border-subtle shadow-xs shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">
                            {t("التوصيل داخل البحرين", "Bahrain (Domestic)")}
                          </span>
                          <span className="text-xs bg-primary/20 text-primary font-bold px-2 py-0.5 rounded-full shrink-0">
                            {t("الافتراضي", "Default")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t(
                            "توصيل لكافة مناطق مملكة البحرين",
                            "Delivery across all Bahrain regions",
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-end shrink-0 ps-2">
                      <span className="font-mono font-bold text-sm text-foreground">
                        {Number(settings.delivery_fee || 0) > 0 ? (
                          formatPrice(Number(settings.delivery_fee || 0), currency, lang)
                        ) : (
                          <span className="text-emerald-600 font-bold">{t("مجانًا", "Free")}</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {settings.delivery_estimate_enabled &&
                    (settings.delivery_estimate_ar || settings.delivery_estimate_en) && (
                      <div className="mt-2.5 pt-2 border-t border-border-subtle text-xs text-muted-foreground flex items-center gap-1.5">
                        <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>
                          {lang === "ar"
                            ? settings.delivery_estimate_ar
                            : settings.delivery_estimate_en}
                        </span>
                      </div>
                    )}
                </div>

                {/* 2. International Zones */}
                {zones.map((z) => {
                  const active = z.id === selectedDestination;
                  const zoneShippingFee = calculateShippingFee(
                    z,
                    totalCartQuantity,
                    Number(settings.delivery_fee || 0),
                  );
                  const countryCodes = (z.countries || []).slice(0, 5);

                  return (
                    <div
                      key={z.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedDestination(z.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") setSelectedDestination(z.id);
                      }}
                      className={`p-3.5 sm:p-4 rounded-xl border text-sm transition-all text-start cursor-pointer hover:bg-secondary/10 flex flex-col justify-between ${
                        active
                          ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Radio Circle */}
                          <div
                            className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                              active ? "border-primary" : "border-muted-foreground/40"
                            }`}
                          >
                            {active && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>

                          <div className="flex items-center -space-x-1.5 rtl:space-x-reverse shrink-0">
                            {countryCodes.map((c) => (
                              <CountryFlag
                                key={c}
                                code={c}
                                className="w-5 h-3.5 rounded-2xs object-cover border border-background shadow-xs shrink-0"
                              />
                            ))}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-sm">
                              {lang === "ar" ? z.name_ar : z.name_en}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {z.pricing_type === "per_piece"
                                ? lang === "ar"
                                  ? `${formatPrice(z.fee, currency, lang)} لكل قطعة`
                                  : `${formatPrice(z.fee, currency, lang)}/piece`
                                : z.pricing_type === "bundle"
                                  ? lang === "ar"
                                    ? `${formatPrice(z.fee, currency, lang)} لكل ${z.bundle_size || 2} قطع`
                                    : `${formatPrice(z.fee, currency, lang)} per ${z.bundle_size || 2} pcs`
                                  : lang === "ar"
                                    ? "شحن دولي محدد"
                                    : "International shipping"}
                            </p>
                          </div>
                        </div>
                        <div className="text-end shrink-0 ps-2">
                          <span className="font-mono font-bold text-sm text-foreground">
                            {zoneShippingFee > 0 ? (
                              formatPrice(zoneShippingFee, currency, lang)
                            ) : (
                              <span className="text-emerald-600 font-bold">
                                {t("مجانًا", "Free")}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      {(z.estimate_ar || z.estimate_en) && (
                        <div className="mt-2.5 pt-2 border-t border-border-subtle text-xs text-muted-foreground flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{lang === "ar" ? z.estimate_ar : z.estimate_en}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* If an international zone is selected and has countries, show country picker */}
            {selectedZone && selectedZone.countries && selectedZone.countries.length > 0 && (
              <div className="p-3 bg-secondary/30 rounded-xl border border-border-subtle mb-2">
                <Label htmlFor="checkout-country" className="font-semibold text-sm mb-1.5 block">
                  {t("دولة الشحن والتوصيل", "Destination Country")} *
                </Label>
                <Select
                  name="destination-country"
                  value={selectedCountryCode}
                  onValueChange={(v) => setSelectedCountryCode(v)}
                >
                  <SelectTrigger id="checkout-country" className="h-11 bg-background">
                    <SelectValue placeholder={t("اختر الدولة", "Select country")} />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedZone.countries.map((cCode) => {
                      const cData = getCountryByCode(cCode);
                      return (
                        <SelectItem key={cCode} value={cCode}>
                          <div className="flex items-center gap-2">
                            <CountryFlag
                              code={cCode}
                              className="w-4 h-3 rounded-2xs object-cover border border-border-subtle shrink-0"
                            />
                            <span>
                              {lang === "ar" ? cData?.name_ar || cCode : cData?.name_en || cCode}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Address fields */}
            {selectedDestination === "BH" ? (
              // Bahrain Local Address Form
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground/80 tracking-wider flex items-center gap-2 pb-1">
                  <CountryFlag
                    code="BH"
                    className="w-4.5 h-3 rounded-xs object-cover border border-border-subtle shrink-0"
                  />
                  <span>
                    {t("تفاصيل العنوان داخل مملكة البحرين", "Address Details in Bahrain")}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="checkout-address-label">
                      {t("لقب العنوان", "Address label")}
                    </Label>
                    <Input
                      id="checkout-address-label"
                      name="address-label"
                      autoComplete="address-level3"
                      className="h-11"
                      placeholder={t("مثل: المنزل، المكتب", "e.g. Home, Work")}
                      value={form.label}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, label: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-region">{t("المنطقة", "Region")} *</Label>
                    <Select
                      name="region"
                      value={form.region}
                      onValueChange={(v) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, region: v });
                      }}
                    >
                      <SelectTrigger id="checkout-region" className="h-11">
                        <SelectValue placeholder={t("اختر المنطقة", "Select region")} />
                      </SelectTrigger>
                      <SelectContent>
                        {BAHRAIN_REGIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {lang === "ar" ? r.ar : r.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="checkout-block">{t("المجمع", "Block")} *</Label>
                    <Input
                      id="checkout-block"
                      name="block"
                      inputMode="numeric"
                      autoComplete="address-level2"
                      className="h-11"
                      placeholder={t("مثال: 428", "e.g. 428")}
                      value={form.block}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, block: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-road">{t("الطريق / الشارع", "Road / Avenue")} *</Label>
                    <Input
                      id="checkout-road"
                      name="road"
                      inputMode="numeric"
                      autoComplete="street-address"
                      className="h-11"
                      placeholder={t("مثال: 2825", "e.g. 2825")}
                      value={form.road}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, road: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-house">
                      {t("منزل / بناية", "House / Building")} *
                    </Label>
                    <Input
                      id="checkout-house"
                      name="house"
                      inputMode="numeric"
                      autoComplete="address-line1"
                      className="h-11"
                      placeholder={t("مثال: 12", "e.g. 12")}
                      value={form.house}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, house: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-flat">{t("شقة (اختياري)", "Flat (optional)")}</Label>
                    <Input
                      id="checkout-flat"
                      name="flat"
                      inputMode="numeric"
                      autoComplete="address-line2"
                      className="h-11"
                      placeholder={t("مثال: 4", "e.g. 4")}
                      value={form.flat}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, flat: e.target.value });
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              // International Address Form
              <div className="space-y-3">
                <div className="text-xs font-semibold text-foreground/80 tracking-wider flex items-center gap-2 pb-1">
                  <CountryFlag
                    code={selectedCountryCode}
                    className="w-4.5 h-3 rounded-xs object-cover border border-border-subtle shrink-0"
                  />
                  <span>
                    {t("تفاصيل عنوان الشحن الدولي إلى", "International Shipping Address to")}{" "}
                    {lang === "ar"
                      ? getCountryByCode(selectedCountryCode)?.name_ar || selectedCountryCode
                      : getCountryByCode(selectedCountryCode)?.name_en || selectedCountryCode}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="checkout-intl-city">
                      {t("المدينة / الإمارة", "City / State")} *
                    </Label>
                    <Input
                      id="checkout-intl-city"
                      name="intl-city"
                      autoComplete="address-level2"
                      className="h-11"
                      placeholder={t(
                        "مثال: الرياض، دبي، الكويت",
                        "e.g. Riyadh, Dubai, Kuwait City",
                      )}
                      value={form.region}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, region: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-intl-district">
                      {t("الحي / المنطقة", "District / Area")} *
                    </Label>
                    <Input
                      id="checkout-intl-district"
                      name="intl-district"
                      autoComplete="address-level3"
                      className="h-11"
                      placeholder={t("مثال: حي النرجس، حي الياسمين", "e.g. Al Narjis, Downtown")}
                      value={form.road}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, road: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-intl-street">
                      {t("اسم الشارع ورقم المبنى", "Street & Building")} *
                    </Label>
                    <Input
                      id="checkout-intl-street"
                      name="intl-street"
                      autoComplete="street-address"
                      className="h-11"
                      placeholder={t("مثال: طريق الملك فهد، مبنى 12", "e.g. King Fahd Rd, Bldg 12")}
                      value={form.house}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, house: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-intl-postal">
                      {t("الرمز البريدي (اختياري)", "Postal / Zip Code (optional)")}
                    </Label>
                    <Input
                      id="checkout-intl-postal"
                      name="intl-postal"
                      autoComplete="postal-code"
                      className="h-11"
                      placeholder={t("مثال: 12345", "e.g. 12345")}
                      value={form.block}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, block: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-intl-flat">
                      {t("رقم الشقة / الجناح (اختياري)", "Apt / Suite (optional)")}
                    </Label>
                    <Input
                      id="checkout-intl-flat"
                      name="intl-flat"
                      autoComplete="address-line2"
                      className="h-11"
                      placeholder={t("مثال: شقة 304", "e.g. Apt 304")}
                      value={form.flat}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, flat: e.target.value });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout-intl-label">
                      {t("لقب العنوان (اختياري)", "Address label (optional)")}
                    </Label>
                    <Input
                      id="checkout-intl-label"
                      name="intl-label"
                      className="h-11"
                      placeholder={t("مثال: المنزل، المكتب", "e.g. Home, Office")}
                      value={form.label}
                      onChange={(e) => {
                        setSelectedAddressId("manual");
                        setForm({ ...form, label: e.target.value });
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="p-5 space-y-3">
          <h2 className="font-display text-xl">{t("طريقة الدفع", "Payment method")}</h2>
          {availableMethods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t("لا توجد طرق دفع مفعّلة حالياً.", "No payment methods enabled yet.")}
            </p>
          )}
          <div className="grid gap-2">
            {availableMethods.map((m: any) => {
              const Icon = m.icon;
              const active = method === m.id;
              return (
                <Button
                  key={m.id}
                  type="button"
                  variant={active ? "outline" : "ghost"}
                  onClick={() => setMethod(m.id)}
                  className={`text-start flex items-center justify-start gap-3 p-3 rounded-lg border h-auto ${
                    active ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="font-medium">{lang === "ar" ? m.ar : m.en}</span>
                </Button>
              );
            })}
          </div>

          {fulfillment === "delivery" && selectedDestination !== "BH" && (
            <p className="text-xs text-muted-foreground pt-1">
              {t(
                "طرق الدفع المتاحة مخصصة بحسب وجهة الشحن المختارة.",
                "Available payment methods correspond to your selected shipping destination.",
              )}
            </p>
          )}

          {method === "benefit" && (
            <div className="mt-3 p-4 border rounded-lg bg-muted/40 text-center">
              <p className="text-sm mb-3">
                {t(
                  "امسح رمز الاستجابة السريعة أدناه لإتمام الدفع عن طريق البنفت، ثم اضغط تأكيد الطلب.",
                  "Scan the QR code below to complete payment via Benefit, then confirm your order.",
                )}
              </p>
              {settings.benefit_qr_url ? (
                <div className="space-y-3">
                  <ResponsiveImage
                    src={settings.benefit_qr_url}
                    alt="Benefit QR"
                    preset="thumb"
                    sizes="240px"
                    className="mx-auto max-w-[240px] rounded-lg border bg-white p-2"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={async () => {
                      try {
                        const response = await fetch(settings.benefit_qr_url!);
                        const blob = await response.blob();
                        const href = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = href;
                        a.download = `${brand.slug}-benefit-qr.png`;
                        a.click();
                        URL.revokeObjectURL(href);
                      } catch {
                        window.open(settings.benefit_qr_url!, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <Download className="me-2 h-4 w-4" />
                    {t("اضغط هنا لحفظ الباركود في الاستوديو", "Save QR Code to Gallery")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "لم يقم المتجر برفع رمز البنفت بعد.",
                    "Store hasn't uploaded a Benefit QR yet.",
                  )}
                </p>
              )}
              {settings.benefit_account_number && (
                <div className="mt-4 rounded-lg border bg-background p-3">
                  <p className="mb-2 break-all font-semibold" dir="ltr">
                    {settings.benefit_account_number}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(settings.benefit_account_number!);
                      toast.success(t("تم نسخ رقم الحساب", "Account number copied"));
                    }}
                  >
                    <Copy className="me-2 h-4 w-4" />
                    {t("نسخ رقم الحساب", "Copy Account Number")}
                  </Button>
                </div>
              )}
              <div className="mt-4 text-start">
                <Label htmlFor="benefit-receipt" className="mb-2 block font-semibold">
                  {t(
                    "يرجى إرفاق صورة إيصال التحويل لتأكيد الطلب",
                    "Please attach a screenshot of the payment receipt",
                  )}
                </Label>
                <label
                  className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background p-4 text-center hover:bg-muted/40"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) setBenefitReceipt(file);
                  }}
                >
                  <input
                    id="benefit-receipt"
                    name="benefit-receipt"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => setBenefitReceipt(e.target.files?.[0] ?? null)}
                  />
                  {benefitReceipt ? (
                    <>
                      <CheckCircle2 className="mb-2 h-7 w-7 text-emerald-600" />
                      <span className="max-w-full truncate font-medium">{benefitReceipt.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 inline-flex items-center text-xs text-destructive hover:text-destructive h-auto p-1"
                        onClick={(e) => {
                          e.preventDefault();
                          setBenefitReceipt(null);
                        }}
                      >
                        <X className="me-1 h-3 w-3" />
                        {t("إزالة", "Remove")}
                      </Button>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
                      <span>
                        {t(
                          "اسحب الصورة هنا أو اضغط للاختيار",
                          "Drop the image here or tap to choose",
                        )}
                      </span>
                      <span className="mt-1 text-xs text-muted-foreground">
                        JPG, PNG, WebP · 8 MB
                      </span>
                    </>
                  )}
                </label>
              </div>
            </div>
          )}

          {method === "card" && (
            <div className="mt-3 p-4 border rounded-lg text-sm text-center font-medium text-amber-800 border-amber-200/50 bg-amber-500/10 dark:text-amber-400 dark:border-amber-900/50 dark:bg-amber-950/10">
              {t(
                "سيتم تحويلك بشكل آمن إلى بوابة الدفع لإتمام عملية الدفع بالبطاقة فور تأكيد الطلب.",
                "You will be securely redirected to the payment gateway to complete your card payment upon placing the order.",
              )}
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card className="p-5 sticky top-20 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl">{t("ملخّص الطلب", "Order summary")}</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-lg border-border text-xs"
              onClick={() => setShareOpen(true)}
            >
              <Share2 className="h-3.5 w-3.5 text-primary" />
              <span>{t("مشاركة السلة", "Share cart")}</span>
            </Button>
          </div>
          <div className="space-y-2 max-h-72 overflow-auto">
            {cart.map((c) => (
              <div key={c.cart_line_id} className="flex justify-between gap-3 text-sm">
                <div className="flex min-w-0 flex-1 items-start gap-3 me-2">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                    {c.image ? (
                      <ResponsiveImage
                        src={c.image}
                        alt={c.name}
                        preset="thumb"
                        sizes="56px"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-1 text-center text-xs text-muted-foreground">
                        {t("لا توجد صورة", "No image")}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate">
                      {c.name} × {c.qty}
                    </div>
                    {(() => {
                      const parts = displayVariantParts(
                        {
                          size: c.size,
                          size_unit: c.size_unit,
                          color: c.color,
                          fabric: c.fabric,
                        },
                        lang,
                      );
                      return parts.length > 0 ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {parts.join(" · ")}
                        </div>
                      ) : null;
                    })()}
                    {(() => {
                      const formattedFields = formatCustomFieldsList(c.custom_fields, lang);
                      if (formattedFields.length === 0) return null;
                      return (
                        <div className="mt-2 rounded-lg bg-secondary/40 border border-border-subtle p-2 space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <span>✨</span>
                            <span>
                              {lang === "ar" ? "خيارات ومقاسات مخصصة" : "Custom Options & Sizing"}
                            </span>
                          </p>
                          <div className="grid grid-cols-1 gap-1 text-xs">
                            {formattedFields.map((field) => (
                              <div
                                key={field.key}
                                className="flex items-center justify-between gap-2 text-muted-foreground"
                              >
                                <span>{field.label}:</span>
                                {field.isUrl ? (
                                  <a
                                    href={field.value}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline font-semibold inline-flex items-center gap-0.5"
                                  >
                                    📎 {lang === "ar" ? "عرض الملف" : "View File"}
                                  </a>
                                ) : (
                                  <span className="font-medium text-foreground dir-ltr text-end">
                                    {field.value}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <span className="flex flex-col items-end">
                  <span>{formatPrice(c.price * c.qty, currency, lang)}</span>
                  {Number(c.original_price || 0) > c.price && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatPrice(Number(c.original_price) * c.qty, currency, lang)}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("المجموع الفرعي", "Subtotal")}</span>
              <span>{formatPrice(cartTotal, currency, lang)}</span>
            </div>
            {fulfillment === "delivery" && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">
                  {t("التوصيل المتوقع", "Estimated delivery")}
                </span>
                <span className="font-medium text-foreground text-end">
                  {estimatedDeliveryText}
                </span>
              </div>
            )}
            {fulfillment === "pickup" && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("موعد الاستلام", "Pickup timing")}</span>
                <span className="font-medium text-foreground text-end">
                  {estimatedDeliveryText}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("رسوم التوصيل", "Delivery fee")}</span>
              <span>
                {shipping > 0 ? formatPrice(shipping, currency, lang) : t("مجانًا", "Free")}
              </span>
            </div>
            {promoDiscount > 0 && (
              <div className="flex justify-between font-medium text-emerald-700 dark:text-emerald-400">
                <span>
                  {t("الخصم الترويجي", "Promo Discount")} ({appliedPromo?.code})
                </span>
                <span>− {formatPrice(promoDiscount, currency, lang)}</span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between font-medium text-amber-700 dark:text-amber-400">
                <span>
                  {t("خصم النقاط والمكافآت", "Points Discount")} ({redeemedPoints}{" "}
                  {t("نقطة", "pts")})
                </span>
                <span>− {formatPrice(loyaltyDiscount, currency, lang)}</span>
              </div>
            )}
          </div>

          {/* Promo Code Box */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="promo-code">{t("هل لديك رمز خصم؟", "Have a promo code?")}</Label>
            <div className="flex gap-2">
              <Input
                id="promo-code"
                name="promo-code"
                autoComplete="off"
                className="h-11 uppercase"
                value={promoInput}
                onChange={(e) => {
                  const value = e.target.value.toUpperCase();
                  setPromoInput(value);
                  if (appliedPromo && value !== appliedPromo.code) setAppliedPromo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPromo();
                  }
                }}
                placeholder="EID20"
              />
              <Button type="button" variant="outline" onClick={applyPromo} disabled={checkingPromo}>
                {checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {t("تطبيق", "Apply")}
              </Button>
            </div>
          </div>

          {/* Loyalty Points Redemption Widget */}
          {loyaltyProgram?.is_enabled && (loyaltyAccount?.active_points ?? 0) > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Coins className="h-4 w-4 text-amber-500" />
                  <span>{t("استخدام نقاط المكافآت", "Redeem Loyalty Points")}</span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {t("متاح:", "Available:")} {loyaltyAccount?.active_points} {t("نقطة", "pts")}
                </span>
              </div>

              {redeemedPoints > 0 ? (
                <div className="flex items-center justify-between p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs">
                  <span className="font-semibold text-foreground">
                    {redeemedPoints} {t("نقطة مطبقة", "points applied")} (−
                    {formatPrice(loyaltyDiscount, currency, lang)})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRemovePoints}
                    className="h-7 text-xs text-rose-600 hover:text-rose-700 p-0 hover:bg-transparent"
                  >
                    {t("إلغاء", "Remove")}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    max={loyaltyAccount?.active_points}
                    placeholder={t("أدخل عدد النقاط...", "Enter points to redeem...")}
                    className="h-11 font-mono text-sm bg-background"
                    value={pointsToRedeemInput}
                    onChange={(e) => setPointsToRedeemInput(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleApplyPoints}
                    className="h-11 border-amber-500/30 text-amber-700 dark:text-amber-400"
                  >
                    {t("استخدام", "Redeem")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Estimated Points Earned Badge */}
          {estimatedPointsToEarn > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary font-medium">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>
                {t(
                  `ستكسب +${estimatedPointsToEarn} نقطة مكافأة فور إتمام هذا الطلب!`,
                  `You will earn +${estimatedPointsToEarn} loyalty points on this order!`,
                )}
              </span>
            </div>
          )}

          <div className="border-t pt-3 flex justify-between font-semibold text-lg">
            <span>{t("الإجمالي", "Total")}</span>
            <span className="text-primary font-bold">
              {formatPrice(grandTotal, currency, lang)}
            </span>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
            <Checkbox
              className="mt-0.5"
              checked={acceptedTerms}
              onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {t("أوافق على", "I agree to the")}{" "}
              <Link
                to="/$slug/$category"
                params={{ slug: brand.slug, category: "terms-conditions" }}
                className="font-semibold text-foreground underline underline-offset-2"
              >
                {t("الشروط والأحكام", "terms and conditions")}
              </Link>{" "}
              {t(
                "وسياسة الخصوصية المعروضة ضمن خيارات الخصوصية.",
                "and the privacy policy available in Privacy Preferences.",
              )}
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-strong bg-muted/20 p-3">
            <Checkbox
              className="mt-0.5"
              checked={marketingConsent}
              onCheckedChange={(checked) => setMarketingConsent(checked === true)}
            />
            <span className="text-xs leading-relaxed text-muted-foreground">
              {t(
                "أوافق على استلام إشعارات وعروض خاصة ورسائل تذكير بالسلة عبر واتساب والبريد.",
                "Keep me updated with cart reminders, points balance, and exclusive offers via WhatsApp & Email.",
              )}
            </span>
          </label>

          <Button
            className="w-full h-12 bg-primary text-primary-foreground rounded-lg"
            disabled={
              submitting ||
              availableMethods.length === 0 ||
              fulfillmentOptions.length === 0 ||
              !acceptedTerms ||
              (method === "benefit" && !benefitReceipt)
            }
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
          <ShareCartModal open={shareOpen} onOpenChange={setShareOpen} />
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{t("الإجمالي", "Total")}</div>
            <div className="truncate text-lg font-bold text-primary">
              {formatPrice(grandTotal, currency, lang)}
            </div>
          </div>
          <Button
            className="h-12 min-w-36 shrink-0 bg-primary text-primary-foreground rounded-lg"
            disabled={
              submitting ||
              availableMethods.length === 0 ||
              fulfillmentOptions.length === 0 ||
              !acceptedTerms ||
              (method === "benefit" && !benefitReceipt)
            }
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
        </div>
      </div>

      <Dialog
        open={showAccountPopup.show}
        onOpenChange={(open) => {
          if (!open) {
            setShowAccountPopup({ show: false, field: null, value: "" });
            setIgnoredAccountWarning(true);
          }
        }}
      >
        <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="text-xl font-display text-start">
              {t("لديك حساب بالفعل!", "You have an account already!")}
            </DialogTitle>
            <DialogDescription className="text-sm mt-3 text-start leading-relaxed text-muted-foreground">
              {showAccountPopup.field === "email"
                ? t(
                    `تم العثور على حساب مسجل بالبريد الإلكتروني (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                    `A registered account already exists for this email (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                  )
                : t(
                    `تم العثور على حساب مسجل برقم الهاتف (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                    `A registered account already exists for this phone number (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5 flex flex-col sm:flex-row gap-2 justify-end">
            <Button
              variant="outline"
              className="w-full sm:w-auto h-11"
              onClick={() => {
                setShowAccountPopup({ show: false, field: null, value: "" });
                setIgnoredAccountWarning(true);
              }}
            >
              {t("المتابعة كزائر", "Continue as guest")}
            </Button>
            <Button
              className="w-full sm:w-auto h-11 bg-primary text-primary-foreground rounded-lg"
              asChild
            >
              <Link
                to="/$slug/auth"
                params={{ slug: brand.slug }}
                search={{ redirect: mounted ? window.location.pathname : "" }}
              >
                {t("تسجيل الدخول", "Sign in")}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
