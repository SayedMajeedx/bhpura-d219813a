import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
import { businessSettingsQueries } from "@/lib/data/business-settings";
import { displayPhone } from "@/lib/invoice-display";
import { catalogInsightQueries, catalogQueries } from "@/lib/data/catalog";
import { loadStudioFonts } from "@/features/content-studio/engine/fonts";
import { POSTS } from "../content/posts";
import {
  catalogueFrom,
  livePost,
  type Catalogue,
  type KitProduct,
  type KitVariant,
} from "../lib/photos";
import { loadImage } from "../lib/saved";
import { useKitStore } from "./use-kit-store";
import type { PhotoBook, Post } from "../lib/types";

const KIT_FONTS =
  "https://fonts.googleapis.com/css2?family=Marhey:wght@500;600;700&family=Aref+Ruqaa:wght@700&display=swap";

/** A canvas does not wait for web fonts, so nothing is drawn until the kit's faces arrive. */
async function loadKitFonts() {
  const sheet = new Promise<void>((resolve) => {
    if (document.querySelector(`link[href="${KIT_FONTS}"]`)) return resolve();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = KIT_FONTS;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  const faces = sheet.then(() =>
    Promise.all([
      loadStudioFonts(),
      ...[
        '600 40px "Marhey"',
        '700 40px "Marhey"',
        '700 60px "Aref Ruqaa"',
        '200 60px "29LT Azer"',
      ].map((face) => document.fonts.load(face, "عربي").catch(() => [])),
    ]),
  );
  await Promise.race([faces, new Promise((resolve) => setTimeout(resolve, 5000))]);
}

/** Everything the page reads: the catalogue's photos, and what the store keeps of its own. */
export function usePostKit() {
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const productsQ = useQuery(catalogInsightQueries.contentStudio(brandId));
  const variantsQ = useQuery(catalogQueries.variants(brandId));
  const settingsQ = useQuery(businessSettingsQueries.detail(brandId));
  // A post says the store's written making time. While it is being read a post says none, not a guess.
  const making = (
    settingsQ.data as { delivery_estimate_tailored_ar?: string | null } | null | undefined
  )?.delivery_estimate_tailored_ar;

  // The number printed on a label is the store's own, as its settings say today.
  const contact = settingsQ.data as
    { phone?: string | null; whatsapp_number?: string | null } | null | undefined;
  const phone = displayPhone(contact?.phone || contact?.whatsapp_number);

  const catalogue: Catalogue | null = useMemo(() => {
    if (!productsQ.data || !variantsQ.data) return null;
    return catalogueFrom(
      productsQ.data as unknown as KitProduct[],
      variantsQ.data as unknown as KitVariant[],
      currency,
      making,
    );
  }, [productsQ.data, variantsQ.data, currency, making]);

  const store = useKitStore(brandId, catalogue);
  const [pieces, setPieces] = useState<PhotoBook | null>(null);

  useEffect(() => {
    if (!catalogue) return;
    let alive = true;
    void (async () => {
      const [, loaded] = await Promise.all([
        loadKitFonts(),
        Promise.all(
          Object.entries(catalogue.photos).map(async ([key, photo]) => {
            const img = await loadImage(photo.url ?? "").catch(() => undefined);
            return [key, { ...photo, img }] as const;
          }),
        ),
      ]);
      if (alive) setPieces(Object.fromEntries(loaded));
    })();
    return () => {
      alive = false;
    };
  }, [catalogue]);

  const photos: PhotoBook = useMemo(
    () => ({ ...pieces, ...store.ownPhotos }),
    [pieces, store.ownPhotos],
  );

  const originals = useMemo(() => {
    const empty: Catalogue = { photos: {}, prices: {}, from: null };
    return Object.fromEntries(POSTS.map((post) => [post.key, livePost(post, catalogue ?? empty)]));
  }, [catalogue]);

  const { edits, removeUpload: removeFromStore } = store;
  const currentOf = useCallback(
    (key: string): Post => edits[key] ?? originals[key],
    [edits, originals],
  );

  const removeUpload = useCallback(
    (key: string) => removeFromStore(key, Object.keys(photos).find((k) => k !== key) ?? ""),
    [photos, removeFromStore],
  );

  return {
    brand,
    phone,
    ready: Boolean(pieces) && store.loaded,
    failed:
      (productsQ.isError && !productsQ.data) ||
      (variantsQ.isError && !variantsQ.data) ||
      store.failed,
    photos,
    edits,
    ownKeys: store.ownKeys,
    currentOf,
    catalogue,
    saveEdit: store.saveEdit,
    resetEdit: store.resetEdit,
    createPost: store.createPost,
    copyPost: store.copyPost,
    calendar: store.calendar,
    saveCalendar: store.saveCalendar,
    cup: store.cup,
    saveCup: store.saveCup,
    saveState: store.saveState,
    retrySave: store.retrySave,
    addUploads: store.addUploads,
    removeUpload,
  };
}

export type PostKit = ReturnType<typeof usePostKit>;
