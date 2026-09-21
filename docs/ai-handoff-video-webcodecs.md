# Handoff Prompt — Boutq OS: Replace MediaRecorder video compression with WebCodecs transcoding (free, high quality)

Copy everything below the line into a new AI-assistant session opened at the repository root.

---

You are a senior front-end/media engineer working in the repository **`SayedMajeedx/bhpura-d219813a`** (Boutq OS — TanStack Start + React 19 + Vite + Supabase + Cloudflare Workers with R2 for media). Work on a new branch `feat/video-webcodecs-optimizer` off `main`.

Load these repo skills before starting: `.agents/rules/AGENTS.md`, `.agents/skills/handoff-plan-execution/SKILL.md`, `.agents/skills/storefront-seo-performance-a11y/SKILL.md`, `.agents/skills/refactor-safety/SKILL.md`, `.agents/skills/test-quality-gate/SKILL.md`, `.agents/skills/rtl-arabic-consistency/SKILL.md`.

## Context — read this first

Merchants upload hero/product videos from phones (often 30–50 MB, 1080p/4K). Today `src/lib/video-optimizer.ts` (`optimizeVideo`) "compresses" them by drawing the video onto a canvas and recording it with **`MediaRecorder`** at 720p / 950 kbps. `MediaRecorder` is a realtime, single-pass live-capture encoder with no real rate control, so the output (~700 KB) shows heavy macroblocking and washed-out colour on desktop screens. Raising its bitrate does not fix this — it is the wrong tool.

History you should know (do not re-investigate): videos were previously transcoded by ImageKit (`src/lib/media-delivery.ts`), removed on 2026-08-11 (commit `73c59c76`) because of third-party plan limits and watermarking. Cloudflare Images / Polish do not process MP4; Cloudflare Stream is paid. **Constraint: the solution must cost nothing** — no paid transcoding service, no Workers Containers, no server-side ffmpeg.

Current pieces:

- `src/lib/video-optimizer.ts` — exports `calculateTargetDimensions`, `captureVideoPoster`, `optimizeVideo`, and the `OptimizeVideoOptions` / `OptimizedVideoResult` interfaces. Unit tests in `tests/video-optimizer.test.ts` cover `calculateTargetDimensions` only.
- Callers: `src/features/settings/tabs/storefront/HeroSlidesEditor.tsx` (two call sites, ~lines 108 and 172), `src/features/settings/tabs/storefront/HomeHeroGroup.tsx`, `src/routes/_authenticated/admin.b.$slug.inventory.tsx`. They call `optimizeVideo(file)`, upload `result.file` and `result.posterBlob` via `uploadPublicMedia(brandId, blob, "hero")` (`src/lib/r2-upload.ts` / `r2-upload.functions.ts`; allowed video type is `video/mp4`).
- Delivery: `src/lib/r2-media-server.ts` already serves R2 objects with RFC 7233 byte ranges (`206 Partial Content`, `Accept-Ranges: bytes`, immutable cache headers); tests in `tests/r2-media-server.test.ts`. The storefront player is `src/components/common/AppVideo.tsx`; Playwright `tests/hero-fallback.spec.ts` asserts the hero degrades gracefully when the MP4 is blocked.
- `src/server.ts` sets `Cross-Origin-Opener-Policy: same-origin-allow-popups`. The site is **not** cross-origin isolated, so anything requiring `SharedArrayBuffer` (multithreaded ffmpeg.wasm) is out of scope — do not add COEP headers; they would break third-party embeds and Tap payment redirects.

## Goal

Replace the `MediaRecorder` pipeline with **WebCodecs-based transcoding in the browser** (`VideoDecoder` → `VideoEncoder`, H.264, proper quality-based rate control), muxed to a **faststart MP4** with the MIT-licensed **`mediabunny`** library (successor of `mp4-muxer`; it demuxes, decodes, encodes and muxes with WebCodecs in one conversion API). Result: a 30–50 MB phone clip becomes ~3–5 MB at crisp 1080p, playback starts on the first range request, and merchants can always keep the original.

## Requirements

### 1. New optimizer (`src/lib/video-optimizer.ts`, keep the file and the exported names)

- Add `mediabunny` as a dependency (verify current version and API on npm before coding; do not guess method names). Import it **dynamically** inside `optimizeVideo` so it is never in the storefront bundle — only admin upload screens load it. Check the bundle-size guardrail tests in `tests/` (`storefront-performance-guardrails`, `design-system-guardrails`) still pass.
- Capability detection: `typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined"` and `await VideoEncoder.isConfigSupported(config)` for the chosen config. If unsupported (old browsers, some Firefox versions, private-mode quirks) → **return the original file untouched** with `wasCompressed: false`. Delete the `MediaRecorder`/canvas recording path entirely; it must not remain as a fallback.
- Presets (export them as a typed constant so the UI can show them):
  - `high` (default): cap longest side at **1920** (1080p, portrait 1080×1920 supported), H.264 High profile (`avc1.640028` or the highest level `isConfigSupported` accepts), `latencyMode: "quality"`, bitrate mode `variable` (or quantizer mode if the browser supports it — probe with `isConfigSupported`) targeting **~2.5 Mbps at 1080p** and **~1.5 Mbps at 720p** (scale linearly with pixel count for other sizes), keyframe every 2 s, source fps preserved up to 30 (drop to 30 if higher), audio re-encoded AAC 128 kbps stereo (or passthrough if already AAC ≤ 160 kbps).
  - `balanced`: cap 1280, ~1.5 Mbps.
  - `original`: no transcode; only remux to faststart if the source is already H.264/AAC MP4 (see §3), otherwise return untouched.
