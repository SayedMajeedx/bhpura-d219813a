# Boutq OS — Video Transcoding & Delivery Architecture

This document describes the in-browser WebCodecs transcoding, FastStart MP4 packaging, and HTTP 206 range delivery pipeline implemented in Boutq OS.

---

## 1. Executive Summary & Design Constraints

### The Problem
Merchants upload hero banner and product showcase videos directly from smartphones. These video files are typically **30–50 MB** in size, recorded at 1080p or 4K with high phone bitrates (15–40 Mbps).
- Prior to this architecture, videos were either transcoded using paid third-party services (ImageKit, which was deprecated due to cost limits and watermarking) or "compressed" client-side via `MediaRecorder` canvas recording.
- `MediaRecorder` canvas recording is a single-pass realtime capture tool lacking proper rate control. At 720p/950 kbps, it produced severe macroblocking artifacts, washed-out colors on high-DPI displays, and non-faststart MP4 headers that prevented streaming playback.

### Constraints
1. **Zero Recurring Infrastructure Cost**: No paid serverless encoding (Cloudflare Stream), no expensive Worker container instances, no cloud ffmpeg servers.
2. **Strict Cross-Origin Isolation Independence**: Boutq OS hosts payment gateways (e.g. Tap Payments) and external embeds requiring `Cross-Origin-Opener-Policy: same-origin-allow-popups`. COEP (`Cross-Origin-Embedder-Policy: require-corp`) cannot be enabled without breaking payment redirects and third-party embeds. Therefore, multithreaded `ffmpeg.wasm` (which mandates `SharedArrayBuffer` via COEP) is strictly prohibited.
3. **Storefront Bundle Hygiene**: Transcoding libraries must never pollute storefront visitor bundles. Dynamic imports (`import("mediabunny")`) ensure that only authenticated merchants and admins executing video uploads load the muxing engine.

---

## 2. WebCodecs + mediabunny Transcoding Pipeline

### Technology Selection: Why WebCodecs?
- **WebCodecs API** (`VideoDecoder`, `VideoEncoder`, `EncodedVideoChunk`) exposes hardware-accelerated encoding and decoding directly to the web application.
- Processing speeds are typically **2× to 8× faster than realtime** on modern devices, consuming minimal memory via streaming frame decoders.
- **Why NOT ffmpeg.wasm?**
  - Threaded `ffmpeg.wasm` requires COEP/COOP headers (`SharedArrayBuffer`), which breaks checkout payment popups.
  - Single-threaded `ffmpeg.wasm` requires downloading a **~30 MB WASM binary** on the merchant's machine and encodes at **1× to 3× slower than realtime** (e.g. 90 seconds for a 30s video), frequently freezing phone browsers.
- **Why mediabunny?**
  - MIT-licensed, zero-dependency pure JavaScript demuxer and muxer.
  - Successor to `mp4-muxer`.
  - Produces compliant ISO Base Media File Format (ISOBMFF) MP4 containers with the `moov` atom placed before media data (`fastStart: true`).

### Browser Support Matrix

| Browser | WebCodecs VideoDecoder | WebCodecs VideoEncoder (H.264) | Pipeline Status |
| :--- | :--- | :--- | :--- |
| **Chrome / Edge / Chromium** (v94+) | Supported | Supported (AVC1) | Full In-Browser Transcode |
| **Safari / iOS Safari** (v16.4+) | Supported | Supported (AVC1 hardware) | Full In-Browser Transcode |
| **Firefox** (v130+) | Supported | Supported | Full In-Browser Transcode |
| **Older / Unsupported Browsers** | Unsupported | Unsupported | Safe Fallback (Original Untouched) |

### Fallback Behavior & Safety Valves
1. **Capability Detection (`isWebCodecsSupported`)**:
   - The pipeline probes for `VideoEncoder`, `VideoDecoder`, and confirms profile support via `VideoEncoder.isConfigSupported()`.
   - If unsupported (older Android/iOS, private browsing restrictions, Firefox ESR), the system safely returns the **untouched original file** with `wasCompressed: false`. The legacy `MediaRecorder` canvas recording path has been completely removed to prevent quality degradation.
2. **Safety Valve (No Inflated Files)**:
   - If the transcoded MP4 output is larger than the original input (e.g. an already heavily compressed clip), the optimizer discards the transcoded output and returns the original file untouched (`wasCompressed: false`).
3. **Codec Macroblock Alignment**:
   - H.264 requires macroblock dimensions divisible by 2. `calculateTargetDimensions()` automatically rounds odd source dimensions to even integers to prevent codec encoding faults.

---

## 3. Preset Matrix & Bitrate Management

Merchant settings and upload dialogs offer three standardized presets:

