# Gift cards: the plan

Status: **steps one to four built**. Step one (migration `20261101100000`): issuing, the list, voiding, staff taking a card on an order. Step two (migration `20261102100000`): a shopper's card at checkout, and the card charge and the transfer approval asking only for what a card leaves. Step three (migration `20261103100000`): cards sold in the store, and the reports' lines. Step four (migration `20261104100000`): cards bought by shoppers on the storefront. The owner's decision: a gift card is a **payment**
(international practice), not a discount. The order keeps its full price; VAT is charged on the
full price; selling a card is money the store holds until the card is used, not a sale of goods.

## Why it is its own piece of work

A payment by card touches every place that works out what an order still owes. Each of these
assumes today that it collects the whole amount (or the advance) itself:

| Path                       | Where                                                                                                               | What changes                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Card charge (Tap)          | `src/lib/payments/charge-plan.ts`, `api.public.payments.create-tap-charge.ts`, `tap-redirect.ts`, `webhooks.tap.ts` | charge what is due less what a gift card paid; `paidOrderUpdate` adds to `advance_paid` instead of setting it |
| BenefitPay / bank transfer | `approve_benefit_payment` (live copy: migration `20261026100000`)                                                   | records the transfer on top of the card's part, never over it                                                 |
| Advance rules and deposits | `order_advance_due` (migration `20261003160000`), `bookings.deposit_amount`                                         | an advance already covered by a card asks nothing more up front                                               |
| Balance on delivery        | `courier_complete_delivery` (migration `20260929091000`)                                                            | already reads `total - advance_paid`: follows if the card's part is in `advance_paid`                         |
| Payment state              | `trg_orders_payment_amounts` (migration `20261012130000`)                                                           | `paid` once `advance_paid = total`: a card covering everything is paid                                        |
| Checkout                   | `src/features/checkout/`                                                                                            | code field, balance preview, "to pay now"; no card or transfer step when the card covers all                  |
| Cancel and refund          | the order engine's release, returns                                                                                 | the card's part goes back to the card, never to cash                                                          |

## The design

