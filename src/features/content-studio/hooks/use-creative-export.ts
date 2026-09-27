import { useState, type RefObject } from "react";
import { toast } from "sonner";
import { creativeFileName, deliverCreativeFile } from "@/lib/creative-export";
import { FORMATS, THEMES, type Product } from "@/features/content-studio/lib/studio-content";
import { getExactVideoDuration } from "@/features/content-studio/lib/video-duration";

/**
 * Exports the stage: a PNG, the product video with the design over it (MP4 or
 * WebM, recorded as it plays), or the original video file.
 */
export function useCreativeExport({
  stageRef,
  videoRef,
  photo,
  isCurrentVideo,
  brandSlugClean,
  selected,
  format,
  palette,
  headline,
  businessName,
  isAr,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  photo: string | null;
  isCurrentVideo: boolean;
  brandSlugClean: string;
  selected: Product | undefined;
  format: keyof typeof FORMATS;
  palette: (typeof THEMES)[keyof typeof THEMES];
  headline: string;
  businessName: string;
  isAr: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const downloadOriginalVideo = async () => {
    if (!photo) return;
    const cleanUrl = photo.split("?")[0];
    const ext = cleanUrl.split(".").pop()?.toLowerCase() || "mp4";
    const fileName = `${brandSlugClean}-${selected?.name || "video"}.${ext}`
      .replace(/\s+/g, "-")
      .toLowerCase();

    try {
      const resp = await fetch(photo);
      if (!resp.ok) throw new Error("Fetch failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success(
        isAr ? "تم تنزيل الفيديو الأصلي بنجاح" : "Original video downloaded successfully",
      );
    } catch {
      const a = document.createElement("a");
      a.href = photo;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success(isAr ? "تم بدء تنزيل الفيديو" : "Video download started");
    }
  };

  const exportImageCreative = async () => {
    if (!stageRef.current) return;
    setExporting(true);
    // The mobile preview shrinks this element via a display-only CSS
    // transform (see previewScale). Reset it to native size for the capture
    // so exports are pixel-identical regardless of what device/screen size
    // triggered them, then restore whatever the on-screen preview needs.
    const originalStageTransform = stageRef.current.style.transform;
    stageRef.current.style.transform = "scale(1)";
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const target = FORMATS[format];
      const canvas = await html2canvas(stageRef.current, {
        backgroundColor: palette.bg,
        scale: target.width / stageRef.current.offsetWidth,
        useCORS: true,
        logging: false,
      });
      const fileName = creativeFileName(brandSlugClean, selected?.name, format, "png");
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("PNG export failed"))),
          "image/png",
          1,
        ),
      );
      const delivered = await deliverCreativeFile(
        blob,
        fileName,
        "image/png",
        headline || businessName,
      );
      if (delivered === "cancelled") return;
      if (delivered === "shared") {
        toast.success(isAr ? "التصميم جاهز للحفظ أو المشاركة" : "Creative ready to save or share");
        return;
      }
      toast.success(
        isAr
          ? `تم تنزيل التصميم ${target.width}×${target.height}`
          : `Downloaded at ${target.width}×${target.height}`,
      );
    } catch (error) {
      console.error(error);
      toast.error(
        isAr
          ? "تعذر تصدير التصميم. تحقق من صورة المنتج."
          : "Could not export. Check the product image.",
      );
    } finally {
      if (stageRef.current) stageRef.current.style.transform = originalStageTransform;
      setExporting(false);
    }
  };

  const exportVideoCreative = async () => {
    if (!stageRef.current) return;
    const v = videoRef.current;
    if (!v || !photo) {
      await downloadOriginalVideo();
      return;
    }

    setExporting(true);
    setExportProgress(0);

    const target = FORMATS[format];
    let hiddenMount: HTMLDivElement | null = null;
    let rVFCId: number | null = null;
    let rAFId: number | null = null;
    let checkTimer: number | null = null;

    try {
      // 1. Ensure video metadata is loaded
      if (v.readyState < 2) {
        await new Promise((resolve) => {
          const handler = () => {
            v.removeEventListener("loadeddata", handler);
            resolve(true);
          };
          v.addEventListener("loadeddata", handler);
          setTimeout(resolve, 2000);
        });
      }

      // 2. Discover exact full video duration directly from file metadata
      const exactDuration = await getExactVideoDuration(v, photo);

      // 3. Pre-render overlay without modifying video state or visibility
      const originalStageBg = stageRef.current.style.background;
      const originalStageTransform = stageRef.current.style.transform;
      stageRef.current.style.background = "transparent";
      // See exportImageCreative: reset the display-only mobile-preview scale
      // for the capture so exports don't vary by screen size.
      stageRef.current.style.transform = "scale(1)";
      let overlayCanvas: HTMLCanvasElement;
      try {
        const { default: html2canvas } = await import("html2canvas-pro");
        overlayCanvas = await html2canvas(stageRef.current, {
          backgroundColor: null,
          scale: target.width / stageRef.current.offsetWidth,
          useCORS: true,
          logging: false,
          ignoreElements: (element) => element.tagName === "VIDEO",
        });
      } finally {
        stageRef.current.style.background = originalStageBg;
        stageRef.current.style.transform = originalStageTransform;
      }

      // 4. Test CORS on video element to prevent tainted canvas crash
      let corsOk = true;
      try {
        const testCanvas = document.createElement("canvas");
        testCanvas.width = 16;
        testCanvas.height = 16;
        const testCtx = testCanvas.getContext("2d");
        if (testCtx) {
          testCtx.drawImage(v, 0, 0, 16, 16);
          testCanvas.toDataURL();
        }
      } catch (err) {
        console.warn("Video canvas tainted by CORS, falling back to direct video download", err);
        corsOk = false;
      }

      if (!corsOk) {
        toast.info(
          isAr
            ? "نظراً لقيود أمان مصدر الفيديو من المتصفح، جرى تنزيل ملف الفيديو الأصلي مباشرة."
            : "Direct source video downloaded due to browser CORS restriction.",
        );
        await downloadOriginalVideo();
        return;
      }

      // 5. Setup output canvas ATTACHED to DOM (mandatory for Chromium captureStream pipeline)
      hiddenMount = document.createElement("div");
      hiddenMount.style.cssText =
        "position:fixed;top:-99999px;left:-99999px;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-99999;overflow:hidden;";
      document.body.appendChild(hiddenMount);

      const recordCanvas = document.createElement("canvas");
      recordCanvas.width = target.width;
      recordCanvas.height = target.height;
      hiddenMount.appendChild(recordCanvas);

      const ctx = recordCanvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Could not create canvas context");

      const fps = 30;
      const stream = (recordCanvas as any).captureStream
        ? (recordCanvas as any).captureStream(fps)
        : null;

      if (!stream || typeof MediaRecorder === "undefined") {
        toast.info(
          isAr
            ? "متصفحك لا يدعم تسجيل مقاطع الفيديو، تم تنزيل الفيديو الأصلي."
            : "Video recording unsupported in this browser; downloading original file.",
        );
        await downloadOriginalVideo();
        return;
      }

      const track = stream.getVideoTracks()[0];

      // Try capturing audio track from video if available so original sound is preserved
      try {
        const vStream = (v as any).captureStream
          ? (v as any).captureStream()
          : (v as any).mozCaptureStream
            ? (v as any).mozCaptureStream()
            : null;
        if (vStream) {
          const aTrack = vStream.getAudioTracks()[0];
          if (aTrack) stream.addTrack(aTrack);
        }
      } catch {
        // mozCaptureStream isn't available in every browser — export continues without audio.
      }

      // Detect supported MIME type
      let mimeType = "";
      let ext = "mp4";
      const candidateTypes = [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1",
        "video/mp4",
        "video/webm;codecs=h264",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ];
      for (const t of candidateTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          ext = t.startsWith("video/mp4") ? "mp4" : "webm";
          break;
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond: 12_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/mp4" }));
        recorder.onerror = reject;
      });

      // 6. Pause, reset, and strictly await seek to 0 before starting recorder
      v.pause();
      v.muted = true;
      v.defaultMuted = true;
      v.volume = 0;
      v.playsInline = true;
      v.loop = false;

      if (v.currentTime !== 0) {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            v.removeEventListener("seeked", onSeeked);
            resolve();
          };
          v.addEventListener("seeked", onSeeked, { once: true });
          v.currentTime = 0;
          setTimeout(resolve, 800);
        });
      }

      const vw = v.videoWidth || target.width;
      const vh = v.videoHeight || target.height;
      const scale = Math.max(target.width / vw, target.height / vh);
      const drawW = vw * scale;
      const drawH = vh * scale;
      const drawX = (target.width - drawW) / 2;
      const drawY = (target.height - drawH) / 2;

      let isRecording = true;
      let finished = false;

      const finishRecording = () => {
        if (finished) return;
        finished = true;
        isRecording = false;

        if (rVFCId !== null && typeof (v as any).cancelVideoFrameCallback === "function") {
          (v as any).cancelVideoFrameCallback(rVFCId);
        }
        if (rAFId !== null) cancelAnimationFrame(rAFId);
        if (checkTimer !== null) clearInterval(checkTimer);

        // Allow 300ms for final frame buffer to commit
        window.setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }, 300);
      };

      // Native ended event is our primary end signal
      v.addEventListener("ended", finishRecording, { once: true });

      const renderCanvas = () => {
        if (!isRecording) return;

        // Draw current video frame (clean 1:1 hardware frame)
        try {
          ctx.drawImage(v, drawX, drawY, drawW, drawH);
        } catch (drawErr) {
          console.warn("drawImage error", drawErr);
        }

        // Draw branding overlay
        ctx.drawImage(overlayCanvas, 0, 0, target.width, target.height);

        // Notify stream track
        if (track && typeof (track as any).requestFrame === "function") {
          (track as any).requestFrame();
        }

        const current = v.currentTime;
        if (exactDuration > 0) {
          const prog = Math.min(Math.round((current / exactDuration) * 100), 99);
          setExportProgress(prog);
        }
      };

      // 7. Buttery smooth frame synchronization using requestVideoFrameCallback (rVFC)
      const supportsRVFC = typeof (v as any).requestVideoFrameCallback === "function";

      if (supportsRVFC) {
        const onVideoFrame = () => {
          if (!isRecording) return;
          renderCanvas();
          if (!v.ended && isRecording) {
            rVFCId = (v as any).requestVideoFrameCallback(onVideoFrame);
          }
        };
        rVFCId = (v as any).requestVideoFrameCallback(onVideoFrame);
      } else {
        const onAnimFrame = () => {
          if (!isRecording) return;
          renderCanvas();
          if (!v.ended && isRecording) {
            rAFId = requestAnimationFrame(onAnimFrame);
          }
        };
        rAFId = requestAnimationFrame(onAnimFrame);
      }

      // Check ended condition every 100ms without cutting off prematurely
      checkTimer = window.setInterval(() => {
        if (!isRecording) {
          if (checkTimer !== null) clearInterval(checkTimer);
          return;
        }
        // Only stop if the video has truly ended, or if we have exactDuration and currentTime reached it
        if (v.ended || (exactDuration > 0 && v.currentTime >= exactDuration)) {
          if (checkTimer !== null) clearInterval(checkTimer);
          finishRecording();
        }
      }, 100);

      // Start recording and start playback
      recorder.start(100);

      try {
        await v.play();
      } catch {
        v.muted = true;
        await v.play().catch(() => {});
      }

      // Generous safety timeout: full duration + 8 seconds buffer (or 120s max if unknown)
      const timeoutLimitMs = (exactDuration > 0 ? exactDuration + 8 : 120) * 1000;
      const maxTimeout = window.setTimeout(() => {
        finishRecording();
      }, timeoutLimitMs);

      const blob = await recordingPromise;
      window.clearTimeout(maxTimeout);
      v.removeEventListener("ended", finishRecording);
      setExportProgress(100);

      // 8. Deliver file via Web Share or direct download
      const fileName = creativeFileName(brandSlugClean, selected?.name, format, ext);
      const delivered = await deliverCreativeFile(
        blob,
        fileName,
        mimeType,
        headline || businessName,
      );
      if (delivered === "cancelled") return;
      if (delivered === "shared") {
        toast.success(
          isAr ? "فيديو التصميم جاهز للحفظ أو المشاركة" : "Video creative ready to share",
        );
        return;
      }
      toast.success(
        isAr
          ? `تم تنزيل فيديو التصميم بنجاح (${target.width}×${target.height})`
          : `Video creative downloaded (${target.width}×${target.height})`,
      );
    } catch (error) {
      console.error("Video export error:", error);
      toast.error(
        isAr
          ? "تعذر تسجيل الفيديو. جاري تنزيل الملف الأصلي بدلاً منه."
          : "Could not record video. Downloading original file.",
      );
      await downloadOriginalVideo();
    } finally {
      if (hiddenMount && hiddenMount.parentNode) {
        hiddenMount.remove();
      }
      if (rVFCId !== null && typeof (v as any).cancelVideoFrameCallback === "function") {
        (v as any).cancelVideoFrameCallback(rVFCId);
      }
      if (rAFId !== null) cancelAnimationFrame(rAFId);
      if (checkTimer !== null) clearInterval(checkTimer);
      setExporting(false);
      setExportProgress(0);
      if (v) {
        v.loop = true;
        v.play().catch(() => {});
      }
    }
  };

  const exportCreative = async () => {
    if (isCurrentVideo) {
      await exportVideoCreative();
    } else {
      await exportImageCreative();
    }
  };

  return {
    exporting,
    exportProgress,
    downloadOriginalVideo,
    exportImageCreative,
    exportVideoCreative,
    exportCreative,
  };
}
