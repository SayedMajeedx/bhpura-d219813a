import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  Search,
  ShoppingCart,
  MessageSquare,
  Link2,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  Copy,
  ExternalLink,
} from "lucide-react";
import type { AbandonedCart, CartLineSnapshot } from "@/lib/abandoned-carts.types";
import { generateCartRecoveryCoupon } from "@/lib/abandoned-carts.functions";

interface AbandonedCartsListProps {
  carts: (AbandonedCart & {
    customers?: { name: string; email: string; phone: string } | null;
  })[];
  brandSlug: string;
  brandName: string;
  brandId: string;
  isLoading: boolean;
  onRefresh: () => void;
}

export function AbandonedCartsList({
  carts,
  brandSlug,
  brandName,
  brandId,
  isLoading,
  onRefresh,
}: AbandonedCartsListProps) {
  const { lang, t } = useI18n();
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            {isAr ? "سلة نشطة حالياً" : "Active Session"}
          </span>
        );
      case "abandoned":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            {isAr ? "متروكة" : "Abandoned"}
          </span>
        );
      case "recovering":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            {isAr ? "قيد المتابعة" : "Recovering"}
          </span>
        );
      case "recovered":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {isAr ? "تمت الاستعادة بنجاح" : "Recovered"}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            {status}
          </span>
        );
    }
  };

  const handleCopyLink = (token: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const recoveryUrl = `${origin}/${brandSlug}/checkout?recover=${token}`;
    navigator.clipboard.writeText(recoveryUrl);
    toast.success(isAr ? "تم نسخ رابط استعادة السلة" : "Recovery link copied to clipboard");
  };

  const handleSendWhatsApp = async (cart: AbandonedCart) => {
    const phone = cart.guest_phone || (cart as any).customers?.phone;
    if (!phone) {
      toast.error(isAr ? "لا يوجد رقم هاتف مسجل لهذه السلة" : "No phone number recorded");
      return;
    }

    try {
      setGeneratingForCartId(cart.id);
      // Generate single-use discount coupon if not already present
      let couponCode = cart.recovery_discount_code;
      if (!couponCode) {
        couponCode = await generateCartRecoveryCoupon({
          brandId,
          cartId: cart.id,
          discountType: "percentage",
          discountValue: 10,
        });
      }

      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const recoveryUrl = `${origin}/${brandSlug}/checkout?recover=${cart.recovery_token}${
        couponCode ? `&coupon=${couponCode}` : ""
      }`;

      const name = cart.guest_name || (cart as any).customers?.name || (isAr ? "عزيزنا العميل" : "Valued Customer");
      const message = isAr
        ? `مرحباً ${name}، لاحظنا أنك تركت منتجات في سلتك لدى ${brandName}. إليك كود خصم خاص 10% [${couponCode}] لإتمام طلبك الآن: ${recoveryUrl}`
        : `Hi ${name}, you left items in your cart at ${brandName}. Here is an exclusive 10% discount code [${couponCode}] to complete your order: ${recoveryUrl}`;

      const cleanedPhone = phone.replace(/[^0-9]/g, "");
      const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, "_blank");

      toast.success(isAr ? "تم فتح محادثة الواتساب مع كود الخصم" : "Opened WhatsApp with recovery offer");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate recovery message");
    } finally {
      setGeneratingForCartId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isAr ? "بحث بالعميل أو الهاتف أو البريد..." : "Search customer, phone, email..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 min-h-[44px] bg-background border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] min-h-[44px] border-border bg-background">
              <SelectValue placeholder={isAr ? "حالة السلة" : "Status"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAr ? "جميع السلات" : "All Carts"}</SelectItem>
              <SelectItem value="abandoned">{isAr ? "متروكة (غير مكتملة)" : "Abandoned"}</SelectItem>
              <SelectItem value="active">{isAr ? "نشطة" : "Active"}</SelectItem>
              <SelectItem value="recovering">{isAr ? "قيد المتابعة" : "Recovering"}</SelectItem>
              <SelectItem value="recovered">{isAr ? "تمت الاستعادة" : "Recovered"}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            className="min-h-[44px] min-w-[44px] border-border"
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
                <TableHead className="text-right">{isAr ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCarts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    {isLoading
                      ? isAr
                        ? "جاري تحميل السلات المتروكة..."
                        : "Loading abandoned carts..."
                      : isAr
                      ? "لا توجد سلات متروكة مطابقة للبحث."
                      : "No abandoned carts found."}
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
                          {cart.marketing_consent && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 mt-0.5">
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
                          <span className="text-[11px] text-muted-foreground line-clamp-1">
                            {items.map((it: any) => it.title).join(", ")}
                          </span>
                        </div>
                      </TableCell>

                      <TableCell className="font-mono text-sm font-bold text-foreground">
                        {Number(cart.subtotal).toFixed(3)} {cart.currency || "BHD"}
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

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(cart.recovery_token)}
                            title={isAr ? "نسخ رابط السلة" : "Copy Recovery Link"}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>

                          {phone && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSendWhatsApp(cart)}
                              disabled={generatingForCartId === cart.id}
                              className="min-h-[36px] gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{isAr ? "استعادة واتساب" : "WhatsApp"}</span>
                            </Button>
                          )}
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
