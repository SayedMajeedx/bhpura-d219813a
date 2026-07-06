## Goal
Make the barcodes actually scannable by rendering them as CODE128 images (not just digits) with print options.

## Changes

**1. Install `jsbarcode`** for client-side CODE128 SVG rendering (works offline, no external calls).

**2. New component `src/components/barcode-label.tsx`**
- Renders a CODE128 barcode SVG from a code string using JsBarcode.
- Props: `code`, plus optional `productName`, `size`, `color`, `price`, `businessName` for the label layout.
- Two modes: `compact` (inline preview in tables) and `label` (full printable sticker with business name at top, product name + size/color, barcode, price at bottom).

**3. Inventory UI (`src/routes/_authenticated/inventory.tsx`)**
- Next to each variant's barcode digits, show the small CODE128 preview + a "Print" button that opens a print dialog for that single label.
- Add a "Print all barcodes" button at the top of the inventory page that opens a bulk print sheet: a grid of labels (all variants that have a barcode), sized for standard sticker sheets, page-breaks handled via CSS `@media print`.
- Business name pulled from existing `business_settings` query already used on the page.

**4. Product detail modal**
- The inventory page uses an edit dialog per product; inside that dialog, for each variant row, show a larger barcode rendering so it can be scanned directly from the screen during quick tests.

**5. Print styling**
- A dedicated `PrintableLabelsSheet` component rendered into a hidden container; on print click, use `window.print()` scoped via a body class + `@media print` rules to hide app chrome and show only the labels grid.
- Each label: business name (small, top), product name (bold), size · color, CODE128 barcode (with human-readable digits below, built into JsBarcode), price (bottom right).

## Out of scope
- No DB changes (barcode column already exists).
- No changes to scanner logic on the order page.
- No QR codes (CODE128 only, per your choice).

## Technical notes
- JsBarcode renders into an SVG ref via `useEffect`; safe for SSR because the component is only used inside authenticated client routes.
- Bulk print uses CSS grid with `page-break-inside: avoid` on each label.
