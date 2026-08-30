import { useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
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
} from "@/lib/cart-sharing";
import { formatPrice, useStorefront } from "@/lib/storefront-context";

interface ShareCartModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCartModal({ open, onOpenChange }: ShareCartModalProps) {
  const { cart, cartTotal, currency, lang, t, brand, settings } = useStorefront();
  const [copied, setCopied] = useState(false);

  const isAr = lang === "ar";
  const shareUrl = buildCartShareUrl(brand.slug, cart);
  const totalFormatted = formatPrice(cartTotal, currency, lang);
  const brandName = isAr ? brand.name_ar || brand.name_en : brand.name_en;

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
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
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: isAr ? `سلة مشتريات من ${brandName}` : `Cart from ${brandName}`,
          text: isAr
            ? `تفضل سلة المشتريات المختارة من ${brandName} (${cart.length} منتجات - ${totalFormatted})`
            : `Here is the cart from ${brandName} (${cart.length} items - ${totalFormatted})`,
          url: shareUrl,
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
    shareUrl,
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
              "شارك محتويات سلتك الحالية مع أصدقائك أو عملائك برابط مباشر ليتمكنوا من إكمال الشراء فوراً.",
              "Share your current cart with friends or customers so they can complete the checkout immediately.",
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
            <label className="text-xs font-semibold text-muted-foreground">
              {t("رابط السلة المباشر", "Direct Cart Link")}
            </label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
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
