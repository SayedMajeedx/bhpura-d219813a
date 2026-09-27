import { Link } from "@tanstack/react-router";
import { Check, Copy, MessageSquareHeart, Sparkles, ArrowUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** Headline, body, price switch, the automatic caption and the reviews link. */
export function CopyPanel({ studio }: { studio: ContentStudio }) {
  const {
    slug,
    storeProfile,
    isAr,
    showPrice,
    setShowPrice,
    productName,
    selectedDescription,
    snappyDesc,
    headline,
    setHeadline,
    body,
    setBody,
    copiedCaption,
    captionText,
    handleCopyCaption,
  } = studio;
  return (
    <>
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
            onClick={() => setHeadline(isAr ? "صُممت لتبقى في الذاكرة" : "Designed to Remember")}
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
              title={isAr ? "نسخ الوصف بالكامل (حتى 160 حرف)" : "Full description up to 160 chars"}
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
                  ? storeProfile.modules.made_to_order
                    ? "متوفرة الآن للطلب حسب الحاجة عبر متجرنا الإلكتروني."
                    : "متوفرة الآن للطلب عبر متجرنا الإلكتروني."
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
            <span>{copiedCaption ? (isAr ? "تم النسخ" : "Copied") : isAr ? "نسخ" : "Copy"}</span>
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
    </>
  );
}
