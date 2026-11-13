import type { CheckoutPart, CheckoutProblem } from "@/lib/checkout-progress";
import { checkoutFormProblem } from "@/features/checkout/lib/checkout-validation";

type FormInput = Parameters<typeof checkoutFormProblem>[0];

/** A phone a person could be reached on: eight digits or more, Arabic digits read too. */
export function phoneLooksComplete(phone: string): boolean {
  const digits = phone.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  return digits.length >= 8;
}

/**
 * How far into checkout the shopper is, and what still stands in the way of ordering: 1 once a
 * name and a phone are typed, 2 once the delivery, the pickup place or the digital contact is
 * filled in too, 3 once nothing stops the order. Read from the checkout's own rules
 * (`checkoutFormProblem`), never a copy of them.
 */
export function checkoutProgress(
  input: FormInput,
  deliveryTimeMissing = false,
): { part: Exclude<CheckoutPart, 4>; problem: CheckoutProblem | null } {
  const { form, fulfillment } = input;
  const contact =
    Boolean(form.name.trim()) && (fulfillment === "digital" || phoneLooksComplete(form.phone));
  // The delivery part alone: the same rules with the other parts taken as done.
  const delivery = !checkoutFormProblem({
    ...input,
    form: { ...form, name: "-", phone: "-", email: "" },
    acceptedTerms: true,
    method: input.method || "cod",
    receiptRequired: false,
  });
  const problem =
    checkoutFormProblem(input)?.code ?? (deliveryTimeMissing ? "delivery_time" : null);
  const part = !problem ? 3 : contact && delivery ? 2 : contact ? 1 : 0;
  return { part, problem };
}
