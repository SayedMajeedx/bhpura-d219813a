import { formatPrice } from "@/lib/storefront-context";
import { BAHRAIN_REGIONS } from "@/lib/bahrain-regions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Truck } from "lucide-react";
import { getCountryByCode, calculateShippingFee } from "@/lib/shipping";
import { CountryFlag } from "@/components/ui/country-flag";
import type { CheckoutForm, SetCheckoutForm, Storefront } from "@/features/checkout/types";
import type { useCheckoutFulfillment } from "@/features/checkout/hooks/use-checkout-fulfillment";
import type { useCustomerPrefill } from "@/features/checkout/hooks/use-customer-prefill";

/** Saved addresses, the destination (Bahrain or a shipping zone and country) and the address fields for it. */
export function DeliveryAddressCard({
  currency,
  form,
  handleAddressChange,
  lang,
  savedAddresses,
  selectedAddressId,
  selectedCountryCode,
  selectedDestination,
  selectedZone,
  setForm,
  setSelectedAddressId,
  setSelectedCountryCode,
  setSelectedDestination,
  settings,
  t,
  totalCartQuantity,
  zones,
}: {
  currency: Storefront["currency"];
  form: CheckoutForm;
  handleAddressChange: ReturnType<typeof useCustomerPrefill>["handleAddressChange"];
  lang: Storefront["lang"];
  savedAddresses: ReturnType<typeof useCustomerPrefill>["savedAddresses"];
  selectedAddressId: ReturnType<typeof useCustomerPrefill>["selectedAddressId"];
  selectedCountryCode: ReturnType<typeof useCheckoutFulfillment>["selectedCountryCode"];
  selectedDestination: ReturnType<typeof useCheckoutFulfillment>["selectedDestination"];
  selectedZone: ReturnType<typeof useCheckoutFulfillment>["selectedZone"];
  setForm: SetCheckoutForm;
  setSelectedAddressId: ReturnType<typeof useCustomerPrefill>["setSelectedAddressId"];
  setSelectedCountryCode: ReturnType<typeof useCheckoutFulfillment>["setSelectedCountryCode"];
  setSelectedDestination: ReturnType<typeof useCheckoutFulfillment>["setSelectedDestination"];
  settings: Storefront["settings"];
  t: Storefront["t"];
  totalCartQuantity: number;
  zones: ReturnType<typeof useCheckoutFulfillment>["zones"];
}) {
  return (
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
                  {a.label || t("عنوان", "Address")} - {a.region}, {t("مجمع", "Block")} {a.block},{" "}
                  {t("طريق", "Road")} {a.road}, {t("منزل", "House")} {a.house}
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
                    selectedDestination === "BH" ? "border-primary" : "border-muted-foreground/40"
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
                    {t("توصيل لكافة مناطق مملكة البحرين", "Delivery across all Bahrain regions")}
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
                    {lang === "ar" ? settings.delivery_estimate_ar : settings.delivery_estimate_en}
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
                        <span className="text-emerald-600 font-bold">{t("مجانًا", "Free")}</span>
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
            <span>{t("تفاصيل العنوان داخل مملكة البحرين", "Address Details in Bahrain")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="checkout-address-label">{t("لقب العنوان", "Address label")}</Label>
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
              <Label htmlFor="checkout-house">{t("منزل / بناية", "House / Building")} *</Label>
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
              <Label htmlFor="checkout-intl-city">{t("المدينة / الإمارة", "City / State")} *</Label>
              <Input
                id="checkout-intl-city"
                name="intl-city"
                autoComplete="address-level2"
                className="h-11"
                placeholder={t("مثال: الرياض، دبي، الكويت", "e.g. Riyadh, Dubai, Kuwait City")}
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
  );
}
