-- One variant pointed at a picture file that no longer exists.
--
-- A new product's first variant used to be given the product's first gallery picture (the same
-- file, a second pointer). When the merchant later replaced that picture, the file was deleted
-- and the variant kept pointing at it: the storefront card, the product page and the cart, which
-- prefer a variant's picture, showed a broken image for "Abaya | Marjan" on the Pura store.
--
-- The code no longer creates the second pointer, no longer deletes a file that is still used,
-- and clears a variant's copy when its gallery picture is removed. This clears the one dangling
-- pointer that already exists (every stored picture link was checked on 2026-10-12: 180 links,
-- this one dead). The variant then shows its product's pictures, like any variant with none of
-- its own. Guarded by the id and the exact link, so it changes that row or nothing.

UPDATE public.product_variants
SET image_url = NULL
WHERE id = '9092de7c-e604-4830-817c-11d98cd5e8c6'
  AND image_url = 'https://media.boutq.store/brands/b2f628c9-cfeb-444b-befe-5dbbb9d5c9e6/product/dad779ae-6487-4255-897d-46a4ca80690d.jpg';
