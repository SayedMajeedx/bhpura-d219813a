import type { useStorefront } from "@/lib/storefront-context";

export type Storefront = ReturnType<typeof useStorefront>;

export type Fulfillment = "delivery" | "pickup" | "digital";

export type PaymentMethod = "cod" | "card" | "benefit";

/** The shopper's contact and address fields. */
export type CheckoutForm = {
  name: string;
  phone: string;
  email: string;
  label: string;
  region: string;
  block: string;
  road: string;
  house: string;
  flat: string;
  notes: string;
};

export type SetCheckoutForm = React.Dispatch<React.SetStateAction<CheckoutForm>>;

export type AppliedPromo = { code: string; amount: number };
