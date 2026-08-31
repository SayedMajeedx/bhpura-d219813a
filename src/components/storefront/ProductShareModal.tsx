import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Share2,
  Copy,
  Check,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface ProductShareModalProps {
  isAr: boolean;
  productName: string;
  productUrl?: string;
  priceFormatted?: string;
  children?: React.ReactNode;
}

export function ProductShareModal({
  isAr,
  productName,
  productUrl,
  priceFormatted,
  children,
}: ProductShareModalProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const getFullUrl = () => {
    if (productUrl && (productUrl.startsWith("http://") || productUrl.startsWith("https://"))) {
      return productUrl;
    }
    if (typeof window !== "undefined") {
      return window.location.href;
    }
    return productUrl || "";
  };

  const handleShareClick = async (e: React.MouseEvent) => {
    const url = getFullUrl();
    const shareTitle = productName;
    const shareText = isAr
      ? `شاهد هذا المنتج الرائع: ${productName}${priceFormatted ? ` بسعر ${priceFormatted}` : ""}`
      : `Check out ${productName}${priceFormatted ? ` for ${priceFormatted}` : ""}`;

    // On mobile devices with navigator.share, prefer native share sheet
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")
    ) {
      e.preventDefault();
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: url,
        });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setOpen(true);
        }
        return;
      }
    }

    // Otherwise open the luxury share dialog
    setOpen(true);
  };

  const copyToClipboard = async () => {
    const url = getFullUrl();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopied(true);
      toast.success(isAr ? "تم نسخ الرابط إلى الحافظة" : "Link copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(isAr ? "فشل نسخ الرابط" : "Failed to copy link");
    }
  };

  const shareToWhatsApp = () => {
    const url = encodeURIComponent(getFullUrl());
    const text = encodeURIComponent(
      isAr
        ? `شاهد هذا المنتج الفاخر: ${productName}${priceFormatted ? ` بسعر ${priceFormatted}` : ""}\n`
        : `Check out ${productName}${priceFormatted ? ` for ${priceFormatted}` : ""}\n`,
    );
    window.open(`https://api.whatsapp.com/send?text=${text}${url}`, "_blank");
  };

  const shareToTelegram = () => {
    const url = encodeURIComponent(getFullUrl());
    const text = encodeURIComponent(productName);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
  };

  const shareToX = () => {
    const url = encodeURIComponent(getFullUrl());
    const text = encodeURIComponent(
      isAr ? `شاهد ${productName} من متجر بيورا:` : `Check out ${productName}:`,
    );
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div onClick={handleShareClick} className="inline-flex">
        {children || (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full h-11 w-11 transition-[transform,colors] hover:scale-105"
            aria-label={isAr ? "مشاركة المنتج" : "Share product"}
          >
            <Share2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <DialogContent className="max-w-md p-5 sm:p-6" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader className="text-start pb-2 border-b">
          <DialogTitle className="text-lg font-display flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            <span>{isAr ? "مشاركة هذا المنتج" : "Share this product"}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{productName}</p>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Quick Action Channels */}
          <div className="grid grid-cols-3 gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={shareToWhatsApp}
              className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl border hover:border-emerald-500/50 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 text-xs font-semibold transition-all group"
            >
              <div className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 grid place-items-center group-hover:scale-110 transition-transform">
                <MessageCircle className="h-4 w-4" />
              </div>
              <span>{isAr ? "واتساب" : "WhatsApp"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={shareToTelegram}
              className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl border hover:border-sky-500/50 hover:bg-sky-50/50 dark:hover:bg-sky-950/20 text-xs font-semibold transition-all group"
            >
              <div className="h-8 w-8 rounded-full bg-sky-500/10 text-sky-600 grid place-items-center group-hover:scale-110 transition-transform">
                <Send className="h-4 w-4" />
              </div>
              <span>{isAr ? "تيليجرام" : "Telegram"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={shareToX}
              className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-xl border hover:border-neutral-900/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold transition-all group"
            >
              <div className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-neutral-800 text-foreground grid place-items-center group-hover:scale-110 transition-transform">
                <span className="font-bold text-xs">𝕏</span>
              </div>
              <span>{isAr ? "منصة X" : "X (Twitter)"}</span>
            </Button>
          </div>

          {/* Direct Link Copy Bar */}
          <div className="pt-2">
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">
              {isAr ? "رابط المنتج المباشر:" : "Direct product link:"}
            </div>
            <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-1.5">
              <input
                type="text"
                readOnly
                value={getFullUrl()}
                className="flex-1 bg-transparent px-2.5 text-xs text-foreground outline-none select-all truncate"
              />
              <Button
                type="button"
                size="sm"
                variant={copied ? "default" : "secondary"}
                onClick={copyToClipboard}
                className="h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 stroke-[3]" />
                    <span>{isAr ? "تم النسخ" : "Copied"}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{isAr ? "نسخ" : "Copy"}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
