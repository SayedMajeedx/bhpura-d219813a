import { describe, expect, it } from "vitest";
import { checkoutFormError } from "../src/features/checkout/lib/checkout-validation";
import {
  placeOrderFailure,
  placeStorefrontOrderArgs,
} from "../src/features/checkout/lib/place-order";
import { promoRejectionMessage } from "../src/features/checkout/lib/promo-rejection";
import type { CheckoutForm } from "../src/features/checkout/types";
import type { CartItem } from "../src/lib/storefront-context";
import type { ShippingZone } from "../src/lib/shipping";

type FormErrorInput = Parameters<typeof checkoutFormError>[0];
type OrderArgsInput = Parameters<typeof placeStorefrontOrderArgs>[0];

const t = (_ar: string, en: string) => en;

const form: CheckoutForm = {
  name: "Sara",
  phone: "33334444",
  email: "",
  label: "Home",
  region: "Manama",
  block: "301",
  road: "12",
  house: "7",
  flat: "",
  notes: "",
};

const formInput = (overrides: Partial<FormErrorInput> = {}): FormErrorInput => ({
  form,
  fulfillment: "delivery",
  acceptedTerms: true,
  selectedDestination: "BH",
  method: "cod",
  benefitReceipt: null,
  branches: [],
  branchId: "",
  digitalChannel: "email",
  digitalContact: "",
  t,
  ...overrides,
});

describe("checkoutFormError", () => {
  it("accepts a complete Bahrain delivery", () => {
    expect(checkoutFormError(formInput())).toBeNull();
  });

  it("needs a name, and a phone unless delivery is digital", () => {
    expect(checkoutFormError(formInput({ form: { ...form, name: " " } }))).toBe(
      "Name and phone are required",
    );
    expect(checkoutFormError(formInput({ form: { ...form, phone: "" } }))).toBe(
      "Name and phone are required",
    );
    expect(
      checkoutFormError(
        formInput({
          form: { ...form, phone: "" },
          fulfillment: "digital",
          digitalContact: "sara@example.com",
        }),
      ),
    ).toBeNull();
  });

  it("checks the email only when one is given", () => {
    expect(checkoutFormError(formInput({ form: { ...form, email: "sara@" } }))).toBe(
      "Enter a valid email address to receive order updates",
    );
    expect(
      checkoutFormError(formInput({ form: { ...form, email: " sara@example.com " } })),
    ).toBeNull();
  });

  it("needs the terms accepted", () => {
    expect(checkoutFormError(formInput({ acceptedTerms: false }))).toBe(
      "Please accept the terms and conditions and privacy policy",
    );
  });

  it("needs a full address; international orders have no block", () => {
    expect(checkoutFormError(formInput({ form: { ...form, block: "" } }))).toBe(
      "Please complete the delivery address in Bahrain",
    );
    expect(
      checkoutFormError(formInput({ selectedDestination: "gcc", form: { ...form, block: "" } })),
    ).toBeNull();
    expect(
      checkoutFormError(formInput({ selectedDestination: "gcc", form: { ...form, road: " " } })),
    ).toBe("Please enter city, district, and street address for international shipping");
    expect(
      checkoutFormError(formInput({ fulfillment: "pickup", form: { ...form, block: "" } })),
    ).toBeNull();
  });

  it("needs a payment method, and the receipt for Benefit", () => {
    expect(checkoutFormError(formInput({ method: "" }))).toBe("Choose a payment method");
    expect(checkoutFormError(formInput({ method: "benefit" }))).toBe(
      "Please attach the transfer receipt to confirm your order",
    );
    expect(
      checkoutFormError(
        formInput({ method: "benefit", benefitReceipt: new File(["x"], "receipt.png") }),
      ),
    ).toBeNull();
  });

  it("needs a branch for pickup when the store has branches", () => {
    expect(checkoutFormError(formInput({ fulfillment: "pickup", branches: [{}] }))).toBe(
      "Select a branch",
    );
    expect(checkoutFormError(formInput({ fulfillment: "pickup", branches: [] }))).toBeNull();
  });

  it("needs a digital contact, and a valid email on the email channel", () => {
    const digital = formInput({ fulfillment: "digital" });
    expect(checkoutFormError(digital)).toBe("Enter the email or WhatsApp number/user ID");
    expect(checkoutFormError({ ...digital, digitalContact: "sara" })).toBe(
      "Enter a valid email address",
    );
    expect(
      checkoutFormError({ ...digital, digitalChannel: "whatsapp", digitalContact: "sara" }),
    ).toBeNull();
  });
});

const cartLine: CartItem = {
  cart_line_id: "l1",
  variant_id: "v1",
  product_id: "p1",
  name: "Abaya",
  image: null,
  price: 30,
  size: "52",
  color: "Black",
  qty: 2,
  max_stock: 5,
};

const zone: ShippingZone = {
  id: "gcc",
  name_en: "GCC",
  name_ar: "الخليج",
  countries: ["KW"],
  pricing_type: "flat",
  fee: 5,
};

const argsInput = (overrides: Partial<OrderArgsInput> = {}): OrderArgsInput => ({
  brand: { slug: "pura" },
  form,
  customerEmail: "",
  selectedDestination: "BH",
  selectedCountryCode: "BH",
  selectedZone: undefined,
  session: null,
  saveToProfile: true,
  cart: [cartLine, { ...cartLine, variant_id: " ", fabric: "Crepe" }],
  method: "cod",
  isGift: false,
  giftRecipient: "",
  giftMessage: "",
  fulfillment: "delivery",
  branchId: "b1",
  digitalChannel: "email",
  digitalContact: " sara@example.com ",
  appliedPromo: null,
  benefitReceiptId: null,
  shipping: 2,
  lang: "en",
  idempotencyKey: "key",
  ...overrides,
});