1. **Tables** (one migration, run in a real Postgres like the others):
   - `gift_cards`: store, code (12 characters from an unambiguous alphabet, unique per store,
     stored as typed and as a hash for lookup), currency (the store's), amount issued, balance,
     expiry (optional), who bought it, for whom, a note, state (active, used up, voided).
   - `gift_card_movements`: the ledger (issued, redeemed on an order, given back on a cancel or
     refund, voided), one row per change; the balance is the sum, kept equal by the functions
     that write both, never by a screen.
   - `orders.gift_card_paid`: what cards paid on the order (part of `advance_paid`).
2. **Functions**: `issue_gift_card` (staff with `manage_orders`), `void_gift_card` (with a reason,
   stays on record), `gift_card_balance(slug, code)` for the storefront (rate-limited through a
   server function, says the balance and expiry only), and `redeem_gift_card_on_order(order,
code, amount)`: locks the card, takes at most its balance and what the order still owes, writes
   the movement, adds to `orders.gift_card_paid` and `advance_paid` in one transaction.
3. **Selling**: a store sells cards as a digital product; when its order is paid, the order page
   offers "Issue the gift card" (the amount from the line) and a WhatsApp message with the code
   that a person sends, as every other message is sent today.
4. **Using one**: at checkout (after the order is placed, as loyalty points are redeemed today,
   through a server function as the service role) and by staff on an order's money card.
5. **Reports**: cards sold are money held (a liability), not sales; a sale paid by card is a sale
   as any other. The monthly statement and the month pack gain a line for cards outstanding.

## What step two does

- **Checkout** (`GiftCardBox`, `GiftCardLines`, `useCheckoutGiftCard`, rules `features/checkout/lib/gift-card-pay.ts`): the field shows only in a store holding a usable card (`storeTakesGiftCards`). A code is looked up for its balance (`checkGiftCard` over `gift_card_balance_for_checkout`, ten tries an hour per address, `src/lib/request-tries.ts`); the summary says what the card pays, what is left and what is still paid now (`giftCardPay`: toward what is asked now first; the advance notice follows, `advanceAfterGiftCard`). When the card pays all that is asked now, no transfer receipt is asked for and the gateway is skipped.
- **Taking it** (`redeemGiftCardAtCheckout` over `redeem_gift_card_at_checkout`, service role): after the order is placed and the points are redeemed, before any payment: the order's confirmation token proves it is the shopper's, and the database takes it only on a storefront order of the last hour that no payment has begun on (`ORDER_ALREADY_PAYING`). A card that cannot be used is said; the order stands without it.
- **The card charge** (`withGiftCards`, `upfrontOf` in `src/lib/payments/charge-plan.ts`; `orderChargePlan` reads `gift_card_paid`): it charges what the order asks up front less what cards paid, the same amount for the charge, the redirect and the webhook; "already settled" is read from what was collected once a card paid part, and a deposit's charge records the card's part and its own. When nothing is left to charge, the route answers `ORDER_ALREADY_PAID` and the checkout goes to the thank-you page.
- **The transfer approval** (`approve_benefit_payment`, redefined from its live copy): the advance asked counts what cards paid, never lowers what was collected, and an order a card paid in part is not "approved already".
- **Staff** may now take part of a transfer order's balance on a card; a card-payment order is still paid in full by the card when staff take it (`GIFT_CARD_MUST_COVER_ONLINE`).

Tests: `tests/gift-cards-checkout-migration.test.ts` (real Postgres with step one and the payment state trigger), `tests/charge-plan.test.ts`, `tests/gift-cards-checkout-functions.test.ts`, `tests/place-order-gift-card.test.tsx`.

## What step three does

The owner's decision (2026-10-31): **cards are sold in the store first**. Selling one online through the checkout would charge VAT on it and count it as a sale; both are wrong for money held, and keeping them out means the order builder's tax and about ten report functions change (step four).

- **Selling** (`IssueGiftCardDialog`): issuing asks every time how the card came to be: sold in cash, on the card machine or by transfer, or given by the store (`CardOrigin`, `paidWithOf`, `cardOrigin` in `src/features/gift-cards/lib/gift-cards.ts`); `issue_gift_card` keeps it in `gift_cards.paid_with` (null for a card given). The card's sheet says it. No order, no VAT, nothing in the sales figures.
- **Reports** (`rpc_reporting_gift_cards`, finance staff through `reporting_brand_id`): per period from the cards' ledger, what was sold (and by how it was paid) and given, what was spent net of what released orders gave back, what was written off, and what the cards held at the period's end (the sum of every move before it: the liability that day); and, today, what cards in use hold, in how many cards, and what sits on cards past their end date. The monthly statement adds a section "Gift cards (money held, not sales)" in the store's currency (`giftCardStatementLines` in `src/features/finance-reports/lib/gift-card-report.ts`; a balance's total is the last month's), in its Excel copy too, and the month pack a "Gift cards" sheet (`giftCardSheet`). A sale paid by card is already in the statement's sales, when the card is spent.

Tests: `tests/gift-cards-sold-in-store-migration.test.ts` (real Postgres after steps one and two), `tests/gift-card-report.test.ts`, `tests/monthly-statement-screen.test.tsx`, `tests/month-pack.test.tsx`, `tests/gift-cards-screens.test.tsx`.

## What step four does

A card bought online is **not an order**: an order would carry VAT, stock, points and count as a sale in some twenty places of the reports. It is a purchase of its own (`gift_card_purchases`), so none of that is touched, and step three's reports count the card as money held once it is issued.

- **What a store offers** (`gift_card_settings`, off until turned on): its amounts (1 to 8) and how long a card bought online lasts, set by staff who may change settings in the Gift cards page's "Selling on the store" (`OnlineGiftCardsSection`, rules `lib/online-sales.ts`, `set_gift_card_settings`). A visitor reads it through `storefront_gift_card_offer` (only while the store sells cards online and takes a card or BenefitPay); the footers link the shop page while it does.
- **Buying** (`/<store>/gift-cards`, `GiftCardShopPage`, rules `src/features/gift-card-shop/lib/gift-card-shop.ts`): an amount offered, who it is for and a note for them, the buyer's name and phone, and a card or a BenefitPay transfer with its receipt (`BenefitTransferDetails`, the checkout's own block). `startGiftCardPurchase` (service role, ten tries an hour per address) writes it through `create_gift_card_purchase`, which checks the offer, the method and the buyer and uses the receipt once.
- **Paying by card**: `/api/public/gift-cards/charge` starts a Tap charge for the purchase's own amount and currency (by its id, store and token; a started charge resumes), and Tap's redirect (`/api/public/gift-cards/tap-redirect`) and webhook (its `gift_card_purchase_id` branch) both check the charge with Tap (`settleGiftCardCharge` in `src/lib/gift-card-purchase.server.ts`, judged by `judgeGiftCardCharge` in `src/lib/payments/gift-card-charge.ts`: captured, this purchase, this store, its amount and currency) before `settle_gift_card_purchase` issues the card once, as `paid_with` 'online'. A card payment that arrives after its purchase expired (a day) still issues it.
- **Paying by transfer**: the purchase waits on the Gift cards page under "Transfers to check", with its receipt (`getGiftCardPurchaseReceiptUrl`); approving it (`approve_gift_card_purchase`) issues the card as 'transfer'; declining it (`cancel_gift_card_purchase`) keeps a reason.
- **The code**: the purchase's own page (`/<store>/gift-card/<id>?t=<token>`, `GiftCardPurchasePage`, kept out of search engines and the subdomain redirect) shows it once paid, with a WhatsApp message the buyer sends to the person it is for (`recipientMessage`); a transfer reads as being checked, a failed card payment can be tried again.
- **Reports**: the cards' lines split what was sold into cash, card machine, transfer and paid on the store (`sold_online`).

