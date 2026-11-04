# Workshop flow: job sheets, supplier orders, alterations and changes — the plan

Status: **PRs 1, 2 and 3 built** (2026-11-03: the sheet and the supplier's message in Arabic,
English or both, migration `20261115100000`; one "Send to workshop" step for every member of
order staff, migration `20261116100000`; alterations of ready-made and custom pieces, charged on
the open order or a linked one, migration `20261117100000`). PR 4 to come. Written
2026-11-03 from a read-only review of `main` at `d48e8277` plus PR #492. Four pull requests, in
order. Each one stands on its own and is merged before the next starts.

## The owner's report (2026-11-03)

1. A custom-made order's **job sheet prints in one language only** (the admin screen's). It must
   print in English or Arabic, chosen at print time.
2. Printing the job sheet and **registering the piece on the supplier's order are two separate
   steps** in two places. It must be one step.
3. **Alterations** of ready-made and custom-made pieces are hard to find and not joined to the
   supplier's order. Changes the customer asks for after the order is placed reach nobody.

## The owner's decisions (2026-11-03)

| #   | Question                                                                                                                      | Decision                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Offer a third print choice, **Arabic and English side by side** on one sheet?                                                 | **Yes.**                                                                                                                                                                        |
| 2   | An alteration asked for **after the order was delivered / completed**: add it to that order, or a **new order linked** to it? | **A new linked order** (the original sale stays in its month; the alteration has its own invoice). An alteration on an order still open is **a new priced line on that order**. |
| 3   | Alterations on **ready-made** pieces: every clothing store, or only stores with the `made_to_order` module?                   | **A store setting "We do alterations"**, on by default for clothing stores (the fashion family), off for the rest; the store can change it.                                     |
| 4   | Staff **without** `view_financials` putting a piece on a supplier's order **with no price**?                                  | **Yes.** The price is left for finance staff to fill in; the order shows it is missing.                                                                                         |

## Before you start: how this repository works

Read `AGENTS.md` first. The rules that matter most here:

