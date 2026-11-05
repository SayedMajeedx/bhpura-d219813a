import type { Post } from "./types";

/**
 * What stays on this device until the shared store comes: edited posts in localStorage and the
 * merchant's own photos in IndexedDB. Either can be refused (a private window): the page goes on.
 */
const editsKey = (brandId: string) => `post-kit-edits-${brandId}`;

export function readEdits(brandId: string): Record<string, Post> {
  try {
    return JSON.parse(localStorage.getItem(editsKey(brandId)) ?? "{}") as Record<string, Post>;
  } catch {
    return {};
  }
}

export function writeEdits(brandId: string, edits: Record<string, Post>) {
  try {
    localStorage.setItem(editsKey(brandId), JSON.stringify(edits));
  } catch {
    /* kept for this visit only */
  }
}

export type SavedPhoto = { id: string; name: string; blob: Blob };

function openPhotos(brandId: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(`post-kit-photos-${brandId}`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  brandId: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openPhotos(brandId);
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = work(db.transaction("photos", mode).objectStore("photos"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export const savedPhotos = async (brandId: string): Promise<SavedPhoto[]> =>
  (await run<SavedPhoto[]>(brandId, "readonly", (store) => store.getAll())) ?? [];

/** Whether the photo was kept, so the page can say when it will not survive a reload. */
export const keepPhoto = async (brandId: string, photo: SavedPhoto): Promise<boolean> =>
  (await run(brandId, "readwrite", (store) => store.put(photo))) !== null;

export const forgetPhoto = (brandId: string, id: string) =>
  run(brandId, "readwrite", (store) => store.delete(id));

/** A phone's photo can be 12 megapixels: keep what a 1080 post can show. */
export async function shrinkPhoto(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A picture a canvas may export: `crossOrigin` first, as the media host serves CORS. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (/^https?:/.test(src)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("IMAGE_FAILED"));
    img.src = src;
  });
}
