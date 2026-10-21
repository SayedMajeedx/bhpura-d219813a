import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OsSkeleton } from "@/components/os/os-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Search, MessageSquare, Link2, CheckCircle2, RefreshCw } from "lucide-react";
import { generateCartRecoveryCoupon } from "@/lib/abandoned-carts.functions";
import type { AbandonedCartWithCustomer } from "@/lib/data/abandoned-carts";
import { cartChatUrl, isLeftCart, type RecoveryCode } from "@/lib/abandoned-cart-recovery";
import { cartReminderMessage } from "@/features/outreach/lib/outreach-messages";
import { cartLines, guessLang } from "@/features/outreach/lib/outreach";
import { getStorefrontUrl } from "@/lib/storefront-url";
import { formatMoney } from "@/lib/format";

type CartRow = AbandonedCartWithCustomer;

interface AbandonedCartsListProps {
  carts: CartRow[];
  brandSlug: string;
  brandName: string;
  brandId: string;
  /** The code the store chose to offer with a reminder, or none. */
  recoveryCode: RecoveryCode | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function AbandonedCartsList({
  carts,
  brandSlug,
  brandName,
  brandId,
  recoveryCode,
  isLoading,
  onRefresh,
}: AbandonedCartsListProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [generatingForCartId, setGeneratingForCartId] = useState<string | null>(null);

  const filteredCarts = carts.filter((c) => {
    const contact =
      (c.customers?.name || c.guest_name || "") +
      " " +
      (c.customers?.phone || c.guest_phone || "") +
      " " +
      (c.customers?.email || c.guest_email || "");
    const matchesSearch = search === "" || contact.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            {isAr ? "سلة نشطة حالياً" : "Active Session"}
          </span>
        );
      case "abandoned":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {isAr ? "متروكة" : "Abandoned"}
          </span>
        );
      case "recovering":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            {isAr ? "قيد المتابعة" : "Recovering"}
          </span>
        );
      case "recovered":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {isAr ? "تمت الاستعادة بنجاح" : "Recovered"}
          </span>
        );
      case "converted":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {isAr ? "صار طلباً مباشرة" : "Ordered"}
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {isAr ? "تم إفراغها" : "Cleared"}
          </span>
        );
      case "unsubscribed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            {isAr ? "أوقف المتابعة" : "Unsubscribed"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
            {status}
          </span>
        );
    }
  };

  // The storefront's own address (its domain when it has one), not the admin's.
  const recoveryLink = (token: string, code?: string | null) => {
    const query = `?recover=${encodeURIComponent(token)}${code ? `&coupon=${encodeURIComponent(code)}` : ""}`;
    const link = getStorefrontUrl(brandSlug, `/checkout${query}`);
    return link.startsWith("http") ? link : `${window.location.origin}${link}`;
  };

  const handleCopyLink = (token: string) => {
    navigator.clipboard.writeText(recoveryLink(token));
    toast.success(isAr ? "تم نسخ رابط استعادة السلة" : "Recovery link copied to clipboard");
  };

  // A person sends the reminder, only to a shopper who agreed to hear about the cart. A code is
  // made only when asked for, once per cart, with the store's own discount.
  const handleSendWhatsApp = async (cart: CartRow, withCode: boolean) => {
    const chat = cartChatUrl(cart);
    if (!chat) {
      toast.error(
        isAr
          ? "لم يوافق صاحب السلة على الرسائل، أو لا يوجد رقم واتساب"
          : "The shopper did not agree to messages, or left no WhatsApp number",
      );
      return;
    }

    try {
      setGeneratingForCartId(cart.id);
      let code: string | null = null;
      if (withCode && recoveryCode) {
        code =
          cart.recovery_discount_code ||
          (await generateCartRecoveryCoupon({
            brandId,
            cartId: cart.id,
            discountType: recoveryCode.type,
            discountValue: recoveryCode.value,
            expiryHours: recoveryCode.expiryHours,
          }));
      }
      const name = cart.guest_name || cart.customers?.name || null;
      const message = cartReminderMessage(
        {
          name,
          lines: cartLines(cart.cart_items),
          subtotal: Number(cart.subtotal) || 0,
          currency: cart.currency,
          token: cart.recovery_token,
          code,
        },
        guessLang(name),
        {
          storeName: brandName,
          cartLink: (token) => recoveryLink(token, code),
          money: (amount, currency, l) => formatMoney(amount, currency || cart.currency, l),
        },
      );
      window.open(`${chat}?text=${encodeURIComponent(message)}`, "_blank");
      toast.success(isAr ? "تم فتح محادثة الواتساب" : "Opened WhatsApp");
    } catch (err) {
      toast.error(
        (err as Error).message || (isAr ? "تعذر إنشاء الكود" : "The code could not be made"),
      );
    } finally {
      setGeneratingForCartId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label={
              isAr ? "بحث بالعميل أو الهاتف أو البريد..." : "Search customer, phone, email..."
            }
            placeholder={
              isAr ? "بحث بالعميل أو الهاتف أو البريد..." : "Search customer, phone, email..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9 min-h-[44px] bg-background border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] min-h-[44px] border-border bg-background">
              <SelectValue placeholder={isAr ? "حالة السلة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع السلات" : "All Carts"}</SelectItem>
              <SelectItem value="abandoned">
                {isAr ? "متروكة (غير مكتملة)" : "Abandoned"}
              </SelectItem>
              <SelectItem value="active">{isAr ? "نشطة" : "Active"}</SelectItem>
              <SelectItem value="recovering">{isAr ? "قيد المتابعة" : "Recovering"}</SelectItem>
              <SelectItem value="recovered">{isAr ? "تمت الاستعادة" : "Recovered"}</SelectItem>
              <SelectItem value="converted">{isAr ? "صار طلباً مباشرة" : "Ordered"}</SelectItem>
              <SelectItem value="expired">{isAr ? "تم إفراغها" : "Cleared"}</SelectItem>
              <SelectItem value="unsubscribed">
                {isAr ? "أوقف المتابعة" : "Unsubscribed"}
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="min-h-[44px] min-w-[44px] border-border"
            aria-label={isAr ? "تحديث السلات" : "Refresh carts"}
            title={isAr ? "تحديث السلات" : "Refresh carts"}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Carts Table */}
      <Card className="border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>{isAr ? "العميل / جهة الاتصال" : "Customer / Contact"}</TableHead>
                <TableHead>{isAr ? "المنتجات بالسلة" : "Cart Items"}</TableHead>
                <TableHead>{isAr ? "إجمالي السلة" : "Subtotal"}</TableHead>
                <TableHead>{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead>{isAr ? "آخر نشاط" : "Last Activity"}</TableHead>
                <TableHead className="text-end">{isAr ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <OsSkeleton variant="text" className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <OsSkeleton variant="text" className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <OsSkeleton variant="text" className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <OsSkeleton variant="text" className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <OsSkeleton variant="text" className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <OsSkeleton variant="button" className="h-8 w-20 ms-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredCarts.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center py-10 text-muted-foreground text-sm"
                  >
                    {isAr ? "لا توجد سلات متروكة مطابقة للبحث." : "No abandoned carts found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCarts.map((cart) => {
                  const items = Array.isArray(cart.cart_items) ? cart.cart_items : [];
                  const phone = cart.guest_phone || cart.customers?.phone;
                  const name = cart.guest_name || cart.customers?.name || (isAr ? "زائر" : "Guest");

                  return (
                    <TableRow key={cart.id} className="border-border">
                      <TableCell className="font-medium">
                        <div>
                          <span className="text-foreground font-semibold block">{name}</span>
                          <span className="text-xs text-muted-foreground block font-mono">
                            {phone || cart.guest_email || cart.customers?.email || "—"}
                          </span>
                          {Boolean(
                            cart.marketing_consent &&
                            (phone || cart.guest_email || cart.customers?.email),
                          ) && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              {isAr ? "موافق على التسويق" : "Marketing consent"}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col gap-1 max-w-[220px]">
                          <span className="text-xs font-medium text-foreground">
                            {items.length} {isAr ? "منتج" : "item(s)"}
                          </span>
                          <span className="text-xs text-muted-foreground line-clamp-1">
                            {items.map((it: any) => it.title).join(", ")}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-sm font-bold text-foreground">
                        {formatMoney(Number(cart.subtotal) || 0, cart.currency, lang)}
                      </TableCell>

                      <TableCell>{getStatusBadge(cart.status)}</TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(cart.last_activity_at).toLocaleDateString(
                          isAr ? "ar-BH" : "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </TableCell>

                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(cart.recovery_token)}
                            title={isAr ? "نسخ رابط السلة" : "Copy Recovery Link"}
                            aria-label={
                              isAr ? `نسخ رابط سلة ${name}` : `Copy the cart link for ${name}`
                            }
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>

                          {isLeftCart(cart) &&
                            (cartChatUrl(cart) ? (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSendWhatsApp(cart, false)}
                                  disabled={generatingForCartId === cart.id}
                                  className="min-h-[36px] gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  <span>{isAr ? "واتساب" : "WhatsApp"}</span>
                                </Button>
                                {recoveryCode && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSendWhatsApp(cart, true)}
                                    disabled={generatingForCartId === cart.id}
                                    className="min-h-[36px] text-xs"
                                  >
                                    {isAr ? "مع كود" : "With a code"}
                                  </Button>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {isAr ? "لم يوافق على الرسائل" : "No consent to messages"}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