- **Migrations are applied by the owner**, never by you: write the migration, test it in a real
  Postgres (PGlite, the `?raw` import pattern of `tests/*-migration.test.ts`), run
  `npx --yes supabase@2.122.0 db push --linked --dry-run`, and stop. After the owner applies it,
  regenerate the types with `npx --yes supabase@2.122.0 gen types typescript --linked`, remove the
  `graphql_public` block the CLI adds, write the result to `src/integrations/supabase/types.ts`
  and run Prettier on it (the diff should be only your migration's columns and functions).
- **Never redefine a live function from an older migration's copy.** Read the live definition
  first (`npx supabase db query --linked "select pg_get_functiondef(...)"`) and change only what
  you need. `receive_purchase_order` and `send_order_to_supplier` below are such functions.
- **Every SECURITY DEFINER function a browser can call** checks its caller inside
  (`can_access_brand`, `has_permission`), is listed in `supabase/function-grants.json` with its
  reason, and is revoked from `anon`. A function only the server or the database calls is
  revoked from `anon` and `authenticated`.
- **A database refusal is read with `getFriendlyErrorMessage` or a feature's own word table**
  (`src/features/supplier-orders/lib/errors.ts`, kept complete by
  `tests/supplier-order-errors.test.ts`), never with `error instanceof Error`.
- **Data access** lives in `src/lib/data/<domain>/` (`selects.ts`, `keys.ts`, `queries.ts`,
  mutations); screens call `useQuery(xxxQueries.foo(...))`.
- **Words**: every label in Arabic and English; counts through `countOf` / `arNoun` (the count
  last in Arabic); money through `formatMoney(amount, currency, lang)`; an order number through
  `orderNumberLabel` / `useOrderNumber`; a line's name through `orderLineName(line, lang)`; option
  names through the store's axes (`resolveAllVariantAxes`, `describeVariantAxes`); the default
  variant through `src/lib/default-variant.ts`. Asking before an irreversible step is
  `confirmDialog`, never `window.confirm`.
- **Ratchets**: a new file stays at or under 600 lines; a file over 1,000 lines cannot grow; use
  `Button` instead of a hand-made `<button>`; no new `as any` / `as never`.
- **Tests test behaviour**: pure rules in a feature's `lib/`, screens rendered with the data layer
  mocked under **both** import paths (`@/lib/data/x` and `../src/lib/data/x`), the Supabase
  client mocked too (CI has no Supabase environment).
- **Before a PR**: `npm run typecheck`, the full `npx vitest run` (write it to a file and read the
  summary), lint and Prettier on the files you changed, `npm run db:migrations:check`, and a line
  in `AGENTS.md` (section 5, under "Supplier orders" / "Orders & Checkout") describing what you
  built and its tests. Fill in `.github/pull_request_template.md`.
- Commit only your own files: the owner's working copy holds untracked files that are not part of
  any change (`.agents/skills/…`, `.mcp.json`, `components.json`, `src/components/SplitText.jsx`).

## What exists today (verified 2026-11-03)

**The job sheet**

- Built by `src/features/orders/lib/job-sheet.ts`: `isWorkshopLine` (a line with
  `location = 'custom'`, a hand-made custom line `variant_id = 'custom'`, or one with the
  customer's answers; never a service), `jobSheetPieces(lines, products, { lang, brandAddons,
storeVertical })` and `jobSheetHtml({ brand, workshop, orderNumber, numberFormat, orderDate,
customerName, orderNote, pieces, lang })`.
- Printed by `printJobSheet` in `src/features/orders/actions/order-document-actions.ts`, with the
  **admin screen's `lang`** for everything, and a piece's title is `line.description` as written
  (not `orderLineName`). Offered only when the store has the `made_to_order` module and the order
  has a workshop piece (`makesToOrder`).
- Shown as "Print job sheet" in `OrderSalesDocumentsCard` (`src/components/orders/`), the
  "Sales Documents & Lifecycle Chain" card near the foot of the order page.
- The supplier's WhatsApp message (`supplierMessage` in
  `src/features/supplier-orders/lib/supplier-message.ts`, `SupplierMessageDialog`) reuses
  `jobSheetPieces`, also in the reader's language only.

**Sending a piece to the supplier**

- "Send to workshop" is the order's main button when `getOrderWorkflow(...).nextAction ===
'send_to_tailor'` (`renderOrderPrimaryAction` in
  `src/features/orders/components/order-primary-action.tsx`, `SendToTailorButton` in
  `src/features/supplier-orders/components/TailorButtons.tsx`).
- For staff with `manage_orders` **and** `view_financials` it opens `SendToTailorDialog`
  (supplier, one of their open orders or a new one with its due day, each piece's price, rules in
  `lib/customer-pieces.ts`) and calls `send_order_to_supplier(order, vendor, po, lines,
expected_at)` (SECURITY DEFINER; refuses `NOT_AUTHORIZED` without both permissions;
  `INVALID_PIECE_COST` when a cost is missing). Everyone else gets a plain stage move: the piece
  never reaches a supplier's account.
- After the send: a toast offering "Tell the customer" (`workStartedMessage`). **No job sheet is
  offered**, and the sheet knows nothing of the supplier, the supplier order number or the due
  day.
- `vendors`, `purchase_orders` and `purchase_order_items` are readable only with
  `view_financials` (policies `can_access_brand(brand_id) AND has_permission('view_financials')`).
  `vendors` has no language column (`name`, `phone`, `email`, `contact_person`, `tax_number`).
- Several orders at once: the supplier orders page's "Pieces to make" tab (`PiecesToMakeTab`,
  `usePiecesToMake`, `sendBatches`). The supplier order page has "Message" but **no "print job
  sheets"**.

**Alterations and fixes**

- `purchase_order_items.purpose` is `make`, `fix` or `alteration`, with `work_note`
  (migration `20261021100000`). `send_order_to_supplier` takes each line's `purpose` and `note`.
- On the order: `OrderTailorPieces` (inside `OrderSalesDocumentsCard`) shows which supplier has
  each piece, "Fix or alter" on a piece that came back, and "Send a piece for alteration" for a
  piece never sent (`readyToAlter`) — **only** in a store with the `made_to_order` module and
  **only** for staff with `view_financials` + `manage_orders`. `SendBackDialog` asks the supplier,
  their order, the due day, the supplier's charge and what to change.
- The supplier's charge for an alteration is added to the **original piece's**
  `order_items.unit_cost` when it is received (`receive_purchase_order`, the `order_item_id`
  branch). **What the customer pays is not recorded anywhere** ("added to their order apart").
- There is no alteration job sheet, and nothing on the order says a piece is out for alteration
  beyond that card.

**Changing a custom order**

- An order line's measurements and answers are `order_items.custom_field_values` (jsonb list of
  `{ key, label_ar, label_en, value }`), shown read-only on the line (`OrderLineCard`). No screen
  corrects them, and no record says a sheet already went to the supplier.

## The scenarios to cover

| #   | Scenario                                                              | Today                                                                    | After                                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| S1  | A custom order arrives; it goes to a tailor                           | Two steps in two places; the sheet in the screen's language only         | One "Send to workshop": supplier order, sheet in the tailor's language, message, customer told (PRs 1-2) |
| S2  | It is made in the store's own workshop                                | Stage move; sheet separate                                               | "Our workshop" in the same step; sheet printed (PR 2)                                                    |
| S3  | Several orders go to one tailor                                       | Sent together; sheets printed one order at a time                        | All the tailor's sheets in one print from the supplier order (PR 2)                                      |
| S4  | Staff without finance access send a piece                             | The tailor's account never hears of it                                   | On the tailor's order with "price to add" (PR 2)                                                         |
| S5  | A ready piece needs an alteration before it leaves (hemming an abaya) | Buried; customer charge not recorded                                     | "Alter this piece" on the line; charge as a line on the open order; alteration sheet (PR 3)              |
| S6  | A delivered piece comes back for a paid alteration                    | Same as S5, and adding to a completed order would move last month's sale | A new order linked to the original, with its own invoice (PR 3)                                          |
| S7  | A piece comes back with a fault                                       | "Fix or alter", free                                                     | Same, from the same "Alter this piece", free, no charge line (PR 3)                                      |
| S8  | The customer changes a measurement before or while the piece is made  | Cannot be corrected; the tailor is never told                            | "Change measurements" with a record; "Revision 2" sheet and a change message to the tailor (PR 4)        |
| S9  | A piece is cancelled while at the tailor                              | Handled (`CancelledPieceDialog`)                                         | Unchanged                                                                                                |

---

## PR 1 — The job sheet in English, Arabic, or both

**Goal**: choose the language when printing; the sheet (and the supplier message) speak it
entirely. Default to the supplier's language when the piece is on a supplier's order, else the
screen's.

### Database (migration `20261115100000_vendor_language.sql`)

```sql
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS preferred_language text;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_preferred_language_check
  CHECK (preferred_language IS NULL OR preferred_language IN ('ar', 'en', 'both'));
