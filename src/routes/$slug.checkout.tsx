import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront, formatPrice } from "@/lib/storefront-context";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, CreditCard, Banknote, QrCode, Truck, Store, User, Download, Mail, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/$slug/checkout")({
  component: Checkout,
});

type Fulfillment = "delivery" | "pickup" | "digital";

function Checkout() {
  const { brand, settings, cart, cartTotal, currency, lang, t, clearCart, session } = useStorefront();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    label: "",
    region: "",
    block: "",
    road: "",
    house: "",
    flat: "",
    notes: "",
  });

  // Pre-fill from linked customer when signed in
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("name, phone, email, region, block, road, house, flat")
          .eq("brand_id", brand.id)
          .eq("auth_user_id", session.user.id)
          .maybeSingle();
        if (customer) {
          setForm((f) => ({
            ...f,
            name: f.name || customer.name || "",
            phone: f.phone || customer.phone || "",
            email: f.email || customer.email || session.user.email || "",
            region: f.region || customer.region || "",
            block: f.block || (customer as any).block || "",
            road: f.road || customer.road || "",
            house: f.house || customer.house || "",
            flat: f.flat || customer.flat || "",
          }));
        } else if (session.user.email) {
          setForm((f) => ({ ...f, email: f.email || session.user.email || "" }));
        }
      } catch (e) {
        console.error("checkout prefill failed", e);
      }
    })();
  }, [session, brand.id]);

  const availableMethods: Array<{ id: "cod" | "card" | "benefit"; ar: string; en: string; icon: any }> = [
    settings.cod_enabled && { id: "cod" as const, ar: "الدفع عند الاستلام", en: "Cash on delivery", icon: Banknote },
    settings.card_enabled && { id: "card" as const, ar: "الدفع بالبطاقة", en: "Card payment", icon: CreditCard },
    settings.benefit_enabled && { id: "benefit" as const, ar: "عن طريق البنفت", en: "Benefit Pay", icon: QrCode },
  ].filter(Boolean) as any;

  const [method, setMethod] = useState<"cod" | "card" | "benefit" | "">(
    availableMethods[0]?.id ?? "",
  );

  const fulfillmentOptions = useMemo(() => {
    const opts: Array<{ id: Fulfillment; ar: string; en: string; icon: any; fee: number }> = [];
    if (settings.delivery_enabled) opts.push({ id: "delivery", ar: "توصيل", en: "Delivery", icon: Truck, fee: settings.delivery_fee });
    if (settings.pickup_enabled) opts.push({ id: "pickup", ar: "استلام من الفرع", en: "Pickup from branch", icon: Store, fee: 0 });
    if (settings.digital_delivery_enabled) opts.push({ id: "digital", ar: "تسليم رقمي", en: "Digital delivery", icon: Download, fee: 0 });
    return opts;
  }, [settings.delivery_enabled, settings.pickup_enabled, settings.digital_delivery_enabled, settings.delivery_fee]);

  const [fulfillment, setFulfillment] = useState<Fulfillment>(fulfillmentOptions[0]?.id ?? "delivery");
  useEffect(() => {
    if (fulfillmentOptions.length > 0 && !fulfillmentOptions.find((o) => o.id === fulfillment)) {
      setFulfillment(fulfillmentOptions[0].id);
    }
  }, [fulfillmentOptions, fulfillment]);

  const [branches, setBranches] = useState<Array<{ id: string; name_ar: string | null; name_en: string | null; location_ar: string | null; location_en: string | null; notes_ar: string | null; notes_en: string | null }>>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [digitalChannel, setDigitalChannel] = useState<"email" | "whatsapp">("email");
  const [digitalContact, setDigitalContact] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; amount: number } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  useEffect(() => {
    if (!settings.pickup_enabled) return;
    (async () => {
      const { data } = await supabase.rpc("get_public_branches" as any, {
        p_brand_id: brand.id,
      });
      const list = ((data ?? []) as any[]);
      setBranches(list);
      setBranchId((cur) => cur || (list[0]?.id ?? ""));
    })();
  }, [brand.id, settings.pickup_enabled]);
  const branchLabel = (b: typeof branches[number]) => (lang === "ar" ? (b.name_ar || b.name_en || "") : (b.name_en || b.name_ar || ""));
  const branchLoc = (b: typeof branches[number]) => (lang === "ar" ? (b.location_ar || b.location_en || "") : (b.location_en || b.location_ar || ""));

  const shipping = fulfillment === "delivery" ? Number(settings.delivery_fee || 0) : 0;
  const promoDiscount = Math.min(appliedPromo?.amount ?? 0, cartTotal);
  const grandTotal = Math.max(0, cartTotal - promoDiscount) + shipping;

  useEffect(() => { setAppliedPromo(null); }, [cartTotal, brand.id]);

  const applyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return toast.error(t("أدخل رمز الخصم", "Enter a promo code"));
    setCheckingPromo(true);
    const { data, error } = await supabase.rpc("validate_promo_code" as any, { p_brand_slug: brand.slug, p_code: code, p_subtotal: cartTotal });
    setCheckingPromo(false);
    if (error) return toast.error(t("تعذر التحقق من الرمز", "Could not validate this code"));
    const result = data as any;
    if (!result?.valid) {
      setAppliedPromo(null);
      if (result?.reason === "MINIMUM_NOT_MET") return toast.error(t(`الحد الأدنى للطلب ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`, `Minimum order is ${formatPrice(Number(result.minimum_order_amount), currency, lang)}`));
      if (result?.reason === "CODE_INACTIVE") return toast.error(t("رمز الخصم غير نشط", "This promo code is inactive"));
      return toast.error(t("رمز الخصم غير صحيح", "Invalid promo code"));
    }
    setAppliedPromo({ code: result.code, amount: Number(result.discount_amount) });
    setPromoInput(result.code);
    toast.success(t("تم تطبيق الخصم", "Promo code applied"));
  };

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <Card className="p-8">
          <p className="mb-4">{t("السلة فارغة", "Your cart is empty")}</p>
          <Link to="/$slug" params={{ slug: brand.slug }} className="underline">
            {t("العودة للمتجر", "Back to store")}
          </Link>
        </Card>
      </div>
    );
  }

  const submit = async () => {
    if (!form.name.trim() || (fulfillment !== "digital" && !form.phone.trim())) {
      toast.error(t("الاسم والهاتف مطلوبان", "Name and phone are required"));
      return;
    }
    if (fulfillment === "delivery") {
      if (!form.region || !form.block.trim() || !form.road.trim() || !form.house.trim()) {
        toast.error(t("يرجى تعبئة كامل عنوان التوصيل", "Please complete the delivery address"));
        return;
      }
    }
    if (!method) {
      toast.error(t("اختر طريقة دفع", "Choose a payment method"));
      return;
    }
    if (fulfillment === "pickup" && branches.length > 0 && !branchId) {
      toast.error(t("اختر الفرع", "Select a branch"));
      return;
    }
    if (fulfillment === "digital") {
      const contact = digitalContact.trim();
      if (!contact) {
        toast.error(t("أدخل البريد الإلكتروني أو رقم/معرّف واتساب", "Enter the email or WhatsApp number/user ID"));
        return;
      }
      if (digitalChannel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        toast.error(t("أدخل بريداً إلكترونياً صحيحاً", "Enter a valid email address"));
        return;
      }
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("place_storefront_order", {
        p_brand_slug: brand.slug,
        p_customer: {
          name: form.name,
          phone: form.phone,
          email: fulfillment === "digital" && digitalChannel === "email" ? digitalContact.trim() : form.email,
          label: form.label,
          region: form.region,
          block: form.block,
          road: form.road,
          house: form.house,
          flat: form.flat,
        },
        p_items: cart.map((c) => ({
          variant_id: c.variant_id,
          quantity: c.qty,
          selected_variant: {
            size: c.size,
            color: c.color,
            fabric: c.fabric ?? null,
          },
          // Send both names during rollout. The database normalizes these to
          // order_items.custom_field_values.
          custom_fields: c.custom_fields ?? [],
          custom_field_values: c.custom_fields ?? [],
        })),
        p_payment_method: method,
        p_notes: form.notes || undefined,
        p_fulfillment: fulfillment,
        p_branch_id: fulfillment === "pickup" ? (branchId || null) : null,
        p_digital_channel: fulfillment === "digital" ? digitalChannel : null,
        p_digital_contact: fulfillment === "digital" ? digitalContact.trim() : null,
        p_promo_code: appliedPromo?.code ?? null,
      } as any);
      if (error) throw error;
      const orderId = (data as any)?.order_id;
      const confirmationEmailToken = (data as any)?.confirmation_email_token;
      clearCart();
      toast.success(t("تم استلام طلبك!", "Order placed!"));
      // Fire-and-forget confirmation email (respects storefront language).
      const confirmationEmail = fulfillment === "digital" && digitalChannel === "email" ? digitalContact.trim() : form.email;
      if (orderId && confirmationEmail) {
        const emailLang = (typeof document !== "undefined" && document.documentElement.dir === "rtl") ? "ar" : "en";
        // Fire-and-forget; server returns 202 immediately and sends in background.
        supabase.functions.invoke("send-order-email", {
          body: { order_id: orderId, email_token: confirmationEmailToken, lang: emailLang },
        }).catch((err) => console.warn("[send-order-email]", err));
      }
      navigate({
        to: "/$slug/thank-you/$orderId",
        params: { slug: brand.slug, orderId: String(orderId ?? "") },
        search: { fulfillment, channel: fulfillment === "digital" ? digitalChannel : "email" },
      });
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("INSUFFICIENT_STOCK")) {
        toast.error(t("المخزون غير كافٍ لأحد المنتجات", "Insufficient stock for one item"));
      } else if (msg.includes("PAYMENT_METHOD_DISABLED")) {
        toast.error(t("طريقة الدفع غير متاحة", "Payment method unavailable"));
      } else if (msg.includes("DELIVERY_DISABLED") || msg.includes("PICKUP_DISABLED") || msg.includes("DIGITAL_DELIVERY_DISABLED")) {
        toast.error(t("طريقة التسليم غير متاحة", "Fulfillment method unavailable"));
      } else if (msg.includes("DIGITAL_CONTACT") || msg.includes("DIGITAL_EMAIL") || msg.includes("DIGITAL_CHANNEL")) {
        toast.error(t("تحقق من بيانات التسليم الرقمي", "Check the digital delivery details"));
      } else if (msg.includes("PROMO_")) {
        setAppliedPromo(null);
        toast.error(t("رمز الخصم لم يعد صالحاً لهذا الطلب", "The promo code is no longer valid for this order"));
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-8 pb-28 md:py-8 grid md:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        {!session && (
          <Card className="p-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-primary/30 bg-primary/5">
            <div className="flex min-w-0 items-center gap-3">
              <User className="h-5 w-5 shrink-0" />
              <p className="text-sm min-w-0 break-words">{t("لديك حساب؟ سجّل الدخول لملء البيانات تلقائيًا.", "Have an account? Sign in to prefill your details.")}</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/$slug/auth" params={{ slug: brand.slug }}>{t("سجّل الدخول", "Sign in")}</Link>
            </Button>
          </Card>
        )}

        <Card className="p-5 space-y-4">
          <h2 className="font-display text-xl">{t("بيانات العميل", "Customer details")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>{t("الاسم الكامل", "Full name")} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>{t("رقم الهاتف", "Phone")} *</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>{t("البريد الإلكتروني", "Email")}</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>{t("ملاحظات", "Notes")}</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </Card>

        {fulfillmentOptions.length > 0 && (
          <Card className="p-5 space-y-3">
            <h2 className="font-display text-xl">{t("طريقة التسليم", "Fulfillment method")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fulfillmentOptions.map((opt) => {
                const Icon = opt.icon;
                const active = fulfillment === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFulfillment(opt.id)}
                    className={`text-start flex items-center gap-3 p-4 rounded-lg border transition-all ${active ? "border-current" : "border-input"}`}
                    style={active ? { borderColor: settings.primary_color, backgroundColor: `${settings.primary_color}11` } : undefined}
                  >
                    <div className="h-10 w-10 rounded-md grid place-items-center" style={{ backgroundColor: active ? settings.primary_color : "hsl(var(--muted))", color: active ? "#fff" : "inherit" }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{lang === "ar" ? opt.ar : opt.en}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.fee > 0 ? formatPrice(opt.fee, currency, lang) : t("مجانًا", "Free")}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
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
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBranchId(b.id)}
                      className={`relative text-start p-4 rounded-xl border-2 transition-all hover:shadow-sm ${active ? "shadow-sm" : "border-input bg-background hover:border-foreground/30"}`}
                      style={active ? { borderColor: settings.primary_color, backgroundColor: `${settings.primary_color}14` } : undefined}
                      aria-pressed={active}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center transition-colors ${active ? "" : "border-muted-foreground/40"}`}
                          style={active ? { borderColor: settings.primary_color, backgroundColor: settings.primary_color } : undefined}
                          aria-hidden
                        >
                          {active && <span className="h-2 w-2 rounded-full bg-white" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold truncate">{branchLabel(b)}</div>
                          {branchLoc(b) && <div className="text-xs text-muted-foreground mt-0.5">{branchLoc(b)}</div>}
                          {(lang === "ar" ? b.notes_ar : b.notes_en) && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {lang === "ar" ? b.notes_ar : b.notes_en}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {fulfillment === "digital" && (
          <Card className="p-5 space-y-4">
            <div>
              <h2 className="font-display text-xl">{t("طريقة استلام المنتج الرقمي", "Digital delivery channel")}</h2>
              <p className="text-sm text-muted-foreground">{t("اختر طريقة واحدة وأدخل بيانات الاستلام المطلوبة.", "Choose one channel and enter the required delivery contact.")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["email", t("البريد الإلكتروني", "Email"), Mail],
                ["whatsapp", t("واتساب", "WhatsApp"), MessageCircle],
              ] as const).map(([channel, label, Icon]) => (
                <button key={channel} type="button" onClick={() => { setDigitalChannel(channel); setDigitalContact(""); }} className="flex items-center gap-2 rounded-lg border p-3" style={digitalChannel === channel ? { borderColor: settings.primary_color, backgroundColor: `${settings.primary_color}11` } : undefined}>
                  <Icon className="h-5 w-5" /><span>{label}</span>
                </button>
              ))}
            </div>
            <div>
              <Label>{digitalChannel === "email" ? t("البريد الإلكتروني", "Email address") : t("رقم أو معرّف واتساب", "WhatsApp number or user ID")} *</Label>
              <Input type={digitalChannel === "email" ? "email" : "text"} inputMode={digitalChannel === "email" ? "email" : "text"} value={digitalContact} onChange={(e) => setDigitalContact(e.target.value)} placeholder={digitalChannel === "email" ? "name@example.com" : t("مثال: +973… أو معرّف المستخدم", "e.g. +973… or user ID")} />
            </div>
          </Card>
        )}


        {fulfillment === "delivery" && (
          <Card className="p-5 space-y-4">
            <h2 className="font-display text-xl">{t("عنوان التوصيل", "Delivery address")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>{t("لقب العنوان", "Address label")}</Label>
                <Input placeholder={t("مثل: المنزل، المكتب", "e.g. Home, Work")} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <Label>{t("المنطقة", "Region")} *</Label>
                <Select value={form.region} onValueChange={(v) => setForm({ ...form, region: v })}>
                  <SelectTrigger><SelectValue placeholder={t("اختر المنطقة", "Select region")} /></SelectTrigger>
                  <SelectContent>
                    {BAHRAIN_REGIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{lang === "ar" ? r.ar : r.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("المجمع", "Block")} *</Label>
                <Input placeholder={t("مثال: 428", "e.g. 428")} value={form.block} onChange={(e) => setForm({ ...form, block: e.target.value })} />
              </div>
              <div>
                <Label>{t("الطريق / الشارع", "Road / Avenue")} *</Label>
                <Input placeholder={t("مثال: 2825", "e.g. 2825")} value={form.road} onChange={(e) => setForm({ ...form, road: e.target.value })} />
              </div>
              <div>
                <Label>{t("منزل / بناية", "House / Building")} *</Label>
                <Input placeholder={t("مثال: 12", "e.g. 12")} value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} />
              </div>
              <div>
                <Label>{t("شقة (اختياري)", "Flat (optional)")}</Label>
                <Input placeholder={t("مثال: 4", "e.g. 4")} value={form.flat} onChange={(e) => setForm({ ...form, flat: e.target.value })} />
              </div>
            </div>
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
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={`text-start flex items-center gap-3 p-3 rounded-lg border ${active ? "border-current" : "border-input"}`}
                  style={active ? { borderColor: settings.primary_color, backgroundColor: `${settings.primary_color}11` } : undefined}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{lang === "ar" ? m.ar : m.en}</span>
                </button>
              );
            })}
          </div>

          {method === "benefit" && (
            <div className="mt-3 p-4 border rounded-lg bg-muted/40 text-center">
              <p className="text-sm mb-3">
                {t(
                  "امسح رمز الاستجابة السريعة أدناه لإتمام الدفع عن طريق البنفت، ثم اضغط تأكيد الطلب.",
                  "Scan the QR code below to complete payment via Benefit, then confirm your order.",
                )}
              </p>
              {settings.benefit_qr_url ? (
                <img
                  src={settings.benefit_qr_url}
                  alt="Benefit QR"
                  className="mx-auto max-w-[240px] rounded-lg border bg-white p-2"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("لم يقم المتجر برفع رمز البنفت بعد.", "Store hasn't uploaded a Benefit QR yet.")}
                </p>
              )}
            </div>
          )}

          {method === "card" && (
            <div className="mt-3 p-4 border rounded-lg bg-muted/40 text-sm">
              {t(
                "سيتم التواصل معك من قِبل المتجر لإتمام الدفع بالبطاقة.",
                "The store will contact you to complete the card payment.",
              )}
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card className="p-5 sticky top-20 space-y-3">
          <h2 className="font-display text-xl">{t("ملخّص الطلب", "Order summary")}</h2>
          <div className="space-y-2 max-h-72 overflow-auto">
            {cart.map((c) => (
              <div key={c.cart_line_id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0 me-2">
                  <div className="truncate">{c.name} × {c.qty}</div>
                  {[c.size, c.color, c.fabric].filter(Boolean).length > 0 && (
                    <div className="truncate text-xs text-muted-foreground">{[c.size, c.color, c.fabric].filter(Boolean).join(" · ")}</div>
                  )}
                  {(c.custom_fields ?? []).map((field) => (
                    <div key={field.key} className="text-xs text-muted-foreground break-words">
                      {lang === "ar" ? (field.label_ar || field.label_en || field.key) : (field.label_en || field.label_ar || field.key)}: {field.value}
                    </div>
                  ))}
                </div>
                <span className="flex flex-col items-end">
                  <span>{formatPrice(c.price * c.qty, currency, lang)}</span>
                  {Number(c.original_price || 0) > c.price && <span className="text-xs text-muted-foreground line-through">{formatPrice(Number(c.original_price) * c.qty, currency, lang)}</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("المجموع الفرعي", "Subtotal")}</span>
              <span>{formatPrice(cartTotal, currency, lang)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("رسوم التوصيل", "Delivery fee")}</span>
              <span>{shipping > 0 ? formatPrice(shipping, currency, lang) : t("مجانًا", "Free")}</span>
            </div>
            {promoDiscount > 0 && <div className="flex justify-between font-medium text-emerald-700">
              <span>{t("الخصم", "Discount")} ({appliedPromo?.code})</span>
              <span>− {formatPrice(promoDiscount, currency, lang)}</span>
            </div>}
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <Label htmlFor="promo-code">{t("هل لديك رمز خصم؟", "Have a promo code?")}</Label>
            <div className="flex gap-2">
              <Input id="promo-code" value={promoInput} onChange={(e) => { const value = e.target.value.toUpperCase(); setPromoInput(value); if (appliedPromo && value !== appliedPromo.code) setAppliedPromo(null); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } }} placeholder="EID20" className="uppercase" />
              <Button type="button" variant="outline" onClick={applyPromo} disabled={checkingPromo}>{checkingPromo && <Loader2 className="me-2 h-4 w-4 animate-spin" />}{t("تطبيق", "Apply")}</Button>
            </div>
          </div>
          <div className="border-t pt-3 flex justify-between font-semibold text-lg">
            <span>{t("الإجمالي", "Total")}</span>
            <span style={{ color: settings.primary_color }}>{formatPrice(grandTotal, currency, lang)}</span>
          </div>
          <Button
            className="w-full h-12"
            style={{
              backgroundColor: settings.btn_checkout_bg ?? settings.primary_color,
              color: settings.btn_checkout_fg ?? "#fff",
            }}
            disabled={submitting || availableMethods.length === 0 || fulfillmentOptions.length === 0}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-6px_20px_-12px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">{t("الإجمالي", "Total")}</div>
            <div className="truncate text-lg font-semibold" style={{ color: settings.primary_color }}>
              {formatPrice(grandTotal, currency, lang)}
            </div>
          </div>
          <Button
            className="h-12 min-w-36 shrink-0"
            style={{
              backgroundColor: settings.btn_checkout_bg ?? settings.primary_color,
              color: settings.btn_checkout_fg ?? "#fff",
            }}
            disabled={submitting || availableMethods.length === 0 || fulfillmentOptions.length === 0}
            onClick={submit}
          >
            {submitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {t("تأكيد الطلب", "Place order")}
          </Button>
        </div>
      </div>
    </div>
  );
}
