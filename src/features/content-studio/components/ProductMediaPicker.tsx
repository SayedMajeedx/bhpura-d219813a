import { Check, Video, Image as LucideImage } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContentStudio } from "@/features/content-studio/hooks/use-content-studio";

/** Choose the product, its variant and the photo or video the design uses. */
export function ProductMediaPicker({ studio }: { studio: ContentStudio }) {
  const {
    isAr,
    currencySymbol,
    setProductId,
    products,
    selected,
    productVariants,
    selectedVariantId,
    selectedMediaUrl,
    setSelectedMediaUrl,
    productMediaList,
    handleSelectVariant,
  } = studio;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between h-5">
          <Label htmlFor="studio-product" className="text-xs font-bold text-foreground">
            {isAr ? "المنتج" : "Product"}
          </Label>
          <span className="text-xs font-medium text-muted-foreground">
            {products.length} {isAr ? "منتجات نشطة" : "active products"}
          </span>
        </div>
        <Select value={selected?.id ?? ""} onValueChange={setProductId}>
          <SelectTrigger id="studio-product" className="h-11 rounded-xl text-xs font-medium">
            <SelectValue placeholder={isAr ? "اختيار منتج" : "Choose a product"} />
          </SelectTrigger>
          <SelectContent>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {isAr ? product.name_ar || product.name : product.name_en || product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Variant Selector (if product has multiple variants) */}
      {productVariants.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between h-5">
            <Label htmlFor="studio-variant" className="text-xs font-bold text-foreground">
              {isAr ? "المتغير / المقاس واللون" : "Product Variant"}
            </Label>
            <span className="text-xs font-medium text-muted-foreground">
              {productVariants.length} {isAr ? "خيارات" : "options"}
            </span>
          </div>
          <Select
            value={selectedVariantId || "all"}
            onValueChange={(val) => handleSelectVariant(val === "all" ? null : val)}
          >
            <SelectTrigger id="studio-variant" className="h-10 rounded-xl text-xs bg-muted/20">
              <SelectValue
                placeholder={isAr ? "جميع المتغيرات / الأساسي" : "All variants (base)"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {isAr ? "المنتج الأساسي (الافتراضي)" : "Base product (default)"}
              </SelectItem>
              {productVariants.map((v) => {
                const labelParts = [v.size, v.color].filter(Boolean);
                const vTitle = labelParts.length > 0 ? labelParts.join(" · ") : v.id.slice(0, 6);
                const priceStr =
                  v.selling_price != null
                    ? ` · ${Number(v.selling_price).toFixed(3)} ${currencySymbol}`
                    : "";
                return (
                  <SelectItem key={v.id} value={v.id}>
                    {vTitle} {priceStr}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Media gallery selector (pictures & videos) */}
      {productMediaList.length > 1 && (
        <div className="space-y-2 rounded-2xl border border-border-strong bg-muted/20 p-3.5">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5 font-bold text-foreground text-xs">
              <LucideImage className="size-3.5 text-primary" />
              {isAr ? "اختيار صورة أو فيديو التصميم" : "Select design media"}
            </span>
            <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
              {productMediaList.length} {isAr ? "عناصر" : "items"}
            </span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 scrollbar-thin">
            {productMediaList.map((item, idx) => {
              const isSelected = item.url === selectedMediaUrl;
              return (
                <button
                  key={item.url + idx}
                  type="button"
                  onClick={() => setSelectedMediaUrl(item.url)}
                  className={cn(
                    "relative shrink-0 size-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer group",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 scale-105 shadow-sm"
                      : "border-border hover:border-primary/50 opacity-75 hover:opacity-100",
                  )}
                  title={item.label}
                >
                  {item.type === "video" ? (
                    <div className="size-full bg-muted flex flex-col items-center justify-center text-foreground p-1">
                      <Video className="size-5 text-primary" />
                      <span className="text-xs font-bold mt-0.5">MP4</span>
                    </div>
                  ) : (
                    <img
                      src={item.url}
                      alt=""
                      className="size-full object-cover"
                      crossOrigin="anonymous"
                    />
                  )}
                  {item.type === "video" && (
                    <span className="absolute bottom-0.5 end-0.5 bg-black/80 text-xs text-white px-1 rounded font-semibold flex items-center gap-0.5">
                      <Video className="size-2" />
                    </span>
                  )}
                  {isSelected && (
                    <span className="absolute top-0.5 start-0.5 bg-primary text-primary-foreground size-4 rounded-full flex items-center justify-center shadow-xs">
                      <Check className="size-2.5 stroke-[3]" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