```

No function change. Test in PGlite that the check holds (a small test is enough). Regenerate the
types after the owner applies it.

### Rules (`src/features/orders/lib/job-sheet.ts`, keep it under 600 lines; split if needed)

- `type SheetLang = "ar" | "en" | "both"`.
- `jobSheetPieces` already takes `lang`; for `both`, call it twice (`ar` and `en`) and pair the
  pieces by index (they come from the same lines in the same order).
- A piece's **title** in the sheet's language: `orderLineName(line, lang)`
  (`src/lib/order-line-name.ts`) instead of `line.description`. `jobSheetPieces` needs the line's
  `name_ar` / `name_en` and the product's names, so pass the products the order editor already
  loads.
- **Option values** (a colour, a fabric): translate with the store's own translations where known
  (`translateOptionValue` in `src/lib/variant-i18n.ts`, the same lookup the storefront uses);
  otherwise print as written. Never send words to the paid translator from here.
- What the customer typed (notes, free measurements) stays exactly as written.
- `jobSheetHtml` takes `lang: SheetLang`. For `both`: one page per piece with two columns (Arabic
  on the right, English on the left, `dir` set per column), headings in both languages
  ("المقاسات · Measurements"), numbers and dates once. Keep the page A4 and the existing no-split
  rules.
- A pure helper `sheetLanguageFor({ vendorLang, screenLang })` returns the default choice.

### Screens

- `JobSheetPrintDialog` (new, `src/features/orders/components/`): three choices (العربية /
  English / both), the default from `sheetLanguageFor`, then "Print". Opened by the documents
  card's "Print job sheet" (replace the direct `printJobSheet` call). The print still opens a
  window (`window.open`; "popup blocked" toast as today).
- `printJobSheet(lang)` in `order-document-actions.ts` builds the pieces in the chosen language(s)
  (not the screen's).
- The supplier's form gets "Language for job sheets and messages" (العربية / English / both):
  `SupplierField`'s create dialog and the Vendors tab (`VendorsPurchaseOrdersTab`); read and write
  it through `src/lib/data/accounting/` (vendors are already there: `createVendor`,
  `accountingQueries.vendorOptions`).
- `SupplierMessageDialog`: the same three-way choice, defaulting to the supplier's language;
  `supplierMessage` takes `lang: SheetLang` (both: the Arabic message, a line, then the English).

### Tests

- `tests/job-sheet.test.ts`: titles from `orderLineName` in each language; option labels in each
  language; `both` pairs pieces and draws both columns; what the customer typed is untouched.
- A screen test: the print dialog defaults to the supplier's language and prints the chosen one.
- `tests/supplier-message*.test.ts`: the message in each language and in both.

### Done when

Any job sheet prints in Arabic, English or both from the documents card, a supplier remembers its
language, and the supplier message follows it.

---

## PR 2 — One "Send to workshop" step

**Goal**: sending a piece is one step that registers it on the supplier's order, prints its job
sheet and tells the people who need to know. It works for the store's own workshop and for staff
without finance access.

### Database (migration `20261116100000_send_to_workshop_without_price.sql`)

1. `purchase_order_items.price_pending boolean NOT NULL DEFAULT false`: a customer's piece put on
   a supplier's order by someone who cannot see costs; its `unit_cost` is 0 until finance staff
   set it. Clearing it: any write of `unit_cost` by staff with `view_financials` sets it false (a
   trigger, or in the existing line guard `purchase_order_items_guard`; read the live copy).
2. `send_order_to_supplier` (read the **live** definition first and change only this): staff with
   `manage_orders` **without** `view_financials` are allowed; for them every line's `unit_cost` is
   forced to 0 and `price_pending` to true, whatever was sent. Staff with both keep today's rules
   (`INVALID_PIECE_COST` when a cost is missing). Never let a caller without `view_financials`
   read a money figure back: the function returns only the supplier order's id.
3. `workshop_suppliers(p_brand uuid)` (new, SECURITY DEFINER, `manage_orders` or
   `view_financials`): returns each supplier's `id`, `name`, `preferred_language`, and its open
   orders' `id`, `po_number`, `expected_at` — **no amounts**. It is what the send dialog reads for
   staff without finance access (they cannot read `vendors` or `purchase_orders` directly).
   List it in `supabase/function-grants.json`.
4. Test all three in PGlite with the shared helper `tests/helpers/supplier-orders-db.ts` (it
   already loads the receiving, payments and customer-pieces migrations): a send by a member
   without `view_financials` writes 0 and `price_pending`, a later price by finance staff clears
   it, and `workshop_suppliers` shows no money.

### Rules

- `src/features/supplier-orders/lib/customer-pieces.ts`: `sendProblems` no longer asks a price
  when the sender cannot see costs.
- A pure `afterSendActions({ poNumber, expectedAt, vendor, hasPhone, customerReachable })` in a new
  `lib/after-send.ts` lists what the panel offers.
- The job sheet (PR 1) gains a header block: **supplier name, supplier order number, due day**,
  and a footer line "Sheet for <order number> · <PO number>". Read them from the piece's supplier
  line (`supplierOrderQueries.orderPieces`, or `workshop_suppliers` for staff without finance
  access).

### Screens

- `SendToTailorDialog` (keep it under 600 lines; move parts to new components):
  - A first choice: **a supplier** or **our own workshop**. "Our own workshop" makes no supplier
    order: it moves the stage as the plain send does today, and still prints the sheet.
  - For staff without finance access: suppliers and their open orders from `workshop_suppliers`,
    no price fields, and a note "The price is added by someone who manages the money."
  - Default sheet language from the chosen supplier (PR 1).
- **After the send, one panel** (replaces the toast in `order-primary-action.tsx`'s `afterSend`):
  "Sent to <supplier> on <PO-0007>, due <day>" with **Print job sheet** (in the supplier's
  language, the PR 1 dialog preselected), **Message the supplier** (the PR 1 message), **Tell the
  customer** (`tellCustomerWorkStarted`, when reachable), and a link to the supplier order. Each
  press is written to the order's activity log (`logActivity`).
- The documents card's job sheet block says where the piece is ("With Umm Ali on PO-0007, due 12
  Nov" or "In our workshop") and reprints with that header.
- **Supplier order page**: "Print job sheets" in its menu prints every customer piece on it, one
  page each, in the supplier's language (choice in the PR 1 dialog). It needs each piece's order
  line: read it the way `SupplierMessageDialog` already does.
- **Pieces to make tab**: after a batch send, the same after-send panel for the batch, whose
  "Print job sheets" prints all of them in one window.
- **Price to add**: a supplier order line with `price_pending` shows "Price to add" (finance staff
  see an input; the order's total says it is incomplete); the supplier orders list shows a count
  of orders with prices to add; the dashboard's supplier line mentions it.

### Edge cases

- A piece already on a supplier's order: the dialog offers only the pieces not yet sent
  (`linesToSend`, as today); reprinting a sheet never sends again.
- A cancelled customer order: refused as today (`ORDER_CANCELLED`).
- No supplier yet: the dialog offers "New supplier" (`SupplierField`, with its language).
- Receiving a `price_pending` piece: allowed; its cost on the customer's line stays 0 until the
  price is set, then `receive_purchase_order`'s customer-piece branch must not have already fixed
  the line's cost at 0 for good. Check the live branch: when the price is set later, update
  `order_items.unit_cost` for that line too (in the same function that clears `price_pending`).

### Tests

- PGlite: the three database changes above.
- Screens: a finance member sends with prices and gets the after-send panel; a member without
  finance access sends without prices and sees "price to add"; "our own workshop" prints and
  moves the stage with no supplier order; the supplier order prints all its sheets.

### Done when

From a custom order, one press of "Send to workshop" registers the piece with the supplier (or the
store's workshop), offers its sheet in the supplier's language, the message and the customer
notice, and every sheet says who has it and by when.

---

## PR 3 — Alterations, for ready-made and custom pieces

**Goal**: an alteration is one first-class record on the order, reachable from the line, priced
for the customer, tracked to the tailor or the store's workshop, with its own job sheet. A free
fix uses the same path at no charge.

### The model (migration `20261117100000_order_alterations.sql`)

1. `business_settings.offers_alterations boolean` (decision 3): the migration sets it `true` for
   stores whose `store_vertical` is in the fashion family (use the vertical registry's lineage:
   `fashion`, `abayas`, and any child; read `src/lib/verticals/registry.ts` for the list) and
   `false` for the rest; new stores take the same default in the onboarding path. Add it to the
   settings registry (`src/features/settings/registry.ts`, skill
   `.agents/skills/settings-registry-single-source`) under Orders, with its owner, and a switch
   "We do alterations" in Orders settings.
2. `order_alterations` (new table):
   - `id`, `brand_id`, `order_id` (the order the alteration is **charged on**), `source_order_id`
     and `source_item_id` (the piece being altered: its order and line), `kind`
     (`alteration` | `fix`), `changes` (jsonb list of `{ key, label_ar, label_en, from, to }`,
     from the product's measurement fields), `note`, `made_by` (`supplier` | `in_house`),
     `purchase_order_item_id` (the supplier line, when a supplier does it), `customer_charge`
     numeric(12,3) (0 for a fix), `charge_item_id` (the order line that charges it), `due_at`,
     `status` (`open`, `at_workshop`, `back`, `handed_over`, `cancelled`), `created_by`,
     `created_at`, `back_at`, `handed_over_at`.
   - RLS: read and write by `can_access_brand(brand_id)` staff with `manage_orders`; money
     columns are fine to show to order staff (it is the customer's price, not a cost).
   - The supplier's **cost** stays on `purchase_order_items` (finance only), never on this table.
3. `orders.related_order_id uuid REFERENCES orders(id)` and `orders.relation text` (`alteration`):
   the linked order of decision 2. Grant SELECT on the new columns to `authenticated` as the
   `orders` columns are.
4. `create_order_alteration(p_source_item_id, p_kind, p_changes, p_note, p_made_by, p_vendor_id,
p_po_id, p_expected_at, p_supplier_cost, p_customer_charge, p_request_id)` (SECURITY DEFINER,
   `manage_orders`; a supplier cost only with `view_financials`, otherwise `price_pending` as in
   PR 2; one request id writes once). In one transaction:
   - **Where it is charged** (decision 2): the source order is still open (not completed, not
     released: use `order_counts_as_sold` / the order engine's own reading, never a hand list of
     statuses) → a new line on that order; the source order is completed or handed over → a
     **new order** for the same customer (`channel = 'admin'`, `related_order_id` = source,
     `relation = 'alteration'`, the customer's details copied as the order builder does), with
     that line. A `fix` makes no charge line and no new order.
   - **The charge line**: `order_items` with the store's words ("Alteration: <piece name>" in
     `name_ar` / `name_en`, through the piece's own names), `quantity` 1, `unit_price` =
     `customer_charge`, no product stock (no `variant_id`; never `location = 'custom'`, which
     would make it a workshop piece and ask an advance), then the order's totals through the live
     `reprice_order_totals` (tax follows the store's rule; the order's payment state follows
     `trg_orders_payment_amounts`: a paid order with a new line becomes part paid).
   - **Who does it**: `supplier` → `send_order_to_supplier`'s alteration path (purpose
     `alteration` or `fix`, `work_note` from the changes and note) and remember the supplier
     line; `in_house` → no supplier order.
   - `status` = `at_workshop`.
5. `receive_purchase_order` (read the **live** copy first): for a supplier line linked to an
   `order_alterations` row, add the supplier's cost to the **charge line's** `unit_cost` (so the
   alteration's revenue and cost sit together, and a completed month's sale never changes), not
   to the original piece's line; set the alteration `back`. A `fix` keeps today's behaviour (no
   charge line: the cost stays on the original piece, or none for a free fix). Mark lines that
   are not linked to an alteration exactly as today.
6. `set_order_alteration_status(p_id, p_status)` (`manage_orders`): `back` (for in-house work),
   `handed_over`, `cancelled` (cancelling removes the charge line from an open order and reprices
   it, or cancels the linked order through the normal order cancel; a supplier line not yet
   received is stopped like `release_customer_piece`'s `stop`).
7. Test all of it in PGlite with the real order builder's pieces the existing tests load
   (`tests/customer-pieces-after-migration.test.ts` shows how): open-order charge and repricing,
   linked order for a completed one, a free fix, receiving puts the cost on the charge line,
   cancelling, permissions, one request id writes once. Extend `tests/orders-delete-guard`
   expectations if the linked order touches them.

### Rules (`src/features/orders/lib/alterations.ts`, pure)

- `alterableLines(items, settings, modules)`: which lines can be altered — any non-service piece
  when `offers_alterations` is on (ready or custom); a fix only for a piece a supplier or the
  workshop made.
- `alterationTarget(order)`: `same_order` or `linked_order` (decision 2), the twin of the
  database's choice; run both against each other in the PGlite test.
- `measurementChanges(fields, before, after)`: the `{ key, label, from, to }` list, from the
  product's measurement fields (`products.custom_fields`, the same definitions the product page
  asks) plus free text.
- Words: `alterationStatusLabel`, `alterationLine(piece, lang)`.

### Screens

- **"Alter this piece"** in each line's menu on the order page (`OrderLineCard`) and in the
  order's own menu, shown by `alterableLines`. One dialog (`AlterPieceDialog`, new):
  - Alteration (customer pays) or fix (free).
  - What to change: the product's measurement fields prefilled with the order's values, each
    editable (only changed ones are kept), plus a note.
  - Who: a supplier (PR 2's supplier and open-order choice, its language) or our own workshop.
  - The supplier's cost (finance staff only) and the **customer's price** (default: the store's
    usual alteration price if it set one; a setting is optional, not required for this PR).
  - The due day.
  - A line saying where it is charged: "Added to this order" or "On a new order linked to
    <number>, with its own invoice".
- After saving, PR 2's after-send panel: **Print alteration sheet**, **Message the supplier**,
  **Tell the customer** (a new message in `stage-messages.ts`: received for alteration, ready on
  <day>).
- **The alteration job sheet**: `jobSheetHtml` with a `purpose` heading ("Alteration" / "Fix"),
  the changes as "from → to", the original measurements beside them, the note, the supplier order
  number and due day; same language choice as PR 1.
- **On the order**: an "Alterations" block (not inside the documents card) listing each one with
  its status, who has it, its due day and its actions (mark back for in-house work, handed over,
  cancel), and a badge on the order header while one is out. The orders list and the board show
  the same badge (`OrderWaitingBadge`'s neighbour).
- **The linked order** shows "Alteration of <original number>" with a link, and the original
  shows "Altered on <linked number>". The invoice prints the relation.
- **Supplier order pages** keep showing purpose labels (`purposeLabel`); the alteration links back
  to its customer order.
- Replace `OrderTailorPieces`'s "Send a piece for alteration" and "Fix or alter" with this one
  dialog, so there is a single way in.

### Edge cases

- An alteration on a piece whose order was cancelled: refused (`ORDER_CANCELLED`).
- A second alteration on the same piece while one is out: refused, or offered as "change the
  open one" (simpler: refuse with a clear reason).
- A store with `offers_alterations` off: no "Alter this piece"; a fix of a supplier-made piece is
  still offered (it is not a service the store sells).
- Reports: the charge line is a sale like any other (it counts through `countsAsSold`); the cost
  sits on it once received. Check `rpc_reporting_margins` names the line sensibly (it has no
  product: it should fall under an "Alterations" row, not "Unknown"). Add a margins test.
- Loyalty points, offers and promo codes: an alteration line is a staff order line; the order
  builder's storefront-only rules do not apply. Do not award points twice on a linked order
  (points follow the order's own status: check `loyalty_order_earns` on a linked order).

### Done when

Any piece (ready or custom) can be sent for an alteration from its line, the customer's price is
on an order (the same one while open, a linked one once completed), the supplier's cost lands on
that price's line, the alteration has its own sheet and status, and a free fix uses the same path
without a charge.

---

## PR 4 — Changing a custom order after it was placed

**Goal**: measurements can be corrected on the order with a record of what changed; if the piece
is already with a supplier, the supplier gets a clearly marked revised sheet and a short change
message.

### Database (migration `20261118100000_order_line_revisions.sql`)

1. `order_line_revisions` (new): `id`, `brand_id`, `order_id`, `order_item_id`, `revision`
   (integer, 2 and up), `changes` (jsonb `{ key, label_ar, label_en, from, to }` list), `note`,
   `changed_by`, `changed_at`, `told_supplier_at` (when the change message was opened).
2. `order_items.revision integer NOT NULL DEFAULT 1` and
   `purchase_order_items.sheet_revision integer`: the revision the supplier was last given (set
   by `send_order_to_supplier`, and by the "told the supplier" action).
3. `amend_order_line_details(p_item_id, p_values jsonb, p_note, p_request_id)` (SECURITY DEFINER,
   `manage_orders`): refuses a released order and a piece already received from the supplier
   (`PIECE_ALREADY_ARRIVED`: offer an alteration instead, PR 3); writes the new
   `custom_field_values` (only keys the line or the product's fields know; values bounded in
   length), bumps `order_items.revision`, writes the revision row, and records the change in the
   order's activity. Never touches prices or stock.
4. PGlite tests: a change before sending, a change while at the supplier (revision 2, the supplier
   line behind), refused after arrival, refused on a cancelled order, permissions.

### Rules

- `measurementChanges` from PR 3, reused.
- `supplierBehind(line, supplierLine)`: the supplier has an older sheet
  (`order_items.revision > purchase_order_items.sheet_revision`).
- `changeMessage({ piece, changes, poNumber, lang })` in `supplier-message.ts`: "Order PO-0007,
  piece 2: length 56 → 58", in the supplier's language (PR 1), no customer details.

### Screens

- **"Change measurements"** on a custom line (`OrderLineCard`'s menu), in view mode too (it does
  not write the editor's other fields): a dialog with the product's fields prefilled, only
  changed ones saved, a note.
- After saving, when the piece is with a supplier: "The supplier has the earlier sheet" with
  **Print revised sheet** and **Message the supplier**; pressing either records
  `told_supplier_at` and the supplier line's `sheet_revision`.
- The job sheet prints "Revision 2 — replaces the sheet of <date>" at the top, with the changed
  fields highlighted (bold with the old value struck through beside them).
- The order shows the line's history (revision, who, when, what) and a warning badge while the
  supplier is behind; the supplier order page shows the same on that line.

### Done when

A measurement can be corrected on the order, the change is on record, and a supplier holding the
earlier sheet is shown it and can be told in one press.

---

## Across all four

- **Activity log**: every send, print, message, alteration status and revision is written with
  `logActivity` in both languages, so the order's trail explains what happened.
- **Permissions**: order staff (`manage_orders`) do everything except see and type supplier
  costs (`view_financials`), per decision 4.
- **Mobile**: every new dialog works at 375px (one column; buttons in a wrapping row; fields
  44px tall on touch; `minmax(0,1fr)` in any grid). Run `npm run audit:overflow -- --admin
--screens=orders,supplier-orders` after PRs 2 and 3.
- **Docs**: each PR adds its paragraph to `AGENTS.md` section 5 and marks its step built at the
  top of this file.

## Not in scope

- Languages other than Arabic and English for sheets (a tailor reading Urdu or Hindi): a later
  step if the owner asks; the sheet's layout should not assume two languages only.
- Sending anything automatically: every message stays one a person sends on WhatsApp.
- A customer-facing alteration request on the storefront.
