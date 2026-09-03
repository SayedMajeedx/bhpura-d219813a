import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Pause,
  Phone,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { REVIEW_HIGHLIGHT_LABELS, type OrderReviewAdminRow } from "@/lib/order-reviews";

type StoryTemplate = "classic" | "editorial" | "midnight";

export type ProductMediaItem = {
  url: string;
  type: "image" | "video";
};

type ReviewStoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review: OrderReviewAdminRow | null;
  brandName: string;
  brandColor?: string | null;
  logoUrl?: string | null;
  isAr: boolean;
  orderDate?: string | null;
  productImages?: string[];
  productMedia?: ProductMediaItem[];
  brandPhone?: string | null;
  brandInstagram?: string | null;
};

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function safeColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#330a0a";
}

function publicFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx, cy, cx + size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + size);
  ctx.quadraticCurveTo(cx, cy, cx - size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - size);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function formatOrderDate(dateStr?: string | null, isAr?: boolean) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(isAr ? "ar-BH" : "en-GB", {
      year: "numeric",
      month: isAr ? "short" : "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function fitLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join(" ").split(/\s+/).length;
  if (consumed < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trim();
    }
    lines[lines.length - 1] = `${last}…`;
  }
  return lines;
}

function drawBrandLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, tint: string | null) {
  const maxWidth = 390;
  const maxHeight = 175;
  const scale = Math.min(maxWidth / logo.naturalWidth, maxHeight / logo.naturalHeight);
  const width = logo.naturalWidth * scale;
  const height = logo.naturalHeight * scale;
  const x = (STORY_WIDTH - width) / 2;
  const y = 90 + (maxHeight - height) / 2;

  if (!tint) {
    ctx.drawImage(logo, x, y, width, height);
    return;
  }

  const tinted = document.createElement("canvas");
  tinted.width = Math.max(1, Math.round(width));
  tinted.height = Math.max(1, Math.round(height));
  const tintedCtx = tinted.getContext("2d");
  if (!tintedCtx) return;
  tintedCtx.drawImage(logo, 0, 0, tinted.width, tinted.height);
  tintedCtx.globalCompositeOperation = "source-in";
  tintedCtx.fillStyle = tint;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);
  ctx.drawImage(tinted, x, y, width, height);
}

interface StoryLayers {
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
}

