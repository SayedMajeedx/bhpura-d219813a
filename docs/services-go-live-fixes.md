# Services stores: platform fixes before going live

Found in the read-only go-live review of Aurora (the only services store) on 2026-10-26: storefront, admin and live data, as a photo booth owner would meet them. Each item is a fault in the platform. It is not the store's own setup; those items are listed at the end, for the owner.

Order: what loses a booking or misleads a customer first, then what weakens a sale, then housekeeping. Every fix comes with a test that fails before it.

| #   | Fix                                                                      | Priority             | Size   |
| --- | ------------------------------------------------------------------------ | -------------------- | ------ |
| 1   | A late transfer approval can confirm a booking over a taken slot         | Must, before go-live | Medium |
| 2   | The owner is never told a booking came in, and the screen says otherwise | Must, before go-live | Medium |
| 3   | A package's saving is stated two ways (3% and 41%)                       | Must                 | Small  |
| 4   | A shared link shows Boutq's placeholder image, not the store's           | Should               | Small  |
| 5   | A service's page leaves out its add-ons and the store's offers           | Should               | Medium |
| 6   | A product with no photo shows "لا توجد صورة"                             | Should               | Small  |
| 7   | Shop wording left on a services store                                    | Should               | Small  |
| 8   | The launch checklist does not ask what a services store needs            | Should               | Small  |
| 9   | An internal OTP test tool is in every merchant's Integrations page       | Should               | Small  |
| 10  | A services home never shows the trust bar the store saved                | Could                | Small  |
| 11  | Pura's admin email alerts have been failing                              | Separate             | Small  |

---

## 1. A late transfer approval can confirm a booking over a taken slot

**What happens.** A BenefitPay booking holds its slot for 24 hours while the owner checks the receipt (`place_booking_order`, `hold_expires_at = now() + 24 hours`). When the hold runs out, the slot frees and another customer can book it. If the owner then approves the first transfer, `approve_benefit_payment` marks the order paid and the trigger `sync_bookings_with_order` confirms the booking anyway (`status IN ('hold', 'expired')`). The only warning is a line added to the booking's notes, in English, whatever the store's language: "Paid after the hold ran out: check the day is still free." The result is two confirmed customers for one booth, and one of them has paid.

**Why it matters for Aurora.** Fix 2 shows the owner is not told when a transfer arrives, so a hold running out is the likely case, not the rare one.

**Fix.**

- At approval, the database checks whether the booking's slot is still free by the engine's own rule (the service's capacity and scope, the store's day limit, blocks). Use `get_service_free_starts` / the capacity checks `request_booking` already runs, for the booking's services, day, start and length, leaving out the booking itself.
- **Slot still free:** confirm as now, with no note.
- **Slot taken:** do not confirm. The payment is still recorded (the money arrived). The booking stays `expired` and gets a reason the staff screens can read (`late_payment_slot_taken`). The approval returns `{ slot_taken: true }`.
- On the order and booking screens, when the slot was taken, ask the owner in their language what to do: move the booking (`BookingMoveDialog`, already built), or refund. Never confirm silently.
- The approve button on a booking whose hold has run out says so before it is pressed: "انتهت مهلة الحجز منذ X ساعات".
- Replace the English note with the reason above (shown in the store's language).

**Where.**

- Live `approve_benefit_payment` (migration `20261023100000`) and `sync_bookings_with_order` (migration `20260930160000`): a new migration, redefined from the live text.
- `src/lib/data/orders/mutations.ts` (`approveBenefitPayment`).
- `src/features/orders/lib/transfer-approval.ts` (the words).
- `BookingCard` / `BookingInvoiceBlock` (the expired-hold warning).

**Tests.** In a real Postgres through the booking engine (`tests/helpers/booking-engine-db.ts`, `booking-checkout-db.ts`):

- approve within the hold: confirmed;
- approve after the hold with the slot free: confirmed;
- approve after the hold with the slot taken by another booking: payment recorded, booking not confirmed, `slot_taken` returned.

A screen test checks the Arabic warning and the move/refund choice.

---

## 2. The owner is never told a booking came in, and the screen says otherwise

**What happens.**

- Admin email alerts need the store's own SendPulse account (`getIntegration(brand, "sendpulse_admin")` in `supabase/functions/send-order-email/index.ts`). Aurora has none, so every alert is skipped: "SendPulse admin notifications are not configured for this brand" (`brand_email_notifications`, both of Aurora's orders).
- No phone is signed in to the Boutq OS app (`push_devices`: 0).
- The Notifications page (`admin.b.$slug.communications.tsx`) tells the owner "يتلقى مديرو العلامة النشطون جميع التنبيهات تلقائياً" (active brand admins receive all alerts automatically). That is false for any store without SendPulse.
- Customers are not emailed either (no `resend_customer_email`), and the WhatsApp updates are a switched-off pilot. Once a transfer is approved, the customer hears nothing unless someone messages them by hand.

**Why it matters.** A small business owner cannot be asked to open a SendPulse account to learn that a booking came in. With fix 1, a missed alert becomes a lost or double-booked day.

