import React, { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStorefront, formatPrice, pickName, readableOn } from "@/lib/storefront-context";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OsEmptyState } from "@/components/os/os-empty-state";
import { ShareCartModal } from "@/components/storefront/ShareCartModal";
import { cloudflareImageUrl } from "@/lib/media-delivery";
import { ShoppingBag, Minus, Plus, Trash2, Gift, Share2 } from "lucide-react";

export function CartDrawer({ children }: { children: React.ReactNode }) {
  const { cart, cartTotal, currency, lang, t, updateQty, removeFromCart, brand, settings } =
    useStorefront();
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [isGift, setIsGift] = useState(() => {
    try {
      const saved = sessionStorage.getItem("boutq_gift_details");
      return saved ? JSON.parse(saved).is_gift === true : false;
    } catch {
      return false;
    }
  });
  const [recipientName, setRecipientName] = useState(() => {
    try {
      const saved = sessionStorage.getItem("boutq_gift_details");
      return saved ? JSON.parse(saved).recipient_name || "" : "";
    } catch {
      return "";
    }
  });
  const [giftMessage, setGiftMessage] = useState(() => {
    try {
      const saved = sessionStorage.getItem("boutq_gift_details");
      return saved ? JSON.parse(saved).gift_message || "" : "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "boutq_gift_details",
        JSON.stringify({
          is_gift: isGift,
          recipient_name: recipientName,
          gift_message: giftMessage,
        }),
      );
    } catch {
      // sessionStorage can be unavailable (private mode, quota) — gift details just won't persist.
    }
  }, [isGift, recipientName, giftMessage]);

  const navigate = useNavigate();
  const drawerCheckoutBg =
    settings.cart_drawer_checkout_bg ??
    settings.btn_checkout_bg ??
    settings.btn_primary_bg ??
    settings.primary_color;
  const drawerCheckoutFg =
    settings.cart_drawer_checkout_fg ??
    settings.btn_checkout_fg ??
    readableOn(drawerCheckoutBg, "#ffffff");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side={lang === "ar" ? "left" : "right"}
        dir={lang === "ar" ? "rtl" : "ltr"}
        className={`w-full sm:max-w-md flex flex-col ${lang === "ar" ? "[&>button]:left-auto [&>button]:right-4" : ""}`}
      >
        {open && (
          <>
            <SheetHeader
              className={`${lang === "ar" ? "text-end sm:text-end pe-14" : "text-start sm:text-start pe-14"}`}
            >
              <SheetTitle>{t("سلة التسوق", "Your cart")}</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-auto py-4 space-y-3">
              {cart.length === 0 ? (
                <div className="py-8">
                  <OsEmptyState
                    compact
                    icon={ShoppingBag}
                    title={t("السلة فارغة", "Your cart is empty")}
                    description={t(
                      "لم تقم بإضافة أية منتجات بعد.",
                      "You haven't added any products yet.",
                    )}
                  />
                </div>
              ) : (
                cart.map((item) => {
                  const displayName = pickName(lang, {
                    name: item.name,
                    name_ar: item.name_ar,
                    name_en: item.name_en,
                  });
                  return (
                    <div
                      key={item.cart_line_id}
                      className="flex gap-3 border rounded-lg p-2 items-center"
                    >
                      {item.image ? (
                        <img
                          src={cloudflareImageUrl(item.image, 160)}
                          alt={displayName}
                          className="h-16 w-16 rounded object-cover shrink-0"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {[item.size, item.color, item.fabric].filter(Boolean).join(" · ")}
                        </div>
                        {(item.custom_fields ?? []).length > 0 && (
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {item.custom_fields!.map((field) => (
                              <div key={field.key} className="break-words">
                                <span className="font-medium text-foreground/80">
                                  {lang === "ar"
                                    ? field.label_ar || field.label_en || field.key
                                    : field.label_en || field.label_ar || field.key}
                                  :
                                </span>{" "}
                                {field.value.startsWith("http") ? (
                                  <a
                                    href={field.value}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary hover:underline font-medium inline-flex items-center gap-0.5 mt-0.5"
                                  >
                                    <span>
                                      📎 {lang === "ar" ? "تحميل/عرض الملف" : "View File"}
                                    </span>
                                  </a>
                                ) : (
                                  field.value
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        <div
                          className="text-sm font-semibold mt-1"
                          style={{ color: settings.primary_color }}
                        >
                          <span className="flex flex-col items-end">
                            <span>{formatPrice(item.price * item.qty, currency, lang)}</span>
                            {Number(item.original_price || 0) > item.price && (
                              <span className="text-xs text-muted-foreground line-through">
                                {formatPrice(
                                  Number(item.original_price) * item.qty,
                                  currency,
                                  lang,
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="flex items-center border rounded overflow-hidden">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            onClick={() => updateQty(item.cart_line_id, item.qty - 1)}
                            aria-label="decrease"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="px-2 text-sm min-w-[24px] text-center font-medium">
                            {item.qty}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 rounded-none"
                            disabled={item.qty >= item.max_stock}
                            onClick={() => updateQty(item.cart_line_id, item.qty + 1)}
                            aria-label="increase"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="flex min-h-11 items-center gap-1 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => removeFromCart(item.cart_line_id)}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t("حذف", "Remove")}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                {/* 🎁 Gift Option Box */}
                <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={isGift}
                      onChange={(e) => setIsGift(e.target.checked)}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    />
                    <Gift className="h-4 w-4 text-primary" />
                    <span>{t("هل هذا الطلب إهداء؟ 🎁", "Is this order a gift? 🎁")}</span>
                  </label>
                  {isGift && (
                    <div className="space-y-2 pt-1 border-t border-border-subtle">
                      <Input
                        type="text"
                        placeholder={t("اسم المستلم (اختياري)", "Recipient Name (Optional)")}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        className="h-9 text-xs rounded-lg bg-background"
                      />
                      <textarea
                        placeholder={t(
                          "رسالة الإهداء لكتابتها على الكرت...",
                          "Gift message to write on card...",
                        )}
                        value={giftMessage}
                        onChange={(e) => setGiftMessage(e.target.value)}
                        className="w-full h-16 p-2 text-xs rounded-lg border bg-background text-foreground resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-between text-lg font-semibold">
                  <span>{t("الإجمالي", "Total")}</span>
                  <span style={{ color: settings.primary_color }}>
                    {formatPrice(cartTotal, currency, lang)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl gap-2 border-border font-medium"
                    onClick={() => setShareOpen(true)}
                  >
                    <Share2 className="h-4 w-4 text-primary" />
                    <span>{t("مشاركة السلة", "Share cart")}</span>
                  </Button>
                  <Button
                    className="h-12 rounded-xl"
                    style={{
                      backgroundColor: drawerCheckoutBg,
                      color: drawerCheckoutFg,
                      borderColor: drawerCheckoutBg,
                    }}
                    onClick={() => {
                      setOpen(false);
                      navigate({ to: "/$slug/checkout", params: { slug: brand.slug } });
                    }}
                  >
                    {t("إتمام الشراء", "Checkout")}
                  </Button>
                </div>
                <ShareCartModal open={shareOpen} onOpenChange={setShareOpen} />
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
