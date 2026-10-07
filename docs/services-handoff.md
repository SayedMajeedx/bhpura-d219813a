# Services vertical: handoff to the next assistant

Written 2026-10-02 by the assistant that built the services vertical and the
booking system (PRs #183–#196), for the next assistant (another model or
account with no memory of this work). Everything needed is in the repository
and in this file; nothing lives only in the old session. Read
[`agent-handoff.md`](./agent-handoff.md) §3 (owner rules) as well: they still
apply and this file adds to them.

---

## 0. Paste this as your first message in the new session

> You are continuing work on the services vertical of this repository (a
> photo-booth / events / rentals store type with bookings). Before changing
> anything, read in this order: `AGENTS.md`, `docs/services-handoff.md` (all of
> it), `docs/agent-handoff.md` section 3, `docs/services-vertical-plan.md`,
> `docs/behaviour-tests.md`. Then run `git checkout main && git pull`,
> `npm ci`, `npm run check` (move `.env` aside for the test run, see §2) and
> `npx supabase db query --linked "select max(version) from supabase_migrations.schema_migrations"`
> (expect `20261002150000` or later). Report what you found and propose the
> next step from section 6 before writing code. Follow the owner rules exactly:
> never write to the production database yourself (the owner applies
> migrations after you show a `--dry-run`), merge a PR only when the owner says
> "merge when green" (or "merge if green"), never enable auto-merge, one branch
> and one PR per step. The owner writes in Arabic or English, in short
> messages; answer in the language they used, briefly.

---

## 1. The owner and how they work

- One person, on **Windows** (Git Bash and PowerShell), in the Claude desktop
  app, reviewing PRs on GitHub (`SayedMajeedx/bhpura-d219813a`). Production
  runs on **Cloudflare Workers** (not Vercel: ignore Vercel checks; "green" is
  GitHub Actions plus "Workers Builds: bhpura-d219813a"). Supabase project
  `ikciahnuqhemvnyfvbyp`.
- Their loop: they ask for something (often with screenshots of their own live
  store, `aurora.boutq.store/aurora`), you build it, show the migration
  `--dry-run`, they run `npx supabase db push --linked` and say "applied", you
  verify read-only, regenerate types, open the PR, they say "merge when green".
  "merge if green" and "merge also when green" mean the same thing for the PR
  named. Approval of one PR is not approval of the next.
- They test on the live store as a real customer and report what they see.
  Take screenshots seriously: three production bugs this week were found that
  way (see §5).
- Their standards: "world-class", every screen correct in **Arabic (RTL)** and
  English, nothing asked twice (a booking's checkout must not re-ask what the
  booking page asked), invoices and orders for every booking, status words that
  fit services (no "needs packing" for an appointment).
- Their reference competitor: `https://auroraphotoboothbh.netlify.app/ar`
  (a photo-booth site). Section 6.1 lists what it has that we still lack.

---

## 2. Working here (tooling pitfalls you will hit)

- **Bash tool and heredocs.** A heredoc that contains Arabic text, `$`, backticks
  or unbalanced quotes often fails with "unexpected EOF". Write files with the
  Write tool (a Python patch script, then run it), or use small Python snippets
  with `PYTHONIOENCODING=utf-8` (printing Arabic or `↳` to a Windows console
  raises `UnicodeEncodeError` otherwise). Exact-match string patches break
  after Prettier reflows lines: re-read the current text first.
- **Run tests with `.env` moved aside** (CI has no Supabase environment):
  `mv .env "$TEMP/env.bak"; npx vitest run …; mv "$TEMP/env.bak" .env`. Moving
  `.env` kills a running dev server (restart the preview after). The full run is
  about 3 minutes.
- **Quality gate before every push:** `npm run typecheck`, `npm run lint`
  (zero warnings), `npm run format:check` (run `npx prettier --write src tests`),
  the full suite, `npm run db:migrations:check`, `node scripts/maintainability-metrics.mjs`,
  and for the mobile app `cd apps/boutq-os-mobile && npm run typecheck`.
  Ratchets (`tests/maintainability-ratchet.test.ts`): no new `as any`, `: any`
  (comments too), `as never`, `eslint-disable`, no new `readFileSync` test files;
  new files under 600 lines; a file already over 1000 lines may not grow
  (`src/routes/$slug.account.tsx` hit this: transform in the data layer instead).
