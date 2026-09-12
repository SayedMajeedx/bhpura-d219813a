import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  ImageIcon,
  Instagram,
  MessageSquareHeart,
  Palette,
  Phone,
  Sparkles,
  Move,
  Sliders,
  RotateCcw,
  Layers,
  Video,
  Image as LucideImage,
  Sun,
  Moon,
  Eye,
  ChevronDown,
  ArrowUpLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/admin/b/$slug/content-studio")({
  component: ContentStudioPage,
});

type Product = {
  id: string;
  name: string;
  name_ar: string | null;
  name_en: string | null;
  description: string | null;
  description_ar: string | null;
  image_url: string | null;
  media: unknown;
  base_price: number | null;
  fabric_type?: string | null;
  occasion?: string | null;
};

const FORMATS = {
  story: { ar: "ستوري", en: "Story", width: 1080, height: 1920, ratio: "aspect-[9/16]" },
  portrait: { ar: "بوست 4:5", en: "Post 4:5", width: 1080, height: 1350, ratio: "aspect-[4/5]" },
  square: { ar: "مربع", en: "Square", width: 1080, height: 1080, ratio: "aspect-square" },
} as const;

/**
 * The stage is laid out at this fixed CSS width always, then visually scaled
 * to fit whatever space is actually available (see previewScale below). Every
 * child element's sizing (text, padding, icons) is tuned against this exact
 * reference width, so this is also the width the desktop preview already
 * renders at today (`max-w-[570px]`) — keeping this fixed is what makes the
 * mobile preview a proportionally identical, scaled-down copy of the desktop
 * one instead of a re-flowed, disproportionate one.
 */
const PREVIEW_BASE_WIDTH = 570;

const THEMES = {
  editorial: {
    ar: "تحريري",
    en: "Editorial",
    bg: "#f4eee9",
    ink: "#330a0a",
    panel: "rgba(255,255,255,.68)",
  },
  maison: {
    ar: "دار الأزياء",
    en: "Maison",
    bg: "#330a0a",
    ink: "#fffaf6",
    panel: "rgba(51,10,10,.64)",
  },
  minimal: {
    ar: "هادئ",
    en: "Minimal",
    bg: "#e8ddd5",
    ink: "#330a0a",
    panel: "rgba(244,238,233,.7)",
  },
} as const;

function firstImage(product?: Product) {
  if (!product) return null;
  if (product.image_url) return product.image_url;
  const media = Array.isArray(product.media) ? product.media : [];
  const item = media.find((entry: any) => {
    const url = typeof entry === "string" ? entry : entry?.url;
    return url && !/\.(mp4|webm|mov)(\?|$)/i.test(url);
  });
  return typeof item === "string" ? item : item?.url || null;
}

function instagramHandle(socials: unknown) {
  if (!Array.isArray(socials)) return null;
  const item = socials.find((social: any) =>
    `${social?.name ?? ""} ${social?.url ?? ""}`.toLowerCase().includes("instagram"),
  ) as any;
  if (!item?.url) return null;
  const handle = item.url
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[/@]+$/g, "");
  return handle ? `@${handle.replace(/^@/, "")}` : null;
}

function containsArabic(value: string) {
  return /[\u0600-\u06ff]/.test(value);
}

function extractSnappySnippet(text: string | null | undefined, fallback: string): string {
  if (!text) return fallback;
  const clean = text.replace(/\r\n/g, "\n").trim();
  const lines = clean
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const firstLine = lines[0] || "";
  if (firstLine.length >= 10 && firstLine.length <= 110) {
    return firstLine;
  }
  const sentenceMatch = clean.match(/^([^.!?؟\n]+[.!?؟]?)/);
  if (
    sentenceMatch &&
    sentenceMatch[1].trim().length >= 10 &&
    sentenceMatch[1].trim().length <= 110
  ) {
    return sentenceMatch[1].trim();
  }
  if (clean.length <= 110) return clean;
  const sliced = clean.slice(0, 105);
  const lastSpace = sliced.lastIndexOf(" ");
  return (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced).trim() + "...";
}

