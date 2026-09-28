import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { deliverCreativeFile } from "@/lib/creative-export";
import type { OrderReviewAdminRow } from "@/lib/order-reviews";
import type { Drawable } from "@/features/content-studio/engine/scene";
import {
  canExportMp4,
  exportTemplateMp4,
  exportTemplatePng,
} from "@/features/content-studio/engine/export";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import { openVideoFrames, type VideoFrames } from "@/features/content-studio/engine/video-frames";
import { useLoadedImage } from "@/features/content-studio/hooks/use-template-scene";
import { reviewStory } from "@/features/review-story/templates/review-story";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  formatOrderDate,
  reviewStoryFields,
  safeColor,
  type ProductMediaItem,
  type ReviewScene,
  type StoryLook,
} from "@/features/review-story/lib/review-story";

/**
 * The review story's choices (look, media, words, what to show) and its
 * exports: an MP4 rendered frame by frame (with the product video's own
 * frames when the media is a video) and a still PNG.
 */
export function useReviewStory({
  open,
  review,
  brandName,
  brandColor,
  logoUrl,
  isAr,
  orderDate,
  productImages,
  productMedia,
  brandPhone,
  brandInstagram,
}: {
  open: boolean;
  review: OrderReviewAdminRow | null;
  brandName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  isAr: boolean;
  orderDate?: string | null;
  productImages: string[];
  productMedia: ProductMediaItem[];
  brandPhone?: string | null;
  brandInstagram?: string | null;
}) {
  const [look, setLook] = useState<StoryLook>("classic");
  const [comment, setComment] = useState("");
  const [showName, setShowName] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [orderDateInput, setOrderDateInput] = useState("");
  const [showBrandContact, setShowBrandContact] = useState(true);
  const [customBrandPhone, setCustomBrandPhone] = useState("");
  const [customBrandInstagram, setCustomBrandInstagram] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  // The frame the preview is paused on: the PNG exports that one (else the finished story).
  const [stillAt, setStillAt] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const primary = safeColor(brandColor);
  const availableMedia: ProductMediaItem[] = useMemo(() => {
    if (productMedia.length > 0) return productMedia;
    return productImages.map((url) => ({ url, type: "image" as const }));
  }, [productMedia, productImages]);

  // Start from the review's own words and the first media each time a review opens.
  useEffect(() => {
    if (!review || !open) return;
    setComment(review.comment ?? "");
    setLook("classic");
    setShowName(true);
    setShowHighlights(true);
    setShowDate(true);
    setShowBrandContact(true);
    setCustomBrandPhone(brandPhone ?? "");
    setCustomBrandInstagram(brandInstagram ?? "");
    setOrderDateInput(formatOrderDate(orderDate || review.reviewed_at, isAr));
    setSelectedMedia(availableMedia[0] ?? null);
  }, [review, open, brandPhone, brandInstagram, orderDate, availableMedia, isAr]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void canExportMp4(STORY_WIDTH, STORY_HEIGHT).then((supported) => {
      if (alive) setMp4Supported(supported);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  const logo = useLoadedImage(logoUrl);
  const isVideo = selectedMedia?.type === "video";
  const photo = useLoadedImage(selectedMedia && !isVideo ? selectedMedia.url : null);

  const buildScene = useCallback(
    (width: number, height: number, media?: Drawable | null): ReviewScene => ({
      width,
      height,
      media: media === undefined ? photo : media,
      look,
      lang: isAr ? "ar" : "en",
      primary,
      brandName,
      logo,
      ...(review
        ? reviewStoryFields({
            review,
            comment,
            isAr,
            showName,
            showHighlights,
            showDate,
            orderDateText: orderDateInput,
            showBrandContact,
            brandPhone: customBrandPhone,
            brandInstagram: customBrandInstagram,
          })
        : { customer: "", rating: 5, comment: "", highlights: [], date: null, contact: null }),
    }),
    [
      photo,
      look,
      isAr,
      primary,
      brandName,
      logo,
      review,
      comment,
      showName,
      showHighlights,
      showDate,
      orderDateInput,
      showBrandContact,
      customBrandPhone,
      customBrandInstagram,
    ],
  );

  const deliver = async (blob: Blob, extension: "mp4" | "png", mimeType: string) => {
    if (!review) return;
    const delivered = await deliverCreativeFile(
      blob,
      `customer-review-story-${review.review_id}.${extension}`,
      mimeType,
      brandName,
    );
    if (delivered === "cancelled") return;
    toast.success(
      extension === "mp4"
        ? isAr
          ? "تم تجهيز فيديو الستوري (MP4) بنجاح"
          : "Story video (MP4) ready"
        : isAr
          ? "تم تنزيل الستوري بجودة عالية"
          : "Story downloaded in high quality",
    );
  };

  const exportVideo = async () => {
    if (!review) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setExportProgress(0);
    let frames: VideoFrames | null = null;
    try {
      await loadStudioFonts();
      if (isVideo && selectedMedia) {
        // Decoded at the frame's own size: the video only fills the product frame.
        frames = await openVideoFrames(selectedMedia.url, { width: 660, height: 1140 });
      }
      const blob = await exportTemplateMp4({
        template: reviewStory,
        scene: buildScene(STORY_WIDTH, STORY_HEIGHT, frames ? null : undefined),
        frameAt: frames?.frameAt,
        onProgress: (fraction) => setExportProgress(Math.round(fraction * 100)),
        signal: controller.signal,
      });
      await deliver(blob, "mp4", "video/mp4");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.info(isAr ? "تم إلغاء التصدير" : "Export cancelled");
      } else {
        console.error("Review story video export failed", error);
        toast.error(
          isAr
            ? "تعذر تصدير الفيديو، يمكنك تنزيل صورة ثابتة بدلاً من ذلك"
            : "Could not export video, try PNG download instead",
        );
      }
    } finally {
      frames?.dispose();
      abortRef.current = null;
      setExporting(false);
      setExportProgress(0);
    }
  };

  const exportStill = async () => {
    if (!review) return;
    setExporting(true);
    try {
      await loadStudioFonts();
      const blob = await exportTemplatePng({
        template: reviewStory,
        scene: buildScene(STORY_WIDTH, STORY_HEIGHT),
        t: stillAt ?? undefined,
      });
      await deliver(blob, "png", "image/png");
    } catch (error) {
      console.error("Review story PNG export failed", error);
      toast.error(isAr ? "تعذر إنشاء الصورة، حاول مرة أخرى" : "Could not create the image");
    } finally {
      setExporting(false);
    }
  };

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("video/")) {
      setSelectedMedia({ url: URL.createObjectURL(file), type: "video" });
      toast.success(isAr ? "تم إدراج مقطع الفيديو بنجاح" : "Product video loaded successfully");
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setSelectedMedia({ url: reader.result, type: "image" });
          toast.success(isAr ? "تم إدراج صورة المنتج بنجاح" : "Product photo loaded successfully");
        }
      };
      reader.readAsDataURL(file);
    } else {
      toast.error(
        isAr ? "يرجى اختيار ملف صورة أو فيديو صالح" : "Please select a valid image or video file",
      );
    }
  };

  return {
    look,
    setLook,
    primary,
    comment,
    setComment,
    showName,
    setShowName,
    showHighlights,
    setShowHighlights,
    showDate,
    setShowDate,
    orderDateInput,
    setOrderDateInput,
    showBrandContact,
    setShowBrandContact,
    customBrandPhone,
    setCustomBrandPhone,
    customBrandInstagram,
    setCustomBrandInstagram,
    availableMedia,
    selectedMedia,
    setSelectedMedia,
    handleFileUpload,
    buildScene,
    exporting,
    exportProgress,
    mp4Supported,
    exportVideo,
    exportStill,
    stillAt,
    setStillAt,
    cancelExport: () => abortRef.current?.abort(),
  };
}

export type ReviewStoryState = ReturnType<typeof useReviewStory>;
