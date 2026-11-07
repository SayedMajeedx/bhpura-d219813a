import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { useI18n } from "@/lib/i18n";
import {
  addPostKitPhoto,
  deletePostKitEdits,
  deletePostKitPhoto,
  postKitKeys,
  postKitQueries,
  savePostKitEdits,
  type PostKitEditRow,
  type PostKitPhotoRow,
} from "@/lib/data/post-kit";
import { deletePublicMediaUrl, uploadPublicMedia } from "@/lib/r2-upload";
import { POSTS } from "../content/posts";
import type { Catalogue } from "../lib/photos";
import { CALENDAR_KEY, readCalendar, type CalendarState } from "../lib/calendar";
import { copyOf, isOwnPost, newestFirst, ownPostKey, ownTemplate } from "../lib/own-posts";
import { withoutPhoto } from "../lib/post-rules";
import {
  forgetOldPhoto,
  loadImage,
  oldPhotos,
  readOldEdits,
  readOutbox,
  shrinkPhoto,
  writeOldEdits,
  writeOutbox,
} from "../lib/saved";
import { fromStored, settleOutbox, toStored, withRenamedPhotos, type Outbox } from "../lib/stored";
import type { PhotoBook, Post } from "../lib/types";

export type SaveState = "idle" | "saving" | "saved" | "failed";

const TEMPLATE = Object.fromEntries(POSTS.map((post) => [post.key, post]));
const SAVE_AFTER_MS = 800;
const uploadKey = (id: string) => `upload-${id}`;
/** The post a stored row is read over: as it shipped, or a store's own post's blank. */
const baseOf = (key: string): Post | undefined =>
  TEMPLATE[key] ?? (isOwnPost(key) ? ownTemplate(key) : undefined);

/** A row of the shared record as `Json`, and back again: a post is plain data all the way. */
const asJson = (post: Post) => JSON.parse(JSON.stringify(post)) as Json;

/**
 * Sends a photo to the store's media folder and records it. A photo whose row could not be written
 * takes its file back with it, so nothing is left that no screen can reach.
 */
async function storePhoto(brandId: string, blob: Blob, name: string) {
  const url = await uploadPublicMedia(brandId, blob, "post");
  try {
    return await addPostKitPhoto(brandId, { name, url });
  } catch (error) {
    await deletePublicMediaUrl(brandId, url).catch(() => undefined);
    throw error;
  }
}

/**
 * The kit's memory: the store's edited posts and own photos, in its shared record. A change goes
 * to this device's outbox at once and up to the record soon after, so the page never waits on the
 * network and a lost connection loses nothing. When two devices change one post, the later save
 * wins.
 */
