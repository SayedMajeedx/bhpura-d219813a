# Gift cards: the plan

Status: **decided, not built** (2026-10-31). The owner's decision: a gift card is a **payment**
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

## Order of work

1. The tables, functions and their tests in a real Postgres; the admin page (issue, list,
   balance, void, the ledger); staff redeem on an order. Nothing in the checkout yet.
2. The checkout's code field and the payment paths above, each with its test, the card charge
   and the transfer approval first.
3. Selling cards online and the reports' lines.
