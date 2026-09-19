-- Migration: 20260922130000_merchant_grant_applications.sql
-- Description: Create table and RPC for merchant grant applications (Instagram 6-month initiative)

CREATE TABLE IF NOT EXISTS public.merchant_grant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  instagram_handle text NOT NULL,
  whatsapp_number text NOT NULL,
  product_category text NOT NULL,
  readiness_status text NOT NULL,
  current_sales_channel text NOT NULL,
  biggest_challenge text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'shortlisted', 'selected', 'offered_3_months', 'rejected')),
  offered_grant text NOT NULL DEFAULT 'none' CHECK (offered_grant IN ('none', '6_months_free', '3_months_free')),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.merchant_grant_applications ENABLE ROW LEVEL SECURITY;

-- Super admins have full access
CREATE POLICY "Super admins can read grant applications"
  ON public.merchant_grant_applications
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "Super admins can update grant applications"
  ON public.merchant_grant_applications
  FOR UPDATE
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete grant applications"
  ON public.merchant_grant_applications
  FOR DELETE
  TO authenticated
  USING (public.is_super_admin());

-- Secure RPC for anonymous public submissions
CREATE OR REPLACE FUNCTION public.submit_grant_application(
  p_business_name text,
  p_instagram_handle text,
  p_whatsapp_number text,
  p_product_category text,
  p_readiness_status text,
  p_current_sales_channel text,
  p_biggest_challenge text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_clean_insta text;
  v_clean_phone text;
BEGIN
  -- Basic validation
  IF trim(p_business_name) = '' THEN
    RAISE EXCEPTION 'business_name cannot be empty';
  END IF;

  IF trim(p_instagram_handle) = '' THEN
    RAISE EXCEPTION 'instagram_handle cannot be empty';
  END IF;

  IF trim(p_whatsapp_number) = '' THEN
    RAISE EXCEPTION 'whatsapp_number cannot be empty';
  END IF;

  -- Clean Instagram handle (strip leading @, spaces, URL prefixes if any)
  v_clean_insta := trim(regexp_replace(p_instagram_handle, '^(@|https?://(www\.)?instagram\.com/)', '', 'i'));
  v_clean_insta := trim(regexp_replace(v_clean_insta, '/.*$', ''));

  -- Clean phone number (keep digits and leading +)
  v_clean_phone := trim(regexp_replace(p_whatsapp_number, '[^\d+]', '', 'g'));

  INSERT INTO public.merchant_grant_applications (
    business_name,
    instagram_handle,
    whatsapp_number,
    product_category,
    readiness_status,
    current_sales_channel,
    biggest_challenge,
    status,
    offered_grant
  ) VALUES (
    trim(p_business_name),
    v_clean_insta,
    v_clean_phone,
    trim(p_product_category),
    trim(p_readiness_status),
    trim(p_current_sales_channel),
    nullif(trim(p_biggest_challenge), ''),
    'pending',
    'none'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.submit_grant_application(text, text, text, text, text, text, text) TO anon, authenticated;
