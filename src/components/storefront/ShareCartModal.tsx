import { useEffect, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Share2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  buildCartShareUrl,
  buildWhatsAppShareUrl,
  createSharedCartLink,
} from "@/lib/cart-sharing";
import { formatPrice, useStorefront } from "@/lib/storefront-context";

interface ShareCartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCartModal({ open, onOpenChange }: ShareCartModalProps) {
  const { cart, cartTotal, currency, lang, t, brand, settings } = useStorefront();
  const [copied, setCopied] = useState(false);
  const [shortUrl, setShortUrl] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const isAr = lang === "ar";
  const brandName = isAr ? brand.name_ar || brand.name_en : brand.name_en;
  const totalFormatted = formatPrice(cartTotal, currency, lang);

  // Fallback URL if async short code is still generating or fails
  const fallbackUrl = buildCartShareUrl(brand.slug, cart);
  const activeShareUrl = shortUrl || fallbackUrl;

  useEffect(() => {
    if (!open || cart.length === 0) return;
    let cancelled = false;
    setGenerating(true);

    createSharedCartLink(brand.id, brand.slug, cart)
      .then((url) => {
        if (!cancelled && url) {
          setShortUrl(url);
        }
      })
      .catch((err) => {
        console.warn("Could not generate short cart URL:", err);
      })
      .finally(() => {
        if (!cancelled) {
          setGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, cart, brand.id, brand.slug]);

  const handleCopy = async () => {
    if (!activeShareUrl) return;
    try {
      await navigator.clipboard.writeText(activeShareUrl);
      setCopied(true);
      toast.success(
        t("تم نسخ رابط السلة بنجاح!", "Cart link copied to clipboard!"),
      );
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("تعذر نسخ الرابط", "Failed to copy link"));
    }
  };

  const handleNativeShare = async () => {
    if (!activeShareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: isAr ? `سلة مشتريات من ${brandName}` : `Cart from ${brandName}`,
          text: isAr
            ? `تفضل سلة المشتريات المختارة من ${brandName} (${cart.length} منتجات - ${totalFormatted})`
            : `Here is the cart from ${brandName} (${cart.length} items - ${totalFormatted})`,
          url: activeShareUrl,
        });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          handleCopy();
        }
      }
    } else {
      handleCopy();
    }
  };

  const whatsappUrl = buildWhatsAppShareUrl({
    shareUrl: activeShareUrl,
    brandName,
    itemCount: cart.length,
    totalFormatted,
    isAr,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={isAr ? "rtl" : "ltr"}
        className="w-[92vw] max-w-md rounded-2xl p-5 sm:p-6"
      >
        <DialogHeader className={isAr ? "text-right sm:text-right" : "text-left sm:text-left"}>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Share2 className="h-5 w-5 text-primary" />
            <span>{t("مشاركة سلة المشتريات", "Share Shopping Cart")}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t(
              "شارك محتويات سلتك الحالية برابط مختصر وسريع ليتمكن الطرف الآخر من إكمال الشراء فوراً.",
              "Share your current cart with a short, fast link so others can complete the checkout immediately.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Summary Banner */}
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <span className="font-medium text-foreground">
              {t("محتوى السلة:", "Cart items:")}{" "}
              <span className="text-muted-foreground">
                {cart.length} {isAr ? (cart.length === 1 ? "منتج" : "منتجات") : "items"}
              </span>
            </span>
            <span className="font-bold text-primary">
              {totalFormatted}
            </span>
          </div>

          {/* Share Link Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                {t("رابط السلة المختصر", "Short Cart Link")}
              </label>
              {generating && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{t("جاري التجهيز...", "Generating...")}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={activeShareUrl}
                className="h-11 flex-1 font-mono text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-[44px] shrink-0 gap-1.5 px-3"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs">{t("تم النسخ", "Copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span className="text-xs">{t("نسخ", "Copy")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 gap-2.5 pt-2 sm:grid-cols-2">
            <Button
              type="button"
              className="h-11 w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              asChild
            >
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                <span>{t("مشاركة عبر واتساب", "Share on WhatsApp")}</span>
              </a>
            </Button>

            <Button
              type="button"
              variant="default"
              className="h-11 w-full gap-2"
              style={{
                backgroundColor: settings.primary_color,
                color: "#ffffff",
              }}
              onClick={handleNativeShare}
            >
              <Share2 className="h-4 w-4" />
              <span>{t("مشاركة الرابط", "Share Link")}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
