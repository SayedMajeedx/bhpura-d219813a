# Services vertical: audit and plan

Approved by the owner on 2026-10-01. A services store (`store_vertical = services`,
bookings module on) was built on the product machinery: the same product
editor, stock, shipping and order stages as a dress shop. This plan makes
services first-class and hides what does not apply to them.

## Decisions (owner, 2026-10-01)

1. A services store may also sell products, so the kind is set **per item**
   (`products.item_kind`: `product` | `service`), not per store.
2. Capacity is **per service**, optional; without it the store's daily
   capacity applies.
3. A service is **always booked** (no buying a service without a date). Gift
   vouchers, if ever needed, come later.
4. Which features a store shows comes from **modules**: defaults per vertical
   in the vertical registry, overridable per store (`business_settings.store_modules`).

## Audit (2026-10-01)

### Wrong behaviour

- The appointment showed nowhere: not on the admin order, the thank-you page,
  the order email or the invoice. **S0 fixed the first three.**
- The storefront offers "Add to cart" and "Buy now" next to "Book", so a
  service can be bought without a date. **S1** (needs `item_kind`).
- The checkout asks "delivery or pickup" and passes the travel fee as the
  shipping fee. **S4.**
- A booking's order goes through packing and shipping stages. **S3.**
  (It is not sent to the tailor: those stages follow the `made_to_order`
  module, which services stores do not have.)

### Shown to a services store but not relevant

| Surface                 | What                                                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Admin menu              | Incubators & consignment (every store), Returns & exchanges (should be cancellations & refunds)                                   |
| Inventory page          | Packaging materials tab; Low stock / Out of stock tabs; variant table store stock, incubator stock, barcode, "Add sizes & colors" |
| Product editor          | Fabric type, "Suitable for: daily/evening/formal", size/colour/fabric labels, "unit cost", "base price of the product"            |
| Orders                  | Packing, shipping, out for delivery, workshop; "out of stock" confirmation                                                        |
| Dashboard               | Variant stock alerts, stock diagnostics, "Add your first product"; no bookings                                                    |
| Settings                | Shipping zones, GCC countries, "3-5 business days"; travel fees live separately in the booking rules                              |
| Storefront product page | Quantity, "Order custom piece", "Shipping & returns" (GCC delivery in 2-4 days), "Complete your order"                            |
| Mobile app              | Inventory tab with stock totals                                                                                                   |

### Missing from the service model

Per service: where it happens (at the customer's, at the venue, both),
capacity, setup/teardown buffer, what's included, cancellation policy, guest
count, extras. Today only the variants' `duration_minutes` is per service;
every other booking rule is store-wide (`booking_settings`).

## Plan (one PR per step; migrations applied by the owner after a dry run)

- **S0: appointment everywhere, no migration** (done in this PR):
  - the admin order shows its booking (`OrderBookingCard`);
  - the thank-you page shows the appointment, carried in its address like the
    fulfillment method (`src/lib/bookings/confirmation.ts`), from the
    checkout and from the card gateway's redirect;
  - the order email shows it (`send-order-email/appointment.ts`) and calls
    the fulfillment a service appointment. Needs `supabase functions deploy
send-order-email`.
- **S1: item kind and modules.** Migration: `products.item_kind`, default
  `product`; services stores' current items become `service`. New modules
  (stock, incubators, packaging, shipping, returns), off for services by
  default; menu, inventory tabs and dashboard follow them. Services are only
  booked (no cart buttons).
- **S2: the service editor.** "Add service": basics; packages (name,
  duration, price, compare-at) in place of the size/colour matrix; where it
  happens; what's included; booking settings (capacity, buffer, notice);
  questions for the customer (the customisation engine, renamed). A services
  list with price from, duration, packages, bookings. Migration for the new
  fields.
- **S3: orders.** An `appointment` fulfillment with its own stages
  (confirmed, scheduled, in progress, completed) that follow the booking;
  the appointment in the orders list and on the invoice (public invoice
  through its database function).
- **S4: the customer's journey.** Product page: duration chip, "What's
  included", "Booking & cancellation", suggested extras. Checkout: "Where?"
  (at your place: address and area, travel fee; at our venue: branch) in
  place of delivery/pickup. Account and WhatsApp messages show the
  appointment, with an add-to-calendar link.
- **S5: settings and dashboard.** One "Service area & travel fees" section in
  place of shipping zones; cancellation policy; default pages. Dashboard:
  today's bookings, the next 7 days, pending requests, occupancy. First-run
  checklist: first service, booking rules and hours.
- **S6: mobile app.** A services tab without stock; bookings in the tab bar.
- **S7: guards.** Tests that fail when a services store shows stock,
  shipping or incubator UI, or a vertical lacks a module default.
