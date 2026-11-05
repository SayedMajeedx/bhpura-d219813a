import type { Outbox } from "./stored";
import type { Post } from "./types";

/**
 * What a device holds for itself. The store's shared record is the truth (`src/lib/data/post-kit`);
 * this is the outbox, a change not yet in it, so a lost connection or a closed tab loses nothing.
 * It also reads what the kit kept here before there was a shared record (edits in localStorage,
 * photos in IndexedDB), which moves up once and is then cleared. Storage can be refused (a private
 * window): the page goes on.
 */
const outboxKey = (brandId: string) => `post-kit-outbox-${brandId}`;
const oldEditsKey = (brandId: string) => `post-kit-edits-${brandId}`;

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* kept in memory for this visit only */
  }
}

export const readOutbox = (brandId: string): Outbox => readJson<Outbox>(outboxKey(brandId)) ?? {};

export const writeOutbox = (brandId: string, outbox: Outbox) =>
  writeJson(outboxKey(brandId), Object.keys(outbox).length ? outbox : null);

export const readOldEdits = (brandId: string): Record<string, Post> =>
  readJson<Record<string, Post>>(oldEditsKey(brandId)) ?? {};

export const writeOldEdits = (brandId: string, edits: Record<string, Post> | null) =>
  writeJson(oldEditsKey(brandId), edits);

export type OldPhoto = { id: string; name: string; blob: Blob };

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
  return new Promise<T | null>((resolve) => {
    try {
      const request = work(db.transaction("photos", mode).objectStore("photos"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close());
}

export const oldPhotos = async (brandId: string): Promise<OldPhoto[]> =>
  (await run<OldPhoto[]>(brandId, "readonly", (store) => store.getAll())) ?? [];

export const forgetOldPhoto = (brandId: string, id: string) =>
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
