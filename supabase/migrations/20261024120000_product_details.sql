-- What a product is, in the facts its kind of store records.
--
-- A product could say only its fabric (fabric_type) and occasion, both fashion's, and a free
-- description. A perfume store's product page titled one store-wide text "Fragrance Notes" for
-- every bottle; a sweet could not say what it contains, a coffee its origin or roast, a ring its
-- metal and karat, a table its size.
--
-- products.details holds them as one object: each vertical's set of facts is defined in the app
-- (src/lib/product-facts.ts: a perfume's concentration, family and notes; a food's ingredients,
-- allergens and how many it serves; a coffee's origin, process, roast and tasting notes; a
-- jewel's metal, karat and weight; a piece of furniture's dimensions...), offered by the product
-- editor, shown on the product page and carried in Google's data. The app keeps only known
-- shapes (cleanFacts); the column keeps it an object and bounds its size, so no one can store a
-- novel in it. Every product starts with none: nothing is written for the stores that exist.
--
-- Visitors read it on the product page, so anon and authenticated may SELECT the column (the
-- products table grants its columns one by one: npm run db:catalog-columns:check). Staff write it
-- with the rest of the product. Guarded by tests/product-facts-migration.test.ts.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb
  CONSTRAINT products_details_shape
  CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 8192);

COMMENT ON COLUMN public.products.details IS
  'What the product is, in its store vertical''s facts (src/lib/product-facts.ts): an object of short texts, lists and numbers.';

GRANT SELECT (details) ON public.products TO anon;
GRANT SELECT (details) ON public.products TO authenticated;
