-- Add custom price_color and product_title_color to business_settings
ALTER TABLE business_settings 
ADD COLUMN IF NOT EXISTS price_color text,
ADD COLUMN IF NOT EXISTS product_title_color text;
