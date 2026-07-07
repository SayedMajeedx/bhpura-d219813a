# Public Storefront + Payments + Realtime + Localization

## 1. Database migration (schema + policies)

**New columns**
- `products`: `is_active bool default true`, `media jsonb default '[]'` (array of `{type:'image'|'video', url}`)
- `product_variants`: no schema change (stock already there)
- `brands`: hero media (`hero_media jsonb default '[]'`, `hero_video_url text`, `primary_color text`, `about_ar text`, `about_en text`)
- `business_settings`: `cod_enabled bool default true`, `card_enabled bool default false`, `benefit_enabled bool default false`, `benefit_qr_url text`
- `orders`: `channel text default 'admin'` (values: `admin`, `storefront`), allow `user_id` nullable OR set to brand owner for storefront orders — simpler: keep `user_id NOT NULL` and set it to the brand's `created_by` on storefront insert
- `customers`: same — set `user_id` = brand owner for guest customers created via storefront

**Public read policies (anon)**
- `brands`: add `SELECT TO anon USING (is_active)` — safe public columns already
- `products`: `SELECT TO anon USING (is_active AND EXISTS(brand active))`
- `product_variants`: `SELECT TO anon USING (EXISTS(product active))`
- `business_settings`: create a public view `public.brand_public_settings` (security_invoker) exposing only logo, colors, currency, name, benefit_qr_url, payment toggles; grant SELECT to anon
- `customers`, `orders`, `order_items`: no anon SELECT. Instead expose a SECURITY DEFINER RPC `place_storefront_order(p_brand_id, p_customer jsonb, p_items jsonb, p_payment_method text, p_notes text)` that:
  1. Validates brand active + payment method enabled
  2. Inserts/updates customer (dedupe by phone within brand)
  3. Inserts order with `channel='storefront'`, `status='pending'`, `user_id = brand owner`
  4. Inserts order_items
  5. Calls stock deduction inline (bypass existing `sync_order_stock` which checks `auth.uid()`) — write a new helper `deduct_storefront_stock(p_order_id)` that runs as definer
  6. Returns `{order_id, invoice_number}`
- Grant EXECUTE on RPC to anon

**Realtime**
- `ALTER PUBLICATION supabase_realtime ADD TABLE products, product_variants, orders, customers;`

**Storage**
- Reuse `invoice-assets` bucket; add public read policy for `brand-media/*` prefix, or create new public bucket `brand-media` for hero videos/product videos/benefit QR

## 2. Storefront routes (`/store/$slug/*`)

Files created:
- `src/routes/store.$slug.route.tsx` — layout: loads brand + public settings, provides context (brand, settings, cart, lang), renders header/footer + `<Outlet />`
- `src/routes/store.$slug.index.tsx` — hero banner (image or autoplay muted looping video), featured products grid, categories
- `src/routes/store.$slug.products.tsx` — full catalog with filters (category, price, in-stock)
- `src/routes/store.$slug.product.$id.tsx` — product detail: media carousel (images + `<video controls>` clips), variant selector, add-to-cart
- `src/routes/store.$slug.checkout.tsx` — cart review, customer info form, address, payment method radio (only enabled shown), benefit QR panel when selected, place order → calls RPC
- `src/routes/store.$slug.thank-you.$orderId.tsx` — order confirmation

Existing `src/routes/store.$slug.tsx` becomes the route layout (renamed to `.route.tsx`).

**Client features**
- `useStorefront()` context: brand, settings, cart (localStorage-persisted per brand slug), lang (ar/en with localStorage), currency
- Header: brand logo + name (lang-based), language toggle (العربية/English) that sets `document.documentElement.dir` and `lang`, cart icon with count
- All copy via inline `t()` helper in a small `src/lib/storefront-i18n.ts` (masculine Arabic)
- Brand primary color applied via CSS variable at layout root
- Framer-motion smooth transitions; skeleton loading states
- Mobile-first: sticky bottom "Add to cart" on product page, drawer cart

**Realtime**
- In the layout, subscribe to `products`, `product_variants` for this `brand_id` → `queryClient.invalidateQueries(['storefront', slug, ...])`
- Clean teardown in `useEffect`

## 3. Brand Admin: Payment Settings

Add a new "إعدادات الدفع / Payment Settings" card in `src/routes/_authenticated/b.$slug.settings.tsx`:
- Three switches: COD, Card, Benefit Pay
- Benefit QR image upload (uses existing `uploadToBucket` helper, public URL)
- Preview of QR

Add hero media & product media upload UI:
- Brand settings: hero image/video upload → `brands.hero_media`
- Inventory product form (`b.$slug.inventory.tsx`): add multi-media uploader writing to `products.media` (images + optional short mp4 clips). Toggle `is_active`.

## 4. Real-time in admin dashboards

Add realtime subscriptions in:
- `b.$slug.orders.index.tsx` → invalidate on new orders (already listing brand orders)
- `b.$slug.customers.tsx` → invalidate on new customers
- `b.$slug.inventory.tsx` → invalidate on variant stock changes

## 5. Global Arabic copy pass — feminine → masculine/neutral

Sweep `src/lib/i18n.tsx` and any inline `ar:` strings across the app. Examples:
- "أضيفي" → "أضف"
- "سجّلي" → "سجّل"
- "مشترياتكِ" → "مشترياتك"
- "أهلاً بكِ" → "أهلاً بك"
- "قومي بـ" → "قم بـ"
- All verb endings, pronoun suffixes normalized.

Do this in a single file diff on `src/lib/i18n.tsx` and grep the routes for remaining feminine forms.

## 6. Technical notes

- Storefront queries use browser `supabase` client (anon key) — RLS + anon policies enforce safety
- Order placement uses `supabase.rpc('place_storefront_order', {...})` (no auth required)
- Videos: `<video autoPlay muted loop playsInline>` for hero; `<video controls playsInline>` in product gallery
- Media gallery component: shared between hero and product page, keyboard/swipe navigation
- Cart persists in `localStorage` keyed by `cart:${brandSlug}`
- Empty/loading/error states everywhere; toast on order success then redirect

## Out of scope (confirm if needed)
- Real card payment processor integration (Stripe/Tap/etc.) — "Card Payment" will collect intent and mark order pending manual processing unless you want a specific gateway
- Customer login/accounts on storefront (guest checkout only)
- Search / discount codes

Approve to build.
