
## 1. Fix `send-order-email` Edge Function (CPU timeout)

The current function boots but hits **"CPU Time exceeded"** on every invocation (confirmed in edge logs). Root cause: `denomailer` opens a raw TLS socket to `smtp.zoho.com:465` and negotiates SMTPS handshake + AUTH LOGIN + DATA. On Supabase Edge Runtime the TLS/socket path is heavy and frequently exceeds the CPU budget before the SMTP dialog completes — this is a known Deno Deploy/Edge issue with SMTPS libraries.

**Fix:** Replace the SMTP-socket approach with a lightweight HTTP call. Since Zoho requires SMTP (no free REST API), the cleanest, resource-safe path is to send via **Zoho Mail's OAuth-less "SMTP over HTTPS" is not offered** — so we switch to a small, well-behaved SMTP client that uses the runtime's native `Deno.connectTls` with a hard timeout, plus a fast path.

Concretely:
- Rewrite `supabase/functions/send-order-email/index.ts` to:
  - Use `EdgeAuth`-style **early return + `Promise.race` timeout** (10s) around the SMTP send so we never hit the 60s CPU wall silently.
  - Keep `denomailer` (it is the correct lib) but:
    - Add `pool: false`, `debug: { log: false }`, and disable STARTTLS negotiation (we're on port 465 implicit TLS).
    - Reuse a single `SMTPClient` per invocation, `await client.close()` in `finally`.
  - Verify `x-webhook-secret` header against `ORDER_EMAIL_WEBHOOK_SECRET` using `timingSafeEqual`; return 401 fast (before DB reads) if missing/wrong. Allow authenticated Supabase JWT calls (admin resend) to bypass the header check.
  - Trim the DB round-trips into ONE `select` with embedded joins (`order_items(...)`, `customers(email,name)`, `business_settings(business_name,primary_color)`) — currently 4 sequential queries.
  - Shorten HTML template rendering (precomputed strings, no repeated `escapeHtml` on numbers).
  - Return `202 Accepted` immediately after enqueueing when payload is large; otherwise send inline.
- Update the client caller in `admin.b.$slug.orders.$id.tsx` and `$slug.checkout.tsx` to send `x-webhook-secret` header via `supabase.functions.invoke` `headers` option (for the checkout auto-trigger; admin uses JWT).
- Add proper JSON error surfacing so the frontend toast shows the real reason instead of "non-2xx".

## 2. Upgrade AI Receipt Scanner

### 2a. Extraction upgrade (`src/lib/scan-receipt.functions.ts`)

Rewrite the prompt + JSON schema to extract a full commercial-receipt structure:

```ts
{
  store_name: string | null,
  store_name_ar: string | null,
  receipt_date: string | null,   // YYYY-MM-DD
  receipt_time: string | null,   // HH:mm (24h)
  currency: string,              // ISO, default BHD
  items: Array<{
    name: string,
    name_ar: string | null,
    quantity: number,
    unit_price: number,
    line_total: number
  }>,
  subtotal: number | null,
  tax: number | null,
  tax_rate: number | null,       // e.g. 0.10
  total: number,                 // final paid — the anchor value
  category_guess: string | null, // Arabic when targetLang=ar
  description_summary: string    // short Arabic/English summary of what was bought
}
```

- Use `google/gemini-2.5-flash` via the Lovable AI Gateway (already wired).
- Enforce strict JSON schema output (`Output.object` with `structuredOutputs: false` since Gemini).
- Prompt instructs the model to: prefer the printed "Total" / "الإجمالي" / "Grand Total" line as `total`; sum(line_total) must equal `subtotal + tax` within 0.02 tolerance — else retry field-by-field extraction; translate item names to Arabic when `targetLang="ar"`.
- Fallback: if items array is empty OR total missing, run a second pass with a text-only regex fallback for `Total|Grand Total|Amount Due|الإجمالي|المجموع`.

### 2b. New review modal (`src/routes/_authenticated/admin.b.$slug.expenses.tsx`)

Replace the current simple `ExpenseDialog` "AI extracted" badge with a dedicated **`ReceiptReviewDialog`** shown right after scan completes:

Layout:
- Header: store name (large) + date/time chip + AI badge.
- Editable table of line items — columns: Item, Qty, Unit Price, Line Total, delete row. Add-row button.
- Right-side totals card: Subtotal, Tax (with rate), **Total** (bold, editable, currency selector).
- Bottom: Category input (prefilled), Description textarea (prefilled with Arabic summary), Notes.
- Actions: "Save as expense" (persists a single row with `amount = total`, `description = store + summary`, plus a new JSONB column `line_items` on `expenses`).

### 2c. Database

Migration:
- `ALTER TABLE public.expenses ADD COLUMN line_items jsonb`, `store_name text`, `receipt_time text`, `tax_amount numeric(12,3)`, `tax_rate numeric(6,4)`.
- Backfill nothing; existing rows null.
- Keep existing RLS/grants unchanged.

### 2d. Wire-up
- Scan button (existing) → call `scanReceipt` → open `ReceiptReviewDialog` with parsed data.
- On save, insert row into `expenses` including new columns.
- Loading spinner stays until every field populates; errors show precise Gateway error (429 / 402 / model error).

## Technical notes

- Edge function stays under `supabase/functions/send-order-email/` (unchanged path). No config.toml changes.
- Frontend stays entirely in the two files listed; no route additions.
- All existing translations reused; add ~8 new i18n keys for the review modal (items/qty/unit/tax/subtotal/total/add row/save).
- No changes to auth, RLS on orders/customers, or existing security posture.

## Files touched

- `supabase/functions/send-order-email/index.ts` — rewrite for speed + secret verification.
- `src/routes/$slug.checkout.tsx` — pass webhook secret header on invoke.
- `src/routes/_authenticated/admin.b.$slug.orders.$id.tsx` — surface real error message.
- `src/lib/scan-receipt.functions.ts` — new extraction schema + prompt + fallback.
- `src/routes/_authenticated/admin.b.$slug.expenses.tsx` — new `ReceiptReviewDialog`, save mapping.
- `src/lib/i18n.tsx` — new keys.
- New migration: extend `expenses` schema.
