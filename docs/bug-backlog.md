# Bug Backlog

Real bugs found during the maintainability refactors (Phases 4–5). Refactors must preserve behaviour, so these were **recorded, not fixed**. Fix each in its own small PR with a test that fails before the fix.

When you fix one, delete its entry (the PR is the record). When a refactor finds a new one, add it here instead of fixing it in the refactor PR.

Line numbers are as of 2026-09-24 and may drift; search for the quoted code.

---

Every bug found up to #44 is fixed.

## Found in the services sweep (2026-10-25), for the services wording PR

- **#45 The bookings report counts add-ons and a package's services as "top services".** `bookingReport` (`src/features/bookings/lib/booking-report.ts`) adds every `booking_items` row, so "أظرف أنيقة × 100 × 1" is listed beside the photobooth; a package's services add a count at 0. Count lines with no `parent_item_id` only.
- **#46 Arabic counts glued to a noun on the services pages.** "و2 مدد أخرى" (`RentalCard.tsx`), "و1 أخرى" (`ServiceCards.tsx`), "1 موعد حان وقته" (`DashboardActionStrip.tsx`), "2 موعد مؤكد" (`BookingsGlanceCard.tsx`), and on a services store's list "0 منتج محدد", "عرض 1-6 من 6 منتج". Use `arNoun`; the guardrail misses template literals.
- **#47 `/admin/b/<slug>` is a blank page.** There is no index route under `admin.b.$slug`; send it to `homePageOf`.
- **#48 Aurora's add-ons are offered to every services store.** `STARTERS` in `ServiceOptionsFields.tsx` (attendant, instant prints, envelopes) carry Aurora's names and BHD prices (15, 30) whatever the store sells or its currency.
- **#49 Photobooth leftovers on a services store.** The booking picker still draws a camera for every rental (`BookingServicePicker.tsx`); the service editor's place choice "الاثنين" reads as Monday (`ServiceDetailsFields.tsx`, mean "كلاهما"); the header's search says "ابحث عن منتج" (`StorefrontNavigation.tsx`); the services list and editor say "المنتج" (name fields, active switch, columns, per page).

