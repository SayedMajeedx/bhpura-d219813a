import type { CartBooking } from "@/lib/bookings/cart";
import type { CheckoutForm } from "@/features/checkout/types";

/**
 * A booking's checkout asks nothing the booking page already asked: the name,
 * phone and notes come from the booking (the place is the booking's own), and
 * the address fields stay empty (an appointment has no delivery address to
 * fill). Details the customer typed that the booking does not have (an email
 * from a signed-in account, say) are kept.
 */
export function appointmentCheckoutForm(
  form: CheckoutForm,
  appointment: Pick<CartBooking, "customer" | "notes"> | null,
): CheckoutForm {
  if (!appointment) return form;
  return {
    ...form,
    name: appointment.customer?.name || form.name,
    phone: appointment.customer?.phone || form.phone,
    notes: appointment.notes ?? form.notes,
  };
}

/** Whether the form already carries the booking's details (so nothing needs setting). */
export function appointmentFormApplied(
  form: CheckoutForm,
  appointment: Pick<CartBooking, "customer" | "notes"> | null,
): boolean {
  const next = appointmentCheckoutForm(form, appointment);
  return next.name === form.name && next.phone === form.phone && next.notes === form.notes;
}