describe("placeStorefrontOrderArgs", () => {
  it("sends a Bahrain delivery", () => {
    const args = placeStorefrontOrderArgs(argsInput());
    expect(args).toMatchObject({
      p_brand_slug: "pura",
      p_customer: { name: "Sara", label: "Home", block: "301", save_to_profile: false },
      p_payment_method: "cod",
      p_notes: undefined,
      p_fulfillment: "delivery",
      p_branch_id: null,
      p_digital_channel: null,
      p_digital_contact: null,
      p_promo_code: null,
      p_shipping_fee: 2,
      p_shipping_zone: "Bahrain - Local Delivery",
      p_idempotency_key: "key",
    });
    expect(args.p_items).toEqual([
      {
        variant_id: "v1",
        quantity: 2,
        selected_variant: { size: "52", color: "Black", fabric: null },
        custom_fields: [],
        custom_field_values: [],
      },
      {
        variant_id: null,
        quantity: 2,
        selected_variant: { size: "52", color: "Black", fabric: "Crepe" },
        custom_fields: [],
        custom_field_values: [],
      },
    ]);
  });

  it("puts the country in the label and zone for international delivery", () => {
    const args = placeStorefrontOrderArgs(
      argsInput({ selectedDestination: "gcc", selectedCountryCode: "KW", selectedZone: zone }),
    );
    expect(args.p_customer.label).toBe("Kuwait - Home");
    expect(args.p_shipping_zone).toBe("GCC (Kuwait)");
    expect(
      placeStorefrontOrderArgs(argsInput({ selectedDestination: "gone", selectedZone: undefined }))
        .p_shipping_zone,
    ).toBe("International Shipping");
  });

  it("saves the address only for signed-in shoppers who asked", () => {
    const session = { user: { id: "u1" } } as OrderArgsInput["session"];
    expect(placeStorefrontOrderArgs(argsInput({ session })).p_customer.save_to_profile).toBe(true);
    expect(
      placeStorefrontOrderArgs(argsInput({ session, saveToProfile: false })).p_customer
        .save_to_profile,
    ).toBe(false);
  });

  it("puts the gift note above the shopper's notes", () => {
    const args = placeStorefrontOrderArgs(
      argsInput({
        isGift: true,
        giftRecipient: "Noor",
        form: { ...form, notes: " Ring the bell " },
      }),
    );
    expect(args.p_notes).toBe(
      "🎁 [طلب إهداء / Gift Order]\nالمستلم: Noor\nرسالة الإهداء: بدون رسالة\n\nRing the bell",
    );
  });

  it("sends pickup and digital details only for that fulfillment", () => {
    expect(placeStorefrontOrderArgs(argsInput({ fulfillment: "pickup" }))).toMatchObject({
      p_branch_id: "b1",
      p_shipping_zone: null,
    });
    expect(placeStorefrontOrderArgs(argsInput({ fulfillment: "digital" }))).toMatchObject({
      p_branch_id: null,
      p_digital_channel: "email",
      p_digital_contact: "sara@example.com",
    });
  });
});

describe("placeOrderFailure", () => {
  it("explains known server errors", () => {
    expect(placeOrderFailure("INSUFFICIENT_STOCK: v1", t)).toEqual({
      message: "Insufficient stock for one item",
      clearPromo: false,
    });
    expect(placeOrderFailure('violates check constraint "order_items_location_check"', t)).toEqual({
      message: "Custom order checkout is temporarily unavailable. Refresh and try again.",
      clearPromo: false,
    });
    expect(placeOrderFailure("PICKUP_DISABLED", t).message).toBe("Fulfillment method unavailable");
  });

  it("drops the promo code when the server refuses it", () => {
    expect(placeOrderFailure("PROMO_USAGE_LIMIT_REACHED", t)).toEqual({
      message: "You have reached this code's usage limit.",
      clearPromo: true,
    });
    expect(placeOrderFailure("PROMO_EXPIRED", t)).toEqual({
      message: "The promo code is no longer valid for this order",
      clearPromo: true,
    });
  });

  it("shows unknown errors as they are", () => {
    expect(placeOrderFailure("Network down", t)).toEqual({
      message: "Network down",
      clearPromo: false,
    });
  });
});

describe("promoRejectionMessage", () => {
  const ctx = { currency: "BHD", lang: "en" as const, t };

  it("explains each refusal", () => {
    expect(promoRejectionMessage({ reason: "CODE_NOT_FOUND" }, ctx)).toBe(
      "This promo code does not exist for this brand.",
    );
    expect(promoRejectionMessage({ reason: "FIRST_ORDER_ONLY" }, ctx)).toBe(
      "This promo code is restricted to first-time customers only.",
    );
    expect(
      promoRejectionMessage({ reason: "MINIMUM_NOT_MET", minimum_order_amount: 20 }, ctx),
    ).toMatch(/^Minimum order is .*20/);
  });

  it("falls back to a general message", () => {
    expect(promoRejectionMessage(null, ctx)).toBe(
      "This promo code could not be applied. Check its eligibility rules.",
    );
  });
});
