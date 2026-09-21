/**
 * In-Browser Video Optimization & Poster Generation Pipeline
 *
 * Automatically:
 * 1. Downsamples heavy 4K / 1080p video uploads to crisp 720p (1280x720 or 720x1280).
 * 2. Capped-bitrate transcode via MediaRecorder (800k - 1.2M), taking 15MB-50MB down to ~1MB.
 * 3. Auto-extracts a lightweight WebP poster thumbnail at 0.5s via Canvas.
 * 4. Graceful zero-failure fallback: returns original file if compression is unsupported.
 */

export interface OptimizeVideoOptions {
  /** Max bounding dimension (default: 1280 for 720p) */
  maxDimension?: number;
  /** Target video bitrate in bps (default: 950_000 for ~950 kbps) */
  targetBitrate?: number;
  /** Frame rate for encoding (default: 30) */
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
}

/**
 * Calculates even dimensions capped to maxDimension while maintaining aspect ratio.
 * Video encoders require dimensions divisible by 2.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension = 1280,
): { width: number; height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: 720, height: 1280 };
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
  if (typeof window === "undefined" || typeof document === "undefined") {
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
      if (shouldRevoke) URL.revokeObjectURL(url);
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
 * Automatically optimizes a video file in-browser before upload.
 * If the browser environment doesn't support canvas stream encoding,
 * it safely falls back to the original file and generates the poster.
 */