function ContentStudioPage() {
  const { slug } = Route.useParams();
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const brandNameEn = brand.name_en || (brand as any).name || "Brand";
  const brandNameDisplay = isAr ? brand.name_ar || (brand as any).name || brandNameEn : brandNameEn;
  const brandSlugClean = brand.slug || slug || "brand";
  const defaultEditionLabel = `The ${brandNameEn} Edit`;

  const stageRef = useRef<HTMLDivElement>(null);
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Scales the fixed-width (PREVIEW_BASE_WIDTH) stage down to fit whatever
  // width is actually available — capped at 1 so nothing changes on desktop,
  // where the viewport is already >= PREVIEW_BASE_WIDTH. This is purely a
  // display transform: it never touches offsetWidth/offsetHeight, so the
  // html2canvas export scale math below is unaffected.
  const [previewScale, setPreviewScale] = useState(1);
  const [format, setFormat] = useState<keyof typeof FORMATS>("story");
  const [theme, setTheme] = useState<keyof typeof THEMES>("editorial");
  const [productId, setProductId] = useState("");
  const [editionLabel, setEditionLabel] = useState(() => defaultEditionLabel);
  const [headline, setHeadline] = useState("صُممت لتبقى في الذاكرة");
  const [body, setBody] = useState("أناقة هادئة، وتفاصيل مدروسة لكل لحظة.");
  const [showPrice, setShowPrice] = useState(true);
  const [imageFit, setImageFit] = useState<"cover" | "contain">("cover");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  useEffect(() => {
    setEditionLabel((prev) => {
      if (
        !prev ||
        prev === "The Pura Edit" ||
        (prev.startsWith("The ") && prev.endsWith(" Edit"))
      ) {
        return `The ${brandNameEn} Edit`;
      }
      return prev;
    });
  }, [brandNameEn]);

  const productsQ = useQuery({
    queryKey: ["content-studio-products", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id,name,name_ar,name_en,description,description_ar,image_url,media,base_price,fabric_type,occasion",
        )
        .eq("brand_id", brand.id)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });
  const variantsQ = useQuery({
    queryKey: ["content-studio-variants", brand.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select(
          "id,product_id,size,color,fabric,selling_price,original_price,image_url,stock_main,stock_incubator",
        )
        .eq("brand_id", brand.id);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_id: string;
        size: string | null;
        color: string | null;
        fabric: string | null;
        selling_price: number | null;
        original_price: number | null;
        image_url: string | null;
        stock_main: number | null;
        stock_incubator: number | null;
      }>;
    },
  });
  const settingsQ = useQuery({
    queryKey: ["content-studio-settings", brand.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("business_settings") as any)
        .select("business_name,phone,whatsapp_number,socials,logo_url,primary_color,currency")
        .eq("brand_id", brand.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const products = productsQ.data ?? [];
  const selected = products.find((product) => product.id === productId) ?? products[0];

  type StudioMediaItem = {
    url: string;
    type: "image" | "video";
    source: "primary" | "gallery" | "variant";
    label: string;
  };

  const productVariants = useMemo(() => {
    if (!selected) return [];
    return (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
  }, [selected, variantsQ.data]);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);

  // Header customization state
  const [headerScale, setHeaderScale] = useState(1.0);
  const [headerLogoHeight, setHeaderLogoHeight] = useState(48);
  const [headerPosY, setHeaderPosY] = useState(4.5);
  const [headerPosX, setHeaderPosX] = useState(0);
  const [headerPlateStyle, setHeaderPlateStyle] = useState<"none" | "glass" | "solid">("none");
  const [headerPlateColor, setHeaderPlateColor] = useState("rgba(0, 0, 0, 0.48)");
  const [headerTextColor, setHeaderTextColor] = useState<"white" | "dark">("white");
  const [headerBadgeText, setHeaderBadgeText] = useState("Bahrain");
  const [headerShowBadge, setHeaderShowBadge] = useState(true);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  const activeVariant = useMemo(() => {
    if (!selectedVariantId) return null;
    return productVariants.find((v) => v.id === selectedVariantId) ?? null;
  }, [productVariants, selectedVariantId]);

  const productMediaList = useMemo(() => {
    if (!selected) return [];
    const list: StudioMediaItem[] = [];
    const seenUrls = new Set<string>();

    const add = (
      url: string | null | undefined,
      type: "image" | "video",
      source: "primary" | "gallery" | "variant",
      label: string,
    ) => {
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      list.push({ url, type, source, label });
    };

    if (selected.image_url) {
      add(selected.image_url, "image", "primary", isAr ? "الأساسية" : "Main");
    }

    if (Array.isArray(selected.media)) {
      selected.media.forEach((item: any, idx: number) => {
        const url = typeof item === "string" ? item : item?.url;
        if (!url) return;
        const isVid =
          typeof item === "object" && item.type === "video"
            ? true
            : /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
        add(
          url,
          isVid ? "video" : "image",
          "gallery",
          isVid
            ? `${isAr ? "فيديو" : "Video"} ${idx + 1}`
            : `${isAr ? "صورة" : "Image"} ${idx + 1}`,
        );
      });
    }

    productVariants.forEach((v) => {
      if (v.image_url) {
        const vLabel =
          [v.size, v.color].filter(Boolean).join(" · ") || (isAr ? "متغير" : "Variant");
        add(v.image_url, "image", "variant", vLabel);
      }
    });

    return list;
  }, [selected, productVariants, isAr]);

  useEffect(() => {
    if (productMediaList.length > 0) {
      const match = productMediaList.some((m) => m.url === selectedMediaUrl);
      if (!match) {
        setSelectedMediaUrl(productMediaList[0].url);
      }
    } else {
      setSelectedMediaUrl(null);
    }
  }, [selected?.id, productMediaList, selectedMediaUrl]);

  useEffect(() => {
    if (!selected) return;
    const name = isAr ? selected.name_ar || selected.name : selected.name_en || selected.name;
    if (name) {
      setHeadline(name);
    }
    const rawDesc = isAr
      ? selected.description_ar || selected.description
      : selected.description || selected.description_ar;
    const autoBody = extractSnappySnippet(
      rawDesc,
      isAr
        ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
        : "Quiet elegance, thoughtful details for every moment.",
    );
    setBody(autoBody);
  }, [selected?.id, isAr]);

  const handleSelectVariant = (variantId: string | null) => {
    setSelectedVariantId(variantId);
    if (variantId) {
      const v = productVariants.find((item) => item.id === variantId);
      if (v?.image_url) {
        setSelectedMediaUrl(v.image_url);
      }
    }
  };

  const currentMedia = useMemo(() => {
    return productMediaList.find((m) => m.url === selectedMediaUrl) ?? productMediaList[0] ?? null;
  }, [productMediaList, selectedMediaUrl]);

  const photo = currentMedia?.url ?? firstImage(selected);
  const isCurrentVideo = currentMedia?.type === "video";

  const effectivePrice =
    activeVariant?.selling_price != null
      ? activeVariant.selling_price
      : (selected?.base_price ?? null);

  // Keeps the mobile preview a scaled-down copy of the desktop one instead of
  // a re-flowed, disproportionate one: the stage always lays out at a fixed
  // PREVIEW_BASE_WIDTH, and this only ever shrinks it (never grows past 1) to
  // fit the space actually available on screen.
  useLayoutEffect(() => {
    const viewportEl = stageViewportRef.current;
    if (!viewportEl || typeof ResizeObserver === "undefined") return;

    const updateScale = () => {
      const availableWidth = viewportEl.offsetWidth;
      if (availableWidth > 0) {
        setPreviewScale(Math.min(1, availableWidth / PREVIEW_BASE_WIDTH));
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, []);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exporting) return;
    e.preventDefault();
    setIsDraggingHeader(true);
    const startY = e.clientY;
    const startPosY = headerPosY;
    const stageEl = stageRef.current;
    // getBoundingClientRect (not offsetHeight) so dragging feels the same at
    // any preview size: it reflects the stage's actual visible/scaled
    // height, matching the real screen pixels the pointer is moving across.
    const stageHeight = stageEl ? stageEl.getBoundingClientRect().height : 1;

    const onPointerMove = (moveEv: PointerEvent) => {
      const deltaY = moveEv.clientY - startY;
      const deltaPercent = (deltaY / stageHeight) * 100;
      const nextY = Math.max(1, Math.min(82, startPosY + deltaPercent));
      setHeaderPosY(Math.round(nextY * 10) / 10);
    };

    const onPointerUp = () => {
      setIsDraggingHeader(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const resetHeaderLayout = () => {
    setHeaderScale(1.0);
    setHeaderLogoHeight(48);
    setHeaderPosY(4.5);
    setHeaderPosX(0);
    setHeaderPlateStyle("none");
    setHeaderPlateColor("rgba(0, 0, 0, 0.48)");
    setHeaderTextColor("white");
    setHeaderBadgeText("Bahrain");
    setHeaderShowBadge(true);
  };

  const businessName =
    settingsQ.data?.business_name || (isAr ? brand.name_ar : brand.name_en) || brand.name_en;
  const logo = settingsQ.data?.logo_url || brand.logo_url;
  const phone = settingsQ.data?.phone || settingsQ.data?.whatsapp_number;
  const instagram = instagramHandle(settingsQ.data?.socials);
  const currency = settingsQ.data?.currency || "BHD";
  const currencySymbol = isAr
    ? currency === "BHD"
      ? "د.ب."
      : currency === "SAR"
        ? "ر.س."
        : currency === "KWD"
          ? "د.ك."
          : currency
    : currency;
  const palette = THEMES[theme];
  const editionIsAr = containsArabic(editionLabel);
  const headlineIsAr = containsArabic(headline);
  const bodyIsAr = containsArabic(body);
  const fallbackLineName = `${brandNameEn.toUpperCase()} LINE`;
  const productName = selected
    ? isAr
      ? selected.name_ar || selected.name
      : selected.name_en || selected.name
    : fallbackLineName;

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
      const fileName = `${brandSlugClean}-${selected?.name || "creative"}-${format}.png`
        .replace(/\s+/g, "-")
        .toLowerCase();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("PNG export failed"))),
          "image/png",
          1,
        ),
      );
      const file = new File([blob], fileName, { type: "image/png" });
      const isMobileDevice =
        window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
      const canShareFile =
        isMobileDevice &&
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: headline || businessName });
          toast.success(
            isAr ? "التصميم جاهز للحفظ أو المشاركة" : "Creative ready to save or share",
          );
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
          console.warn("Native file sharing was unavailable; using download fallback", shareError);
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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

  const getExactVideoDuration = async (
    videoElement: HTMLVideoElement,
    url: string,
  ): Promise<number> => {
    // 1. Direct finite duration on element if already fully loaded
    if (videoElement.duration && isFinite(videoElement.duration) && videoElement.duration > 0) {
      return videoElement.duration;
    }

    // 2. Fast MP4 mvhd atom parser directly from file header / body (accurate to milliseconds)
    try {
      const response = await fetch(url);
      const reader = response.body?.getReader();
      if (reader) {
        let totalLen = 0;
        const chunks: Uint8Array[] = [];
        // Read up to 256KB to locate the moov/mvhd atom
        while (totalLen < 256 * 1024) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          totalLen += value.length;

          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
          }

          for (let i = 0; i < merged.length - 32; i++) {
            if (
              merged[i] === 0x6d &&
              merged[i + 1] === 0x76 &&
              merged[i + 2] === 0x68 &&
              merged[i + 3] === 0x64
            ) {
              // 'mvhd' atom
              const ver = merged[i + 4];
              const dv = new DataView(merged.buffer, i);
              const timescale = ver === 1 ? dv.getUint32(24) : dv.getUint32(16);
              const dur = ver === 1 ? Number(dv.getBigUint64(28)) : dv.getUint32(20);
              reader.cancel().catch(() => {});
              if (timescale > 0 && dur > 0) {
                const secs = dur / timescale;
                if (isFinite(secs) && secs > 0) return secs;
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not parse MP4 mvhd duration via stream", err);
    }

    // 3. If stream reader didn't find mvhd (e.g. moov at end of file), read full arrayBuffer
    try {
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      const u8 = new Uint8Array(buf);
      for (let i = 0; i < u8.length - 32; i++) {
        if (u8[i] === 0x6d && u8[i + 1] === 0x76 && u8[i + 2] === 0x68 && u8[i + 3] === 0x64) {
          const ver = u8[i + 4];
          const dv = new DataView(buf, i);
          const timescale = ver === 1 ? dv.getUint32(24) : dv.getUint32(16);
          const dur = ver === 1 ? Number(dv.getBigUint64(28)) : dv.getUint32(20);
          if (timescale > 0 && dur > 0) {
            const secs = dur / timescale;
            if (isFinite(secs) && secs > 0) return secs;
          }
          break;
        }
      }
    } catch (err) {
      console.warn("Could not parse MP4 mvhd duration from full buffer", err);
    }

    return 0;
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
      const fileName = `${brandSlugClean}-${selected?.name || "creative"}-${format}.${ext}`
        .replace(/\s+/g, "-")
        .toLowerCase();
      const file = new File([blob], fileName, { type: mimeType });
      const isMobileDevice =
        window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
      const canShareFile =
        isMobileDevice &&
        typeof navigator.share === "function" &&
        navigator.canShare?.({ files: [file] });

      if (canShareFile) {
        try {
          await navigator.share({ files: [file], title: headline || businessName });
          toast.success(
            isAr ? "فيديو التصميم جاهز للحفظ أو المشاركة" : "Video creative ready to share",
          );
          return;
        } catch (shareError) {
          if (shareError instanceof DOMException && shareError.name === "AbortError") return;
          console.warn("Native file sharing unavailable; using fallback", shareError);
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = fileName;
      link.href = url;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
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

  const selectedDescription = useMemo(
    () =>
      selected
        ? isAr
          ? selected.description_ar || selected.description
          : selected.description
        : null,
    [isAr, selected],
  );

  const snappyDesc = useMemo(
    () =>
      extractSnappySnippet(
        selectedDescription,
        isAr
          ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
          : "Quiet elegance, thoughtful details for every moment.",
      ),
    [isAr, selectedDescription],
  );

  const [copiedCaption, setCopiedCaption] = useState(false);

  const captionText = useMemo(() => {
    if (!selected) return "";
    const title = headline.trim() ? `✨ ${headline.trim()}` : "✨ [العنوان العاطفي]";
    const desc = body.trim() || selectedDescription || "";

    const pVariants = (variantsQ.data ?? []).filter((v) => v.product_id === selected.id);
    const availableSizes = Array.from(
      new Set(
        pVariants
          .filter(
            (v) => (Number(v.stock_main) || 0) + (Number(v.stock_incubator) || 0) > 0 && v.size,
          )
          .map((v) => v.size!.trim()),
      ),
    );

    const sizesFormatted = availableSizes.length > 0 ? availableSizes.join(" · ") : "";

    const occasionFormatted = selected.occasion ? selected.occasion.trim() : "";
    const fabricFormatted = selected.fabric_type ? selected.fabric_type.trim() : "";
    const priceFormatted = effectivePrice != null ? Number(effectivePrice).toFixed(3) : "0.000";

    const details: string[] = [];
    if (sizesFormatted) {
      details.push(`📏 المقاسات المتوفرة للبيع الفوري: ${sizesFormatted}`);
    } else {
      details.push("📏 المقاسات: متوفرة للتفصيل حسب الطلب");
    }
    if (occasionFormatted) {
      details.push(`👗 مناسبة لـ: ${occasionFormatted}`);
    }
    if (fabricFormatted) {
      details.push(`🧵 نوع القماش: ${fabricFormatted}`);
    }
    details.push("✂️ متوفرة للتفصيل حسب الطلب: نعم");

    const detailsBlock = details.length > 0 ? `\n\n${details.join("\n")}` : "";

    return `${title}
${desc}${detailsBlock}

💰 ${priceFormatted} ${currencySymbol}`;
  }, [selected, headline, body, selectedDescription, variantsQ.data, currencySymbol]);

  const handleCopyCaption = async () => {
    if (!captionText) return;
    try {
      await navigator.clipboard.writeText(captionText);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
      toast.success(
        isAr ? "تم نسخ كابشن انستقرام للحافظة بنجاح!" : "Instagram caption copied to clipboard!",
      );
    } catch {
      toast.error(isAr ? "تعذر النسخ للحافظة" : "Failed to copy to clipboard");
    }
  };

  return (
    <div
      className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 sm:space-y-6 p-2 sm:p-4 pb-32 sm:pb-16 overflow-x-hidden"
      dir={isAr ? "rtl" : "ltr"}
    >
      <section className="relative overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card p-4 sm:p-6 lg:p-8 shadow-xs">
        <div className="absolute inset-y-0 end-0 w-72 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/.12),transparent_70%)] pointer-events-none" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <span className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Palette className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 sm:mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.18em] text-primary">
                <Sparkles className="size-3.5 shrink-0" />
                <span className="truncate">{brandNameEn} Content Studio</span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl lg:text-3xl font-black text-foreground">
                {isAr ? "من المنتج إلى محتوى جاهز للنشر" : "From product to publish-ready creative"}
              </h1>
              <p className="mt-0.5 sm:mt-1 max-w-2xl text-xs sm:text-sm text-muted-foreground line-clamp-2 sm:line-clamp-none">
                {isAr
                  ? "استديو بصري يحافظ على هوية البراند ويصدّر المقاس الصحيح لكل منصة."
                  : "A focused visual studio that protects your brand language and exports the right social size."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyCaption}
              size="default"
              className="h-10 gap-2 rounded-xl border-border bg-background/80 text-xs font-semibold px-3.5 sm:px-4 shadow-2xs hover:bg-muted/50"
            >
              {copiedCaption ? (
                <Check className="size-4 text-emerald-600" />
              ) : (
                <Copy className="size-4 text-primary" />
              )}
              <span>{isAr ? "نسخ كابشن انستقرام" : "Copy Instagram Caption"}</span>
            </Button>
            {isCurrentVideo ? (
              <div className="flex items-center shadow-2xs">
                <Button
                  onClick={exportCreative}
                  disabled={exporting || productsQ.isLoading}
                  size="default"
                  className="h-10 gap-2 rounded-s-xl rounded-e-none text-xs font-semibold px-3.5 sm:px-4"
                >
                  <Video className="size-4" />
                  <span>
                    {exporting
                      ? exportProgress > 0
                        ? isAr
                          ? `جارٍ التصدير (${exportProgress}%)…`
                          : `Exporting (${exportProgress}%)…`
                        : isAr
                          ? "جارٍ التجهيز…"
                          : "Preparing…"
                      : isAr
                        ? "تنزيل فيديو MP4"
                        : "Download Video (MP4)"}
                  </span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={exporting || productsQ.isLoading}
                      size="default"
                      className="h-10 px-2.5 rounded-s-none rounded-e-xl border-s border-primary-foreground/20 text-xs"
                      aria-label={isAr ? "خيارات التنزيل" : "Download options"}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align={isAr ? "start" : "end"} className="w-60">
                    <DropdownMenuItem
                      onClick={exportVideoCreative}
                      disabled={exporting}
                      className="gap-2.5 cursor-pointer py-2"
                    >
                      <Video className="size-4 text-primary shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">
                          {isAr ? "تنزيل فيديو مصمم (MP4)" : "Branded Video (MP4)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isAr
                            ? "فيديو مع القالب والشعار والأسعار"
                            : "Video with layout, branding & price"}
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={downloadOriginalVideo}
                      disabled={exporting}
                      className="gap-2.5 cursor-pointer py-2"
                    >
                      <Download className="size-4 text-muted-foreground shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">
                          {isAr ? "تنزيل الفيديو الأصلي الخام" : "Original Raw Video"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isAr
                            ? "ملف الفيديو الأصلي بدون إضافات"
                            : "Source MP4 file without overlays"}
                        </span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={exportImageCreative}
                      disabled={exporting}
                      className="gap-2.5 cursor-pointer py-2"
                    >
                      <LucideImage className="size-4 text-muted-foreground shrink-0" />
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs">
                          {isAr ? "تنزيل لقطة كصورة (PNG)" : "Snapshot Frame (PNG)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isAr ? "صورة ثابتة للتصميم الحالي" : "Still image of current frame"}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                onClick={exportCreative}
                disabled={exporting || productsQ.isLoading}
                size="default"
                className="h-10 gap-2 rounded-xl text-xs font-semibold px-3.5 sm:px-4 shadow-2xs"
              >
                <Download className="size-4" />
                <span>
                  {exporting
                    ? isAr
                      ? "جارٍ التصدير…"
                      : "Exporting…"
                    : isAr
                      ? "تنزيل PNG"
                      : "Download PNG"}
                </span>
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid w-full min-w-0 max-w-full items-start gap-4 sm:gap-6 lg:gap-8 xl:grid-cols-[minmax(460px,520px)_1fr]">
        <Card
          id="studio-controls"
          className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[24px] border border-border-strong bg-card shadow-xs"
        >
          <div className="border-b border-border-subtle p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg font-bold text-foreground">
                  {isAr ? "اتجاه التصميم" : "Creative direction"}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isAr
                    ? "كل تعديل يظهر مباشرة في المعاينة."
                    : "Every change appears instantly in the preview."}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    document
                      .getElementById("studio-preview")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 cursor-pointer"
                >
                  <Eye className="size-3.5" />
                  <span>{isAr ? "المعاينة" : "Preview"}</span>
                </Button>
                <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Sliders className="size-4" />
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-5 p-4 sm:space-y-6 sm:p-6 min-w-0">
            {/* Product Selector */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between h-5">
                  <Label htmlFor="studio-product" className="text-xs font-bold text-foreground">
                    {isAr ? "المنتج" : "Product"}
                  </Label>
                  <span className="text-xs font-medium text-muted-foreground">
                    {products.length} {isAr ? "منتجات نشطة" : "active products"}
                  </span>
                </div>
                <Select value={selected?.id ?? ""} onValueChange={setProductId}>
                  <SelectTrigger
                    id="studio-product"
                    className="h-11 rounded-xl text-xs font-medium"
                  >
                    <SelectValue placeholder={isAr ? "اختيار منتج" : "Choose a product"} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {isAr ? product.name_ar || product.name : product.name_en || product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Variant Selector (if product has multiple variants) */}
              {productVariants.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between h-5">
                    <Label htmlFor="studio-variant" className="text-xs font-bold text-foreground">
                      {isAr ? "المتغير / المقاس واللون" : "Product Variant"}
                    </Label>
                    <span className="text-xs font-medium text-muted-foreground">
                      {productVariants.length} {isAr ? "خيارات" : "options"}
                    </span>
                  </div>
                  <Select
                    value={selectedVariantId || "all"}
                    onValueChange={(val) => handleSelectVariant(val === "all" ? null : val)}
                  >
                    <SelectTrigger
                      id="studio-variant"
                      className="h-10 rounded-xl text-xs bg-muted/20"
                    >
                      <SelectValue
                        placeholder={isAr ? "جميع المتغيرات / الأساسي" : "All variants (base)"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {isAr ? "المنتج الأساسي (الافتراضي)" : "Base product (default)"}
                      </SelectItem>
                      {productVariants.map((v) => {
                        const labelParts = [v.size, v.color].filter(Boolean);
                        const vTitle =
                          labelParts.length > 0 ? labelParts.join(" · ") : v.id.slice(0, 6);
                        const priceStr =
                          v.selling_price != null
                            ? ` · ${Number(v.selling_price).toFixed(3)} ${currencySymbol}`
                            : "";
                        return (
                          <SelectItem key={v.id} value={v.id}>
                            {vTitle} {priceStr}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Media gallery selector (pictures & videos) */}
              {productMediaList.length > 1 && (
                <div className="space-y-2 rounded-2xl border border-border-strong bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5 font-bold text-foreground text-xs">
                      <LucideImage className="size-3.5 text-primary" />
                      {isAr ? "اختيار صورة أو فيديو التصميم" : "Select design media"}
                    </span>
                    <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                      {productMediaList.length} {isAr ? "عناصر" : "items"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                    {productMediaList.map((item, idx) => {
                      const isSelected = item.url === selectedMediaUrl;
                      return (
                        <button
                          key={item.url + idx}
                          type="button"
                          onClick={() => setSelectedMediaUrl(item.url)}
                          className={cn(
                            "relative shrink-0 size-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer group",
                            isSelected
                              ? "border-primary ring-2 ring-primary/30 scale-105 shadow-sm"
                              : "border-border hover:border-primary/50 opacity-75 hover:opacity-100",
                          )}
                          title={item.label}
                        >
                          {item.type === "video" ? (
                            <div className="size-full bg-muted flex flex-col items-center justify-center text-foreground p-1">
                              <Video className="size-5 text-primary" />
                              <span className="text-xs font-bold mt-0.5">MP4</span>
                            </div>
                          ) : (
                            <img
                              src={item.url}
                              alt=""
                              className="size-full object-cover"
                              crossOrigin="anonymous"
                            />
                          )}
                          {item.type === "video" && (
                            <span className="absolute bottom-0.5 end-0.5 bg-black/80 text-xs text-white px-1 rounded font-semibold flex items-center gap-0.5">
                              <Video className="size-2" />
                            </span>
                          )}
                          {isSelected && (
                            <span className="absolute top-0.5 start-0.5 bg-primary text-primary-foreground size-4 rounded-full flex items-center justify-center shadow-xs">
                              <Check className="size-2.5 stroke-[3]" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Publish Size */}
            <div className="space-y-2 min-w-0">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "مقاس النشر" : "Publish size"}
              </Label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                {Object.entries(FORMATS).map(([key, item]) => {
                  const isSelected = format === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setFormat(key as keyof typeof FORMATS)}
                      className={cn(
                        "relative flex flex-col justify-between rounded-xl border p-2 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[66px] min-w-0",
                        isSelected
                          ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                          : "border-border hover:border-primary/40 bg-card/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1 w-full min-w-0">
                        <span className="text-xs font-bold text-foreground truncate">
                          {isAr ? item.ar : item.en}
                        </span>
                        {isSelected && (
                          <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-2 sm:size-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span
                        dir="ltr"
                        className="font-mono text-xs text-muted-foreground tabular-nums truncate"
                      >
                        {item.width} × {item.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual Style */}
            <div className="space-y-2 min-w-0">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "الأسلوب البصري" : "Visual style"}
              </Label>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5">
                {Object.entries(THEMES).map(([key, item]) => {
                  const isSelected = theme === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setTheme(key as keyof typeof THEMES)}
                      className={cn(
                        "relative flex flex-col justify-between rounded-xl border p-2 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[66px] min-w-0",
                        isSelected
                          ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                          : "border-border hover:border-primary/40 bg-card/60",
                      )}
                    >
                      <div className="flex items-center justify-between w-full min-w-0">
                        <span className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <i
                            className="size-3 sm:size-3.5 rounded-full border border-black/10 shadow-2xs"
                            style={{ background: item.bg }}
                          />
                          <i
                            className="size-3 sm:size-3.5 rounded-full shadow-2xs"
                            style={{ background: item.ink }}
                          />
                        </span>
                        {isSelected && (
                          <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-2 sm:size-2.5 stroke-[3]" />
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-foreground truncate mt-1">
                        {isAr ? item.ar : item.en}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Product Framing */}
            <div className="space-y-2 min-w-0">
              <Label className="text-xs font-bold text-foreground">
                {isAr ? "طريقة عرض صورة المنتج" : "Product photo framing"}
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => setImageFit("cover")}
                  className={cn(
                    "relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[64px] min-w-0",
                    imageFit === "cover"
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                      : "border-border hover:border-primary/40 bg-card/60",
                  )}
                >
                  <div className="flex items-center justify-between w-full min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">
                      {isAr ? "ملء الإطار (قص)" : "Cover frame"}
                    </span>
                    {imageFit === "cover" && (
                      <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2 sm:size-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 truncate">
                    {isAr ? "تكبير الصورة لملء الخلفية" : "Fills canvas boundary"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setImageFit("contain")}
                  className={cn(
                    "relative flex flex-col justify-between rounded-xl border p-2.5 sm:p-3 text-start transition-all cursor-pointer min-h-[58px] sm:min-h-[64px] min-w-0",
                    imageFit === "contain"
                      ? "border-primary bg-primary/[0.06] ring-1 ring-primary shadow-2xs"
                      : "border-border hover:border-primary/40 bg-card/60",
                  )}
                >
                  <div className="flex items-center justify-between w-full min-w-0">
                    <span className="text-xs font-bold text-foreground truncate">
                      {isAr ? "احتواء كامل (كاملة)" : "Fit / Contain"}
                    </span>
                    {imageFit === "contain" && (
                      <span className="grid size-3.5 sm:size-4 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground mt-1 truncate">
                    {isAr ? "حفظ كامل تفاصيل الصورة" : "Preserves full photo"}
                  </span>
                </button>
              </div>
            </div>

            {/* Visual Separation Divider */}
            <div className="pt-2">
              <Separator className="bg-border/60" />
            </div>

            {/* Header & Branding Bar Customization Card */}
            <div className="rounded-2xl border border-border-strong bg-muted/20 p-3.5 sm:p-5 space-y-4 sm:space-y-5 shadow-2xs min-w-0">
              <div className="flex items-center justify-between border-b border-border-subtle pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sliders className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {isAr ? "شريط الشعار والترويسة" : "Header & Branding Bar"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isAr
                        ? "تخصيص الموضع والحجم وخلفية الشعار"
                        : "Position, resize & backdrop plate"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetHeaderLayout}
                  className="h-7 gap-1 px-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-background/80"
                  title={isAr ? "استعادة الموضع والحجم الافتراضي" : "Reset layout"}
                >
                  <RotateCcw className="size-3" />
                  <span>{isAr ? "إعادة ضبط" : "Reset"}</span>
                </Button>
              </div>

              {/* Text Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between h-6">
                    <Label
                      htmlFor="studio-edition-label"
                      className="text-xs font-bold text-foreground leading-none"
                    >
                      {isAr ? "العبارة بجانب الشعار" : "Edition label"}
                    </Label>
                    <span
                      dir="ltr"
                      className="font-mono text-xs text-muted-foreground tabular-nums leading-none"
                    >
                      {editionLabel.length}/28
                    </span>
                  </div>
                  <Input
                    id="studio-edition-label"
                    value={editionLabel}
                    maxLength={28}
                    onChange={(event) => setEditionLabel(event.target.value)}
                    className="h-10 rounded-xl text-xs bg-background"
                    placeholder={defaultEditionLabel}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between h-6">
                    <Label
                      htmlFor="studio-badge-text"
                      className="text-xs font-bold text-foreground leading-none"
                    >
                      {isAr ? "شارة الموقع / الدولة" : "Location badge"}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setHeaderShowBadge(!headerShowBadge)}
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md border transition-all cursor-pointer leading-none",
                        headerShowBadge
                          ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                          : "border-border bg-muted/50 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full shrink-0",
                          headerShowBadge ? "bg-primary" : "bg-muted-foreground/40",
                        )}
                      />
                      <span>
                        {headerShowBadge
                          ? isAr
                            ? "مفعّلة"
                            : "Visible"
                          : isAr
                            ? "مخفية"
                            : "Hidden"}
                      </span>
                    </button>
                  </div>
                  <Input
                    id="studio-badge-text"
                    value={headerBadgeText}
                    maxLength={16}
                    disabled={!headerShowBadge}
                    onChange={(event) => setHeaderBadgeText(event.target.value)}
                    className="h-10 rounded-xl text-xs bg-background disabled:opacity-40 disabled:cursor-not-allowed"
                    placeholder="Bahrain"
                  />
                </div>
              </div>

              {/* Backdrop Plate Style (None / Glassmorphic / Solid) */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground">
                  {isAr ? "خلفية شريط الشعار (لزيادة الوضوح)" : "Header backdrop plate"}
                </Label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setHeaderPlateStyle("none")}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
                      headerPlateStyle === "none"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "شفاف" : "None"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderPlateStyle("glass");
                      if (headerPlateColor === "#1a1a1a")
                        setHeaderPlateColor("rgba(0, 0, 0, 0.48)");
                    }}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
                      headerPlateStyle === "glass"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "زجاجي مضبب" : "Glass"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHeaderPlateStyle("solid");
                      if (headerPlateColor.startsWith("rgba")) setHeaderPlateColor("#1a1a1a");
                    }}
                    className={cn(
                      "rounded-xl border p-2 text-center text-xs font-bold transition-all cursor-pointer truncate min-w-0",
                      headerPlateStyle === "solid"
                        ? "border-primary bg-primary/[0.08] ring-1 ring-primary text-primary"
                        : "border-border bg-background/50 hover:border-primary/40 text-muted-foreground",
                    )}
                  >
                    {isAr ? "خلفية مصمتة" : "Solid"}
                  </button>
                </div>

                {/* Plate Color & Contrast Settings */}
                {headerPlateStyle !== "none" && (
                  <div className="space-y-3 rounded-xl border border-border-subtle bg-background/70 p-3 pt-2.5">
                    <div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5 font-medium">
                        <span>{isAr ? "لون الخلفية" : "Plate color"}</span>
                        <span dir="ltr" className="font-mono text-xs tabular-nums">
                          {headerPlateColor}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {headerPlateStyle === "glass" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(0, 0, 0, 0.52)");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === "rgba(0, 0, 0, 0.52)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(0, 0, 0, 0.52)", color: "#fff" }}
                            >
                              <Moon className="size-2.5" />
                              <span>{isAr ? "زجاج داكن" : "Dark glass"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(255, 255, 255, 0.78)");
                                setHeaderTextColor("dark");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === "rgba(255, 255, 255, 0.78)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(255, 255, 255, 0.78)", color: "#111" }}
                            >
                              <Sun className="size-2.5" />
                              <span>{isAr ? "زجاج فاتح" : "Light glass"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("rgba(51, 10, 10, 0.65)");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === "rgba(51, 10, 10, 0.65)"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "rgba(51, 10, 10, 0.65)", color: "#fff" }}
                            >
                              <Palette className="size-2.5" />
                              <span>{isAr ? "براند" : "Brand"}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("#111111");
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === "#111111"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "#111111", color: "#fff" }}
                            >
                              <span>{isAr ? "أسود" : "Black"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor("#ffffff");
                                setHeaderTextColor("dark");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === "#ffffff"
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: "#ffffff", color: "#111" }}
                            >
                              <span>{isAr ? "أبيض" : "White"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setHeaderPlateColor(palette.ink);
                                setHeaderTextColor("white");
                              }}
                              className={cn(
                                "h-7 px-2.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer",
                                headerPlateColor === palette.ink
                                  ? "border-primary ring-1 ring-primary"
                                  : "border-border",
                              )}
                              style={{ background: palette.ink, color: palette.bg }}
                            >
                              <Palette className="size-2.5" />
                              <span>{isAr ? "لون النمط" : "Theme ink"}</span>
                            </button>
                          </>
                        )}
                        <label className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border bg-background cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          <input
                            type="color"
                            value={headerPlateColor.startsWith("#") ? headerPlateColor : "#1a1a1a"}
                            onChange={(e) => setHeaderPlateColor(e.target.value)}
                            className="size-4 cursor-pointer rounded border-0 bg-transparent p-0"
                          />
                          <span>{isAr ? "مخصص" : "Custom"}</span>
                        </label>
                      </div>
                    </div>

                    {/* Text Contrast Mode */}
                    <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-xs">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {isAr ? "تباين الشعار والنصوص" : "Content contrast"}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setHeaderTextColor("white")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                            headerTextColor === "white"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          ⚪ {isAr ? "أبيض" : "Light"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHeaderTextColor("dark")}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer",
                            headerTextColor === "dark"
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          ⚫ {isAr ? "داكن" : "Dark"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Resize & Drag Fine-Tuning Controls */}
              <div className="space-y-3.5 border-t border-border-subtle pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5 text-foreground text-xs">
                    <Move className="size-3.5 text-primary" />
                    <span>{isAr ? "الموضع والارتفاع" : "Position & Sizing"}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {isAr ? "اسحب بالماوس مباشرة أو اضبط هنا" : "Drag on canvas or adjust"}
                  </span>
                </div>

                {/* Vertical Position (Y) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isAr ? "الموضع العمودي (من الأعلى)" : "Vertical position (Y)"}
                    </span>
                    <span
                      dir="ltr"
                      className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
                    >
                      {headerPosY}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="75"
                    step="0.5"
                    value={headerPosY}
                    onChange={(e) => setHeaderPosY(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>

                {/* Logo Height */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isAr ? "ارتفاع الشعار" : "Logo height"}
                    </span>
                    <span
                      dir="ltr"
                      className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
                    >
                      {headerLogoHeight}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="80"
                    step="2"
                    value={headerLogoHeight}
                    onChange={(e) => setHeaderLogoHeight(parseInt(e.target.value, 10))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>

                {/* Overall Scale */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-xs font-medium text-muted-foreground">
                      {isAr ? "مقياس الترويسة الكاملة" : "Overall header scale"}
                    </span>
                    <span
                      dir="ltr"
                      className="font-mono text-xs font-bold tabular-nums px-2 py-0.5 rounded-md bg-background border border-border-strong text-foreground shadow-2xs"
                    >
                      {Math.round(headerScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={headerScale}
                    onChange={(e) => setHeaderScale(parseFloat(e.target.value))}
                    className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
            {/* Headline */}
            <div className="space-y-2">
              <div className="flex items-center justify-between h-5">
                <Label htmlFor="studio-headline" className="text-xs font-bold text-foreground">
                  {isAr ? "العنوان الرئيسي" : "Headline"}
                </Label>
                <span dir="ltr" className="font-mono text-xs text-muted-foreground tabular-nums">
                  {headline.length}/64
                </span>
              </div>
              <Input
                id="studio-headline"
                value={headline}
                maxLength={64}
                onChange={(event) => setHeadline(event.target.value)}
                className="h-10 rounded-xl text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setHeadline(productName)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors cursor-pointer shadow-2xs"
                  title={isAr ? "تعيين اسم المنتج كعنوان" : "Set product name as headline"}
                >
                  <Sparkles className="size-3 text-primary" />
                  <span>{isAr ? "اسم المنتج" : "Product Name"}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setHeadline(isAr ? "صُممت لتبقى في الذاكرة" : "Designed to Remember")
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{isAr ? "صُممت لتبقى في الذاكرة" : "Designed to Remember"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHeadline(isAr ? "وصل حديثاً ✨" : "New Arrival ✨")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{isAr ? "وصل حديثاً ✨" : "New Arrival ✨"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHeadline(isAr ? "الأكثر طلباً 🔥" : "Best Seller 🔥")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{isAr ? "الأكثر طلباً 🔥" : "Best Seller 🔥"}</span>
                </button>
              </div>
            </div>

            {/* Body Copy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between h-5">
                <Label htmlFor="studio-body" className="text-xs font-bold text-foreground">
                  {isAr ? "النص والوصف" : "Body copy"}
                </Label>
                <span dir="ltr" className="font-mono text-xs text-muted-foreground tabular-nums">
                  {body.length}/160
                </span>
              </div>
              <Textarea
                id="studio-body"
                value={body}
                maxLength={160}
                rows={3}
                onChange={(event) => setBody(event.target.value)}
                className="rounded-xl resize-none text-xs leading-relaxed"
                placeholder={selectedDescription || ""}
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {selectedDescription && (
                  <button
                    type="button"
                    onClick={() => setBody(snappyDesc)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:bg-muted px-2.5 py-1 text-xs font-medium text-foreground transition-colors cursor-pointer shadow-2xs"
                    title={isAr ? "اقتباس ذكي من أول الوصف" : "Smart excerpt from description"}
                  >
                    <Sparkles className="size-3 text-primary" />
                    <span>{isAr ? "مقتطف الوصف" : "Excerpt"}</span>
                  </button>
                )}
                {selectedDescription && (
                  <button
                    type="button"
                    onClick={() => setBody(selectedDescription.slice(0, 160))}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                    title={
                      isAr ? "نسخ الوصف بالكامل (حتى 160 حرف)" : "Full description up to 160 chars"
                    }
                  >
                    <span>{isAr ? "الوصف كاملاً" : "Full Desc"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setBody(
                      isAr
                        ? "أناقة هادئة، وتفاصيل مدروسة لكل لحظة."
                        : "Quiet elegance, thoughtful details for every moment.",
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{isAr ? "أناقة هادئة" : "Quiet Elegance"}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setBody(
                      isAr
                        ? "متوفرة الآن للطلب والتفصيل عبر متجرنا الإلكتروني."
                        : "Available now to order online.",
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background/50 hover:bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                >
                  <span>{isAr ? "جاهز للطلب" : "Ready to Order"}</span>
                </button>
              </div>
            </div>

            {/* Show price switch */}
            <div className="flex items-center justify-between rounded-xl border border-border-strong bg-muted/20 px-3.5 py-2.5">
              <Label
                htmlFor="studio-show-price"
                className="text-xs font-bold text-foreground cursor-pointer"
              >
                {isAr ? "إظهار السعر على البطاقة" : "Show price on card"}
              </Label>
              <Switch id="studio-show-price" checked={showPrice} onCheckedChange={setShowPrice} />
            </div>

            {/* Instagram auto-caption block */}
            <div className="rounded-2xl border border-border-strong bg-muted/20 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-primary">
                  <Sparkles className="size-3.5" />
                  <span>{isAr ? "كابشن انستقرام التلقائي" : "Auto Instagram Caption"}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyCaption}
                  className="h-7 text-xs font-semibold gap-1 px-2.5 text-muted-foreground hover:text-foreground hover:bg-background/80"
                >
                  {copiedCaption ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>
                    {copiedCaption ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ" : "Copy"}
                  </span>
                </Button>
              </div>
              <pre
                dir="rtl"
                className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground bg-background/80 p-3 rounded-xl border border-border-subtle select-all"
              >
                {captionText}
              </pre>
            </div>

            {/* Customer stories link */}
            <Link
              to="/admin/b/$slug/reviews"
              params={{ slug }}
              className="group flex items-center justify-between rounded-2xl border border-border-strong bg-muted/20 p-4 transition-all hover:bg-muted/40 hover:border-primary/40"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-background border border-border-subtle text-primary shadow-2xs">
                  <MessageSquareHeart className="size-4 text-primary" />
                </span>
                <span>
                  <strong className="block text-xs font-bold text-foreground">
                    {isAr ? "آراء وتقييمات العملاء" : "Customer stories"}
                  </strong>
                  <small className="text-xs text-muted-foreground">
                    {isAr ? "تحويل أي تقييم إلى ستوري تسويقي" : "Turn any review into a story"}
                  </small>
                </span>
              </span>
              <ArrowUpLeft className="size-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </Card>

        {/* Live Preview Stage */}
        <div
          id="studio-preview"
          className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl sm:rounded-[28px] border border-border-strong bg-muted/30 p-3 sm:p-7 xl:sticky xl:top-4 self-start shadow-xs"
        >
          <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p
                className={cn(
                  "text-xs font-bold text-muted-foreground",
                  !isAr && "uppercase tracking-[.15em]",
                )}
              >
                {isAr ? "معاينة مباشرة" : "Live preview"}
              </p>
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm font-semibold flex items-center gap-1 text-foreground">
                <span dir="ltr" className="font-mono tabular-nums">
                  {FORMATS[format].width} × {FORMATS[format].height} px
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  document
                    .getElementById("studio-controls")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="xl:hidden h-8 px-2.5 gap-1.5 text-xs font-semibold rounded-xl text-foreground border-border bg-background hover:bg-muted cursor-pointer"
              >
                <Sliders className="size-3.5" />
                <span>{isAr ? "التعديل" : "Edit"}</span>
              </Button>
              <span className="grid size-8 place-items-center rounded-xl bg-background/80 border border-border-subtle text-muted-foreground">
                <ImageIcon className="size-4" />
              </span>
            </div>
          </div>
          <div
            ref={stageViewportRef}
            dir="ltr"
            className="mx-auto w-full max-w-[570px] overflow-hidden rounded-[22px] shadow-2xl relative"
            style={{
              // Reserves exactly the scaled-down footprint of the fixed-width
              // stage below, so shrinking it on a narrow screen doesn't leave
              // empty space (transform never affects layout/reserved space).
              height: `${(
                PREVIEW_BASE_WIDTH *
                (FORMATS[format].height / FORMATS[format].width) *
                previewScale
              ).toFixed(2)}px`,
            }}
          >
            <div
              ref={stageRef}
              className={cn("relative isolate overflow-hidden shrink-0", FORMATS[format].ratio)}
              style={{
                background: palette.bg,
                color: palette.ink,
                // Fixed reference width — see PREVIEW_BASE_WIDTH — then
                // visually scaled to fit. Never touches offsetWidth, so the
                // html2canvas export scale below is unaffected either way.
                width: `${PREVIEW_BASE_WIDTH}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              {photo ? (
                isCurrentVideo ? (
                  <video
                    ref={videoRef}
                    src={photo}
                    crossOrigin="anonymous"
                    autoPlay
                    loop={!exporting}
                    muted
                    playsInline
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : imageFit === "contain" ? (
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                    <img
                      src={photo}
                      crossOrigin="anonymous"
                      alt=""
                      className="absolute inset-0 size-full object-cover blur-2xl scale-125 opacity-70 brightness-75 select-none"
                    />
                    <div className="absolute inset-0 bg-black/20" />
                    <img
                      src={photo}
                      crossOrigin="anonymous"
                      alt=""
                      className="relative z-10 max-h-full max-w-full object-contain drop-shadow-[0_16px_32px_rgba(0,0,0,0.4)] select-none"
                    />
                  </div>
                ) : (
                  <img
                    src={photo}
                    crossOrigin="anonymous"
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                )
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(214,177,130,.65),transparent_28%),radial-gradient(circle_at_80%_75%,rgba(51,10,10,.22),transparent_30%)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent via-70% to-black/20" />

              {/* Draggable & Customizable Header Bar */}
              <div
                dir="ltr"
                onPointerDown={handleHeaderPointerDown}
                className={cn(
                  "absolute inset-x-[5%] z-20 flex items-center justify-between gap-3 transition-shadow select-none",
                  !exporting &&
                    "cursor-grab active:cursor-grabbing group hover:ring-2 hover:ring-primary/60 hover:ring-offset-2 hover:ring-offset-black/30 rounded-2xl",
                  isDraggingHeader && "cursor-grabbing ring-2 ring-primary ring-offset-2",
                  headerPlateStyle === "glass" &&
                    "backdrop-blur-md shadow-lg border border-white/20 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl",
                  headerPlateStyle === "solid" &&
                    "shadow-md border border-white/10 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl",
                  headerPlateStyle === "none" && "px-1 py-1",
                )}
                style={{
                  top: `${headerPosY}%`,
                  transform: `scale(${headerScale})`,
                  transformOrigin: "center center",
                  backgroundColor:
                    headerPlateStyle === "glass"
                      ? headerPlateColor || "rgba(0, 0, 0, 0.48)"
                      : headerPlateStyle === "solid"
                        ? headerPlateColor || "#1a1a1a"
                        : "transparent",
                  color: headerTextColor === "dark" ? "#111827" : "#ffffff",
                }}
              >
                {/* Drag handle tooltip on hover (hidden during export) */}
                {!exporting && (
                  <div className="absolute -top-7 start-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                    <span className="flex items-center gap-1 text-xs font-bold bg-black/85 text-white px-2.5 py-0.5 rounded-full shadow-md whitespace-nowrap">
                      <Move className="size-2.5" />
                      {isAr ? "اسحب لتغيير الموضع" : "Drag to reposition"}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  {logo ? (
                    <img
                      src={logo}
                      crossOrigin="anonymous"
                      alt={businessName}
                      style={{ height: `${headerLogoHeight}px`, width: "auto" }}
                      className={cn(
                        "max-w-28 sm:max-w-36 object-contain pointer-events-none transition-all",
                        headerTextColor === "white" ? "brightness-0 invert" : "",
                      )}
                    />
                  ) : (
                    <span className="font-serif text-xl sm:text-2xl tracking-[.22em] pointer-events-none">
                      {brandNameEn.toUpperCase()}
                    </span>
                  )}
                  {editionLabel?.trim() ? (
                    <>
                      <span
                        className={cn(
                          "h-6 sm:h-7 w-px pointer-events-none",
                          headerTextColor === "dark" ? "bg-foreground/30" : "bg-white/40",
                        )}
                      />
                      <span
                        dir="auto"
                        lang={editionIsAr ? "ar" : "en"}
                        className={cn(
                          "font-semibold truncate pointer-events-none",
                          editionIsAr
                            ? "text-[12px] sm:text-sm"
                            : "text-xs sm:text-xs uppercase tracking-[.22em]",
                        )}
                        style={
                          editionIsAr ? { fontFamily: "Tahoma, Arial, sans-serif" } : undefined
                        }
                      >
                        {editionLabel}
                      </span>
                    </>
                  ) : null}
                </div>

                {headerShowBadge && headerBadgeText?.trim() && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs sm:text-xs font-bold uppercase tracking-[.16em] whitespace-nowrap pointer-events-none shrink-0",
                      headerTextColor === "dark"
                        ? "border border-foreground/30 bg-black/5 text-foreground"
                        : "border border-white/50 bg-white/10 text-white",
                    )}
                  >
                    {headerBadgeText}
                  </span>
                )}
              </div>
              <div
                dir={isAr ? "rtl" : "ltr"}
                lang={isAr ? "ar" : "en"}
                className={cn(
                  "absolute bottom-[7.5%] w-[66%] overflow-hidden rounded-[18px] border border-white/25 px-[4%] py-[2.75%] shadow-xl backdrop-blur-[6px]",
                  isAr ? "right-[6%] text-end" : "left-[6%] text-start",
                )}
                style={{
                  background: palette.panel,
                  direction: isAr ? "rtl" : "ltr",
                  textAlign: isAr ? "right" : "left",
                }}
              >
                <div className="mb-[2.25%] flex items-center gap-2">
                  <span className="h-px w-6 bg-current opacity-45" />
                  <p className="text-xs font-black opacity-65">{productName}</p>
                </div>
                <h2
                  dir="auto"
                  lang={headlineIsAr ? "ar" : "en"}
                  className={cn(
                    "text-xl font-black leading-[1.3] sm:text-[30px]",
                    !headlineIsAr && "font-display tracking-tight",
                  )}
                  style={{
                    unicodeBidi: "plaintext",
                    fontFamily: headlineIsAr ? "Tahoma, Arial, sans-serif" : undefined,
                  }}
                >
                  {headline || " "}
                </h2>
                <p
                  dir="auto"
                  lang={bodyIsAr ? "ar" : "en"}
                  className="mt-[2.5%] max-w-[94%] text-xs font-medium leading-[1.65] opacity-80 sm:text-sm"
                  style={{
                    unicodeBidi: "plaintext",
                    fontFamily: bodyIsAr ? "Tahoma, Arial, sans-serif" : undefined,
                  }}
                >
                  {body || " "}
                </p>
                {showPrice && selected?.base_price ? (
                  <div
                    dir="ltr"
                    className="mt-[2.5%] flex items-center border-t border-current/15 pt-[2%]"
                  >
                    <span dir="ltr" className="font-black text-xs sm:text-sm tracking-tight">
                      {Number(selected.base_price).toFixed(3)} {currencySymbol}
                    </span>
                  </div>
                ) : null}
              </div>
              <div
                dir="ltr"
                className="absolute inset-x-[6%] bottom-[2.2%] flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-white"
              >
                <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                  <Instagram className="size-3" /> {instagram || businessName}
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
                  <Phone className="size-3" /> {phone || `${slug}.boutq.store`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
