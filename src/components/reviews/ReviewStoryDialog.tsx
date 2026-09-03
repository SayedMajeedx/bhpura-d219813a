import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Sparkles,
  Star,
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
  logoImage?: HTMLImageElement | null;
}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  ctx.textBaseline = "middle";
  ctx.direction = isAr ? "rtl" : "ltr";

  const dark = template === "midnight";
  const background = dark ? primary : template === "editorial" ? "#ffffff" : "#f7f1ed";
  const ink = dark ? "#fffaf5" : "#251918";
  const muted = dark ? "rgba(255,250,245,.68)" : "#786967";
  const accent = dark ? "#efd9c8" : primary;

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  if (template === "classic") {
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.arc(970, 110, 260, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(70, 1770, 330, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (template === "editorial") {
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, 34, STORY_HEIGHT);
    ctx.fillRect(110, 296, 860, 2);
  } else {
    const gradient = ctx.createRadialGradient(850, 260, 30, 850, 260, 900);
    gradient.addColorStop(0, "rgba(255,255,255,.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.lineWidth = 2;
    roundedRect(ctx, 72, 72, 936, 1776, 40);
    ctx.stroke();
  }

  ctx.textAlign = "center";
  if (logoImage?.naturalWidth && logoImage.naturalHeight) {
    const maxWidth = 250;
    const maxHeight = 120;
    const scale = Math.min(maxWidth / logoImage.naturalWidth, maxHeight / logoImage.naturalHeight);
    const width = logoImage.naturalWidth * scale;
    const height = logoImage.naturalHeight * scale;
    ctx.drawImage(logoImage, (STORY_WIDTH - width) / 2, 105, width, height);
    ctx.fillStyle = dark ? "#ffffff" : primary;
    ctx.font = `700 30px Arial, sans-serif`;
    ctx.fillText(brandName, 540, 260);
  } else {
    ctx.fillStyle = accent;
    roundedRect(ctx, 514, 110, 52, 80, 18);
    ctx.fill();
    ctx.fillStyle = dark ? primary : "#ffffff";
    ctx.font = `700 38px Arial, sans-serif`;
    ctx.fillText(brandName.trim().charAt(0).toUpperCase(), 540, 152);
    ctx.fillStyle = dark ? "#ffffff" : primary;
    ctx.font = `700 38px Arial, sans-serif`;
    ctx.fillText(brandName, 540, 235);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = muted;
  ctx.font = `600 27px Arial, sans-serif`;
  ctx.fillText(isAr ? "من كلام عميلاتنا" : "From our customers", 540, 410);

  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  ctx.fillStyle = dark ? "#efd9c8" : primary;
  ctx.font = `700 58px Arial, sans-serif`;
  ctx.direction = "ltr";
  ctx.fillText("★".repeat(rating), 540, 490);
  ctx.direction = isAr ? "rtl" : "ltr";

  const fontSize = comment.length > 190 ? 48 : comment.length > 110 ? 56 : 66;
  ctx.fillStyle = ink;
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  const lines = fitLines(
    ctx,
    comment || (isAr ? "تجربة تستحق المشاركة" : "An experience worth sharing"),
    820,
    7,
  );
  const lineHeight = fontSize * 1.55;
  const blockHeight = lines.length * lineHeight;
  let y = 890 - blockHeight / 2;
  ctx.fillStyle = accent;
  ctx.font = `700 150px Georgia, serif`;
  ctx.fillText("“", 540, y - 100);
  ctx.fillStyle = ink;
  ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  lines.forEach((line) => {
    ctx.fillText(line, 540, y);
    y += lineHeight;
  });

  const labels = review.highlights
    .slice(0, 2)
    .map((highlight) => REVIEW_HIGHLIGHT_LABELS[highlight]?.[isAr ? "ar" : "en"] ?? highlight);
  if (showHighlights && labels.length) {
    ctx.font = `600 27px Arial, sans-serif`;
    const widths = labels.map((label) => ctx.measureText(label).width + 64);
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + (labels.length - 1) * 18;
    let x = 540 - totalWidth / 2;
    labels.forEach((label, index) => {
      ctx.fillStyle = dark ? "rgba(255,255,255,.1)" : `${primary}12`;
      roundedRect(ctx, x, 1280, widths[index], 64, 32);
      ctx.fill();
      ctx.fillStyle = dark ? "#fffaf5" : primary;
      ctx.fillText(label, x + widths[index] / 2, 1312);
      x += widths[index] + 18;
    });
  }

  ctx.fillStyle = ink;
  ctx.font = `700 32px Arial, sans-serif`;
  ctx.fillText(
    showName && publicFirstName(review.customer_name)
      ? publicFirstName(review.customer_name)
      : isAr
        ? "عميلة موثّقة"
        : "Verified customer",
    540,
    1450,
  );
  ctx.fillStyle = muted;
  ctx.font = `500 25px Arial, sans-serif`;
  ctx.fillText(isAr ? "تقييم موثّق بعد الشراء" : "Verified post-purchase review", 540, 1500);

  ctx.strokeStyle = dark ? "rgba(255,255,255,.18)" : `${primary}30`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(350, 1625);
  ctx.lineTo(730, 1625);
  ctx.stroke();
  ctx.fillStyle = muted;
  ctx.font = `500 25px Arial, sans-serif`;
  ctx.fillText(isAr ? "شكراً لثقتكم" : "Thank you for your trust", 540, 1690);
}

export function ReviewStoryDialog({
  open,
  onOpenChange,
  review,
  brandName,
  brandColor,
  logoUrl,
  isAr,
}: ReviewStoryDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [template, setTemplate] = useState<StoryTemplate>("classic");
  const [comment, setComment] = useState("");
  const [showName, setShowName] = useState(true);
  const [showHighlights, setShowHighlights] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const primary = safeColor(brandColor);

  useEffect(() => {
    if (!review || !open) return;
    setComment(review.comment ?? "");
    setTemplate("classic");
    setShowName(true);
    setShowHighlights(true);
  }, [review, open]);

  useEffect(() => {
    if (!review || !canvasRef.current || !open) return;
    const canvas = canvasRef.current;
    const render = (logoImage?: HTMLImageElement | null) =>
      drawStory({
        canvas,
        template,
        review,
        comment,
        brandName,
        primary,
        isAr,
        showName,
        showHighlights,
        logoImage,
      });
    render();
    if (!logoUrl) return;
    let cancelled = false;
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => {
      if (!cancelled) render(logo);
    };
    logo.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [
    review,
    open,
    template,
    comment,
    brandName,
    primary,
    logoUrl,
    isAr,
    showName,
    showHighlights,
  ]);

  const templates = useMemo(
    () => [
      { id: "classic" as const, label: isAr ? "كلاسيكي" : "Classic", colors: ["#f7f1ed", primary] },
      {
        id: "editorial" as const,
        label: isAr ? "تحريري" : "Editorial",
        colors: ["#ffffff", primary],
      },
      { id: "midnight" as const, label: isAr ? "داكن" : "Midnight", colors: [primary, "#efd9c8"] },
    ],
    [isAr, primary],
  );

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
        className="grid h-[calc(100dvh-1rem)] max-h-[820px] min-h-0 max-w-5xl gap-0 overflow-y-auto rounded-2xl p-0 sm:h-[calc(100dvh-2rem)] lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden"
      >
        <section className="order-2 min-h-0 min-w-0 p-5 sm:p-7 lg:order-1 lg:overflow-y-auto lg:overscroll-contain">
          <DialogHeader className="px-0 pe-10">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="size-5 text-primary" />
              {isAr ? "حوّل التقييم إلى ستوري" : "Turn this review into a story"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {isAr
                ? "عدّل النسخة المخصصة للنشر واختر الشكل المناسب. لن يظهر رقم الطلب أو كود الخصم."
                : "Edit the public copy and choose a style. Order numbers and reward codes are always excluded."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            <div className="space-y-2.5">
              <Label>{isAr ? "القالب" : "Template"}</Label>
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

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="story-review-copy">{isAr ? "نص الستوري" : "Story copy"}</Label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {comment.length}/280
                </span>
              </div>
              <Textarea
                id="story-review-copy"
                value={comment}
                maxLength={280}
                rows={5}
                onChange={(event) => setComment(event.target.value)}
                className="resize-none leading-7"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {isAr
                  ? "هذا التعديل للتصميم فقط ولن يغيّر تقييم العميل الأصلي."
                  : "This only changes the story design, never the original review."}
              </p>
            </div>

            <div className="divide-y rounded-xl border border-border">
              <div className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-semibold">
                    {isAr ? "إظهار الاسم الأول" : "Show first name"}
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
                    {isAr ? "إظهار أبرز النقاط" : "Show highlights"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isAr
                      ? "نقطتان كحد أقصى للحفاظ على وضوح التصميم"
                      : "Up to two, keeping the design uncluttered"}
                  </p>
                </div>
                <Switch checked={showHighlights} onCheckedChange={setShowHighlights} />
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {isAr
                ? "آمن للنشر: لا يتضمن رقم الطلب، الهاتف، معلومات الدفع أو كود المكافأة."
                : "Safe to publish: order, phone, payment, and reward details are excluded."}
            </div>

            <Button className="min-h-12 w-full gap-2" onClick={download} disabled={downloading}>
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {isAr ? "تنزيل PNG للستوري" : "Download story PNG"}
            </Button>
          </div>
        </section>

        <aside className="order-1 flex min-h-0 items-center justify-center border-b bg-muted/35 p-5 lg:order-2 lg:border-b-0 lg:border-s">
          <div className="w-full max-w-[170px] sm:max-w-[230px] lg:max-w-[280px]">
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <ImageIcon className="size-3.5" />
                {isAr ? "معاينة" : "Preview"}
              </span>
              <span dir="ltr">1080 × 1920</span>
            </div>
            <canvas
              ref={canvasRef}
              aria-label={isAr ? "معاينة ستوري تقييم العميل" : "Customer review story preview"}
              className="aspect-[9/16] w-full rounded-xl bg-white shadow-xl ring-1 ring-black/10"
            />
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
