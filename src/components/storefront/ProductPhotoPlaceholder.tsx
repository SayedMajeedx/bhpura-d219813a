import { useStorefront } from "@/lib/storefront-context";
import { storeInitials } from "@/lib/product-photo";
import { cn } from "@/lib/utils";

/**
 * What a product with no photo shows in its frame: the store's initials in its heading font. It
 * once read "No image", which tells a shopper the store forgot something. Not the logo: a logo is
 * drawn for the header's colour (Pura's is cream), and faded on grey it disappears.
 */
export function ProductPhotoPlaceholder({ className }: { className?: string }) {
  const { brand, lang } = useStorefront();
  const name = lang === "ar" ? brand.name_ar || brand.name_en : brand.name_en || brand.name_ar;
  return (
    <div
      aria-hidden="true"
      data-testid="product-photo-placeholder"
      className={cn("grid h-full w-full place-items-center bg-muted", className)}
    >
      <span className="font-display text-2xl text-muted-foreground">{storeInitials(name)}</span>
    </div>
  );
}