| Preset Key | Max Dimension | Video Codec & Profile | Target Bitrate | Audio Codec | Target Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`high`** (Default) | 1920px (1080p) | H.264 High / Main (avc1.640028) | ~2.5 Mbps (variable) | AAC 128 kbps | Hero banners, luxury fashion reels, high-DPI displays |
| **`balanced`** | 1280px (720p) | H.264 Main (avc1.4d001f) | ~1.5 Mbps (variable) | AAC 96 kbps | Product detail media galleries, fast 4G mobile |
| **`original`** | No downscale | Untouched source | Source bitrate | Source audio | Master archival copies; untouched upload |

- **Framerate Capping**: Videos with frame rates above 30fps are normalized to 30fps to conserve mobile cellular bandwidth without perceptible motion judder.
- **Keyframe Interval**: Fixed at 2 seconds (`keyframeInterval: 2`), enabling rapid scrubbing and low seek latency during HTTP range requests.
- **Dimension Scaling**: `calculateTargetDimensions` preserves original aspect ratios for landscape (16:9), portrait reels (9:16), and square media (1:1). Upscaling is strictly disabled.

---

## 4. FastStart MP4 Structure & HTTP 206 Delivery

### The FastStart (`moov` before `mdat`) Architecture
Standard MP4 encoders write video sample frames into the `mdat` (Media Data) atom sequentially as frames are encoded. When encoding finishes, metadata (sample tables, chunk offsets, frame timing, codec initialization data) is written into the `moov` (Movie) atom at the **end** of the file.

When a browser attempts to stream a non-faststart MP4:
1. The browser requests byte range `0-1024` to read container headers (`ftyp`).
2. Finding no `moov` atom, the browser is forced to send an HTTP range request for the **very end of the file** (e.g. bytes 48,000,000–50,000,000) to find the `moov` atom.
3. On high-latency mobile networks, this multi-roundtrip seeking causes 2–4 second delays before video playback begins.

```
Standard (Slow Seek):   [ ftyp ] [          mdat (Media Data 30MB)          ] [ moov ]
FastStart (Instant 206): [ ftyp ] [ moov ] [          mdat (Media Data 30MB)          ]
```

With `mediabunny` configured with `fastStart: true`:
- The `moov` atom is assembled and written immediately after the `ftyp` header.
- The browser downloads bytes `0-32768` on its very first HTTP `206 Partial Content` request, immediately parses track metadata and duration, and begins rendering the first video frame in under 200ms.

### Range Serving Verification (`r2-media-server.ts`)
Media stored in Cloudflare R2 is served through the custom `r2-media-server.ts` endpoint supporting RFC 7233:
- Responds with `HTTP 206 Partial Content` when `Range: bytes=start-end` is supplied.
- Returns `Accept-Ranges: bytes` and `Content-Range: bytes start-end/total`.
- Responds with `HTTP 200 OK` with full length and `Accept-Ranges: bytes` when no Range header is present (critical for Safari initial probe requests).
- Serves immutable caching headers (`Cache-Control: public, max-age=31536000, immutable`).

---

## 5. UI Integration Points & Developer Usage

### 1. Merchant Upload Dialog (`VideoOptimizerDialog.tsx`)
Rendered across all video upload surfaces:
- **Hero Slides Editor** (`src/features/settings/tabs/storefront/HeroSlidesEditor.tsx`)
- **Hero Background Group** (`src/features/settings/tabs/storefront/HomeHeroGroup.tsx`)
- **Product Inventory Media** (`src/routes/_authenticated/admin.b.$slug.inventory.tsx`)

**Capabilities**:
- Real-time transcode progress indicator (`0–100%`).
- Live size comparison card (e.g. `38.4 MB → 3.8 MB (-90%)`).
- Dual video quality preview allowing the merchant to scrub before confirming upload.
- One-click "Re-compress" action on existing R2 video assets.
- Preserves merchant preset preference per brand in `localStorage` (`boutq_video_preset_<brandId>`).

### 2. Super-Admin Maintenance Utility (`SuperVideoReoptimizer.tsx`)
Located in Super Admin Settings (`src/routes/_authenticated/admin.super.settings.tsx`):
- Automatically scans all tenant brands and products for referenced video URLs.
- Provides one-click re-transcoding and automated database record patching.
- Supports single-video re-optimization as well as non-blocking batch re-optimization.

### 3. Storefront Video Component (`AppVideo.tsx`)
- Configured with `preload="metadata"` by default.
- Uses `IntersectionObserver` with a 250px viewport root margin to defer mounting non-hero `<video>` tags until the visitor scrolls near the component.
- Automatically generates and displays a high-resolution JPEG poster frame (`captureVideoPoster`) to prevent initial frame black flashes.
- Muted autoplay enabled strictly for hero background banners with `playsInline` for mobile Safari compatibility.
