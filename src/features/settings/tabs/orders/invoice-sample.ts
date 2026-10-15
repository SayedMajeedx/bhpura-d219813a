/**
 * A sample order for the invoice settings' preview: the store's real invoice (`InvoicePreview`)
 * drawn from the settings being edited, before any order is placed. Two lines, a delivery fee and
 * the store's own currency and tax; nothing in it is saved or sent.
 */

type Settings = Record<string, unknown>;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function sampleInvoice(bs: Settings, brandId: string) {
  const currency = typeof bs.currency === "string" && bs.currency ? bs.currency : "BHD";
  const items = [
    {
      description: "Linen abaya",
      quantity: 1,
      unit_price: 24,
      line_total: 24,
      customization_total: 0,
      customizations: [],
      selected_variant: { size: "54", color: "Black" },
    },
    {
      description: "Silk shayla",
      quantity: 2,
      unit_price: 6.5,
      line_total: 13,
      customization_total: 0,
      customizations: [],
      selected_variant: null,
    },
  ];
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const shipping = Number(bs.delivery_fee) > 0 ? Number(bs.delivery_fee) : 2;
  const taxRate = Number(bs.default_tax_rate) > 0 ? Number(bs.default_tax_rate) : 0;
  const taxAmount = round(((subtotal + shipping) * taxRate) / 100);
  const total = round(subtotal + shipping + taxAmount);
  const now = new Date().toISOString();
  const order = {
    id: "sample",
    // No store id: the preview asks the database for nothing (add-ons, bookings, branches).
    brand_id: undefined as string | undefined,
    sample_of: brandId,
    invoice_number: 1042,
    order_date: now.slice(0, 10),
    created_at: now,
    updated_at: now,
    currency,
    status: "confirmed",
    fulfillment_status: "confirmed",
    fulfillment_method: "delivery",
    payment_status: "paid",
    payment_method: "card",
    advance_paid: total,
    subtotal,
    shipping,
    delivery_fee: shipping,
    discount: 0,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total,
    notes: "",
    customers: {
      name: "Fatima Ali",
      phone: "+973 3300 0000",
      email: null,
      address: "Block 908, Road 12, House 4, Riffa",
    },
    customer_name_snapshot: "Fatima Ali",
    customer_phone_snapshot: "+973 3300 0000",
  };
  return { order, items };
}
