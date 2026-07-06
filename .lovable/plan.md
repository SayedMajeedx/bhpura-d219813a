## Problem

Two issues make the scanner return nothing on a real barcode printed from the app:

1. **Scanner decode path is weak for 1D barcodes.** `barcode-scanner.tsx` grabs the full video frame into a canvas and calls `html5-qrcode.scanFile()` on every tick. `scanFile()` is a single-shot decoder tuned for QR codes and full-image scans — with a small CODE128 barcode inside a wide camera frame it almost never triggers. The native `BarcodeDetector` path silently no-ops on iOS Safari (unsupported) and on many Android Chrome builds when it can't lock on. Net result: camera opens, frames stream, nothing decodes.
2. **Photo fallback fails for the same reason.** A wide phone photo of a small label leaves the barcode as a tiny fraction of the pixels; `scanFile` can't lock on.

The generated barcode itself is a valid CODE128 (JsBarcode default), but the on-label rendering is thin (width `1.6`, height `50`, `margin 4`) which reduces reliability at typical phone distances.

## Fix

### 1. Replace the custom decode loop with `Html5Qrcode.start()`

`src/components/barcode-scanner.tsx`:

- Drop the manual `<video>` + `canvas.drawImage` + `scanFile` loop.
- Use html5-qrcode's built-in continuous scanner:
  ```ts
  await decoder.start(
    { deviceId: { exact: <id from streamRef track> } },  // reuse the pre-warmed stream's device
    {
      fps: 12,
      qrbox: (w, h) => ({ width: Math.floor(w * 0.85), height: Math.floor(h * 0.35) }), // wide, short — matches 1D barcodes
      aspectRatio: 1,
      disableFlip: false,
      formatsToSupport: SUPPORTED_FORMATS,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    },
    (decodedText) => { onDetected(decodedText.trim()); stopCamera(); onOpenChange(false); },
    () => { /* per-frame no-match: ignore */ },
  );
  ```
- Render the html5-qrcode container (`<div id="barcode-scanner-decode-region">`) as the visible viewport instead of hidden, and keep the corner-mask overlay on top of it.
- Stop the pre-warmed probe stream from the click handler before `start()` runs (html5-qrcode opens its own stream from the deviceId). This avoids `NotReadableError: Device in use`.
- Keep the existing `handleCameraError` mapping and Arabic/English messages.

### 2. Improve the photo-upload fallback

- Before calling `scanFile`, downscale/crop the uploaded image so the long edge is ≤ 1600px (html5-qrcode struggles with 12MP originals).
- Try `scanFile(file, true)` first (with verbose/preprocessing), then a second pass with `false` if it throws.
- Keep the bilingual "couldn't read" message.

### 3. Make printed barcodes more scannable

`src/components/barcode-label.tsx`:

- Bump `PrintableLabel` and `printLabels` JsBarcode options to `width: 2.2`, `height: 70`, `margin: 8` (quiet zone matters most). Keep CODE128.
- No API change; existing call sites stay the same.

### 4. Keep everything else as-is

- `openBarcodeScanner` click handler in `orders.$id.tsx`, `handleScanned` lookup by `barcode`/`sku`, and the dialog UI stay unchanged.

## Files touched

- `src/components/barcode-scanner.tsx` — rewrite decode strategy (Html5Qrcode.start) + stronger file fallback.
- `src/components/barcode-label.tsx` — thicker/taller bars + larger quiet zone for both on-screen `BarcodeSvg` (only inside `PrintableLabel`) and `printLabels`.

No DB, no route, no other component changes.