function prepareStoryLayers({
  template,
  review,
  comment,
  brandName,
  primary,
  isAr,
  showName,
  showHighlights,
  showDate,
  orderDateText,
  showBrandContact,
  brandPhone,
  brandInstagram,
  logoImage,
  hasMedia = false,
}: {
  template: StoryTemplate;
  review: OrderReviewAdminRow;
  comment: string;
  brandName: string;
  primary: string;
  isAr: boolean;
  showName: boolean;
  showHighlights: boolean;
  showDate?: boolean;
  orderDateText?: string | null;
  showBrandContact?: boolean;
  brandPhone?: string | null;
  brandInstagram?: string | null;
  logoImage?: HTMLImageElement | null;
  hasMedia?: boolean;
}): StoryLayers {
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = STORY_WIDTH;
  bgCanvas.height = STORY_HEIGHT;
  const ctx = bgCanvas.getContext("2d")!;
  ctx.textBaseline = "middle";
  ctx.direction = isAr ? "rtl" : "ltr";

  const dark = template === "midnight";

  // 1. Background
  if (template === "classic") {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    bgGrad.addColorStop(0, "#ece3d8");
    bgGrad.addColorStop(0.45, "#dfd4c7");
    bgGrad.addColorStop(1, "#cfc0b0");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

    const ambient = ctx.createRadialGradient(540, 750, 60, 540, 750, 750);
    ambient.addColorStop(0, "rgba(255, 255, 255, 0.28)");
    ambient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  } else if (template === "editorial") {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    bgGrad.addColorStop(0, "#ffffff");
    bgGrad.addColorStop(0.5, "#faf8f5");
    bgGrad.addColorStop(1, "#f0ede8");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
    bgGrad.addColorStop(0, "#1c1010");
    bgGrad.addColorStop(0.6, "#120a0a");
    bgGrad.addColorStop(1, "#0a0505");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

    const ambient = ctx.createRadialGradient(540, 700, 80, 540, 700, 800);
    ambient.addColorStop(0, "rgba(239, 217, 200, 0.08)");
    ambient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  }

  // 2. Brand Header
  ctx.textAlign = "center";
  if (logoImage?.naturalWidth && logoImage.naturalHeight) {
    drawBrandLogo(ctx, logoImage, dark ? null : primary);
  } else {
    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.font = "700 38px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.fillText(brandName, 540, 130);
  }

  // 3. Central Frame Dimensions
  const fw = 660;
  const fh = 1140;
  const fx = (STORY_WIDTH - fw) / 2; // 210
  const fy = 240;
  const fr = 42;

  // Frame Drop Shadow
  ctx.save();
  ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.55)" : "rgba(60, 45, 38, 0.16)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = dark ? "#241616" : "#fdfbf9";
  roundedRect(ctx, fx, fy, fw, fh, fr);
  ctx.fill();
  ctx.restore();

  // Placeholder inside frame if no media is selected
  if (!hasMedia) {
    ctx.save();
    roundedRect(ctx, fx, fy, fw, fh, fr);
    ctx.clip();
    const pGrad = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
    pGrad.addColorStop(0, dark ? "#2c1a1a" : "#e7dfd5");
    pGrad.addColorStop(1, dark ? "#190e0e" : "#d9cebf");
    ctx.fillStyle = pGrad;
    ctx.fillRect(fx, fy, fw, fh);

    ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.4)" : "rgba(80, 60, 50, 0.45)";
    ctx.font = "600 32px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isAr ? "صورة المنتج" : "Product photo", 540, fy + fh / 2 - 20);
    ctx.font = "400 24px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.fillText(
      isAr ? "(يمكن رفع صورة من القائمة)" : "(Upload photo from controls)",
      540,
      fy + fh / 2 + 25,
    );
    ctx.restore();
  }

  // FOREGROUND LAYER
  const fgCanvas = document.createElement("canvas");
  fgCanvas.width = STORY_WIDTH;
  fgCanvas.height = STORY_HEIGHT;
  const fgCtx = fgCanvas.getContext("2d")!;
  fgCtx.textBaseline = "middle";
  fgCtx.direction = isAr ? "rtl" : "ltr";

  // Crisp White Border
  fgCtx.save();
  fgCtx.strokeStyle = dark ? "rgba(255, 255, 255, 0.9)" : "#ffffff";
  fgCtx.lineWidth = 12;
  roundedRect(fgCtx, fx, fy, fw, fh, fr);
  fgCtx.stroke();
  fgCtx.restore();

  // 4. Decorative Sparkles
  const sparkleColor = dark ? "rgba(245, 225, 210, 0.9)" : "rgba(255, 255, 255, 0.95)";
  drawSparkle(fgCtx, 880, 460, 32, sparkleColor);
  drawSparkle(fgCtx, 190, 1310, 26, sparkleColor);
  drawSparkle(fgCtx, 890, 1180, 18, sparkleColor);

  // 5. Floating Frosted Review Card
  const cw = 780;
  const cx = (STORY_WIDTH - cw) / 2;
  const maxCommentWidth = 684;

  fgCtx.font = "500 30px 'Tajawal', 'Cairo', Arial, sans-serif";
  const commentText =
    comment.trim() ||
    (isAr ? "تجربة تستحق المشاركة ورائعة جداً" : "An experience worth sharing");
  const commentLines = fitLines(fgCtx, commentText, maxCommentWidth, 6);
  const commentLineHeight = 46;
  const textBlockHeight = commentLines.length * commentLineHeight;

  const validHighlights = (review.highlights || []).slice(0, 2);
  const hasHighlights = showHighlights && validHighlights.length > 0;
  const extraHighlightsHeight = hasHighlights ? 52 : 0;

  const ch = Math.max(
    320,
    Math.min(560, 160 + textBlockHeight + extraHighlightsHeight),
  );
  const cy = Math.round(850 - ch / 2);

  // Frosted Card Shadow
  fgCtx.save();
  fgCtx.shadowColor = dark ? "rgba(0, 0, 0, 0.45)" : "rgba(50, 35, 25, 0.16)";
  fgCtx.shadowBlur = 38;
  fgCtx.shadowOffsetY = 14;
  fgCtx.fillStyle = dark ? "rgba(28, 16, 16, 0.88)" : "rgba(255, 255, 255, 0.88)";
  roundedRect(fgCtx, cx, cy, cw, ch, 36);
  fgCtx.fill();
  fgCtx.restore();

  // Frosted Card Border Outline
  fgCtx.save();
  fgCtx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.85)";
  fgCtx.lineWidth = 1.5;
  roundedRect(fgCtx, cx, cy, cw, ch, 36);
  fgCtx.stroke();
  fgCtx.restore();

  // Card Content
  const padX = 48;
  const customerName =
    showName && publicFirstName(review.customer_name)
      ? publicFirstName(review.customer_name)
      : isAr
        ? "عميلة موثّقة"
        : "Verified customer";

  const headerY = cy + 48;
  if (isAr) {
    fgCtx.textAlign = "right";
    fgCtx.fillStyle = dark ? "#fffaf5" : "#231815";
    fgCtx.font = "700 36px 'Tajawal', 'Cairo', Arial, sans-serif";
    fgCtx.fillText(customerName, cx + cw - padX, headerY);

    if (showDate && orderDateText) {
      fgCtx.textAlign = "left";
      fgCtx.fillStyle = dark ? "rgba(255, 250, 245, 0.65)" : "#7a6b65";
      fgCtx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
      fgCtx.fillText(orderDateText, cx + padX, headerY);
    }
  } else {
    fgCtx.textAlign = "left";
    fgCtx.fillStyle = dark ? "#fffaf5" : "#231815";
    fgCtx.font = "700 36px 'Tajawal', 'Cairo', Arial, sans-serif";
    fgCtx.fillText(customerName, cx + padX, headerY);

    if (showDate && orderDateText) {
      fgCtx.textAlign = "right";
      fgCtx.fillStyle = dark ? "rgba(255, 250, 245, 0.65)" : "#7a6b65";
      fgCtx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
      fgCtx.fillText(orderDateText, cx + cw - padX, headerY);
    }
  }

  const starsY = cy + 98;
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  fgCtx.fillStyle = dark ? "#efd9c8" : "#32231f";
  fgCtx.font = "700 34px Arial, sans-serif";
  fgCtx.direction = "ltr";
  if (isAr) {
    fgCtx.textAlign = "right";
    fgCtx.fillText("★".repeat(rating), cx + cw - padX, starsY);
  } else {
    fgCtx.textAlign = "left";
    fgCtx.fillText("★".repeat(rating), cx + padX, starsY);
  }
  fgCtx.direction = isAr ? "rtl" : "ltr";

  let commentY = cy + 155;
  fgCtx.font = "500 30px 'Tajawal', 'Cairo', Arial, sans-serif";
  fgCtx.fillStyle = dark ? "#f4ede6" : "#2b211e";
  fgCtx.textAlign = isAr ? "right" : "left";
  const commentStartX = isAr ? cx + cw - padX : cx + padX;

  commentLines.forEach((line) => {
    fgCtx.fillText(line, commentStartX, commentY);
    commentY += commentLineHeight;
  });

  if (hasHighlights) {
    const labels = validHighlights.map(
      (h) => REVIEW_HIGHLIGHT_LABELS[h]?.[isAr ? "ar" : "en"] ?? h,
    );
    fgCtx.font = "600 22px 'Tajawal', 'Cairo', Arial, sans-serif";
    const tagY = cy + ch - 40;
    let currX = isAr ? cx + cw - padX : cx + padX;

    labels.forEach((label) => {
      const textWidth = fgCtx.measureText(label).width;
      const tagW = textWidth + 32;
      const tagH = 38;
      const tagBoxX = isAr ? currX - tagW : currX;

      fgCtx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.05)";
      roundedRect(fgCtx, tagBoxX, tagY - tagH / 2, tagW, tagH, 19);
      fgCtx.fill();

      fgCtx.fillStyle = dark ? "#f0e6dd" : "#4a3c37";
      fgCtx.textAlign = "center";
      fgCtx.fillText(label, tagBoxX + tagW / 2, tagY);

      if (isAr) {
        currX -= tagW + 12;
      } else {
        currX += tagW + 12;
      }
    });
  }

  fgCtx.textAlign = "center";
  fgCtx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
  fgCtx.fillStyle = dark ? "rgba(255, 250, 245, 0.72)" : "#756660";
  fgCtx.fillText(
    isAr ? "آراء حقيقية، وتجارب نعتز بها" : "Real words. Genuine experiences.",
    540,
    1565,
  );

  if (showBrandContact && (brandInstagram?.trim() || brandPhone?.trim())) {
    const contactParts: string[] = [];
    if (brandInstagram?.trim()) contactParts.push(`Instagram: ${brandInstagram.trim()}`);
    if (brandPhone?.trim()) contactParts.push(`Tel: ${brandPhone.trim()}`);
    const contactText = contactParts.join("   •   ");

    fgCtx.font = "700 26px 'Tajawal', 'Cairo', Arial, sans-serif";
    const contactTextWidth = fgCtx.measureText(contactText).width;
    const pillW = Math.min(STORY_WIDTH - 120, contactTextWidth + 64);
    const pillH = 58;
    const pillX = 540 - pillW / 2;
    const pillY = 1625;

    fgCtx.save();
    fgCtx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.75)";
    roundedRect(fgCtx, pillX, pillY, pillW, pillH, 29);
    fgCtx.fill();

    fgCtx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.9)";
    fgCtx.lineWidth = 1.5;
    roundedRect(fgCtx, pillX, pillY, pillW, pillH, 29);
    fgCtx.stroke();
    fgCtx.restore();

    fgCtx.fillStyle = dark ? "#fffaf5" : primary;
    fgCtx.textAlign = "center";
    fgCtx.fillText(contactText, 540, pillY + pillH / 2);
  }

  fgCtx.fillStyle = dark ? "rgba(255, 255, 255, 0.1)" : `${primary}12`;
  roundedRect(fgCtx, 414, 1740, 252, 54, 27);
  fgCtx.fill();

  fgCtx.fillStyle = dark ? "#fffaf5" : primary;
  fgCtx.font = "600 22px 'Tajawal', 'Cairo', Arial, sans-serif";
  fgCtx.textAlign = "center";
  fgCtx.fillText(isAr ? "✓  رأي عميلة موثّق" : "✓  VERIFIED REVIEW", 540, 1768);

  return { bgCanvas, fgCanvas };
}

