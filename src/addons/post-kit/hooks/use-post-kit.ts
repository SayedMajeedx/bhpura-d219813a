import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import { useStoreCurrency } from "@/hooks/use-store-currency";
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
import {
  forgetPhoto,
  keepPhoto,
  loadImage,
  readEdits,
  savedPhotos,
  shrinkPhoto,
  writeEdits,
} from "../lib/saved";
import { withoutPhoto } from "../lib/post-rules";
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
      ...['600 40px "Marhey"', '700 40px "Marhey"', '700 60px "Aref Ruqaa"'].map((face) =>
        document.fonts.load(face, "عربي").catch(() => []),
      ),
    ]),
  );
  await Promise.race([faces, new Promise((resolve) => setTimeout(resolve, 5000))]);
}

/** Everything the page reads: the catalogue's photos, the merchant's own, and the edited posts. */
export function usePostKit() {
  const brand = useBrand();
  const brandId = brand.id;
  const currency = useStoreCurrency(brandId);
  const productsQ = useQuery(catalogInsightQueries.contentStudio(brandId));
  const variantsQ = useQuery(catalogQueries.variants(brandId));

  const catalogue: Catalogue | null = useMemo(() => {
    if (!productsQ.data || !variantsQ.data) return null;
    return catalogueFrom(
      productsQ.data as unknown as KitProduct[],
      variantsQ.data as unknown as KitVariant[],
      currency,
    );
  }, [productsQ.data, variantsQ.data, currency]);

  const [photos, setPhotos] = useState<PhotoBook>({});
  const [ready, setReady] = useState(false);
  const [edits, setEdits] = useState<Record<string, Post>>({});
  const urls = useRef<string[]>([]);

  useEffect(() => {
    setEdits(readEdits(brandId));
  }, [brandId]);

  useEffect(() => {
    if (!catalogue) return;
    let alive = true;
    void (async () => {
      const [, loaded, own] = await Promise.all([
        loadKitFonts(),
        Promise.all(
          Object.entries(catalogue.photos).map(async ([key, photo]) => {
            const img = await loadImage(photo.url ?? "").catch(() => undefined);
            return [key, { ...photo, img }] as const;
          }),
        ),
        savedPhotos(brandId),
      ]);
      const book: PhotoBook = Object.fromEntries(loaded);
      await Promise.all(
        own.map(async (saved) => {
          const url = URL.createObjectURL(saved.blob);
          urls.current.push(url);
          const img = await loadImage(url).catch(() => undefined);
          if (img) book[`upload-${saved.id}`] = { label: saved.name, img, upload: true };
        }),
      );
      if (!alive) return;
      setPhotos(book);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [catalogue, brandId]);

  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const originals = useMemo(() => {
    const empty: Catalogue = { photos: {}, prices: {}, from: null };
    return Object.fromEntries(POSTS.map((post) => [post.key, livePost(post, catalogue ?? empty)]));
  }, [catalogue]);

  const currentOf = useCallback(
    (key: string): Post => edits[key] ?? originals[key],
    [edits, originals],
  );

  const saveEdit = useCallback(
    (post: Post) => {
      setEdits((prev) => {
        const next = { ...prev };
        if (JSON.stringify(post) === JSON.stringify(originals[post.key])) delete next[post.key];
        else next[post.key] = post;
        writeEdits(brandId, next);
        return next;
      });
    },
    [brandId, originals],
  );

  const resetEdit = useCallback(
    (key: string) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[key];
        writeEdits(brandId, next);
        return next;
      });
    },
    [brandId],
  );

  /** Keeps the files on this device. The answer says which went in and whether they will last. */
  const addUploads = useCallback(
    async (files: File[]) => {
      const added: string[] = [];
      let failed = 0;
      let lasting = true;
      for (const file of files.slice(0, 12)) {
        const blob = await shrinkPhoto(file).catch(() => null);
        if (!blob) {
          failed += 1;
          continue;
        }
        const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, 22) || "صورتي";
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        const img = await loadImage(url).catch(() => undefined);
        if (!img) {
          failed += 1;
          continue;
        }
        if (!(await keepPhoto(brandId, { id, name, blob }))) lasting = false;
        const key = `upload-${id}`;
        setPhotos((prev) => ({ ...prev, [key]: { label: name, img, upload: true } }));
        added.push(key);
      }
      return { added, failed, lasting };
    },
    [brandId],
  );

  const removeUpload = useCallback(
    (key: string) => {
      void forgetPhoto(brandId, key.replace("upload-", ""));
      const fallback = Object.keys(photos).find((k) => k !== key) ?? "";
      setPhotos((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setEdits((prev) => {
        const next: Record<string, Post> = {};
        for (const [postKey, post] of Object.entries(prev)) {
          next[postKey] = withoutPhoto(post, key, fallback);
        }
        writeEdits(brandId, next);
        return next;
      });
      return fallback;
    },
    [brandId, photos],
  );

  return {
    brand,
    ready,
    failed: productsQ.isError || variantsQ.isError,
    photos,
    edits,
    currentOf,
    saveEdit,
    resetEdit,
    addUploads,
    removeUpload,
  };
}

export type PostKit = ReturnType<typeof usePostKit>;
