-- Migration: 20261214100000_post_kit_stickers.sql
--
-- The post kit's own stickers: a photo with its background taken off on the merchant's device is
-- kept beside the photo it came from, as a sticker the team can lay on any post. Additive only:
-- three columns on post_kit_photos, read and written under its existing policies.
--
--   kind       'photo' (an upload, as every row before) or 'sticker' (a cut-out, a PNG)
--   source_id  the photo it was cut from, while that photo is kept; another store's never
--   width, height  the picture's own size in pixels, when known

ALTER TABLE public.post_kit_photos
  ADD COLUMN kind text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'sticker')),
  ADD COLUMN source_id uuid,
  ADD COLUMN width integer CHECK (width BETWEEN 1 AND 10000),
  ADD COLUMN height integer CHECK (height BETWEEN 1 AND 10000);

-- A sticker has see-through parts, so it is a PNG; a photo may be any kind the folder takes.
ALTER TABLE public.post_kit_photos
  ADD CONSTRAINT post_kit_photos_sticker_is_png CHECK (kind <> 'sticker' OR url ~ '\.png$'),
  ADD CONSTRAINT post_kit_photos_not_its_own_source CHECK (source_id IS DISTINCT FROM id);

-- The source is a photo of the same store: the key names the store as well as the photo. Deleting
-- the photo keeps the sticker and forgets where it came from.
ALTER TABLE public.post_kit_photos
  ADD CONSTRAINT post_kit_photos_brand_id_id_key UNIQUE (brand_id, id);

ALTER TABLE public.post_kit_photos
  ADD CONSTRAINT post_kit_photos_source_fkey
    FOREIGN KEY (brand_id, source_id)
    REFERENCES public.post_kit_photos (brand_id, id)
    ON DELETE SET NULL (source_id);

CREATE INDEX post_kit_photos_source_idx
  ON public.post_kit_photos (source_id)
  WHERE source_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