export async function optimizeVideo(
  inputFile: File,
  options: OptimizeVideoOptions = {},
): Promise<OptimizedVideoResult> {
  const maxDimension = options.maxDimension ?? 1280;
  const targetBitrate = options.targetBitrate ?? 950_000;
  const fps = options.fps ?? 30;
  const onProgress = options.onProgress ?? (() => {});

  const originalSizeBytes = inputFile.size;

  // 1. Capture poster frame first
  let posterBlob: Blob;
  try {
    posterBlob = await captureVideoPoster(inputFile, 0.5);
  } catch (posterErr) {
    console.warn("[VideoOptimizer] Poster generation fallback:", posterErr);
    posterBlob = new Blob([], { type: "image/webp" });
  }

  // 2. Browser feature detection
  const isSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function";

  if (!isSupported) {
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
    };
  }

  // 3. Pick best supported mimeType for MediaRecorder
  const candidateMimeTypes = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  const mimeType = candidateMimeTypes.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });

  if (!mimeType) {
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
    };
  }

  // 4. Load video to inspect properties and transcode
  const objectUrl = URL.createObjectURL(inputFile);

  return new Promise<OptimizedVideoResult>((resolve) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    const fallbackReturn = (error?: unknown) => {
      if (error) console.warn("[VideoOptimizer] Compression error, using original:", error);
      cleanup();
      resolve({
        file: inputFile,
        posterBlob,
        duration: video.duration || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        originalSizeBytes,
        optimizedSizeBytes: originalSizeBytes,
        savingsPercent: 0,
        wasCompressed: false,
        mimeType: inputFile.type || "video/mp4",
      });
    };

    video.onerror = () => fallbackReturn(video.error);

    video.onloadedmetadata = async () => {
      try {
        const rawW = video.videoWidth || 1280;
        const rawH = video.videoHeight || 720;
        const duration = video.duration || 1;

        // If file is already small (< 1.2 MB) and within target dimensions, skip re-encoding
        if (originalSizeBytes <= 1_200_000 && Math.max(rawW, rawH) <= maxDimension) {
          cleanup();
          return resolve({
            file: inputFile,
            posterBlob,
            duration,
            width: rawW,
            height: rawH,
            originalSizeBytes,
            optimizedSizeBytes: originalSizeBytes,
            savingsPercent: 0,
            wasCompressed: false,
            mimeType: inputFile.type || "video/mp4",
          });
        }

        const { width: targetW, height: targetH } = calculateTargetDimensions(
          rawW,
          rawH,
          maxDimension,
        );

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d", { alpha: false });

        if (!ctx) return fallbackReturn("Failed to acquire 2D canvas context");

        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: targetBitrate,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        let rVFCId: number | null = null;
        let rAFId: number | null = null;
        let intervalTimer: number | null = null;
        let isEncoding = true;
        let finished = false;

        const stopEncoding = () => {
          if (finished) return;
          finished = true;
          isEncoding = false;

          if (rVFCId !== null && typeof (video as any).cancelVideoFrameCallback === "function") {
            (video as any).cancelVideoFrameCallback(rVFCId);
          }
          if (rAFId !== null) cancelAnimationFrame(rAFId);
          if (intervalTimer !== null) clearInterval(intervalTimer);

          setTimeout(() => {
            if (recorder.state === "recording") {
              recorder.stop();
            }
          }, 200);
        };

        recorder.onstop = () => {
          cleanup();
          const isMp4 = mimeType.includes("mp4");
          const ext = isMp4 ? "mp4" : "webm";
          const outMime = isMp4 ? "video/mp4" : "video/webm";
          const compressedBlob = new Blob(chunks, { type: outMime });

          // If compression actually reduced size, use it! Otherwise retain original.
          if (compressedBlob.size > 0 && compressedBlob.size < originalSizeBytes) {
            const baseName = inputFile.name.replace(/\.[^/.]+$/, "");
            const compressedFile = new File([compressedBlob], `${baseName}-opt.${ext}`, {
              type: outMime,
            });

            const savingsPercent = Math.round(
              ((originalSizeBytes - compressedBlob.size) / originalSizeBytes) * 100,
            );

            onProgress(100);
            resolve({
              file: compressedFile,
              posterBlob,
              duration,
              width: targetW,
              height: targetH,
              originalSizeBytes,
              optimizedSizeBytes: compressedBlob.size,
              savingsPercent,
              wasCompressed: true,
              mimeType: outMime,
            });
          } else {
            onProgress(100);
            resolve({
              file: inputFile,
              posterBlob,
              duration,
              width: rawW,
              height: rawH,
              originalSizeBytes,
              optimizedSizeBytes: originalSizeBytes,
              savingsPercent: 0,
              wasCompressed: false,
              mimeType: inputFile.type || "video/mp4",
            });
          }
        };

        recorder.onerror = (e) => fallbackReturn(e);

        const renderFrame = () => {
          if (!isEncoding) return;
          try {
            ctx.drawImage(video, 0, 0, targetW, targetH);
          } catch {
            // ignore draw errors during seek
          }

          if (duration > 0) {
            const prog = Math.min(Math.round((video.currentTime / duration) * 98), 98);
            onProgress(prog);
          }
        };

        // Frame synchronization
        if (typeof (video as any).requestVideoFrameCallback === "function") {
          const onFrame = () => {
            if (!isEncoding) return;
            renderFrame();
            if (!video.ended && isEncoding) {
              rVFCId = (video as any).requestVideoFrameCallback(onFrame);
            }
          };
          rVFCId = (video as any).requestVideoFrameCallback(onFrame);
        } else {
          const onAnim = () => {
            if (!isEncoding) return;
            renderFrame();
            if (!video.ended && isEncoding) {
              rAFId = requestAnimationFrame(onAnim);
            }
          };
          rAFId = requestAnimationFrame(onAnim);
        }

        video.addEventListener("ended", stopEncoding, { once: true });

        intervalTimer = window.setInterval(() => {
          if (!isEncoding) {
            if (intervalTimer !== null) clearInterval(intervalTimer);
            return;
          }
          if (video.ended || (duration > 0 && video.currentTime >= duration)) {
            if (intervalTimer !== null) clearInterval(intervalTimer);
            stopEncoding();
          }
        }, 100);

        // Reset video to start, then start recording
        video.currentTime = 0;
        recorder.start(100);

        try {
          await video.play();
        } catch {
          video.muted = true;
          await video.play().catch(() => fallbackReturn("Play denied"));
        }
      } catch (err) {
        fallbackReturn(err);
      }
    };

    video.src = objectUrl;
    video.load();
  });
}
