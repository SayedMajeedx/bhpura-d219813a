import { useCallback, useEffect, useMemo, useState } from "react";
import type { Drawable, FormatKey, SceneData } from "@/features/content-studio/engine/scene";
import { paletteFor } from "@/features/content-studio/templates";
import type { StudioStyle } from "@/features/content-studio/lib/studio-styles";
import type { Sale } from "@/features/content-studio/lib/sale-price";
import type { OptionRun } from "@/features/content-studio/lib/option-run";
import type { LogoTint } from "@/features/content-studio/engine/brand-mark";
import type { LookbookEntry } from "@/features/content-studio/lib/lookbook";
import { formatAmount } from "@/features/content-studio/lib/batch";
import { formatDuration } from "@/lib/bookings/format";
import { offerEnds } from "@/lib/offers";
import { displayPhone } from "@/lib/invoice-display";
import { postName } from "@/features/content-studio/lib/post-name";

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
  style,
  photo,
  isCurrentVideo,
  shotUrls,
  logo,
  businessName,
  instagram,
  phone,
  productName,
  productKind = null,
  cta = null,
  headline,
  body,
  showPrice,
  effectivePrice,
  currencySymbol,
  sale,
  saleEndsAt,
  selectedId,
  run,
  collection,
  detail,
  occasion,
  moments,
  logoScale,
  logoTint,
  displayFamilies,
}: {
  format: FormatKey;
  isAr: boolean;
  /** The colour style the template draws in. */
  style: StudioStyle;
  photo: string | null;
  isCurrentVideo: boolean;
  /** The photos a template cuts between (Reel Cut), or empty: loaded only when asked for. */
  shotUrls: readonly string[];
  logo: string | null | undefined;
  businessName: string;
  instagram: string | null;
  phone: string | null | undefined;
  productName: string;
  /** What the piece is ("عباية"), from its catalogue name. */
  productKind?: string | null;
  /** The post's ask ("اطلبوا من الرابط في البايو"). */
  cta?: string | null;
  headline: string;
  body: string;
  showPrice: boolean;
  effectivePrice: number | null;
  currencySymbol: string;
  /** The chosen product's sale, when it has one (the sale price wins over effectivePrice). */
  sale: Sale | null;
  /** When the offer behind `sale` ends (null: it has no end, or the sale is the product's own). */
  saleEndsAt: string | null;
  /** The chosen product: in a lookbook its slide carries the copy the merchant edits. */
  selectedId: string | null;
  /** The product's options for Swatch Run, or null. */
  run: OptionRun | null;
  /** The lookbook's products, or null outside the lookbook. */
  collection: LookbookEntry[] | null;
  /** Detail Zoom's point, label and note, or null outside it. */
  detail: SceneData["detail"];
  /** The Occasion Pack's greeting, or null outside it. */
  occasion: SceneData["occasion"];
  /** Last Chance's day, Back in Stock's shelf, Customer Favourite's rating, Coming Soon's launch (null outside them). */
  moments: Pick<SceneData, "deadline" | "restock" | "rating" | "launch" | "orderSteps" | "making">;
  logoScale: number;
  logoTint: LogoTint;
  /** The store's headline faces, when the merchant uses them (null: the studio's). */
  displayFamilies: { en: string; ar: string } | null;
}) {
  const photoImage = useLoadedImage(isCurrentVideo ? null : photo);
  const logoImage = useLoadedImage(logo);
  const shotImages = useLoadedImages(shotUrls);
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
  const priceAmount = showPrice && selling ? formatAmount(selling) : null;
  const originalAmount = showPrice && sale ? formatAmount(sale.original) : null;
  const saleEnds =
    showPrice && sale ? offerEnds({ ends_at: saleEndsAt }, isAr ? "ar" : "en") : null;

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
        displayFamilies,
        handle: instagram,
        // As a reader takes it in ("+973 3995 0016"), never the stored digits.
        contact: phone ? displayPhone(phone) || null : null,
        palette: paletteFor(style),
      },
      productName,
      productKind,
      cta,
      headline,
      body,
      price: priceAmount ? `${priceAmount} ${currencySymbol}` : null,
      originalPrice: originalAmount ? `${originalAmount} ${currencySymbol}` : null,
      priceAmount,
      originalAmount,
      currencyLabel: currencySymbol,
      issueLabel,
      discountPercent: showPrice && sale ? sale.percent : null,
      saleEnds,
      media: media === undefined ? photoImage : media,
      // The product's photos, while the studio draws its own product (an export's
      // video frames or another product's photo cut between their own details).
      shots:
        media === undefined
          ? shotImages.filter((image): image is HTMLImageElement => Boolean(image))
          : null,
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
            // A sentence's name ("عباية وتر"), never a catalogue line with its divider.
            name: postName(entry.name).label,
            price:
              showPrice && entry.price ? `${formatAmount(entry.price)} ${currencySymbol}` : null,
            media: collectionImages[index] ?? null,
            note: entry.minutes ? formatDuration(entry.minutes, isAr) : null,
            originalPrice:
              showPrice && entry.price && entry.originalPrice
                ? `${formatAmount(entry.originalPrice)} ${currencySymbol}`
                : null,
            // Each piece says its own description; the chosen one carries what the merchant edited.
            body: entry.id === selectedId ? body : entry.body,
          }))
        : null,
      collectionTotal:
        showPrice && collection && collection.every((entry) => entry.price)
          ? `${formatAmount(collection.reduce((sum, entry) => sum + (entry.price ?? 0), 0))} ${currencySymbol}`
          : null,
      detail,
      occasion,
      ...moments,
    }),
    [
      format,
      isAr,
      businessName,
      logoImage,
      logoScale,
      logoTint,
      displayFamilies,
      instagram,
      phone,
      style,
      productName,
      productKind,
      cta,
      headline,
      body,
      priceAmount,
      originalAmount,
      saleEnds,
      selectedId,
      currencySymbol,
      issueLabel,
      showPrice,
      sale,
      photoImage,
      shotImages,
      run,
      stopImages,
      collection,
      collectionImages,
      detail,
      occasion,
      moments,
    ],
  );

  return { buildScene, photoReady: isCurrentVideo || !photo || Boolean(photoImage) };
}
