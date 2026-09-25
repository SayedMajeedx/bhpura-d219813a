"""Checkout part 2: move the page sections into src/features/checkout/components."""
import json
import os
import sys

os.environ["ROUTE"] = "src/routes/$slug.checkout.tsx"
os.environ["FUNC"] = "function Checkout() {"
os.environ["RET_AFTER"] = "const { submitting, submit } = usePlaceOrder"
os.environ["ANCHOR"] = 'import { usePlaceOrder } from "@/features/checkout/hooks/use-place-order";'
os.environ["COMP_DIR"] = "src/features/checkout/components/"
sys.path.insert(0, os.path.dirname(__file__))

EXTRA = """import type { Dispatch, SetStateAction } from "react";
import type { CheckoutForm, SetCheckoutForm, Storefront } from "@/features/checkout/types";"""
extra_path = os.path.join(os.path.dirname(__file__), "co_extra_imports.txt")
open(extra_path, "w", encoding="utf-8").write(EXTRA)
os.environ["EXTRA_IMPORTS_FILE"] = extra_path

HOOKS = {
    "useCheckoutForm": ["isGift", "setIsGift", "giftRecipient", "setGiftRecipient", "giftMessage", "setGiftMessage"],
    "useCustomerPrefill": ["customerId", "savedAddresses", "selectedAddressId", "setSelectedAddressId", "handleAddressChange"],
    "useRegisteredAccountCheck": ["showAccountPopup", "setShowAccountPopup", "setIgnoredAccountWarning", "checkRegisteredAccount"],
    "useCheckoutFulfillment": ["fulfillmentOptions", "fulfillment", "setFulfillment", "selectedDestination", "setSelectedDestination", "zones",
                               "selectedCountryCode", "setSelectedCountryCode", "selectedZone", "availableMethods", "method", "setMethod",
                               "estimatedDeliveryText"],
    "usePickupAndDigital": ["branches", "branchId", "setBranchId", "digitalChannel", "setDigitalChannel", "digitalContact",
                            "setDigitalContact", "branchLabel", "branchLoc"],
    "usePromoCode": ["promoInput", "setPromoInput", "appliedPromo", "setAppliedPromo", "checkingPromo", "applyPromo"],
    "useCheckoutLoyalty": ["loyaltyAccount", "loyaltyProgram", "pointsToRedeemInput", "setPointsToRedeemInput", "redeemedPoints",
                           "effectiveRedeemedPoints", "loyaltyDiscount", "estimatedPointsToEarn", "handleApplyPoints", "handleRemovePoints"],
    "usePlaceOrder": ["submitting", "submit"],
    "usePaymentReturnError": ["paymentErrorState", "mounted"],
}
HOOK_FILE = {
    "useCheckoutForm": "use-checkout-form",
    "useCustomerPrefill": "use-customer-prefill",
    "useRegisteredAccountCheck": "use-registered-account-check",
    "useCheckoutFulfillment": "use-checkout-fulfillment",
    "usePickupAndDigital": "use-pickup-and-digital",
    "usePromoCode": "use-promo-code",
    "useCheckoutLoyalty": "use-checkout-loyalty",
    "usePlaceOrder": "use-place-order",
    "usePaymentReturnError": "use-payment-return-error",
}
B = "Dispatch<SetStateAction<boolean>>"
types = {n: f'ReturnType<typeof {h}>["{n}"]' for h, ns in HOOKS.items() for n in ns}
types.update(
    {
        **{n: f'Storefront["{n}"]' for n in ["brand", "settings", "lang", "t", "currency", "cart", "session"]},
        "cartTotal": "number",
        "form": "CheckoutForm",
        "setForm": "SetCheckoutForm",
        "shareOpen": "boolean",
        "setShareOpen": B,
        "marketingConsent": "boolean",
        "setMarketingConsent": B,
        "saveToProfile": "boolean",
        "setSaveToProfile": B,
        "whatsappOrderUpdates": "boolean",
        "setWhatsappOrderUpdates": B,
        "acceptedTerms": "boolean",
        "setAcceptedTerms": B,
        "benefitReceipt": "File | null",
        "setBenefitReceipt": "Dispatch<SetStateAction<File | null>>",
        "totalCartQuantity": "number",
        "shipping": "number",
        "promoDiscount": "number",
        "grandTotal": "number",
        "cartSessionId": "string",
    }
)
types_path = os.path.join(os.path.dirname(__file__), "co_types.json")
json.dump(types, open(types_path, "w", encoding="utf-8"))
os.environ["TYPES_JSON"] = types_path

