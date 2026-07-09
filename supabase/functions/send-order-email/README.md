# Order Confirmation Email — Setup

This function sends the bilingual (AR/EN) order-confirmation email for every
new storefront order, using a **single centralized Zoho SMTP mailbox** with a
**per-brand "From" display name**.

## How it fires

```
customer checks out
   -> place_storefront_order() RPC inserts a row into public.orders
   -> AFTER INSERT trigger trg_order_confirmation_email
   -> pg_net.http_post(...)  (async, non-blocking, never fails checkout)
   -> this Edge Function
   -> Zoho SMTP -> customer's inbox
```

An admin can also click **"Resend confirmation email"** on the order detail
page, which calls `public.resend_order_confirmation_email(order_id)` — same
path, same function.

## One-time deploy steps

1. Deploy the migration `20260709130000_order_confirmation_email_system.sql`
   and this function:
   ```bash
   supabase db push
   supabase functions deploy send-order-email --no-verify-jwt
   ```
   `--no-verify-jwt` is required because the caller is Postgres (via pg_net),
   not a logged-in user — the function authenticates the call itself via the
   `x-webhook-secret` header instead.

2. Generate a random secret and set it in **both** places so they match:
   ```bash
   # a) on the Edge Function
   supabase secrets set ORDER_EMAIL_WEBHOOK_SECRET="<paste a long random string>"

   # b) in the database config table (SQL editor)
   update public.app_config set value = '<the same long random string>'
     where key = 'order_email_webhook_secret';
   update public.app_config set value = 'https://<PROJECT_REF>.supabase.co/functions/v1'
     where key = 'edge_function_base_url';
   ```

3. Set the centralized Zoho SMTP credentials on the Edge Function:
   ```bash
   supabase secrets set ZOHO_SMTP_HOST="smtp.zoho.com"
   supabase secrets set ZOHO_SMTP_PORT="465"
   supabase secrets set ZOHO_SMTP_USER="orders@boutq.store"
   supabase secrets set ZOHO_SMTP_PASS="<Zoho mailbox app password>"
   supabase secrets set ORDER_EMAIL_FROM_ADDRESS="orders@boutq.store"
   supabase secrets set PLATFORM_NAME="Boutq"
   ```
   Use a Zoho **application-specific password** (Zoho Mail → Security →
   App Passwords), not the account login password.

## Dynamic sender name

The function reads each brand's `name_ar` (falling back to `name_en`) and
builds:

```
From: "ميناز كوتور via Boutq" <orders@boutq.store>
```

so every storefront's emails appear to come from that brand, while all mail
is actually sent from — and counted against the reputation/limits of — the
one centralized `orders@boutq.store` Zoho mailbox.

## Delivery tracking

Every order row gets `confirmation_email_status` (`pending` / `sent` /
`failed` / `skipped`), `confirmation_email_sent_at`, and
`confirmation_email_error`, so failures are visible and retryable from the
admin order page instead of silently disappearing.

## Local testing

```bash
supabase functions serve send-order-email --no-verify-jwt --env-file .env.functions
curl -X POST http://localhost:54321/functions/v1/send-order-email \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <your secret>" \
  -d '{"order_id":"<an existing order uuid>"}'
```