**Fix.**

1. **Built-in alerts.** The platform sends the owner's alerts through its own sender (the platform's Resend key, from `noreply@boutq.store` in the store's name) when the store has no SendPulse of its own. SendPulse stays as the store's own option. Alerts cover a new booking or order, a transfer waiting for approval (with how long its hold has left), and a hold about to run out (2 hours before).
2. **The same for customers' booking emails** (placed, confirmed, moved, cancelled) when the store has no Resend of its own, but only when the customer gave an email. The booking form may ask for one, optional.
3. **The Notifications page states the truth.** It shows each channel's real state: email (built-in, the store's own, or off), the phone app (how many phones are signed in, with a link to install), and the calendar link. It never says alerts go out when they don't.
4. **The dashboard** shows one line while a transfer waits ("حوالة بانتظار تأكيدك: تنتهي المهلة خلال 5 ساعات"). The bookings agenda already lists `toVerify`; it needs the time left on the hold.

**Where.**

- `supabase/functions/send-order-email/index.ts` (fallback sender, booking events).
- `admin.b.$slug.communications.tsx` and `NotificationRecipientsEditor`.
- `BookingsGlanceCard` and `waitingOnStore` (hold time left).
- The edge function must be deployed by the owner after the merge.

**Tests.**

- The sender's provider choice is a pure rule: the store's own, else built-in, else none with a reason.
- A screen test checks the page's states (built-in, own, none).
- The dashboard line with a hold's time left.

---

## 3. A package's saving is stated two ways (3% and 41%)

**What happens.** The Diamond package (5 hours, 160 BHD) reads "وفّر 3%" against 165 on the home page, and "منفصلة 273 د.ب، وفّر 41% (113 د.ب)" on its own page.

- The home card's `packageOffer` (`src/features/services-home/lib/services-home.ts`) prices the included services at their shortest length: `separatePrice(lines, products, null)` gives 3 hours each, 55 + 40 + 70 = 165.
- The package page (`PackageIncludes`) prices them at the package's own length: 5 hours, 91 + 66 + 116 = 273.

The home card is the wrong one, and it undersells the package by 108 BHD.

**Fix.** One rule for the comparison: `packageOffer` takes the package's own length (its variant's `duration_minutes`) and prices each included service at that length, as `PackageIncludes` does. The booking page's package card (`BookingPackageCard`, which compares against the variant's compare-at price) follows the same rule. Say it in money as well as percent ("وفّر 113 د.ب").

**Tests.** `tests/services-home.test.ts`: a 5-hour package of services priced by length compares at 5 hours. The home card and the package page give the same figure.

---

## 4. A shared link shows Boutq's placeholder image, not the store's

**What happens.** The home, booking and listing pages share with `og:image = https://boutq.store/og-placeholder.png` (`src/lib/seo/canonical.ts`, `__root.tsx`). A link sent on WhatsApp or posted on Instagram shows Boutq's picture, not Aurora's. A service's page already uses its photo.

**Fix.** A store's pages share, in order:

- the store's chosen share image (a setting to add, under SEO);
- else the first hero slide's still (`media_poster_url`);
- else the brand story picture;
- else the logo on the store's colour.

The listing's description stops saying "تسوّق" on a services store (`category-head.ts`; see fix 7). Two smaller points: the brand name is written three ways across titles ("Aurora", "AURORA", "اورورا"), and the product titles upper-case it ("فوتوبوث | AURORA"). Titles should use the store's own name in the page's language, as written.

**Tests.** Head builder tests for each fallback, and the Arabic name on an Arabic page.

---

## 5. A service's page leaves out its add-ons and the store's offers

**What happens.**

- Add-ons are shown only inside the booking flow and on the home card: the photobooth's instant prints (+30) and envelopes (from 15).
- The store's offers (25% within 14 days, 15% from 15 to 30 days ahead) appear only as marks on the booking calendar.

A customer reading the service page, the page most often shared, sees neither.

**Fix.**

- In `ServicePurchasePanel`, list the add-ons with their prices and what comes with every booking, using the rental card's rule (`addOnLines`, `src/features/services-home/lib/rental-card.ts`).
- Show one line per active offer that reaches the service: "خصم 25% على الحجز خلال 14 يوماً" (from `booking_discount_rules`, its words from `discountLabel`).
- The services home shows the same offers once, under the invitation to book.

**Tests.** Render the service page with add-ons and two offers, in Arabic and English.

---

## 6. A product with no photo shows "لا توجد صورة"

**What happens.** The Diamond package has no photo. Its page shows the text "لا توجد صورة" (`src/features/product-page/components/ProductGallery.tsx:136`). The rule everywhere else is the store's initials, drawn by `ProductPhotoPlaceholder`, never "No image".

**Fix.** `ProductGallery` draws `ProductPhotoPlaceholder` when a product has no photo. A package may instead show its included services' photos side by side.

**Tests.** `tests/storefront-polish.test.tsx`: a product page with no photo shows the initials, not the words.

---