import extract_lib as X  # noqa: E402

SPECS = [
    # (name, doc, start, end (line-anchored), route indent of the JSX)
    (
        "PaymentFailedCard",
        "Shown after a declined or cancelled card payment: retry with the card or pick another method.",
        '          <Card className="p-5 border-destructive bg-destructive/5 space-y-4 col-span-full">\n',
        "          </Card>\n",
        10,
    ),
    (
        "CustomerDetailsCard",
        "Name, phone and email (offering sign-in when they match an account), the gift note, order notes and the opt-ins.",
        '        <Card className="p-5 space-y-4">\n          <h2 className="font-display text-xl">{t("بيانات العميل"',
        "        </Card>\n",
        8,
    ),
    (
        "FulfillmentMethodCard",
        "Delivery, pickup or digital delivery, with each option's fee.",
        '          <Card className="p-5 space-y-3">\n            <h2 className="font-display text-xl">{t("طريقة التسليم"',
        "          </Card>\n",
        10,
    ),
    (
        "PickupBranchCard",
        "The branch to collect the order from.",
        '          <Card className="p-5 space-y-3">\n            <h2 className="font-display text-xl">{t("اختر الفرع"',
        "          </Card>\n",
        10,
    ),
    (
        "DigitalDeliveryCard",
        "Where to send a digital order: email or WhatsApp, and the address or number.",
        '          <Card className="p-5 space-y-4">\n            <div>\n              <h2 className="font-display text-xl">\n                {t("طريقة استلام المنتج الرقمي"',
        "          </Card>\n",
        10,
    ),
    (
        "DeliveryAddressCard",
        "Saved addresses, the destination (Bahrain or a shipping zone and country) and the address fields for it.",
        '          <Card className="p-5 space-y-4">\n            <h2 className="font-display text-xl">{t("عنوان التوصيل"',
        "          </Card>\n",
        10,
    ),
    (
        "PaymentMethodCard",
        "The payment methods for this destination, the Benefit transfer details and receipt upload, and the card note.",
        '        <Card className="p-5 space-y-3">\n          <h2 className="font-display text-xl">{t("طريقة الدفع"',
        "        </Card>\n",
        8,
    ),
    (
        "OrderSummaryCard",
        "The cart lines, promo code, loyalty points, totals, terms and the Place order button.",
        '        <Card className="p-5 sticky top-20 space-y-3">\n',
        "        </Card>\n",
        8,
    ),
    (
        "MobileCheckoutBar",
        "The total and Place order button pinned to the bottom on phones.",
        '      <div className="fixed inset-x-0 bottom-0 z-40 border-t',
        "      </div>\n",
        6,
    ),
    (
        "AccountExistsDialog",
        "Offers sign-in when the email or phone typed belongs to an existing account.",
        "      <Dialog\n        open={showAccountPopup.show}\n",
        "      </Dialog>\n",
        6,
    ),
]

s = X.s
names_by = {}
for name, doc, start, end, indent in SPECS:
    i = s.index(start)
    j = s.index("\n" + end, i) + 1 + len(end)
    jsx = s[i:j].rstrip("\n")
    names = X.used(jsx, X.scope_names())
    X.write_component(name, doc, names, "", X.reindent(jsx, indent - 4))
    s = s[:i] + X.usage(name, names, indent) + s[j:]
    X.s = s
    names_by[name] = names
    print(name, len(jsx.split("\n")), names)

# the components need the hook types they reference
for name, names in names_by.items():
    path = X.C + name + ".tsx"
    c = open(path, encoding="utf-8").read()
    need = sorted({h for h, ns in HOOKS.items() for n in names if n in ns})
    if need:
        imp = "".join(f'\nimport type {{ {h} }} from "@/features/checkout/hooks/{HOOK_FILE[h]}";' for h in need)
        c = c.replace(EXTRA, EXTRA + imp, 1)
        open(path, "w", encoding="utf-8", newline="").write(c)

anchor = os.environ["ANCHOR"]
assert s.count(anchor) == 1
s = s.replace(
    anchor,
    anchor + "".join(f'\nimport {{ {n} }} from "@/features/checkout/components/{n}";' for n, *_ in SPECS),
)
open(X.ROUTE, "w", encoding="utf-8", newline="").write(s)
print("ok")
