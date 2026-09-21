/**
 * High-Quality In-Browser Video Optimization & FastStart Delivery Pipeline
 *
 * Replaces legacy MediaRecorder/canvas recording with browser-native WebCodecs
 * via the MIT-licensed `mediabunny` library:
 * 1. WebCodecs (VideoDecoder -> VideoEncoder) H.264 at crisp 1080p / 720p with proper variable bitrate rate control.
 * 2. Muxes to video/mp4 with FastStart (moov atom placed before mdat) for instant playback on HTTP 206 range requests.
 * 3. Extracts a matching high-resolution WebP/JPEG poster frame from the optimized output.
 * 4. Zero fallback to low-grade MediaRecorder: if WebCodecs is unsupported or output is larger,
 *    returns the original untouched file (wasCompressed: false).
 * 5. Memory-safe streaming via BlobSource and BufferTarget with a 100 MB input cap.
 */

export type VideoPresetKey = "high" | "balanced" | "original";

export interface VideoPresetConfig {
  key: VideoPresetKey;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  descriptionEn: string;
  maxDimension: number;
  targetBitrate: number;
  fps: number;
  audioBitrate: number;
}

export const VIDEO_PRESETS: Record<VideoPresetKey, VideoPresetConfig> = {
  high: {
    key: "high",
    labelAr: "عالي الجودة (1080p)",
    labelEn: "High quality (1080p)",
    descriptionAr: "موصى به للشاشات الكبيرة ومقاطع الهيرو (~2.5 ميجابت/ثانية)",
    descriptionEn: "Recommended for desktop and hero clips (~2.5 Mbps)",
    maxDimension: 1920,
    targetBitrate: 2_500_000,
    fps: 30,
    audioBitrate: 128_000,
  },
  balanced: {
    key: "balanced",
    labelAr: "متوازن (720p)",
    labelEn: "Balanced (720p)",
    descriptionAr: "حجم خفيف مناسب لشبكات الجوال (~1.5 ميجابت/ثانية)",
    descriptionEn: "Lighter size suited for mobile connections (~1.5 Mbps)",
    maxDimension: 1280,
    targetBitrate: 1_500_000,
    fps: 30,
    audioBitrate: 96_000,
  },
  original: {
    key: "original",
    labelAr: "الملف الأصلي بدون ضغط",
    labelEn: "Keep original file",
    descriptionAr: "رفع الملف الأصلي كما هو دون إعادة ترميز (مع تحسين البدء السريع إن أمكن)",
    descriptionEn:
      "Upload original raw file without re-encoding (with FastStart remux if possible)",
    maxDimension: Infinity,
    targetBitrate: 0,
    fps: 0,
    audioBitrate: 0,
  },
};

export const VIDEO_PRESET_STORAGE_PREFIX = "boutq_video_preset_";

export function getStoredVideoPreset(brandId?: string): VideoPresetKey {
  if (typeof window === "undefined" || !brandId) return "high";
  try {
    const stored = window.localStorage.getItem(`${VIDEO_PRESET_STORAGE_PREFIX}${brandId}`);
    if (stored === "high" || stored === "balanced" || stored === "original") {
      return stored;
    }
  } catch {
    // ignore localStorage errors
  }
  return "high";
}

export function setStoredVideoPreset(brandId: string | undefined, preset: VideoPresetKey): void {
  if (typeof window === "undefined" || !brandId) return;
  try {
    window.localStorage.setItem(`${VIDEO_PRESET_STORAGE_PREFIX}${brandId}`, preset);
  } catch {
    // ignore localStorage errors
  }
}

/** 100 MB max video upload cap matching Cloudflare R2 upload function limits */
export const MAX_VIDEO_INPUT_SIZE = 100 * 1024 * 1024;

export interface OptimizeVideoOptions {
  /** Video preset: 'high' (1080p), 'balanced' (720p), or 'original' */
  preset?: VideoPresetKey;
  /** Max bounding dimension override */
  maxDimension?: number;
  /** Target video bitrate in bps override */
  targetBitrate?: number;
  /** Frame rate for encoding override (capped at 30 fps) */
  fps?: number;
  /** Callback for compression progress (0-100) */
  onProgress?: (percent: number) => void;
}

