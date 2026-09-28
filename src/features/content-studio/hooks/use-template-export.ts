import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { creativeFileName, deliverCreativeFile, deliverCreativeFiles } from "@/lib/creative-export";
import { FORMATS } from "@/features/content-studio/lib/studio-content";
import {
  canExportMp4,
  exportTemplateCarousel,
  exportTemplateMp4,
  exportTemplatePng,
} from "@/features/content-studio/engine/export";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import { openVideoFrames, type VideoFrames } from "@/features/content-studio/engine/video-frames";
import type { StudioTemplate } from "@/features/content-studio/engine/scene";
import type { useTemplateScene } from "@/features/content-studio/hooks/use-template-scene";

/**
 * Exports the chosen animated template: an MP4 rendered frame by frame (with
 * the product video's own frames when the media is a video), or a still PNG.
 */
export function useTemplateExport({
  template,
  buildScene,
  format,
  photo,
  isCurrentVideo,
  brandSlugClean,
  productFileName,
  headline,
  businessName,
  isAr,
}: {
  template: StudioTemplate | null;
  buildScene: ReturnType<typeof useTemplateScene>["buildScene"];
  format: keyof typeof FORMATS;
  photo: string | null;
  isCurrentVideo: boolean;
  brandSlugClean: string;
  productFileName: string | null | undefined;
  headline: string;
  businessName: string;
  isAr: boolean;
}) {
  const [templateExporting, setTemplateExporting] = useState(false);
  const [templateProgress, setTemplateProgress] = useState(0);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { width, height } = FORMATS[format];

  useEffect(() => {
    let alive = true;
    void canExportMp4(width, height).then((supported) => {
      if (alive) setMp4Supported(supported);
    });
    return () => {
      alive = false;
    };
  }, [width, height]);

  const deliver = async (blob: Blob, extension: "mp4" | "png", mimeType: string) => {
    const fileName = creativeFileName(brandSlugClean, productFileName, format, extension);
    const delivered = await deliverCreativeFile(blob, fileName, mimeType, headline || businessName);
    if (delivered === "cancelled") return;
    toast.success(
      delivered === "shared"
        ? isAr
          ? "التصميم جاهز للحفظ أو المشاركة"
          : "Creative ready to save or share"
        : isAr
          ? `تم تنزيل التصميم ${width}×${height}`
          : `Downloaded at ${width}×${height}`,
    );
  };

  const exportTemplateVideo = async () => {
    if (!template) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setTemplateExporting(true);
    setTemplateProgress(0);
    let frames: VideoFrames | null = null;
    try {
      await loadStudioFonts();
      if (isCurrentVideo && photo) frames = await openVideoFrames(photo, { width, height });
      const blob = await exportTemplateMp4({
        template,
        scene: buildScene(width, height, frames ? null : undefined),
        frameAt: frames?.frameAt,
        onProgress: (fraction) => setTemplateProgress(Math.round(fraction * 100)),
        signal: controller.signal,
      });
      await deliver(blob, "mp4", "video/mp4");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info(isAr ? "تم إلغاء التصدير" : "Export cancelled");
      } else {
        console.error("Template video export failed", error);
        toast.error(
          isAr
            ? "تعذر تصدير الفيديو. جرّب صورة PNG بدلاً منه."
            : "Could not export the video. Try the PNG instead.",
        );
      }
    } finally {
      frames?.dispose();
      abortRef.current = null;
      setTemplateExporting(false);
      setTemplateProgress(0);
    }
  };

  const exportTemplateStill = async () => {
    if (!template) return;
    setTemplateExporting(true);
    try {
      await loadStudioFonts();
      const blob = await exportTemplatePng({ template, scene: buildScene(width, height) });
      await deliver(blob, "png", "image/png");
    } catch (error) {
      console.error("Template PNG export failed", error);
      toast.error(
        isAr
          ? "تعذر تصدير الصورة. تحقق من صورة المنتج."
          : "Could not export. Check the product image.",
      );
    } finally {
      setTemplateExporting(false);
    }
  };

  // An Instagram carousel: one 4:5 PNG per slide, shared together or zipped.
  const exportTemplateSlides = async () => {
    if (!template?.slideTimes) return;
    setTemplateExporting(true);
    try {
      await loadStudioFonts();
      const { width: slideW, height: slideH } = FORMATS.portrait;
      const slides = await exportTemplateCarousel({
        template,
        scene: { ...buildScene(slideW, slideH), format: "portrait" },
      });
      const files = slides.map((blob, index) => ({
        name: `${brandSlugClean}-${template.id}-${String(index + 1).padStart(2, "0")}.png`,
        blob,
        type: "image/png",
      }));
      const delivered = await deliverCreativeFiles(
        files,
        `${brandSlugClean}-${template.id}.zip`,
        headline || businessName,
      );
      if (delivered === "cancelled") return;
      toast.success(
        delivered === "shared"
          ? isAr
            ? "الشرائح جاهزة للمشاركة"
            : "Carousel ready to share"
          : isAr
            ? `تم تنزيل ${files.length} شرائح بمقاس 4:5 في ملف مضغوط`
            : `Downloaded ${files.length} slides (4:5) as a ZIP`,
      );
    } catch (error) {
      console.error("Template carousel export failed", error);
      toast.error(
        isAr
          ? "تعذر تصدير الشرائح. تحقق من صور المنتجات."
          : "Could not export the slides. Check the product images.",
      );
    } finally {
      setTemplateExporting(false);
    }
  };

  const cancelTemplateExport = () => abortRef.current?.abort();

  return {
    templateExporting,
    templateProgress,
    mp4Supported,
    exportTemplateVideo,
    exportTemplateStill,
    exportTemplateSlides,
    cancelTemplateExport,
  };
}
