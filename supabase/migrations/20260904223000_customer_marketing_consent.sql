-- Migration: Add marketing consent and opt-out tracking to customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.customers.marketing_consent IS 'Explicit opt-in consent for promotional and marketing outreach';
COMMENT ON COLUMN public.customers.opted_out_at IS 'Timestamp when the customer requested to opt out of promotional messages';
