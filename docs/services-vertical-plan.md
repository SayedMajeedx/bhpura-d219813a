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
- **S1: item kind and modules** (done, PR #184). Migration: `products.item_kind`, default
  `product`; services stores' current items become `service`. New modules
  (stock, incubators, packaging, shipping, returns), off for services by
  default; menu, inventory tabs and dashboard follow them. Services are only
  booked (no cart buttons).
- **S2: the service editor** (done, PR #185; per-service capacity, buffer
  and notice need booking-engine changes and come with S3's engine work). "Add service": basics; packages (name,
  duration, price, compare-at) in place of the size/colour matrix; where it
  happens; what's included; booking settings (capacity, buffer, notice);
  questions for the customer (the customisation engine, renamed). A services
  list with price from, duration, packages, bookings. Migration for the new
  fields.
- **S4a: the storefront for services** (done, before S3, at the owner's request
  that services work end to end): no "sold out" on made-to-order items and
  services (ProductCardV2); service cards say how long they last; a
  service's page offers its lengths with prices, where it happens, what it
  includes, its booking terms and a mobile "Book" bar, and books the chosen
  length; the booking flow asks the services' questions and books services
  only; the server-rendered home page carries the columns the cards read
  (migration 20261001140000).
- **S3: orders** (done, PR #187). An order placed for a booking is an
  `appointment` (`orders.fulfillment_method`, set when the booking is linked
  to its order): stages Scheduled → Service done instead of packing and
  shipping, a "Service done" / "Collect balance & complete" action once the
  appointment has started, the appointment (day, time) on its row in the
  orders list, a method filter, its own labels, the event address kept, and
  the appointment on both invoices (admin preview and public). The checkout
  asks "Where is the service?" (at my venue with the travel fee, or at your
  place), shows the travel fee and the appointment in the summary, and says
  "Pay on the day". Per-service capacity, setup buffer and notice remain for
  the booking-engine step.
- **S4: the customer's journey.** Product page: duration chip, "What's
  included", "Booking & cancellation", suggested extras. Checkout: "Where?"
  (at your place: address and area, travel fee; at our venue: branch) in
  place of delivery/pickup. Account and WhatsApp messages show the
  appointment, with an add-to-calendar link.
- **S5: settings and dashboard** (done, PR #188). The dashboard of a store that
  takes bookings opens with its bookings: today's appointments, the next 7
  days, requests waiting for an answer and occupancy over 14 days (and asks a
  store with no booking rules to set its hours first); stock figures leave out
  made-to-order items and services, and the low-stock alert follows the stock
  module. The launch checklist says "Add your first service" and "Receive your
  first booking". The settings' fulfillment group, for a store without the
  shipping module, replaces shipping zones with "where your services happen"
  (at the customer's venue, at your place) and points to the booking rules for
  travel fees and the deposit.
- **S6: mobile app.** A services tab without stock; bookings in the tab bar.
- **S7: guards.** Tests that fail when a services store shows stock,
  shipping or incubator UI, or a vertical lacks a module default.
