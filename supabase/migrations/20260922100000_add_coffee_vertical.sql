-- Migration: 20260922100000_add_coffee_vertical.sql
-- Purpose: Add 'coffee' to business_settings store_vertical allowed values

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_store_vertical_check;

ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_store_vertical_check
  CHECK (store_vertical IN (
    'abayas',
    'fashion',
    'beauty',
    'food',
    'gifts',
    'print',
    'jewelry',
    'home',
    'electronics',
    'digital',
    'general',
    'coffee'
  ));