Tests: `tests/gift-cards-sold-online-migration.test.ts` (real Postgres with steps one to three, `tests/helpers/gift-cards-db.ts`), `tests/gift-cards-online-payment.test.ts` (the routes and the webhook), `tests/gift-card-purchase-functions.test.ts`, `tests/gift-card-shop.test.tsx`, `tests/gift-cards-screens.test.tsx`.

## The refinement after step four (2026-10-31)

The owner bought a card as a guest and found three gaps: a buyer who left the page after a transfer had nothing to come back to, the store was told nothing, and a purchase's details were thin. Migration `20261105100000`:

- **How the code reaches the buyer is their choice**: WhatsApp (a phone is required) or email (an email is required), held by the table and `create_gift_card_purchase`, with the page's language kept for the messages. The purchase's page says where the code goes and offers its own link to keep.
- **A signed-in shopper keeps their cards**: the purchase carries their account (`buyer_user_id`, from the session token the server checks), and their account's Gift cards tab lists them with the code shown on a tap and what is left (`storefront_my_gift_cards`, their own cards only).
- **Both sides are told**: each purchase writes its events (placed, paid, cancelled) to an outbox the Worker sends every minute and at once after a purchase is written or paid. The buyer who chose email gets "received" for a transfer, the code once paid, and "declined" with the reason; the store's admins and new-order recipients get "transfer to check" and "sold on the store", with every detail and a link to the page. A store whose mailbox is not set up skips that email.
- **The installed admin alerts** on a transfer to check and a card paid on the store (`gift_card_new`, on by default; each device can turn it off).
- **WhatsApp codes are sent by a person** (there is no WhatsApp connection): the Gift cards page lists the paid purchases whose buyer chose WhatsApp under "Codes to send", each opening the buyer's chat with the message in their language; pressing it records that it was sent. Every purchase row shows the buyer, phone, email, how the code goes, who it is for, the note, when and where it stands.

Tests: `tests/gift-card-purchase-notices-migration.test.ts` (real Postgres), `tests/gift-card-notices.test.ts`, `tests/gift-card-account-and-sending.test.tsx`, and the step four tests above.

## Order of work

1. The tables, functions and their tests in a real Postgres; the admin page (issue, list,
   balance, void, the ledger); staff redeem on an order. Nothing in the checkout yet.
2. The checkout's code field and the payment paths above, each with its test, the card charge
   and the transfer approval first.
3. Selling cards in the store and the reports' lines (built).
4. Selling cards online, as a purchase of its own rather than an order (built), then its
   refinement: the delivery choice, the account's cards, the emails and alerts (built).