- **Flaky under load:** the first test of `tests/storefront-booking-page.test.tsx`
  and `tests/content-studio-screen.test.tsx` can time out when the whole suite
  runs at once; rerun the file alone before concluding anything. PGlite tests set
  `vi.setConfig({ testTimeout: 60_000 })`.
- **Never change generated files by hand:** `src/integrations/supabase/types.ts`
  is regenerated with `npx supabase gen types typescript --linked > $TEMP/types.ts`,
  copied over, then `npx prettier --write` on it. `src/routeTree.gen.ts` too.
- **Production is read-only for you:** `npx supabase db query --linked "<select>"`
  (one statement per call: only the last statement's rows come back; `-o json`
  for scripting), `npx supabase functions list`. Never `db push`, `migration
repair`, DDL, DML or function deploys. The owner runs those.
- **Storefront cart tracking writes to production** (abandoned carts). Never
  load a seeded cart in the live browser. The built-in browser pane can read
  public pages (the competitor, the live storefront) but cannot reach
  `localhost` servers started by the shell.
- A PR's migration must already be applied to production or CI's drift check
  fails: apply, verify, regenerate types, then open the PR. Docs-only and
  code-only PRs have no such wait.

---

## 3. State of the work (2026-10-02, `main` at PR #196)

### 3.1 Merged PRs of the services effort

| PR   | What                                                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #183 | S0: the appointment shows on the order, thank-you page, email                                                                                            |
| #184 | S1: `products.item_kind`, store modules (stock/incubators/packaging/shipping/returns/bookings), services sold only with a booking                        |
| #185 | S2: the service editor (lengths and prices, where it happens, what it includes)                                                                          |
| #186 | S4a: services on the storefront end to end (product page panel, booking page, mobile bar)                                                                |
| #187 | S3: appointment orders (`fulfillment_method = appointment`, `scheduled` stage) and a booking checkout (hold → cart → order)                              |
| #188 | S5: dashboard and settings for a store that takes bookings                                                                                               |
| #189 | Booking engine v2: per-service capacity, scope (day / time), setup buffer, notice; availability and free-start RPCs; tested in a real Postgres (PGlite)  |
| #190 | S7: guard tests (every vertical's modules, menu, inventory tabs, services are never "sold out")                                                          |
| #191 | S6: merchant app (Bookings tab, Services tab, modules)                                                                                                   |
| #192 | Invoices on every booking (`create_booking_order`), booking-time offers (discount rules), booking card with invoice/WhatsApp, offers dialog              |
| #193 | Packages (services made of services), a booking's summary-only checkout, Arabic time ranges (`formatClockRange`), guest-checkout `customers.user_id` fix |
| #194 | Storefront checkout invoice-number fix, BenefitPay holds, add-ons / extra hours / richer offers (database), card-deposit fix                             |
| #195 | Add-ons and extra hours (editor and booking page), appointment statuses read "scheduled", pending days coloured on the calendar                          |
| #196 | The start-time grid follows the page direction (RTL)                                                                                                     |

### 3.2 Migrations (all applied to production; `max(version) = 20261002150000`)

| Version               | Purpose                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20260930100000…       | Booking engine: `booking_settings`, `bookings`, `booking_items`, `booking_blocks`, day state, `request_booking`, staff functions                      |
| 20260930120000…240000 | Requests, checkout (`hold_booking`, `place_booking_order`, `sync_bookings_with_order`), deposits, pricing/travel fees, calendar feed                  |
| 20261001100000        | `products.item_kind`; a service is made to order (trigger); service lines need a booking                                                              |
| 20261001120000        | Service details (`service_location`, `service_includes`), `duration_minutes` variants                                                                 |
| 20261001140000        | Storefront page data carries services                                                                                                                 |
| 20261001160000        | Appointment orders                                                                                                                                    |
| 20261001180000        | Per-service capacity/scope/buffer/notice, `get_service_availability`, `get_service_free_starts`                                                       |
| 20261002100000        | `booking_discount_rules`, `apply_booking_discount`, `set_booking_discount`, `get_booking_discounts`, `reprice_order_totals`                           |
| 20261002110000        | `create_booking_order` (every booking has an order/invoice; confirm/cancel keep the order in step)                                                    |
| 20261002120000        | Packages: `products.is_package`, `service_package_items`, `booking_items.parent_item_id`, `expand_booking_packages`                                   |
| 20261002130000        | Fix: guest checkout inserted customers/addresses without `user_id`                                                                                    |
| 20261002140000        | Add-ons (`service_options`), `extra_hour_price`, offers with `requires_product_ids` / `stackable` / `event_from` / `event_to`, gallery and FAQ tables |
| 20261002150000        | Fix: storefront order builder wrote a text invoice number; BenefitPay bookings are held 24 h; staff can confirm or release a hold                     |