export interface OptimizedVideoResult {
  file: File | Blob;
  posterBlob: Blob;
  duration: number;
  width: number;
  height: number;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  savingsPercent: number;
  wasCompressed: boolean;
  mimeType: string;
  preset: VideoPresetKey;
  codec: string;
}

/**
 * Calculates even dimensions capped to maxDimension while maintaining aspect ratio.
 * Video encoders require dimensions divisible by 2.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = 1920,
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: 1080, height: 1920 };
  }

  const largest = Math.max(srcWidth, srcHeight);
  const scale = largest > maxDimension ? maxDimension / largest : 1;

  let width = Math.round(srcWidth * scale);
  let height = Math.round(srcHeight * scale);

  // Must be even numbers
  if (width % 2 !== 0) width -= 1;
  if (height % 2 !== 0) height -= 1;

  return {
    width: Math.max(width, 2),
    height: Math.max(height, 2),
  };
}

/**
 * Captures a pristine poster frame from a video file or URL at the specified timestamp.
 */
export async function captureVideoPoster(
  videoSource: File | Blob | string,
  timeInSeconds = 0.5,
): Promise<Blob> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLCanvasElement.prototype.toBlob !== "function" ||
    (typeof process !== "undefined" && process.env?.VITEST === "true")
  ) {
    return new Blob([], { type: "image/webp" });
  }

  const url = typeof videoSource === "string" ? videoSource : URL.createObjectURL(videoSource);
  const shouldRevoke = typeof videoSource !== "string";

  return new Promise<Blob>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let resolved = false;

    const cleanup = () => {
      if (shouldRevoke) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore revocation errors
        }
      }
      video.remove();
    };

    const captureFrame = () => {
      if (resolved) return;
      resolved = true;

      try {
        const vw = video.videoWidth || 720;
        const vh = video.videoHeight || 1280;
        const canvas = document.createElement("canvas");
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          cleanup();
          return resolve(new Blob([], { type: "image/webp" }));
        }

        ctx.drawImage(video, 0, 0, vw, vh);

        canvas.toBlob(
          (blob) => {
            cleanup();
            if (blob && blob.size > 0) {
              resolve(blob);
            } else {
              // Canvas WebP fallback to JPEG
              canvas.toBlob(
                (jpegBlob) => {
                  resolve(jpegBlob || new Blob([], { type: "image/jpeg" }));
                },
                "image/jpeg",
                0.85,
              );
            }
          },
          "image/webp",
          0.85,
        );
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onloadeddata = () => {
      const targetTime = Math.min(timeInSeconds, Math.max((video.duration || 1) - 0.1, 0));
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      captureFrame();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video for poster capture"));
    };

    // Timeout safety net (5 seconds)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(new Blob([], { type: "image/webp" }));
      }
    }, 5000);

    video.src = url;
    video.load();
  });
}

/**
 * Checks whether the current browser supports WebCodecs video encoding with H.264 (avc).
 */
export async function isWebCodecsSupported(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    typeof VideoEncoder === "undefined" ||
    typeof VideoDecoder === "undefined"
  ) {
    return false;
  }
  try {
    const { canEncodeVideo } = await import("mediabunny");
    return await canEncodeVideo("avc", { width: 1920, height: 1080 });
  } catch {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: "avc1.42e01e",
        width: 1280,
        height: 720,
      });
      return !!support?.supported;
    } catch {
      return false;
    }
  }
}

/**
 * Optimizes a video file in-browser before upload using WebCodecs and mediabunny.
 * Produces a faststart MP4 (moov atom first) at crisp 1080p/720p with proper quality-based rate control.
 *
 * If WebCodecs is unsupported or if the resulting file is larger than the original,
 * the original untouched file is returned (wasCompressed: false).
 */
