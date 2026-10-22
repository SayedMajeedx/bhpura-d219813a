import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrand } from "@/lib/brand-context";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { feedAddress } from "@/lib/seo/feed-address";

/**
 * The store's shopping feed for Instagram / Facebook Shop and Google: the two addresses (Arabic,
 * the storefront's own language, and English) to paste into Meta Commerce Manager and Google
 * Merchant Center, how to do it, and what the feed leaves out. The feed itself is built on every
 * fetch from the catalog (`src/lib/seo/product-feed.ts`).
 */
export function ShoppingFeedCard({ brandId, isAr }: { brandId: string; isAr: boolean }) {
  const brand = useBrand();
  const settings = useQuery(businessSettingsQueries.detail(brandId)).data;
  const hidesPrices =
    settings?.storefront_mode === "catalog" && settings?.catalog_show_prices === false;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const feeds = [
    { id: "feed-ar", label: isAr ? "الكتالوج بالعربية" : "Arabic catalog", lang: "ar" as const },
    {
      id: "feed-en",
      label: isAr ? "الكتالوج بالإنجليزية" : "English catalog",
      lang: "en" as const,
    },
  ].map((feed) => ({ ...feed, url: feedAddress(brand, feed.lang, origin) }));

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied");
    } catch {
      toast.error(
        isAr ? "تعذّر النسخ، انسخ الرابط يدوياً" : "Could not copy: copy the link by hand",
      );
    }
  };

  return (
    <Card className="mb-6 p-3 sm:p-5" dir={isAr ? "rtl" : "ltr"}>
      <div className="mb-4 space-y-1">
        <h2 className="font-display text-xl">
          {isAr ? "كتالوج انستغرام وجوجل" : "Instagram & Google catalog"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "رابط واحد يحدّث نفسه من مخزونك: اربطه مرة، فتظهر قطعك في متجر انستغرام وفيسبوك وتُوسم في المنشورات، وفي نتائج التسوق في جوجل."
            : "One link that keeps itself up to date from your stock: connect it once, and your pieces can be tagged in Instagram posts, shown in your Facebook and Instagram shop, and listed in Google's shopping results."}
        </p>
      </div>

      {hidesPrices ? (
        <p className="rounded-lg border border-border-strong bg-muted/30 p-4 text-sm text-muted-foreground">
          {isAr
            ? "متجرك يُخفي الأسعار، وانستغرام وجوجل لا يقبلان قطعة بلا سعر. أظهر الأسعار من الإعدادات ليعمل الكتالوج."
            : "Your store hides its prices, and Instagram and Google accept no piece without one. Show prices in Settings for the catalog to work."}
        </p>
      ) : (
        <div className="grid gap-4">
          {feeds.map((feed) => (
            <div key={feed.id} className="space-y-1.5 min-w-0">
              <Label htmlFor={feed.id} className="text-xs font-bold">
                {feed.label}
              </Label>
              <div className="flex min-w-0 gap-2">
                <Input
                  id={feed.id}
                  dir="ltr"
                  readOnly
                  value={feed.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="min-w-0 flex-1 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copy(feed.url)}
                  aria-label={isAr ? `نسخ رابط ${feed.label}` : `Copy the ${feed.label} link`}
                >
                  <Copy className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-4 text-sm">
              <h3 className="mb-2 font-bold">
                {isAr ? "انستغرام وفيسبوك" : "Instagram & Facebook"}
              </h3>
              <ol className="list-decimal space-y-1 ps-5 text-muted-foreground">
                <li>
                  {isAr
                    ? "افتح Commerce Manager من حساب الأعمال، ثم الكتالوج."
                    : "Open Commerce Manager from your business account, then Catalogue."}
                </li>
                <li>
                  {isAr
                    ? "مصادر البيانات ← موجز بيانات ← موجز مجدول."
                    : "Data sources → Data feed → Scheduled feed."}
                </li>
                <li>
                  {isAr
                    ? "الصق رابط الكتالوج بالعربية، واختر التحديث كل ساعة."
                    : "Paste the Arabic catalog link and choose to update every hour."}
                </li>
              </ol>
            </div>
            <div className="rounded-lg border p-4 text-sm">
              <h3 className="mb-2 font-bold">Google</h3>
              <ol className="list-decimal space-y-1 ps-5 text-muted-foreground">
                <li>
                  {isAr
                    ? "افتح Merchant Center ثم المنتجات."
                    : "Open Merchant Center, then Products."}
                </li>
                <li>
                  {isAr
                    ? "إضافة منتجات ← من ملف ← جلب مجدول."
                    : "Add products → From a file → Scheduled fetch."}
                </li>
                <li>
                  {isAr
                    ? "الصق رابط الكتالوج، واختر الجلب يومياً."
                    : "Paste the catalog link and choose a daily fetch."}
                </li>
              </ol>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {isAr
              ? "كل مقاس قطعة مستقلة بسعره وصورته. المقاس المنتهي يبقى ظاهراً كغير متوفر. لا يدخل الكتالوج: القطع المخفية، والخدمات والباقات، وما ليس له صورة أو سعر."
              : "Each size is its own item, with its price and picture. A sold-out size stays in, marked out of stock. Left out: hidden pieces, services and packages, and anything with no picture or price."}
          </p>
        </div>
      )}
    </Card>
  );
}
