-- A new store's hero starts in the landscape 4:3 shape on a phone.
--
-- The 4:5 portrait default made the hero 488px tall on a 390px-wide phone, 73% of
-- the first screen Safari shows (664px), so a shopper saw no product before
-- scrolling; 4:3 is 293px (44%) and leaves room for the first products. Only the
-- default changes: every existing store keeps the shape stored on its row, and a
-- merchant can still choose any of the four shapes in the hero settings.

ALTER TABLE public.business_settings
  ALTER COLUMN hero_aspect_mobile SET DEFAULT 'landscape_4_3';

COMMENT ON COLUMN public.business_settings.hero_aspect_mobile IS
  'Mobile hero aspect ratio: landscape_4_3 (default: leaves room for products on the first screen), portrait_4_5 (for reels and videos), story_9_16 or square_1_1';