export async function optimizeVideo(
  inputFile: File,
  options: OptimizeVideoOptions = {},
): Promise<OptimizedVideoResult> {
  const originalSizeBytes = inputFile.size;

  // Enforce 100 MB upload cap
  if (originalSizeBytes > MAX_VIDEO_INPUT_SIZE) {
    throw new Error(
      "حجم الفيديو يتجاوز الحد الأقصى المسموح به (100 ميجابايت). / Video size exceeds the 100 MB maximum limit.",
    );
  }

  const presetKey = options.preset ?? "high";
  const presetConfig = VIDEO_PRESETS[presetKey] ?? VIDEO_PRESETS.high;
  const onProgress = options.onProgress ?? (() => {});

  // Handle "original" preset
  if (presetKey === "original") {
    let posterBlob: Blob;
    try {
      posterBlob = await captureVideoPoster(inputFile, 0.5);
    } catch {
      posterBlob = new Blob([], { type: "image/webp" });
    }

    // Attempt FastStart remux without re-encoding if supported
    try {
      if (typeof window !== "undefined" && typeof VideoDecoder !== "undefined") {
        const {
          Input,
          Output,
          Conversion,
          BlobSource,
          BufferTarget,
          Mp4OutputFormat,
          ALL_FORMATS,
        } = await import("mediabunny");

        const input = new Input({
          source: new BlobSource(inputFile),
          formats: ALL_FORMATS,
        });

        const target = new BufferTarget();
        const output = new Output({
          format: new Mp4OutputFormat({ fastStart: "in-memory" }),
          target,
        });

        const conversion = await Conversion.init({
          input,
          output,
          copy: { mode: "forced" },
        });

        if (conversion.isValid) {
          conversion.onProgress = (progress) =>
            onProgress(Math.min(Math.round(progress * 100), 100));
          await conversion.execute();

          if (target.buffer && target.buffer.byteLength > 0) {
            const remuxedBlob = new Blob([target.buffer], { type: "video/mp4" });
            const remuxedFile = new File(
              [remuxedBlob],
              inputFile.name.replace(/\.[^.]+$/, ".mp4"),
              {
                type: "video/mp4",
              },
            );

            return {
              file: remuxedFile,
              posterBlob,
              duration: 0,
              width: 0,
              height: 0,
              originalSizeBytes,
              optimizedSizeBytes: remuxedBlob.size,
              savingsPercent: 0,
              wasCompressed: false,
              mimeType: "video/mp4",
              preset: "original",
              codec: "passthrough-faststart",
            };
          }
        }
      }
    } catch (err) {
      console.info(
        "[VideoOptimizer] Original faststart remux skipped, keeping original file:",
        err,
      );
    }

    return {
      file: inputFile,
      posterBlob,
      duration: 0,
      width: 0,
      height: 0,
      originalSizeBytes,
      optimizedSizeBytes: originalSizeBytes,
      savingsPercent: 0,
      wasCompressed: false,
      mimeType: inputFile.type || "video/mp4",
      preset: "original",
      codec: "original",
    };
  }

  // Capability check for WebCodecs
  const supported = await isWebCodecsSupported();
  if (!supported) {
    console.info(
      "[VideoOptimizer] WebCodecs is not supported in this browser. Uploading original file untouched.",
    );
    const posterBlob = await captureVideoPoster(inputFile, 0.5).catch(
      () => new Blob([], { type: "image/webp" }),
    );
    return {
      file: inputFile,
      posterBlob,
      duration: 0,
      width: 0,
      height: 0,
      originalSizeBytes,
      optimizedSizeBytes: originalSizeBytes,
      savingsPercent: 0,
      wasCompressed: false,
      mimeType: inputFile.type || "video/mp4",
      preset: presetKey,
      codec: "unsupported-passthrough",
    };
  }

  try {
    // Dynamic import to keep storefront bundle completely lean
    const {
      Input,
      Output,
      Conversion,
      BlobSource,
      BufferTarget,
      Mp4OutputFormat,
      Quality,
      ALL_FORMATS,
    } = await import("mediabunny");

    const input = new Input({
      source: new BlobSource(inputFile),
      formats: ALL_FORMATS,
    });

    const primaryVideoTrack = await input.getPrimaryVideoTrack();
    if (!primaryVideoTrack) {
      throw new Error("No video track found in input file");
    }

    const origW = await primaryVideoTrack.getDisplayWidth().catch(() => 1920);
    const origH = await primaryVideoTrack.getDisplayHeight().catch(() => 1080);
    const duration = await input.computeDuration().catch(() => 0);

    const maxDim = options.maxDimension ?? presetConfig.maxDimension;
    const { width: targetW, height: targetH } = calculateTargetDimensions(origW, origH, maxDim);
    const targetBitrate = options.targetBitrate ?? presetConfig.targetBitrate;
    const targetFps = Math.min(options.fps ?? presetConfig.fps, 30);

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });

    const conversion = await Conversion.init({
      input,
      output,
      video: {
        width: targetW,
        height: targetH,
        fit: "contain",
        frameRate: targetFps,
        codec: "avc",
        quality: new Quality({
          bitrate: targetBitrate,
          bitrateMode: "variable",
        }),
        keyFrameInterval: 2,
        forceTranscode: true,
      },
      audio: {
        codec: "aac",
        quality: new Quality({
          bitrate: presetConfig.audioBitrate,
        }),
      },
    });

    if (!conversion.isValid) {
      console.warn("[VideoOptimizer] Conversion setup invalid:", conversion.discardedTracks);
      throw new Error("Conversion configuration is invalid for this video");
    }

    conversion.onProgress = (progress) => {
      onProgress(Math.min(Math.round(progress * 100), 100));
    };

    await conversion.execute();

    if (!target.buffer || target.buffer.byteLength === 0) {
      throw new Error("Conversion produced an empty buffer");
    }

    const outputBlob = new Blob([target.buffer], { type: "video/mp4" });
    const optimizedSizeBytes = outputBlob.size;

    // Safety valve: if transcoded output is NOT smaller than original, keep original!
    if (optimizedSizeBytes >= originalSizeBytes) {
      console.info(
        `[VideoOptimizer] Optimized size (${optimizedSizeBytes} B) >= Original size (${originalSizeBytes} B). Keeping original file.`,
      );
      const posterBlob = await captureVideoPoster(inputFile, 0.5).catch(
        () => new Blob([], { type: "image/webp" }),
      );
      return {
        file: inputFile,
        posterBlob,
        duration,
        width: origW,
        height: origH,
        originalSizeBytes,
        optimizedSizeBytes: originalSizeBytes,
        savingsPercent: 0,
        wasCompressed: false,
        mimeType: inputFile.type || "video/mp4",
        preset: presetKey,
        codec: "original-smaller",
      };
    }

    // Extract poster from the optimized output so it precisely matches what plays
    let posterBlob: Blob;
    try {
      posterBlob = await captureVideoPoster(outputBlob, 0.5);
    } catch {
      posterBlob = await captureVideoPoster(inputFile, 0.5).catch(
        () => new Blob([], { type: "image/webp" }),
      );
    }

    const savingsPercent = Math.round(
      ((originalSizeBytes - optimizedSizeBytes) / originalSizeBytes) * 100,
    );

    const baseName = inputFile.name.replace(/\.[^.]+$/, "");
    const optimizedFile = new File([outputBlob], `${baseName}-opt.mp4`, {
      type: "video/mp4",
    });

    return {
      file: optimizedFile,
      posterBlob,
      duration,
      width: targetW,
      height: targetH,
      originalSizeBytes,
      optimizedSizeBytes,
      savingsPercent,
      wasCompressed: true,
      mimeType: "video/mp4",
      preset: presetKey,
      codec: "avc1",
    };
  } catch (err) {
    console.warn(
      "[VideoOptimizer] WebCodecs conversion failed, safely falling back to original untouched file:",
      err,
    );
    const posterBlob = await captureVideoPoster(inputFile, 0.5).catch(
      () => new Blob([], { type: "image/webp" }),
    );
    return {
      file: inputFile,
      posterBlob,
      duration: 0,
      width: 0,
      height: 0,
      originalSizeBytes,
      optimizedSizeBytes: originalSizeBytes,
      savingsPercent: 0,
      wasCompressed: false,
      mimeType: inputFile.type || "video/mp4",
      preset: presetKey,
      codec: "fallback-original",
    };
  }
}
