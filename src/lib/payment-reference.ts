export type OrderPaymentReference = {
  payment_gateway_reference?: string | null;
  gateway_reference?: string | null;
  payment_intent_id?: string | null;
  tap_id?: string | null;
};

/**
 * Returns the canonical payment gateway reference while retaining support for
 * historical records that used an older integration-specific property.
 */
export function getPaymentGatewayReference(order: OrderPaymentReference): string | null {
  return (
    order.payment_gateway_reference ||
    order.gateway_reference ||
    order.payment_intent_id ||
    order.tap_id ||
    null
  );
}