### 3.3 Owner actions still pending

1. **Deploy `send-order-email`** (it was verified stale on 2026-10-02: live
   version 48, updated before the S3 change to `appointment.ts`). They run
   `npx supabase functions deploy send-order-email`; check with
   `npx supabase functions list` (newer `updated_at`, version 49+).
   `user-management` is current.
2. **Test the live checkout end to end** after #194 (a first-time phone number,
   card and BenefitPay) and report anything. Nothing about the storefront
   checkout could be run by the assistant (it needs a seeded cart).
3. Merge nothing without their word.

### 3.4 Never looked at in a browser

The admin screens need the owner's login, so these were verified only by
rendered tests: the booking card (invoice block, discount editor, pending
banner), the offers dialog, the service editor sections (packages, add-ons,
extra hours, booking rules), the calendar's pending colour, the order header
for appointments, the mobile app screens (never run on a device or simulator),
the subscription page's payment cards. Ask the owner for screenshots after
each such change.

---

## 4. How the system works (the parts you will touch)

### 4.1 Data model

- `booking_settings` (per store: hours, slots, durations, lead days, horizon,
  daily capacity, deposit %, hold minutes, timezone, closed weekdays, travel
  fee default, calendar token). `bookings` (status `hold | requested |
confirmed | completed | cancelled | expired`; `order_id`, `total`,
  `travel_fee`, `deposit_amount`, `discount_*`), `booking_items` (service
  lines; child lines point at their parent with `parent_item_id`: a package's
  included services are unpriced children with `option_id IS NULL`; an add-on
  is a priced child with `option_id` set and `product_id NULL`), `booking_blocks`.
- `products.item_kind` (`product | service`), `is_package`, `extra_hour_price`,
  `booking_capacity`, `booking_scope` (`day | time`), `booking_buffer_minutes`,
  `booking_notice_hours`; services priced by length have variants with
  `duration_minutes`. `service_package_items` (package → included services).
  `service_options` (add-ons: mode `included | required | default_on |
optional`, flat price or `tiers {step, prices[]}`, `max_quantity`).
  `booking_discount_rules` (percent/fixed; window of days between booking and
  event; weekdays; services; booking dates `valid_from/to`; event dates
  `event_from/to`; `requires_product_ids`; `stackable`).
  `store_gallery_items`, `store_faq_items` (tables exist, **no screens yet**).
- Modules: `business_settings.store_modules` over the vertical registry
  defaults (`src/lib/verticals/registry.ts`); services = bookings on, stock /
  incubators / packaging / shipping / returns off. (The merchant app once kept a
  copy of the rules; it is now a shell around the web admin, so there is none.)

### 4.2 The flows

- **Storefront request** (catalog stores): `request_booking(brand, day, start,
minutes, items, customer, location, notes)` → a `requested` booking; the
  customer sends it on WhatsApp. Items are `[{product_id, variant_id?, quantity,
options?: [{option_id, quantity}]}]`. The server picks the variant (by
  length), adds extra hours beyond the longest length, expands packages,
  writes add-ons, checks notice/capacity, adds the travel fee, applies the
  best offer(s).
- **Storefront checkout** (shop stores): `hold_booking` (same checks, holds the
  day `hold_minutes`) → services go to the cart as `CartBooking`
  (`src/lib/bookings/cart.ts`: who, where, notes, discount, add-ons total) →
  checkout shows `AppointmentDetailsCard` + payment only → `place_booking_order`
  builds the order through `place_storefront_order` (which prices lines from
  variants), then adds package lines (free), add-on lines, an "Extra time" line
  for the hours past the longest length, subtotal, the booking's discount, VAT
  (`reprice_order_totals`), and the card deposit. Card holds 30 min; BenefitPay
  holds 24 h until staff approve the receipt (the order's `approve_benefit_payment`
  marks it paid, `sync_bookings_with_order` confirms the booking); cash confirms.