export function useKitStore(brandId: string, catalogue: Catalogue | null) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const editsQ = useQuery(postKitQueries.edits(brandId));
  const photosQ = useQuery(postKitQueries.photos(brandId));
  const serverEdits = editsQ.data;
  const photoRows = photosQ.data;

  const [outbox, setOutboxState] = useState<Outbox>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const outboxRef = useRef<Outbox>({});
  const catalogueRef = useRef(catalogue);
  catalogueRef.current = catalogue;
  const flushing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOutbox = useCallback(
    (next: Outbox) => {
      outboxRef.current = next;
      setOutboxState(next);
      writeOutbox(brandId, next);
    },
    [brandId],
  );

  /** Sends what is waiting, until nothing is. A change made meanwhile goes on the next round. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (flushing.current || !Object.keys(outboxRef.current).length) return;
    flushing.current = true;
    setSaveState("saving");
    const editsKey = postKitKeys.edits(brandId);
    try {
      while (Object.keys(outboxRef.current).length) {
        const entries = Object.entries(outboxRef.current);
        const toSave = entries.flatMap(([post_key, entry]) =>
          entry.post ? [{ post_key, post: asJson(entry.post) }] : [],
        );
        const rows = qc.getQueryData<PostKitEditRow[]>(editsKey) ?? [];
        const known = new Set(rows.map((row) => row.post_key));
        const toDelete = entries.flatMap(([key, entry]) =>
          !entry.post && known.has(key) ? [key] : [],
        );
        const saved = await savePostKitEdits(brandId, toSave);
        const deleted = await deletePostKitEdits(brandId, toDelete);
        // A refused delete is not an error from the API, only nothing deleted: never call it saved.
        if (deleted.length < toDelete.length) throw new Error("POST_KIT_DELETE_REFUSED");

        const gone = new Set(deleted);
        const savedKeys = new Set(saved.map((row) => row.post_key));
        qc.setQueryData<PostKitEditRow[]>(editsKey, (old) => [
          ...(old ?? []).filter((row) => !gone.has(row.post_key) && !savedKeys.has(row.post_key)),
          ...saved,
        ]);
        const left = { ...outboxRef.current };
        for (const [key, entry] of entries) {
          if (left[key] === entry) delete left[key];
        }
        setOutbox(left);
      }
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    } finally {
      flushing.current = false;
      // A read that began before the write must not put the old post back on screen.
      void qc.invalidateQueries({ queryKey: editsKey });
    }
  }, [brandId, qc, setOutbox]);

  const enqueue = useCallback(
    (change: Outbox) => {
      setOutbox({ ...outboxRef.current, ...change });
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush, setOutbox],
  );

  // Leaving sends what is waiting; whatever cannot get out stays in the outbox for next time.
  useEffect(() => {
    const leaving = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", leaving);
    return () => {
      document.removeEventListener("visibilitychange", leaving);
      void flush();
    };
  }, [flush]);

  // On opening: what this device kept before the shared record moves up, photos first because the
  // edits name them; then whatever an earlier visit could not send. Once per store, per visit.
  const opened = useRef<string | null>(null);
  const canOpen = Boolean(serverEdits) && Boolean(catalogue);
  useEffect(() => {
    const prices = catalogueRef.current;
    if (!canOpen || !prices || opened.current === brandId) return;
    opened.current = brandId;
    void (async () => {
      let oldEdits = readOldEdits(brandId);
      const waiting = await oldPhotos(brandId);
      let moved = 0;
      let stuck = 0;
      for (const photo of waiting) {
        try {
          const row = await storePhoto(brandId, photo.blob, photo.name.trim() || "صورتي");
          qc.setQueryData<PostKitPhotoRow[]>(postKitKeys.photos(brandId), (rows) => [
            ...(rows ?? []),
            row,
          ]);
          const renames = { [uploadKey(photo.id)]: uploadKey(row.id) };
          oldEdits = Object.fromEntries(
            Object.entries(oldEdits).map(([key, post]) => [key, withRenamedPhotos(post, renames)]),
          );
          // Written before the photo is forgotten: a crash here must not lose which is which.
          writeOldEdits(brandId, oldEdits);
          await forgetOldPhoto(brandId, photo.id);
          moved += 1;
        } catch {
          stuck += 1;
        }
      }
      const fresh: Outbox = {};
      // Edits wait while a photo they may name is still here, and go up with it on a later visit.
      if (!stuck) {
        for (const [key, post] of Object.entries(oldEdits)) {
          const template = TEMPLATE[key];
          if (template) fresh[key] = { post: toStored(post, template, prices), at: 0 };
        }
      }
      const { kept, dropped } = settleOutbox(
        { ...fresh, ...readOutbox(brandId) },
        qc.getQueryData<PostKitEditRow[]>(postKitKeys.edits(brandId)) ?? [],
      );
      setOutbox({ ...kept, ...outboxRef.current });
      if (!stuck) writeOldEdits(brandId, null);
      void flush();
      if (moved || Object.keys(fresh).some((key) => kept[key])) {
        toast.success(
          isAr
            ? "صوركم وتعديلاتكم من هالجهاز صارت في المتجر"
            : "Your photos and edits from this device are now in the store",
        );
      }
      if (stuck) {
        toast.error(
          isAr
            ? "بعض صور هالجهاز ما انرفعت، بنحاول مرة ثانية لما تفتح الصفحة"
            : "Some photos on this device did not upload. We will try again next time.",
        );
      }
      if (dropped) {
        toast(
          isAr
            ? "تعديل قديم في هالجهاز ما انحفظ، لأن البوست تعدل بعده من جهاز ثاني"
            : "An older edit on this device was not saved, as the post changed elsewhere since.",
        );
      }
    })();
  }, [canOpen, brandId, flush, isAr, qc, setOutbox]);

  /** What the shared record says, with this device's waiting changes over it. */
  const edits = useMemo(() => {
    const book: Record<string, Post> = {};
    if (!catalogue) return book;
    for (const row of serverEdits ?? []) {
      const template = baseOf(row.post_key);
      const post = template && fromStored(row.post, template, catalogue);
      if (post) book[row.post_key] = post;
    }
    for (const [key, entry] of Object.entries(outbox)) {
      const template = baseOf(key);
      if (!template) continue;
      const post = entry.post && fromStored(entry.post, template, catalogue);
      if (post) book[key] = post;
      else delete book[key];
    }
    return book;
  }, [serverEdits, outbox, catalogue]);

  /**
   * The store's own posts as they are kept, tokens and all. To an own post this is what a ready post's
   * template is: what it reads back to, so a price it did not touch stays live.
   */
  const ownStored = useMemo(() => {
    const book: Record<string, Post> = {};
    for (const row of serverEdits ?? []) {
      if (isOwnPost(row.post_key)) book[row.post_key] = row.post as unknown as Post;
    }
    for (const [key, entry] of Object.entries(outbox)) {
      if (!isOwnPost(key)) continue;
      if (entry.post) book[key] = entry.post;
      else delete book[key];
    }
    return book;
  }, [serverEdits, outbox]);
  const ownStoredRef = useRef(ownStored);
  ownStoredRef.current = ownStored;

  /** The posting calendar: one row of the record, kept and sent like any change to a post. */
  const calendar = useMemo(() => {
    const row = (serverEdits ?? []).find((edit) => edit.post_key === CALENDAR_KEY);
    return readCalendar(outbox[CALENDAR_KEY]?.post ?? row?.post);
  }, [serverEdits, outbox]);

  const saveCalendar = useCallback(
    (next: CalendarState) =>
      enqueue({ [CALENDAR_KEY]: { post: next as unknown as Post, at: Date.now() } }),
    [enqueue],
  );

  const ownKeys = useMemo(() => newestFirst(Object.keys(edits).filter(isOwnPost)), [edits]);

  const saveEdit = useCallback(
    (post: Post) => {
      const prices = catalogueRef.current;
      if (!prices) return;
      if (isOwnPost(post.key)) {
        const base = ownStoredRef.current[post.key] ?? ownTemplate(post.key);
        enqueue({ [post.key]: { post: toStored(post, base, prices), at: Date.now() } });
        return;
      }
      const template = TEMPLATE[post.key];
      if (!template) return;
      const stored = toStored(post, template, prices);
      const untouched = JSON.stringify(stored) === JSON.stringify(template);
      enqueue({ [post.key]: { post: untouched ? null : stored, at: Date.now() } });
    },
    [enqueue],
  );

  /** Takes a ready post back to how it came; an own post has nothing to go back to, so it goes. */
  const resetEdit = useCallback(
    (key: string) => enqueue({ [key]: { post: null, at: Date.now() } }),
    [enqueue],
  );

  /** A new post of the store's own. Its key is its place in the record, and the answer. */
  const createPost = useCallback(
    (post: Post) => {
      enqueue({ [post.key]: { post, at: Date.now() } });
      return post.key;
    },
    [enqueue],
  );

  /** A copy of a post as it stands now, its untouched prices still live. */
  const copyPost = useCallback(
    (post: Post) => {
      const prices = catalogueRef.current;
      if (!prices) return null;
      const base = isOwnPost(post.key)
        ? (ownStoredRef.current[post.key] ?? ownTemplate(post.key))
        : TEMPLATE[post.key];
      if (!base) return null;
      return createPost(copyOf(toStored(post, base, prices), ownPostKey()));
    },
    [createPost],
  );

  // The merchant's own photos, each loaded once, however often the list is read again.
  const [ownPhotos, setOwnPhotos] = useState<PhotoBook | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (!photoRows) return;
    let alive = true;
    void (async () => {
      await Promise.all(
        photoRows.map(async (row) => {
          if (images.current.has(row.id)) return;
          const img = await loadImage(row.url).catch(() => undefined);
          if (img) images.current.set(row.id, img);
        }),
      );
      if (!alive) return;
      const book: PhotoBook = {};
      for (const row of photoRows) {
        book[uploadKey(row.id)] = {
          label: row.name,
          url: row.url,
          img: images.current.get(row.id),
          upload: true,
        };
      }
      setOwnPhotos(book);
    })();
    return () => {
      alive = false;
    };
  }, [photoRows]);

  /** Sends the files to the store. The answer says which went in and how many did not. */
  const addUploads = useCallback(
    async (files: File[]) => {
      const added: string[] = [];
      let failed = 0;
      for (const file of files.slice(0, 12)) {
        try {
          const blob = await shrinkPhoto(file);
          if (!blob) throw new Error("IMAGE_FAILED");
          const name =
            file.name
              .replace(/\.[^.]+$/, "")
              .trim()
              .slice(0, 22) || "صورتي";
          const row = await storePhoto(brandId, blob, name);
          const img = await loadImage(row.url);
          images.current.set(row.id, img);
          qc.setQueryData<PostKitPhotoRow[]>(postKitKeys.photos(brandId), (rows) => [
            ...(rows ?? []),
            row,
          ]);
          added.push(uploadKey(row.id));
        } catch {
          failed += 1;
        }
      }
      return { added, failed };
    },
    [brandId, qc],
  );

  /** Takes a photo out of the store: posts using it fall back first. Null when it stayed. */
  const removeUpload = useCallback(
    async (key: string, fallback: string): Promise<{ fallback: string } | null> => {
      const id = key.replace("upload-", "");
      const row = (photoRows ?? []).find((photo) => photo.id === id);
      const went = await deletePostKitPhoto(brandId, id).catch(() => false);
      if (!went) return null;
      qc.setQueryData<PostKitPhotoRow[]>(postKitKeys.photos(brandId), (rows) =>
        (rows ?? []).filter((photo) => photo.id !== id),
      );
      if (row) await deletePublicMediaUrl(brandId, row.url).catch(() => undefined);
      const current = catalogueRef.current;
      if (current) {
        const change: Outbox = {};
        for (const [postKey, post] of Object.entries(edits)) {
          const next = withoutPhoto(post, key, fallback);
          if (JSON.stringify(next) === JSON.stringify(post)) continue;
          const base = TEMPLATE[postKey] ?? ownStoredRef.current[postKey] ?? baseOf(postKey);
          if (!base) continue;
          change[postKey] = { post: toStored(next, base, current), at: Date.now() };
        }
        if (Object.keys(change).length) enqueue(change);
      }
      return { fallback };
    },
    [brandId, edits, enqueue, photoRows, qc],
  );

  return {
    loaded: Boolean(serverEdits) && Boolean(ownPhotos),
    // A later read that fails leaves what is on screen alone: only a first read can stop the page.
    failed: (editsQ.isError && !serverEdits) || (photosQ.isError && !photoRows),
    edits,
    ownKeys,
    ownPhotos: ownPhotos ?? {},
    saveState,
    saveEdit,
    resetEdit,
    createPost,
    copyPost,
    calendar,
    saveCalendar,
    retrySave: flush,
    addUploads,
    removeUpload,
  };
}
