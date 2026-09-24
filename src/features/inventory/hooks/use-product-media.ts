import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { VIDEO_PRESETS, type OptimizedVideoResult } from "@/lib/video-optimizer";
import type { ProductForm } from "@/features/inventory/lib/product-form";

/**
 * Gallery uploads for the product editor. Files uploaded but never saved are
 * deleted when the editor closes; saved files the merchant removed are deleted
 * only after the product saves (`commitMedia`).
 */
export function useProductMedia(
  brandId: string,
  form: ProductForm,
  setForm: Dispatch<SetStateAction<ProductForm>>,
  isAr: boolean,
) {
  const [uploading, setUploading] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const uncommittedUploads = useRef(new Set<string>());
  const removedCommittedMedia = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const url of uncommittedUploads.current) {
        void deletePublicMediaUrl(brandId, url).catch(() => undefined);
      }
      uncommittedUploads.current.clear();
      removedCommittedMedia.current.clear();
    },
    [brandId],
  );

  const uploadBlob = async (blob: Blob, _ext: string, kind: "image" | "video") => {
    try {
      setUploading(true);
      const mediaBlob = blob.type
        ? blob
        : new Blob([blob], { type: kind === "image" ? "image/jpeg" : "video/mp4" });
      const url = await uploadPublicMedia(brandId, mediaBlob, "product");
      uncommittedUploads.current.add(url);
      setForm((f) => ({ ...f, media: [...f.media, { type: kind, url }] }));
      toast.success(isAr ? "تم الرفع" : "Uploaded");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFilePicked = async (file: File) => {
    if (file.type.startsWith("video") || /\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      setPendingVideo(file);
      return;
    }
    setPendingImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleConfirmProductVideo = async (result: OptimizedVideoResult) => {
    try {
      setUploading(true);
      const [videoUrl, posterUrl] = await Promise.all([
        uploadPublicMedia(brandId, result.file, "product"),
        result.posterBlob && result.posterBlob.size > 0
          ? uploadPublicMedia(brandId, result.posterBlob, "product")
          : Promise.resolve(null),
      ]);
      uncommittedUploads.current.add(videoUrl);
      if (posterUrl) uncommittedUploads.current.add(posterUrl);
      setForm((f) => ({
        ...f,
        media: [
          ...f.media,
          { type: "video", url: videoUrl, ...(posterUrl ? { poster_url: posterUrl } : {}) },
        ],
      }));
      const presetLabel = isAr
        ? VIDEO_PRESETS[result.preset].labelAr
        : VIDEO_PRESETS[result.preset].labelEn;
      if (result.wasCompressed) {
        toast.success(
          isAr
            ? `تم تحسين ورفع الفيديو بنجاح (${presetLabel} — وفّر ${result.savingsPercent}%)`
            : `Video optimized & uploaded (${presetLabel} — -${result.savingsPercent}%)`,
        );
      } else {
        toast.success(
          isAr
            ? `تم رفع الفيديو بنجاح (${presetLabel})`
            : `Video uploaded successfully (${presetLabel})`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setPendingVideo(null);
    }
  };

  const handleCropConfirmed = async (blob: Blob) => {
    await uploadBlob(blob, "jpg", "image");
    setCropSrc(null);
    setPendingImageFile(null);
  };

  const handleSkipCrop = async () => {
    if (pendingImageFile) {
      const ext = pendingImageFile.name.split(".").pop() ?? "jpg";
      await uploadBlob(pendingImageFile, ext, "image");
      setCropSrc(null);
      setPendingImageFile(null);
    }
  };

  const removeMedia = (index: number) => {
    const media = form.media[index];
    if (media && uncommittedUploads.current.delete(media.url)) {
      void deletePublicMediaUrl(brandId, media.url).catch(() => {
        uncommittedUploads.current.add(media.url);
      });
    } else if (media) {
      removedCommittedMedia.current.add(media.url);
    }
    setForm((current) => ({ ...current, media: current.media.filter((_, i) => i !== index) }));
  };

  const moveMedia = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.media.length) return;
    const next = [...form.media];
    const temp = next[index];
    next[index] = next[target];
    next[target] = temp;
    setForm((current) => ({ ...current, media: next }));
  };

  /** After a successful save: delete removed files and keep the new uploads. */
  const commitMedia = () => {
    for (const url of removedCommittedMedia.current) {
      void deletePublicMediaUrl(brandId, url).catch(() => undefined);
    }
    removedCommittedMedia.current.clear();
    uncommittedUploads.current.clear();
  };

  return {
    uploading,
    cropSrc,
    setCropSrc,
    pendingVideo,
    setPendingVideo,
    setPendingImageFile,
    handleFilePicked,
    handleConfirmProductVideo,
    handleCropConfirmed,
    handleSkipCrop,
    removeMedia,
    moveMedia,
    commitMedia,
  };
}