- **Staff**: `create_staff_booking`, `reschedule_booking`, `set_booking_status`
  (hold/expired → confirmed re-checks the day; any → cancelled cancels the
  order), `set_booking_discount`, `create_booking_order`. Every confirmed
  booking has an order; a request can be invoiced as a quote.
- **Offers**: `apply_booking_discount` (best non-stackable rule plus all
  matching stackable ones, on service lines only, never on add-ons, capped at
  the services). **The TypeScript mirror `src/lib/bookings/discounts.ts` and the
  offers dialog still implement only the older rule** (window/weekdays/services/
  booking dates, one best rule): see §6.1 item 1.

### 4.3 Where things are

`src/lib/bookings/` (pure rules: `rules.ts`, `format.ts`, `service-capacity.ts`,
`service-package.ts`, `service-options.ts`, `discounts.ts`, `cart.ts`,
`errors.ts`, `order-appointment.ts`), `src/lib/data/bookings/`,
`booking-discounts/`, `service-packages/`, `service-options/`,
`src/features/bookings/` (admin), `src/features/storefront-booking/` (booking
page, hook `use-booking-flow.ts`), `src/features/checkout/`
(`AppointmentDetailsCard`, `appointment-checkout.ts`),
`src/features/inventory/components/Service*Fields.tsx` (editor sections),
`src/lib/status-labels.ts` (`effectiveFulfillmentStatus`). `AGENTS.md` §5
"Bookings" is the quick reference.

### 4.4 Testing the database for real

`tests/helpers/booking-engine-db.ts` starts an in-process Postgres (PGlite),
builds a small fixture schema, imports the migrations with `?raw` (never
`readFileSync`) and applies them in order, so `request_booking`, staff
functions, holds, `place_booking_order` (with a reduced fake of
`place_storefront_order`), offers, packages, add-ons are tested as the database
decides them: `tests/booking-engine-capacity.test.ts`, `booking-orders.test.ts`,
`booking-discounts.test.ts`, `service-packages.test.ts`, `service-options.test.ts`,
`booking-payment-holds.test.ts`. When a migration changes a function, add its
import to the harness and a test; TypeScript mirrors are checked against the
database (`service_option_price` in `service-options-ui.test.tsx`, offers in
`booking-discounts.test.ts`).

### 4.5 How migrations were written (do it the same way)

The functions are long and patched in place. Method: dump the **live**
definition (`select pg_get_functiondef(oid) from pg_proc where proname = …`
with `-o json`), patch it with a Python script using exact-match replacements
that assert each anchor occurs once, write the result into a new migration
(`CREATE OR REPLACE`, `REVOKE … FROM PUBLIC, anon, authenticated` for internal
helpers, `GRANT … TO anon, authenticated` only for public RPCs), apply it in
PGlite through the harness, then `npm run db:migrations:check` and
`npx supabase db push --linked --dry-run` (must list only your migration).
Always dump the live definition again right before patching: earlier
migrations in the same sequence change the same functions.

---

## 5. Production bugs found this week (so you know where the bodies are)

Found by the owner's live testing; all fixed and applied, but the **order
builder is fragile** and was rewritten once without a test, so treat any change
there with real care:

