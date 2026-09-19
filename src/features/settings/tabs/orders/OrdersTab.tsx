import { PaymentsGroup } from "./PaymentsGroup";
import { PricingGroup } from "./PricingGroup";
import { FulfillmentGroup } from "./FulfillmentGroup";
import { InvoiceGroup } from "./InvoiceGroup";

export function OrdersTab() {
  return (
    <div className="space-y-8">
      <section id="group-payments" aria-label="Payments">
        <PaymentsGroup />
      </section>

      <section id="group-pricing" aria-label="Pricing & VAT">
        <PricingGroup />
      </section>

      <section id="group-fulfillment" aria-label="Fulfillment & Shipping">
        <FulfillmentGroup />
      </section>

      <section id="group-invoice" aria-label="Invoice">
        <InvoiceGroup />
      </section>
    </div>
  );
}