## 7. Shop wording left on a services store

| Where                                                    | Says                           | Should say (services store)           |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| `/aurora/all`, title and heading (`$slug.$category.tsx`) | "كل المنتجات"                  | "كل الخدمات"                          |
| Listing back link (`$slug.$category.tsx:460`, `:633`)    | "العودة للمتجر"                | "العودة للرئيسية"                     |
| Listing description (`category-head.ts:87`)              | "تسوّق تأجير من اورورا."       | "احجز تأجير من أورورا."               |
| Product page rail (`$slug.product.$id.tsx:976`)          | "اشتراها العملاء أيضاً"        | "حجزها العملاء أيضاً"                 |
| Hero button default (`HeroSlidesEditor.tsx:99`)          | "تسوّق الآن", link `#products` | "احجز الآن", link to the booking page |

On a services home the hero button linked to `#products`, which does not exist, so it did nothing. That is Aurora's live hero today. A hero link to a section the page does not have should fall back to the booking page.

**Tests.** `tests/services-store-wording.test.tsx` extended to the listing, its head, the product rail and the hero default.

---

## 8. The launch checklist does not ask what a services store needs

**What happens.** Aurora reads 5 of 6 on the launch checklist (`StoreReadinessChecklist.tsx`). Yet a customer cannot contact it, the owner is not told of bookings, and it has no booking terms. The shop-mode list never asks about WhatsApp or contact details.

**Fix.** A services store's checklist asks for:

- a WhatsApp number or phone;
- booking terms (`booking_policies`: cancellation, refund of the deposit, moving);
- a way to be told of bookings (the app signed in, or email: see fix 2);
- at least three questions in the FAQ;
- a photo for every service and package.

It keeps the existing payment and terms page steps. Each step opens where it is done.

**Tests.** The checklist rule is pure: Aurora's data reads the missing steps.

---

## 9. An internal OTP test tool is in every merchant's Integrations page

**What happens.** `NabdaOtpPilotCard` ("تجربة Nabda OTP · تجربة مفعّلة") is rendered for every store on Integrations → All and Email/AI (`admin.b.$slug.integrations.tsx:266`). `/api/admin/nabda-otp` lets any brand admin send a code to any phone number, with a rate limit. It is a platform pilot: confusing to a merchant, and it spends the platform's messages.

**Fix.** Show the card and allow the route to the platform owner only (`isSuperAdmin` on the screen, the role check on the route). Better, move the pilot to the super admin screens.

**Tests.** The route refuses a brand admin. The card is absent for a brand admin.

---

## 10. A services home never shows the trust bar the store saved

**What happens.** Aurora saved trust badges ("نؤكد موعدك مباشرة", …) with the bar on below the hero. The home route returns `ServicesHome` before it draws `TrustBar` (`src/routes/$slug.index.tsx`), so a services store's badges never show. One saved badge, "we confirm your booking immediately", is not true while each transfer waits for approval.

**Fix.**

- `ServicesHome` draws the trust bar when it is on.
- Its starting badges are the services facts the settings say: how it is paid, "يأتيكم في موقعكم", the booking terms' refund when written.
- The badges editor warns about a claim the settings contradict (instant confirmation with transfer payment).

**Tests.** `tests/services-home-page.test.tsx`: the bar shows with its badges, and is hidden when off.

---

## 11. Pura's admin email alerts have been failing (separate)

`brand_email_notifications`: 28 admin alerts for Pura `failed` up to 2026-10-11 through its own SendPulse connection, and none recorded since. Read the failure reasons, check whether the SendPulse credentials have expired, and show a failing connection on Pura's Notifications page (fix 2's honest states).

---

## The store's own setup (not code, for the owner)

For completeness. None of this needs a change to the platform:

- **Contact:**
  - WhatsApp number, with WhatsApp turned on;
  - phone, email, Instagram;
  - the areas served.
- **Terms:**
  - booking terms (cancellation, deposit refund, moving);
  - a terms and privacy page.
- **Fix the hero button's link and text:** "احجز الآن" to the booking page.
- **Text:**
  - "الطباعة الغورية" → "الفورية";
  - the English "What's included" list (shifted by one line);
  - "photobooth" capitalised;
  - the Arabic brand name "أورورا";
  - remove the old delivery text "24-48 ساعة".
- **Diamond package:** a photo and a description.
- **Content:**
  - FAQ (the old site had about 40 questions);
  - a gallery of real events;
  - more photos per service.
- **Packages, add-ons and offers:**
  - the Pearl package;
  - magnets +25 (photobooth);
  - printing +30 (video booth);
  - the phone booth at 50% with a booth (an offer that requires another service).
- **Decisions:**
  - a deposit (العربون) instead of full payment upfront;
  - card payments (Tap).
- **Alerts:** sign in to the Boutq OS app on the owner's phone; subscribe the phone's calendar to the bookings calendar link.
- **Order #1002** still carries 10.425 BHD of VAT from before the VAT rule.
- **Launch:** one real booking end to end: book, pay by BenefitPay, approve, confirmed.
