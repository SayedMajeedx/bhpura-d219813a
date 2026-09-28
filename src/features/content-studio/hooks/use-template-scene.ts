import { useCallback, useEffect, useState } from "react";
import type { Drawable, FormatKey, SceneData } from "@/features/content-studio/engine/scene";
import { paletteFor } from "@/features/content-studio/templates";
import type { THEMES } from "@/features/content-studio/lib/studio-content";
import type { Sale } from "@/features/content-studio/lib/sale-price";

/**
 * An image ready to draw on a canvas: loaded with CORS, so exports are not
 * blocked by a tainted canvas. Null while loading or when there is no URL.
 */
export function useLoadedImage(url: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setImage(null);
    if (!url) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (alive) setImage(img);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return image;
}

/**
 * Builds the scene an animated template draws, from the studio's current
 * choices: copy, price, brand, colour style and the product photo.
 */
export function useTemplateScene({
  format,
  isAr,
  theme,
  photo,
  isCurrentVideo,
  logo,
  businessName,
  instagram,
  phone,
  productName,
  headline,
  body,
  showPrice,
  effectivePrice,
  currencySymbol,
  sale,
}: {
  format: FormatKey;
  isAr: boolean;
  theme: keyof typeof THEMES;
  photo: string | null;
  isCurrentVideo: boolean;
  logo: string | null | undefined;
  businessName: string;
  instagram: string | null;
  phone: string | null | undefined;
  productName: string;
  headline: string;
  body: string;
  showPrice: boolean;
  effectivePrice: number | null;
  currencySymbol: string;
  /** The chosen product's sale, when it has one (the sale price wins over effectivePrice). */
  sale: Sale | null;
}) {
  const photoImage = useLoadedImage(isCurrentVideo ? null : photo);
  const logoImage = useLoadedImage(logo);

  const amount = (value: number) => Number(value).toFixed(3);
  const selling = sale?.price ?? effectivePrice;
  const priceAmount = showPrice && selling ? amount(selling) : null;
  const originalAmount = showPrice && sale ? amount(sale.original) : null;

  const buildScene = useCallback(
    (width: number, height: number, media?: Drawable | null): SceneData => ({
      width,
      height,
      format,
      lang: isAr ? "ar" : "en",
      brand: {
        name: businessName,
        logo: logoImage,
        handle: instagram,
        contact: phone || null,
        palette: paletteFor(theme),
      },
      productName,
      headline,
      body,
      price: priceAmount ? `${priceAmount} ${currencySymbol}` : null,
      originalPrice: originalAmount ? `${originalAmount} ${currencySymbol}` : null,
      priceAmount,
      originalAmount,
      currencyLabel: currencySymbol,
      discountPercent: showPrice && sale ? sale.percent : null,
      media: media === undefined ? photoImage : media,
    }),
    [
      format,
      isAr,
      businessName,
      logoImage,
      instagram,
      phone,
      theme,
      productName,
      headline,
      body,
      priceAmount,
      originalAmount,
      currencySymbol,
      showPrice,
      sale,
      photoImage,
    ],
  );

  return { buildScene, photoReady: isCurrentVideo || !photo || Boolean(photoImage) };
}