function drawStoryFast({
  canvas,
  bgCanvas,
  fgCanvas,
  productImage,
}: {
  canvas: HTMLCanvasElement;
  bgCanvas: HTMLCanvasElement;
  fgCanvas: HTMLCanvasElement;
  productImage?: HTMLImageElement | HTMLVideoElement | null;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (canvas.width !== STORY_WIDTH) canvas.width = STORY_WIDTH;
  if (canvas.height !== STORY_HEIGHT) canvas.height = STORY_HEIGHT;

  ctx.drawImage(bgCanvas, 0, 0);

  if (productImage) {
    const isVideo =
      typeof HTMLVideoElement !== "undefined" && productImage instanceof HTMLVideoElement;
    const pw = isVideo
      ? (productImage as HTMLVideoElement).videoWidth
      : (productImage as HTMLImageElement)?.naturalWidth || 0;
    const ph = isVideo
      ? (productImage as HTMLVideoElement).videoHeight
      : (productImage as HTMLImageElement)?.naturalHeight || 0;

    if (pw > 0 && ph > 0) {
      const fw = 660;
      const fh = 1140;
      const fx = (STORY_WIDTH - fw) / 2;
      const fy = 240;
      const fr = 42;

      ctx.save();
      roundedRect(ctx, fx, fy, fw, fh, fr);
      ctx.clip();
      const scale = Math.max(fw / pw, fh / ph);
      const iw = pw * scale;
      const ih = ph * scale;
      const ix = fx + (fw - iw) / 2;
      const iy = fy + (fh - ih) / 2;
      ctx.drawImage(productImage, ix, iy, iw, ih);
      ctx.restore();
    }
  }

  ctx.drawImage(fgCanvas, 0, 0);
}

function drawStory({
  canvas,
  template,
  review,
  comment,
  brandName,
  primary,
  isAr,
  showName,
  showHighlights,
  showDate,
  orderDateText,
  productImage,
  showBrandContact,
  brandPhone,
  brandInstagram,
  logoImage,
}: {
  canvas: HTMLCanvasElement;
  template: StoryTemplate;
  review: OrderReviewAdminRow;
  comment: string;
  brandName: string;
  primary: string;
  isAr: boolean;
  showName: boolean;
  showHighlights: boolean;
  showDate?: boolean;
  orderDateText?: string | null;
  productImage?: HTMLImageElement | HTMLVideoElement | null;
  showBrandContact?: boolean;
  brandPhone?: string | null;
  brandInstagram?: string | null;
  logoImage?: HTMLImageElement | null;
}) {
  const { bgCanvas, fgCanvas } = prepareStoryLayers({
    template,
    review,
    comment,
    brandName,
    primary,
    isAr,
    showName,
    showHighlights,
    showDate,
    orderDateText,
    showBrandContact,
    brandPhone,
    brandInstagram,
    logoImage,
    hasMedia: Boolean(productImage),
  });

  drawStoryFast({
    canvas,
    bgCanvas,
    fgCanvas,
    productImage,
  });
}

export function ReviewStoryDialog({
  open,
  onOpenChange,
  review,
  brandName,
  brandColor,
  logoUrl,
  isAr,
  orderDate,
  productImages = [],
  productMedia = [],
  brandPhone: initialBrandPhone,
  brandInstagram: initialBrandInstagram,
}: ReviewStoryDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [template, setTemplate] = useState<StoryTemplate>("classic");
  const [comment, setComment] = useState("");
  const [showName, setShowName] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [orderDateInput, setOrderDateInput] = useState("");
  const [showBrandContact, setShowBrandContact] = useState(true);
  const [customBrandPhone, setCustomBrandPhone] = useState("");
  const [customBrandInstagram, setCustomBrandInstagram] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<ProductMediaItem | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoEnded, setIsVideoEnded] = useState(false);

  const [productImgElement, setProductImgElement] = useState<HTMLImageElement | null>(null);
  const [logoImgElement, setLogoImgElement] = useState<HTMLImageElement | null>(null);

  const primary = safeColor(brandColor);

  const availableMedia: ProductMediaItem[] = useMemo(() => {
    if (productMedia && productMedia.length > 0) return productMedia;
    return (productImages || []).map((url) => ({ url, type: "image" as const }));
  }, [productMedia, productImages]);

  // Sync initial state when review opens
  useEffect(() => {
    if (!review || !open) return;
    setComment(review.comment ?? "");
    setTemplate("classic");
    setShowName(true);
    setShowHighlights(true);
    setShowDate(true);
    setShowBrandContact(true);
    setCustomBrandPhone(initialBrandPhone ?? "");
    setCustomBrandInstagram(initialBrandInstagram ?? "");

    const formattedDate = formatOrderDate(orderDate || review.reviewed_at, isAr);
    setOrderDateInput(formattedDate);

    // Auto-select first media item (image or video) if available
    if (availableMedia.length > 0) {
      setSelectedMedia(availableMedia[0]);
    } else {
      setSelectedMedia(null);
    }
  }, [review, open, initialBrandPhone, initialBrandInstagram, orderDate, availableMedia, isAr]);

  // Load logo image
  useEffect(() => {
    if (!logoUrl) {
      setLogoImgElement(null);
      return;
    }
    let cancelled = false;
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => {
      if (!cancelled) setLogoImgElement(logo);
    };
    logo.onerror = () => {
      if (!cancelled) setLogoImgElement(null);
    };
    logo.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);

  // Handle image loading if media is image
  useEffect(() => {
    if (!selectedMedia || selectedMedia.type !== "image") {
      setProductImgElement(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    if (!selectedMedia.url.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      if (!cancelled) setProductImgElement(img);
    };
    img.onerror = () => {
      if (!cancelled) setProductImgElement(null);
    };
    img.src = selectedMedia.url;
    return () => {
      cancelled = true;
    };
  }, [selectedMedia]);

  // Handle video element if media is video (no loop - play once and stop at the last frame)
  useEffect(() => {
    if (selectedMedia?.type !== "video" || !selectedMedia.url) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
      }
      setIsVideoPlaying(false);
      setIsVideoEnded(false);
      return;
    }

    const v = document.createElement("video");
    v.loop = false; // Never loop: play once and stop at last frame
    v.muted = true;
    v.playsInline = true;
    (v as any).webkitPlaysInline = true;
    v.crossOrigin = "anonymous";
    v.autoplay = true;
    v.src = selectedMedia.url;
    videoRef.current = v;
    setIsVideoPlaying(true);
    setIsVideoEnded(false);
    v.play().catch(() => {});

    return () => {
      v.pause();
      v.src = "";
      if (videoRef.current === v) {
        videoRef.current = null;
      }
    };
  }, [selectedMedia]);

  // Pre-render static layers (background + foreground) offscreen
  // This enables silky-smooth 60fps video playback without recalculating text, shadows, or gradients
  const cachedLayers = useMemo(() => {
    if (!review || typeof document === "undefined") return null;
    return prepareStoryLayers({
      template,
      review,
      comment,
      brandName,
      primary,
      isAr,
      showName,
      showHighlights,
      showDate,
      orderDateText: orderDateInput,
      showBrandContact,
      brandPhone: customBrandPhone,
      brandInstagram: customBrandInstagram,
      logoImage: logoImgElement,
      hasMedia: Boolean(selectedMedia),
    });
  }, [
    review,
    template,
    comment,
    brandName,
    primary,
    isAr,
    showName,
    showHighlights,
    showDate,
    orderDateInput,
    showBrandContact,
    customBrandPhone,
    customBrandInstagram,
    logoImgElement,
    selectedMedia,
  ]);

  // Render canvas (instant for images, hardware-synced requestVideoFrameCallback for video)
  useEffect(() => {
    if (!canvasRef.current || !open || !cachedLayers) return;

    if (selectedMedia?.type !== "video" || !videoRef.current) {
      drawStoryFast({
        canvas: canvasRef.current,
        bgCanvas: cachedLayers.bgCanvas,
        fgCanvas: cachedLayers.fgCanvas,
        productImage: productImgElement,
      });
      return;
    }

    const v = videoRef.current;
    let frameCallbackId: number | null = null;
    let animId: number | null = null;
    let isCancelled = false;

    const renderFrame = () => {
      if (isCancelled) return;
      if (canvasRef.current && cachedLayers) {
        drawStoryFast({
          canvas: canvasRef.current,
          bgCanvas: cachedLayers.bgCanvas,
          fgCanvas: cachedLayers.fgCanvas,
          productImage: v,
        });
      }

      if (!v.paused && !v.ended) {
        if ("requestVideoFrameCallback" in v) {
          frameCallbackId = (v as any).requestVideoFrameCallback(renderFrame);
        } else {
          animId = requestAnimationFrame(renderFrame);
        }
      }
    };

    // Draw initial frame
    renderFrame();

    const onPlay = () => {
      setIsVideoPlaying(true);
      setIsVideoEnded(false);
      if ("requestVideoFrameCallback" in v) {
        frameCallbackId = (v as any).requestVideoFrameCallback(renderFrame);
      } else {
        animId = requestAnimationFrame(renderFrame);
      }
    };

    const onPause = () => {
      setIsVideoPlaying(false);
    };

    const onEnded = () => {
      setIsVideoPlaying(false);
      setIsVideoEnded(true);
      // Ensure the canvas firmly displays the last video frame
      if (canvasRef.current && cachedLayers) {
        drawStoryFast({
          canvas: canvasRef.current,
          bgCanvas: cachedLayers.bgCanvas,
          fgCanvas: cachedLayers.fgCanvas,
          productImage: v,
        });
      }
    };

    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);

    return () => {
      isCancelled = true;
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
      if (frameCallbackId !== null && "cancelVideoFrameCallback" in v) {
        (v as any).cancelVideoFrameCallback(frameCallbackId);
      }
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, [open, cachedLayers, selectedMedia, productImgElement]);

  const toggleVideoPlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.ended || isVideoEnded) {
      videoRef.current.currentTime = 0;
      videoRef.current
        .play()
        .then(() => {
          setIsVideoPlaying(true);
          setIsVideoEnded(false);
        })
        .catch(() => {});
    } else if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsVideoPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  const templates = useMemo(
    () => [
      {
        id: "classic" as const,
        label: isAr ? "كلاسيكي رملي" : "Classic Sand",
        colors: ["#ece3d8", primary],
      },
      {
        id: "editorial" as const,
        label: isAr ? "تحريري مينيمال" : "Editorial Clean",
        colors: ["#ffffff", primary],
      },
      {
        id: "midnight" as const,
        label: isAr ? "داكن فاخر" : "Midnight Dark",
        colors: [primary, "#efd9c8"],
      },
    ],
    [isAr, primary],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      setSelectedMedia({ url, type: "video" });
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

  // Download video (MP4 or WebM)
  const downloadVideo = async () => {
    if (!canvasRef.current || !videoRef.current || !review) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    setIsExportingVideo(true);
    setExportProgress(0);

    try {
      video.currentTime = 0;
      try {
        await video.play();
      } catch {}
      setIsVideoPlaying(true);
      setIsVideoEnded(false);

      const duration = Math.min(Math.max(video.duration || 6, 4), 15);
      const totalDuration = duration + 1; // 1s pause on the last frame
      const fps = 30;
      const stream = (canvas as any).captureStream ? (canvas as any).captureStream(fps) : null;
      if (!stream) {
        throw new Error("captureStream not supported in this browser");
      }

      let mimeType = "video/webm";
      let ext = "webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("video/mp4;codecs=avc1")) {
          mimeType = "video/mp4;codecs=avc1";
          ext = "mp4";
        } else if (MediaRecorder.isTypeSupported("video/mp4")) {
          mimeType = "video/mp4";
          ext = "mp4";
        } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
          mimeType = "video/webm;codecs=vp9";
          ext = "webm";
        }
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
        videoBitsPerSecond: 6_000_000,
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        recorder.onerror = reject;
      });

      recorder.start(100);

      let stopped = false;
      const finishRecording = () => {
        if (stopped) return;
        stopped = true;
        window.setTimeout(() => {
          if (recorder.state === "recording") recorder.stop();
        }, 1000); // 1-second hold on the last frame
      };

      video.addEventListener("ended", finishRecording, { once: true });

      const startTime = performance.now();
      const interval = window.setInterval(() => {
        const elapsed = (performance.now() - startTime) / 1000;
        const prog = Math.min(Math.round((elapsed / totalDuration) * 100), 99);
        setExportProgress(prog);
        if (elapsed >= totalDuration + 0.5) {
          window.clearInterval(interval);
          finishRecording();
        }
      }, 100);

      const blob = await recordingPromise;
      window.clearInterval(interval);
      video.removeEventListener("ended", finishRecording);
      setExportProgress(100);

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customer-review-story-${review.review_id}.${ext}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(
        isAr
          ? `تم تنزيل فيديو الستوري (${ext.toUpperCase()}) بنجاح`
          : `Story video (${ext.toUpperCase()}) downloaded successfully`,
      );
    } catch (err) {
      console.error("Video export error:", err);
      toast.error(
        isAr
          ? "تعذر تصدير الفيديو، يمكنك تنزيل صورة ثابتة بدلاً من ذلك"
          : "Could not export video, try PNG download instead",
      );
    } finally {
      setIsExportingVideo(false);
      setExportProgress(0);
    }
  };

  // Download static PNG
  const download = async () => {
    if (!canvasRef.current || !review) return;
    setDownloading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current?.toBlob(resolve, "image/png", 1),
      );
      if (!blob) throw new Error("Unable to create image");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customer-review-story-${review.review_id}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success(isAr ? "تم تنزيل الستوري بجودة عالية" : "Story downloaded in high quality");
    } catch {
      toast.error(isAr ? "تعذر إنشاء الصورة، حاول مرة أخرى" : "Could not create the image");
    } finally {
      setDownloading(false);
    }
  };

  if (!review) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="grid h-[calc(100dvh-1rem)] max-h-[860px] min-h-0 max-w-5xl gap-0 overflow-y-auto rounded-2xl p-0 sm:h-[calc(100dvh-2rem)] lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden"
      >
        <section className="order-2 min-h-0 min-w-0 p-5 sm:p-7 lg:order-1 lg:overflow-y-auto lg:overscroll-contain">
          <DialogHeader className="px-0 pe-10">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-primary" />
              {isAr ? "إنشاء ستوري تقييم فاخر" : "Create Review Story"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {isAr
                ? "قالب جمالي مستوحى من تقييمات العملاء الحقيقية مع إطار المنتج (صورة أو فيديو) وبطاقة التقييم الزجاجية."
                : "Aesthetic customer review story with framed product media (photo or video) and frosted card overlay."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Template Selection */}
            <div className="space-y-2.5">
              <Label>{isAr ? "القالب والألوان" : "Style & Palette"}</Label>
              <div className="grid grid-cols-3 gap-2">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTemplate(item.id)}
                    className={cn(
                      "relative flex min-h-20 flex-col items-start justify-between rounded-xl border p-3 text-start transition-all",
                      template === item.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/10"
                        : "border-border hover:border-primary/30",
                    )}
                  >
                    <span className="flex gap-1.5">
                      {item.colors.map((color) => (
                        <span
                          key={color}
                          className="size-4 rounded-full border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="text-xs font-semibold">{item.label}</span>
                    {template === item.id && (
                      <span className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Media Selector / Uploader (Images & Videos) */}
            <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  {selectedMedia?.type === "video" ? (
                    <Film className="size-4 text-primary" />
                  ) : (
                    <ImageIcon className="size-4 text-primary" />
                  )}
                  {isAr ? "وسائط المنتج (صورة أو فيديو داخل الإطار)" : "Product media (photo or video)"}
                </Label>
                {selectedMedia && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setSelectedMedia(null)}
                  >
                    <Trash2 className="size-3.5" />
                    {isAr ? "إزالة الوسائط" : "Remove"}
                  </Button>
                )}
              </div>

              {/* Order Product Media thumbnails if any */}
              {availableMedia.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "الوسائط المتوفرة في الطلب (اضغط للاختيار):"
                      : "Media detected from the order (click to select):"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {availableMedia.map((m, idx) => (
                      <button
                        key={m.url + idx}
                        type="button"
                        onClick={() => setSelectedMedia(m)}
                        className={cn(
                          "relative size-14 overflow-hidden rounded-lg border-2 transition-all",
                          selectedMedia?.url === m.url
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        {m.type === "video" ? (
                          <div className="flex size-full items-center justify-center bg-zinc-900 text-white">
                            <Video className="size-5" />
                          </div>
                        ) : (
                          <img
                            src={m.url}
                            alt="product"
                            className="size-full object-cover"
                            crossOrigin="anonymous"
                          />
                        )}
                        {m.type === "video" && (
                          <span className="absolute bottom-1 end-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
                            فيديو
                          </span>
                        )}
                        {selectedMedia?.url === m.url && (
                          <span className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                            <Check className="size-4 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload custom image or video */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11 w-full gap-2 border-dashed"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  {selectedMedia
                    ? isAr
                      ? "رفع صورة أو فيديو بديل من جهازك"
                      : "Upload a different photo or video"
                    : isAr
                      ? "رفع صورة أو مقطع فيديو من جهازك"
                      : "Upload photo or video"}
                </Button>
              </div>
            </div>

            {/* Story Review Copy */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="story-review-copy">{isAr ? "نص تقييم العميل" : "Review text"}</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {comment.length}/280
                </span>
              </div>
              <Textarea
                id="story-review-copy"
                value={comment}
                maxLength={280}
                rows={4}
                onChange={(event) => setComment(event.target.value)}
                className="resize-none leading-7"
              />
            </div>

            {/* Order Date inside Review Box */}
            <div className="space-y-2 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold">
                      {isAr ? "إظهار تاريخ الطلب داخل بوكس التقييم" : "Show order date in review box"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? "يظهر داخل البطاقة الزجاجية مع التقييم" : "Appears inside the frosted review card"}
                    </p>
                  </div>
                </div>
                <Switch checked={showDate} onCheckedChange={setShowDate} />
              </div>
              {showDate && (
                <div className="pt-2">
                  <Input
                    value={orderDateInput}
                    onChange={(e) => setOrderDateInput(e.target.value)}
                    placeholder={isAr ? "مثال: 26 أغسطس 2026" : "e.g. 26 Aug 2026"}
                    className="min-h-10 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Brand Contact Details (Instagram & Phone) */}
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار بيانات المتجر (هاتف وإنستجرام)" : "Show brand contacts in story"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "يظهر في شريط أنيق أسفل الستوري لتعزيز المبيعات"
                      : "Appears in a chic footer badge to drive sales"}
                  </p>
                </div>
                <Switch checked={showBrandContact} onCheckedChange={setShowBrandContact} />
              </div>

              {showBrandContact && (
                <div className="grid grid-cols-1 gap-2.5 pt-1 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Instagram className="size-3.5" />
                      {isAr ? "حساب الإنستجرام" : "Instagram"}
                    </Label>
                    <Input
                      value={customBrandInstagram}
                      onChange={(e) => setCustomBrandInstagram(e.target.value)}
                      placeholder="@yourbrand"
                      className="min-h-10 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="size-3.5" />
                      {isAr ? "رقم الهاتف / الواتساب" : "Phone / WhatsApp"}
                    </Label>
                    <Input
                      value={customBrandPhone}
                      onChange={(e) => setCustomBrandPhone(e.target.value)}
                      placeholder="+973 33123456"
                      className="min-h-10 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Display Switches */}
            <div className="divide-y rounded-xl border border-border">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار اسم العميل الأول" : "Show first name"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {showName
                      ? publicFirstName(review.customer_name)
                      : isAr
                        ? "عميلة موثّقة"
                        : "Verified customer"}
                  </p>
                </div>
                <Switch checked={showName} onCheckedChange={setShowName} />
              </div>
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار شارات التميز" : "Show highlights"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAr
                      ? "جودة المنتج، التغليف، سرعة التوصيل"
                      : "Quality, packaging, delivery speed"}
                  </p>
                </div>
                <Switch checked={showHighlights} onCheckedChange={setShowHighlights} />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {isAr
                ? "آمن للنشر: لا يتضمن رقم الطلب، بيانات الدفع الخاصة أو كود الخصم."
                : "Safe to publish: private order number, payment and reward code excluded."}
            </div>

            {/* Action Buttons: Video Download vs Static Image */}
            <div className="space-y-2">
              {selectedMedia?.type === "video" ? (
                <>
                  <Button
                    className="min-h-12 w-full gap-2 font-semibold"
                    onClick={downloadVideo}
                    disabled={isExportingVideo || downloading}
                  >
                    {isExportingVideo ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {isAr
                          ? `جاري تسجيل وتصدير الفيديو... (${exportProgress}%)`
                          : `Exporting video story... (${exportProgress}%)`}
                      </>
                    ) : (
                      <>
                        <Film className="size-4" />
                        {isAr ? "تنزيل فيديو الستوري (MP4)" : "Download story video (MP4)"}
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="min-h-11 w-full gap-2 text-xs"
                    onClick={download}
                    disabled={downloading || isExportingVideo}
                  >
                    {downloading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    {isAr ? "أو تنزيل كصورة ثابتة (PNG)" : "Or download static story (PNG)"}
                  </Button>
                </>
              ) : (
                <Button
                  className="min-h-12 w-full gap-2 font-semibold"
                  onClick={download}
                  disabled={downloading}
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {isAr ? "تنزيل PNG للستوري (1080 × 1920)" : "Download story PNG (1080 × 1920)"}
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Live Canvas Preview */}
        <aside className="order-1 flex min-h-0 flex-col items-center justify-center border-b bg-muted/35 p-5 lg:order-2 lg:border-b-0 lg:border-s">
          <div className="w-full max-w-[170px] sm:max-w-[230px] lg:max-w-[290px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {selectedMedia?.type === "video" ? (
                  <Film className="size-3.5 text-primary" />
                ) : (
                  <ImageIcon className="size-3.5" />
                )}
                {selectedMedia?.type === "video"
                  ? isAr
                    ? "معاينة فيديو حي"
                    : "Live Video Preview"
                  : isAr
                    ? "معاينة حية"
                    : "Live Preview"}
              </span>
              <span dir="ltr">1080 × 1920</span>
            </div>

            <div className="group relative">
              <canvas
                ref={canvasRef}
                aria-label={isAr ? "معاينة ستوري تقييم العميل" : "Customer review story preview"}
                className="aspect-[9/16] w-full rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
              />

              {/* Video Play/Pause floating toggle */}
              {selectedMedia?.type === "video" && (
                <button
                  type="button"
                  onClick={toggleVideoPlayback}
                  className="absolute bottom-3 end-3 flex size-8 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-sm transition-all hover:bg-black/85"
                  title={
                    isVideoEnded
                      ? isAr
                        ? "إعادة التشغيل"
                        : "Replay"
                      : isVideoPlaying
                        ? isAr
                          ? "إيقاف مؤقت"
                          : "Pause"
                        : isAr
                          ? "تشغيل"
                          : "Play"
                  }
                >
                  {isVideoEnded ? (
                    <RotateCcw className="size-4" />
                  ) : isVideoPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4 ms-0.5" />
                  )}
                </button>
              )}
            </div>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
