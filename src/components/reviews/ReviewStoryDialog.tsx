import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  Download,
  Image as ImageIcon,
  Instagram,
  Loader2,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
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
  productImage?: HTMLImageElement | null;
  showBrandContact?: boolean;
  brandPhone?: string | null;
  brandInstagram?: string | null;
  logoImage?: HTMLImageElement | null;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
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

    // Warm aesthetic ambient glow
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
    // midnight
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

  // 2. Brand Header (Top)
  ctx.textAlign = "center";
  if (logoImage?.naturalWidth && logoImage.naturalHeight) {
    drawBrandLogo(ctx, logoImage, dark ? null : primary);
  } else {
    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.font = "700 38px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.fillText(brandName, 540, 130);
  }

  // 3. Central Framed Product Image
  const fw = 660;
  const fh = 1140;
  const fx = (STORY_WIDTH - fw) / 2; // 210
  const fy = 240;
  const fr = 42;

  // Drop shadow behind frame
  ctx.save();
  ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.55)" : "rgba(60, 45, 38, 0.16)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = dark ? "#241616" : "#fdfbf9";
  roundedRect(ctx, fx, fy, fw, fh, fr);
  ctx.fill();
  ctx.restore();

  // Draw product photo or placeholder inside clipped rounded rectangle
  ctx.save();
  roundedRect(ctx, fx, fy, fw, fh, fr);
  ctx.clip();
  if (productImage?.naturalWidth && productImage.naturalHeight) {
    const scale = Math.max(fw / productImage.naturalWidth, fh / productImage.naturalHeight);
    const iw = productImage.naturalWidth * scale;
    const ih = productImage.naturalHeight * scale;
    const ix = fx + (fw - iw) / 2;
    const iy = fy + (fh - ih) / 2;
    ctx.drawImage(productImage, ix, iy, iw, ih);
  } else {
    // Elegant warm placeholder
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
  }
  ctx.restore();

  // Crisp White Border (as in Image 2!)
  ctx.save();
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.9)" : "#ffffff";
  ctx.lineWidth = 12;
  roundedRect(ctx, fx, fy, fw, fh, fr);
  ctx.stroke();
  ctx.restore();

  // 4. Decorative Sparkles (✦) around the frame
  const sparkleColor = dark ? "rgba(245, 225, 210, 0.9)" : "rgba(255, 255, 255, 0.95)";
  drawSparkle(ctx, 880, 460, 32, sparkleColor); // Top-right of frame
  drawSparkle(ctx, 190, 1310, 26, sparkleColor); // Bottom-left of frame
  drawSparkle(ctx, 890, 1180, 18, sparkleColor); // Subtle accent

  // 5. Floating Frosted Review Card (Overlaid across the framed picture)
  // Card width is 780px, overlapping the 660px frame by 60px on both sides!
  const cw = 780;
  const cx = (STORY_WIDTH - cw) / 2; // 150
  const maxCommentWidth = 684;

  ctx.font = "500 30px 'Tajawal', 'Cairo', Arial, sans-serif";
  const commentText =
    comment.trim() ||
    (isAr ? "تجربة تستحق المشاركة ورائعة جداً" : "An experience worth sharing");
  const commentLines = fitLines(ctx, commentText, maxCommentWidth, 6);
  const commentLineHeight = 46;
  const textBlockHeight = commentLines.length * commentLineHeight;

  const validHighlights = (review.highlights || []).slice(0, 2);
  const hasHighlights = showHighlights && validHighlights.length > 0;
  const extraHighlightsHeight = hasHighlights ? 52 : 0;

  // Calculate card height to wrap nicely
  const ch = Math.max(
    320,
    Math.min(560, 160 + textBlockHeight + extraHighlightsHeight),
  );
  // Vertically centered across the product image
  const cy = Math.round(850 - ch / 2);

  // Frosted Card Shadow
  ctx.save();
  ctx.shadowColor = dark ? "rgba(0, 0, 0, 0.45)" : "rgba(50, 35, 25, 0.16)";
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = dark ? "rgba(28, 16, 16, 0.88)" : "rgba(255, 255, 255, 0.88)";
  roundedRect(ctx, cx, cy, cw, ch, 36);
  ctx.fill();
  ctx.restore();

  // Frosted Card Border Outline
  ctx.save();
  ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, cx, cy, cw, ch, 36);
  ctx.stroke();
  ctx.restore();

  // Card Content
  const padX = 48;
  const customerName =
    showName && publicFirstName(review.customer_name)
      ? publicFirstName(review.customer_name)
      : isAr
        ? "عميلة موثّقة"
        : "Verified customer";

  // Header inside card: Name & Order Date
  const headerY = cy + 48;
  if (isAr) {
    ctx.textAlign = "right";
    ctx.fillStyle = dark ? "#fffaf5" : "#231815";
    ctx.font = "700 36px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.fillText(customerName, cx + cw - padX, headerY);

    if (showDate && orderDateText) {
      ctx.textAlign = "left";
      ctx.fillStyle = dark ? "rgba(255, 250, 245, 0.65)" : "#7a6b65";
      ctx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
      ctx.fillText(orderDateText, cx + padX, headerY);
    }
  } else {
    ctx.textAlign = "left";
    ctx.fillStyle = dark ? "#fffaf5" : "#231815";
    ctx.font = "700 36px 'Tajawal', 'Cairo', Arial, sans-serif";
    ctx.fillText(customerName, cx + padX, headerY);

    if (showDate && orderDateText) {
      ctx.textAlign = "right";
      ctx.fillStyle = dark ? "rgba(255, 250, 245, 0.65)" : "#7a6b65";
      ctx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
      ctx.fillText(orderDateText, cx + cw - padX, headerY);
    }
  }

  // Rating Stars below customer name
  const starsY = cy + 98;
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  ctx.fillStyle = dark ? "#efd9c8" : "#32231f"; // Elegant dark charcoal/bronze matching reference
  ctx.font = "700 34px Arial, sans-serif";
  ctx.direction = "ltr";
  if (isAr) {
    ctx.textAlign = "right";
    ctx.fillText("★".repeat(rating), cx + cw - padX, starsY);
  } else {
    ctx.textAlign = "left";
    ctx.fillText("★".repeat(rating), cx + padX, starsY);
  }
  ctx.direction = isAr ? "rtl" : "ltr";

  // Review comment text
  let commentY = cy + 155;
  ctx.font = "500 30px 'Tajawal', 'Cairo', Arial, sans-serif";
  ctx.fillStyle = dark ? "#f4ede6" : "#2b211e";
  ctx.textAlign = isAr ? "right" : "left";
  const commentStartX = isAr ? cx + cw - padX : cx + padX;

  commentLines.forEach((line) => {
    ctx.fillText(line, commentStartX, commentY);
    commentY += commentLineHeight;
  });

  // Optional Highlights Tags inside the card
  if (hasHighlights) {
    const labels = validHighlights.map(
      (h) => REVIEW_HIGHLIGHT_LABELS[h]?.[isAr ? "ar" : "en"] ?? h,
    );
    ctx.font = "600 22px 'Tajawal', 'Cairo', Arial, sans-serif";
    const tagY = cy + ch - 40;
    let currX = isAr ? cx + cw - padX : cx + padX;

    labels.forEach((label) => {
      const textWidth = ctx.measureText(label).width;
      const tagW = textWidth + 32;
      const tagH = 38;
      const tagBoxX = isAr ? currX - tagW : currX;

      ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.05)";
      roundedRect(ctx, tagBoxX, tagY - tagH / 2, tagW, tagH, 19);
      ctx.fill();

      ctx.fillStyle = dark ? "#f0e6dd" : "#4a3c37";
      ctx.textAlign = "center";
      ctx.fillText(label, tagBoxX + tagW / 2, tagY);

      if (isAr) {
        currX -= tagW + 12;
      } else {
        currX += tagW + 12;
      }
    });
  }

  // 6. Brand Contact Footer (Bottom)
  ctx.textAlign = "center";

  // Subtitle
  ctx.font = "500 24px 'Tajawal', 'Cairo', Arial, sans-serif";
  ctx.fillStyle = dark ? "rgba(255, 250, 245, 0.72)" : "#756660";
  ctx.fillText(
    isAr ? "آراء حقيقية، وتجارب نعتز بها" : "Real words. Genuine experiences.",
    540,
    1565,
  );

  // Brand Phone & Instagram pill (as requested: "مع اضافة رقم الهاتف للبراند و الانستجرام تبع البراند")
  if (showBrandContact && (brandInstagram?.trim() || brandPhone?.trim())) {
    const contactParts: string[] = [];
    if (brandInstagram?.trim()) contactParts.push(`Instagram: ${brandInstagram.trim()}`);
    if (brandPhone?.trim()) contactParts.push(`Tel: ${brandPhone.trim()}`);
    const contactText = contactParts.join("   •   ");

    ctx.font = "700 26px 'Tajawal', 'Cairo', Arial, sans-serif";
    const contactTextWidth = ctx.measureText(contactText).width;
    const pillW = Math.min(STORY_WIDTH - 120, contactTextWidth + 64);
    const pillH = 58;
    const pillX = 540 - pillW / 2;
    const pillY = 1625;

    // Contact pill background
    ctx.save();
    ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.75)";
    roundedRect(ctx, pillX, pillY, pillW, pillH, 29);
    ctx.fill();

    ctx.strokeStyle = dark ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, pillX, pillY, pillW, pillH, 29);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = dark ? "#fffaf5" : primary;
    ctx.textAlign = "center";
    ctx.fillText(contactText, 540, pillY + pillH / 2);
  }

  // Verified Badge (Bottom-most)
  ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.1)" : `${primary}12`;
  roundedRect(ctx, 414, 1740, 252, 54, 27);
  ctx.fill();

  ctx.fillStyle = dark ? "#fffaf5" : primary;
  ctx.font = "600 22px 'Tajawal', 'Cairo', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(isAr ? "✓  رأي عميلة موثّق" : "✓  VERIFIED REVIEW", 540, 1768);
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
  brandPhone: initialBrandPhone,
  brandInstagram: initialBrandInstagram,
}: ReviewStoryDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [template, setTemplate] = useState<StoryTemplate>("classic");
  const [comment, setComment] = useState("");
  const [showName, setShowName] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [orderDateInput, setOrderDateInput] = useState("");
  const [showBrandContact, setShowBrandContact] = useState(true);
  const [customBrandPhone, setCustomBrandPhone] = useState("");
  const [customBrandInstagram, setCustomBrandInstagram] = useState("");
  const [selectedProductImageUrl, setSelectedProductImageUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [productImgElement, setProductImgElement] = useState<HTMLImageElement | null>(null);
  const [logoImgElement, setLogoImgElement] = useState<HTMLImageElement | null>(null);

  const primary = safeColor(brandColor);

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

    // Auto-select product image if available from the system
    if (productImages.length > 0) {
      setSelectedProductImageUrl(productImages[0]);
    } else {
      setSelectedProductImageUrl(null);
    }
  }, [review, open, initialBrandPhone, initialBrandInstagram, orderDate, productImages, isAr]);

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

  // Load product image
  useEffect(() => {
    if (!selectedProductImageUrl) {
      setProductImgElement(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    if (!selectedProductImageUrl.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => {
      if (!cancelled) setProductImgElement(img);
    };
    img.onerror = () => {
      if (!cancelled) setProductImgElement(null);
    };
    img.src = selectedProductImageUrl;
    return () => {
      cancelled = true;
    };
  }, [selectedProductImageUrl]);

  // Render canvas whenever relevant state changes
  useEffect(() => {
    if (!review || !canvasRef.current || !open) return;
    drawStory({
      canvas: canvasRef.current,
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
      productImage: productImgElement,
      showBrandContact,
      brandPhone: customBrandPhone,
      brandInstagram: customBrandInstagram,
      logoImage: logoImgElement,
    });
  }, [
    review,
    open,
    template,
    comment,
    brandName,
    primary,
    isAr,
    showName,
    showHighlights,
    showDate,
    orderDateInput,
    productImgElement,
    showBrandContact,
    customBrandPhone,
    customBrandInstagram,
    logoImgElement,
  ]);

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
    if (!file.type.startsWith("image/")) {
      toast.error(isAr ? "يرجى اختيار ملف صورة صالح" : "Please select a valid image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setSelectedProductImageUrl(reader.result);
        toast.success(isAr ? "تم إدراج صورة المنتج بنجاح" : "Product photo loaded successfully");
      }
    };
    reader.readAsDataURL(file);
  };

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
                ? "قالب جمالي مستوحى من تقييمات العملاء الحقيقية مع إطار صورة المنتج وبطاقة التقييم الزجاجية."
                : "Aesthetic customer review story with framed product photo and frosted card overlay."}
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

            {/* Product Photo Selector / Uploader */}
            <div className="space-y-2.5 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-primary" />
                  {isAr ? "صورة المنتج داخل الإطار" : "Product photo in frame"}
                </Label>
                {selectedProductImageUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setSelectedProductImageUrl(null)}
                  >
                    <Trash2 className="size-3.5" />
                    {isAr ? "إزالة الصورة" : "Remove"}
                  </Button>
                )}
              </div>

              {/* Order Product Images thumbnails if any */}
              {productImages.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {isAr
                      ? "تم جلب الصور المرتبطة بالطلب تلقائياً (اضغط لاختيار صورة):"
                      : "Images detected from the order (click to select):"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {productImages.map((url, idx) => (
                      <button
                        key={url + idx}
                        type="button"
                        onClick={() => setSelectedProductImageUrl(url)}
                        className={cn(
                          "relative size-14 overflow-hidden rounded-lg border-2 transition-all",
                          selectedProductImageUrl === url
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border opacity-70 hover:opacity-100",
                        )}
                      >
                        <img
                          src={url}
                          alt="product"
                          className="size-full object-cover"
                          crossOrigin="anonymous"
                        />
                        {selectedProductImageUrl === url && (
                          <span className="absolute inset-0 grid place-items-center bg-black/20 text-white">
                            <Check className="size-4 stroke-[3]" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload custom image */}
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
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
                  {selectedProductImageUrl
                    ? isAr
                      ? "رفع صورة بديلة من جهازك"
                      : "Upload a different photo"
                    : isAr
                      ? "رفع صورة للمنتج من جهازك"
                      : "Upload product photo"}
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

            <Button className="min-h-12 w-full gap-2" onClick={download} disabled={downloading}>
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isAr ? "تنزيل PNG للستوري (1080 × 1920)" : "Download story PNG (1080 × 1920)"}
            </Button>
          </div>
        </section>

        {/* Live Canvas Preview */}
        <aside className="order-1 flex min-h-0 items-center justify-center border-b bg-muted/35 p-5 lg:order-2 lg:border-b-0 lg:border-s">
          <div className="w-full max-w-[170px] sm:max-w-[230px] lg:max-w-[290px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="size-3.5" />
                {isAr ? "معاينة حية" : "Live Preview"}
              </span>
              <span dir="ltr">1080 × 1920</span>
            </div>
            <canvas
              ref={canvasRef}
              aria-label={isAr ? "معاينة ستوري تقييم العميل" : "Customer review story preview"}
              className="aspect-[9/16] w-full rounded-xl bg-white shadow-2xl ring-1 ring-black/10"
            />
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
