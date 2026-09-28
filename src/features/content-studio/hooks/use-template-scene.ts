import { useCallback, useEffect, useMemo, useState } from "react";
import type { Drawable, FormatKey, SceneData } from "@/features/content-studio/engine/scene";
import { paletteFor } from "@/features/content-studio/templates";
import type { THEMES } from "@/features/content-studio/lib/studio-content";
import type { Sale } from "@/features/content-studio/lib/sale-price";
import type { OptionRun } from "@/features/content-studio/lib/option-run";
import type { LogoTint } from "@/features/content-studio/engine/brand-mark";
import type { LookbookEntry } from "@/features/content-studio/lib/lookbook";

/** A price amount as the studio prints it ("42.000"). */
const amount = (value: number) => Number(value).toFixed(3);

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

/** Several images at once (see useLoadedImage), in the order of `urls`. */
export function useLoadedImages(urls: readonly (string | null)[]) {
  const key = JSON.stringify(urls);
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  useEffect(() => {
    let alive = true;
    const wanted = (JSON.parse(key) as Array<string | null>).filter((url): url is string =>
      Boolean(url),
    );
    for (const url of wanted) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        if (alive) setImages((loaded) => ({ ...loaded, [url]: img }));
      };
      img.src = url;
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => urls.map((url) => (url ? (images[url] ?? null) : null)), [urls, images]);
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
  run,
  collection,
  logoScale,
  logoTint,
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
  /** The product's options for Swatch Run, or null. */
  run: OptionRun | null;
  /** The lookbook's products, or null outside the lookbook. */
  collection: LookbookEntry[] | null;
  logoScale: number;
  logoTint: LogoTint;
}) {
  const photoImage = useLoadedImage(isCurrentVideo ? null : photo);
  const logoImage = useLoadedImage(logo);
  const stopUrls = useMemo(() => (run ? run.stops.map((stop) => stop.imageUrl) : []), [run]);
  const stopImages = useLoadedImages(stopUrls);
  const collectionUrls = useMemo(
    () => (collection ? collection.map((entry) => entry.imageUrl) : []),
    [collection],
  );
  const collectionImages = useLoadedImages(collectionUrls);

  // This month, as a magazine would print its issue.
  const issueLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(isAr ? "ar-u-nu-latn" : "en-GB", {
        month: "long",
        year: "numeric",
      }).format(new Date()),
    [isAr],
  );
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
        logoScale,
        logoTint,
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
      issueLabel,
      discountPercent: showPrice && sale ? sale.percent : null,
      media: media === undefined ? photoImage : media,
      options: run
        ? {
            axisLabel: run.axisLabel,
            swatch: run.swatch,
            stops: run.stops.map((stop, index) => ({
              label: stop.label,
              color: stop.color,
              media: stopImages[index] ?? photoImage,
            })),
          }
        : null,
      collection: collection
        ? collection.map((entry, index) => ({
            name: entry.name,
            price: showPrice && entry.price ? `${amount(entry.price)} ${currencySymbol}` : null,
            media: collectionImages[index] ?? null,
          }))
        : null,
    }),
    [
      format,
      isAr,
      businessName,
      logoImage,
      logoScale,
      logoTint,
      instagram,
      phone,
      theme,
      productName,
      headline,
      body,
      priceAmount,
      originalAmount,
      currencySymbol,
      issueLabel,
      showPrice,
      sale,
      photoImage,
      run,
      stopImages,
      collection,
      collectionImages,
    ],
  );

  return { buildScene, photoReady: isCurrentVideo || !photo || Boolean(photoImage) };
}