- Never upscale. Reuse `calculateTargetDimensions` (extend it to accept the new caps; keep the even-dimension rule; existing tests must stay green).
- Output must be `video/mp4`, **moov atom first (`fastStart`)**, so `AppVideo` can start playing with the existing 206 range serving.
- Progress: call `onProgress(0–100)` from the conversion progress callback; keep the existing `OptimizedVideoResult` shape (`file, posterBlob, duration, width, height, originalSizeBytes, optimizedSizeBytes, savingsPercent, wasCompressed, mimeType`). Add `preset` and `codec` fields.
- Safety valve: if the transcoded file is **larger** than the original, return the original (`wasCompressed: false`).
- Memory: process via streams (`mediabunny` input/output on `Blob`/`BufferTarget`), never read the whole file into an `ArrayBuffer` if the library supports streaming; cap accepted input at the existing upload limit in `r2-upload.functions.ts` and surface a clear bilingual error above it.
- `captureVideoPoster` stays; take the poster from the **optimized** output so it matches what plays.

### 2. Merchant UX (all three call sites)

- Before upload, show a compact bilingual (ar/en, RTL-safe) card: original size → estimated/actual optimized size, preset selector (`High quality 1080p` default / `Balanced 720p` / `Keep original`), and a 5-second `<video>` preview of the optimized blob so the merchant sees quality before committing. A "Keep original" choice must upload the raw file (remuxed to faststart if possible) — never silently degrade.
- Progress bar during transcode (it can take 10–60 s for large files on laptops; longer on phones). Keep the UI responsive: the conversion runs off the main thread when `mediabunny` supports workers; otherwise ensure the progress callback yields.
- Persist the merchant's last preset per brand in `localStorage` (`boutq_video_preset_<brandId>`) wrapped in try/catch.
- Toast copy: replace "Optimizing video..." with a message that states the preset, e.g. `جارٍ تحويل الفيديو (1080p عالي الجودة)…` / `Converting video (1080p high quality)…`.

### 3. Delivery improvements (free, no re-encode)

- `src/components/common/AppVideo.tsx`: ensure `preload="metadata"` by default (callers may override), `playsInline`, `muted` + `autoPlay` only for hero/background usage, `poster` always passed when available, and `loading`-style lazy mounting via `IntersectionObserver` for below-the-fold videos (do not mount the `<video>` until near viewport). Keep `tests/hero-fallback.spec.ts` green.
- Add a one-off admin utility (super-admin only, in the existing tools/settings area) **"Re-optimise existing videos"** that lists a brand's R2 video URLs referenced in `business_settings` hero slides and product media, downloads each in the browser, runs the `original` preset (faststart remux — lossless, seconds per file) or `high` preset on request, re-uploads, and updates the referenced URL in one save. Do not batch-run this against every brand automatically.

### 4. Tests

- Extend `tests/video-optimizer.test.ts`: preset→bitrate mapping, dimension capping at 1920/1280 for landscape and portrait, "larger output → keep original", and capability-detection fallback (mock `globalThis.VideoEncoder` absent → returns original with `wasCompressed: false`). Mock `mediabunny` — do not require a real codec in vitest.
- Add a Playwright spec `tests/video-optimizer.spec.ts` that runs only in Chromium: upload a 3-second 1080p fixture (generate it in the test with a canvas + `MediaRecorder`, or commit a ≤ 1 MB MP4 under `tests/fixtures/`), assert the optimized size is < 40 % of the original, the preview plays, and the resulting MP4 has `moov` before `mdat` (read the first bytes of the blob and check the box order).
- Keep `tests/r2-media-server.test.ts` green; add one case asserting a request without `Range` still returns `200` with `Accept-Ranges: bytes` (needed for Safari's first probe).

### 5. Documentation

- Update the header comment in `src/lib/video-optimizer.ts` and add `docs/media-video-pipeline.md`: why WebCodecs, browser support matrix (Chrome/Edge full, Safari 16.4+/iOS 16.4+ H.264 encode, Firefox 130+), fallback behaviour, presets and target bitrates, faststart, and how range streaming interacts with it. Note explicitly that ffmpeg.wasm was **not** chosen because the threaded build needs cross-origin isolation and the single-thread build is 1–3× slower than realtime with a ~30 MB download.

## Rules for how you work

- Do not touch Cloudflare Images handling for pictures in `src/lib/media-delivery.ts`.
- No new COOP/COEP headers; no server-side transcoding; no paid services; no new Worker bindings.
- Verify the `mediabunny` API from its README/types for the installed version before writing code; if its conversion API does not expose a needed knob (e.g. quantizer mode), fall back to driving `VideoEncoder` directly and use `mediabunny` only as the muxer — but keep one code path, not two.
- Before the PR: `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build` — all green except the pre-existing vitest baseline on `main` (record it first; any new failure is yours).
- Manually verify in the running app (`npm run dev`, then `/admin/b/pura/settings` → Storefront → hero slides): upload a real ≥ 20 MB phone video, confirm size, preview quality on a 1080p+ monitor, then that `/pura` starts playing the hero within 1 s on a throttled "Fast 3G" profile with the network panel showing `206` chunked requests. Screenshot both and attach to the PR.
- Commit messages end with the `Co-Authored-By:` line configured in the session; the PR description ends with the generated-with line the session provides.

## Definition of done

- A 30–50 MB 1080p phone upload becomes ≤ 5 MB with no visible macroblocking on a desktop monitor; a 720p upload is not upscaled; "Keep original" uploads the untouched file.
- Output MP4s are faststart and begin playback on the first range request.
- Browsers without WebCodecs upload the original — no degraded `MediaRecorder` output exists anywhere in the codebase.
- `mediabunny` is absent from the storefront bundle (verify in the Vite build output).
- Tests in §4 pass; docs in §5 exist.
