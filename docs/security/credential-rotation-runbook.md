# Integration Credential Rotation Runbook (Boutq OS)

## Overview & Architecture

All third-party credentials (API keys, webhook secrets, tokens) in Boutq OS are strictly stored inside **Supabase Vault** (`vault.decrypted_secrets`). Plaintext credentials are systematically prevented by check constraints (`integration_credentials_vault_only`) and zero plaintext keys are kept in `public.integration_credentials`.

Whenever a merchant updates credentials via the Admin UI (`/admin/b/$slug/integrations`), Boutq OS executes `public.save_integration_credential`:
1. Creates or updates the secret directly inside `vault.secrets`.
2. Updates `last_rotated_at = now()` and `rotated_by = auth.uid()`.
3. Sets `api_key = NULL` and `webhook_secret = NULL` in the base table.
4. Exposes only the masked suffix (`••••••••••••1234`) and the last rotation timestamp to merchants.

---

## Service Rotation Runbooks

### 1. Tap Payments (Payment Gateway)
- **Primary Use**: Processing online payments, Apple Pay, BenefitPay, KNET, Card charges.
- **Keys**: `api_key` (`sk_live_...`), `webhook_secret` (`whsec_...`).
- **Rotation Frequency**: Every 90 days, or immediately upon staff departure / suspected exposure.
- **Rotation Steps**:
  1. Log in to the [Tap Dashboard](https://dashboard.tap.company).
  2. Navigate to **Developer Settings** > **API Keys**.
  3. Generate a new Secret API Key (`sk_live_...`). Note: Do not immediately revoke the previous key.
  4. In **Webhooks**, register a secondary webhook endpoint or generate a new Webhook Secret.
  5. Go to Boutq OS Admin: `/admin/b/{store-slug}/integrations`.
  6. Click **Edit** on the `tap` integration card.
  7. Paste the new Secret Key and Webhook Secret.
  8. Click **Save**. Verify that "Last rotated" updates to current date and time.
  9. Run a sandbox or micro-transaction test.
  10. Return to the Tap Dashboard and revoke / delete the old Secret API key.

---

### 2. WhatsApp / Meta Cloud API (Communications)
- **Primary Use**: Order notifications, verification codes, marketing campaigns (opt-in only).
- **Keys**: Permanent System User Access Token (`EAAB...`), Webhook Verification Token.
- **Rotation Frequency**: Every 180 days.
- **Rotation Steps**:
  1. Access [Meta Business Suite](https://business.facebook.com) > **Business Settings**.
  2. Navigate to **Users** > **System Users**.
  3. Select the Boutq WhatsApp Bot system user and click **Generate New Token**.
  4. Select `whatsapp_business_messaging` and `whatsapp_business_management` permissions.
  5. In Boutq OS Admin (`/admin/b/{store-slug}/integrations`), edit the WhatsApp integration.
  6. Save the new token in the API Key field.
  7. Send a test notification from the test suite or admin dashboard.
  8. Revoke the prior system user token in Meta Business Manager.

---

### 3. Resend (Customer & Transactional Email)
- **Primary Use**: Customer order confirmations, receipts, and staff alerts.
- **Keys**: `api_key` (`re_...`), Verified Sender Domain.
- **Rotation Frequency**: Every 180 days.
- **Rotation Steps**:
  1. Log in to the [Resend Dashboard](https://resend.com/api-keys).
  2. Click **Create API Key**. Set permissions to **Full Access** or **Sending Access**.
  3. Copy the newly generated key.
  4. In Boutq OS Admin (`/admin/b/{store-slug}/integrations`), edit the `resend_customer_email` integration.
  5. Paste the new API key into the Resend API Key field and save.
  6. Verify the "Last rotated" timestamp updates in the card.
  7. Trigger a test order receipt to confirm delivery.
  8. Delete the previous key from the Resend Dashboard.

---

### 4. Google Gemini AI (Content Studio & Bilingual Catalog)
- **Primary Use**: Automatic Arabic/English product descriptions, SEO tags, marketing copy.
- **Keys**: Google AI Studio API Key (`AIzaSy...`).
- **Rotation Frequency**: Every 180 days.
- **Rotation Steps**:
  1. Log in to [Google AI Studio](https://aistudio.google.com/app/apikey).
  2. Click **Create API Key** within the designated Google Cloud project.
  3. In Boutq OS Admin (`/admin/b/{store-slug}/integrations`), edit the `gemini` integration.
  4. Paste the new API key and save.
  5. Run an AI product description generation test in the Admin Catalog.
  6. Delete the retired API key from Google AI Studio.

---

## Verification & Automated Audit

To verify that all stored credentials adhere to zero-plaintext rules and maintain active Vault references:

```bash
node scripts/security/audit-vault-credentials.mjs
```

This verification script confirms:
- Anonymous queries cannot access `integration_credentials`.
- All credentials have valid `api_key_secret_id` Vault pointers.
- No plaintext keys or secrets exist in the database.
- `last_rotated_at` audit dates are populated.