1. `customers.user_id` / `customer_addresses.user_id` are NOT NULL, and the
   guest branch of `place_storefront_order_internal_20260710` (rewritten
   2026-09-26) omitted them, so a first-time shopper's order failed
   (`null value in column "user_id" of relation "customers"`). Fixed in
   `20261002130000` (the guest customer is owned by the store's owner).
2. The same function wrote `'INV-YYMMDD-XXXXXX'` into the integer
   `orders.invoice_number`, so **no storefront order could be placed**. Fixed in
   `20261002150000` (insert 0; the `trg_allocate_brand_invoice_number` trigger
   numbers it).
3. A card deposit was computed from the order total before the booking's
   offer came off it; BenefitPay bookings were confirmed on upload. Fixed.
4. The checkout chain is `place_storefront_order` → `_core` →
   `_internal_20260710` (names are legacy). `p_fulfillment` must be
   `delivery | pickup | digital` (appointments check out as `delivery`; the
   order is made an appointment later). `_core` strips phone/email from the
   customer it hands to `_internal`.
5. Flood guard: `request_booking` allows 3 storefront requests per phone per
   hour per store: tests that book repeatedly need a store per request.

---

## 6. What is left

### 6.1 Parity with the competitor site (owner's request: "anything it has, with very professional customization")

The database side of items 1, 2, 4 is already merged; the screens are not.
Build in this order, one PR each (a migration only where stated):

1. **Offers editor and rule mirror.** Extend `src/lib/bookings/discounts.ts`
   (`DiscountRule`, `bestDiscount` → apply best non-stackable + all stackable
   matches, event dates, `requires_product_ids`, service lines only) and its
   parity test against `apply_booking_discount`; extend `BookingDiscountsDialog`
   (needs another service, stackable, event dates, "gift" preset = 100% on a
   service for chosen dates); `fetchPublicDiscounts` must map the new
   `get_booking_discounts` columns. Storefront calendar: a gift mark (🎁) and
   "up to 25%" legend like the competitor.
2. **Gallery and FAQ.** Admin editors for `store_gallery_items` (images with
   captions; use the existing media upload) and `store_faq_items` (grouped Q&A,
   Arabic and English), a data-layer module each, and storefront sections.
3. **Services landing page**: for a services store the home page becomes one
   page: hero with "view available dates", past events gallery, services cards
   (price, "booking includes", add-ons, details view), offers cards for
   packages (price before/after, saving badge, what is included, "extra hour at
   its usual price"), the booking section, FAQ, floating WhatsApp button.
   Respect the settings registry rule (`.agents/skills/settings-registry-single-source`)
   for any new scalar setting and the storefront design rules
   (`.agents/skills/storefront-premium-design-system`).
4. **Package cards and a service details view** (`PackageIncludes` exists on the
   product page; the competitor shows a card with the saving and an extra-hour
   note, plus an image carousel and a "view details" modal).
5. **Policies on the booking**: balance due N days before the event,
   cancellation/reschedule terms (deposit non-refundable, move within 3 months),
   shown on the booking page, invoice and confirmation; reminders for the
   balance (WhatsApp/email). Needs a migration for the settings and the
   booking's fields.
6. Light/dark switch, a floating WhatsApp button, SEO titles for the services
   page.

### 6.2 Smaller open items and known gaps

- Staff-created bookings take the prices staff type; **extra hours are not
  priced for staff bookings** (only the storefront path prices them).
- `get_service_free_starts` checks one unit per included service even when a
  package includes several; the booking itself still refuses with
  `BOOKING_SERVICE_FULL`.
- BenefitPay: a deposit applies to cards only (`deposit_amount`); a transfer is
  held for the whole total. The 24 h hold is hard-coded in `place_booking_order`.
- The booking card shows an order's `pending_verification` banner and the
  requests list has "BenefitPay transfers to verify", but approving still
  happens on the order screen (link). A one-tap approve with the receipt
  preview in the card would help.
- Reports (`booking-report.ts`) count package children and add-on lines as
  "services"; filter on `parent_item_id` / `option_id` if that matters.
- The merchant app has not run on a device; it shows discounts but not
  invoices or add-ons.
- `docs/bug-backlog.md` says every bug up to #35 is fixed; add new ones there
  (Where / Problem / Effect / Fix) when a refactor finds them.

### 6.3 Habits that worked

- Read the live function before patching; test it in PGlite before showing the
  owner a dry-run.
- Put the rule in a pure function in `src/lib/…`, mirror database rules in
  TypeScript only when the storefront needs to show them, and test both against
  each other.
- Keep a giant file from growing by moving the change into the data layer or a
  new module; keep new files under 600 lines.
- After each PR: short report to the owner (what merged, what is open and its
  CI state, what they should check on the live store, the next step).

---

## 7. Quick reference

```bash
git checkout main && git pull
npm ci
npm run check                     # typecheck + lint + format:check + tests (move .env aside for tests)
npm run db:migrations:check
npx supabase db push --linked --dry-run     # owner applies without --dry-run
npx supabase db query --linked "select max(version) from supabase_migrations.schema_migrations"
npx supabase functions list
node scripts/maintainability-metrics.mjs
cd apps/boutq-os-mobile && npm run typecheck
```

Current numbers (2026-10-02): 286 test files, 2,216 tests, all passing; zero
migration drift; production at migration `20261002150000`.
