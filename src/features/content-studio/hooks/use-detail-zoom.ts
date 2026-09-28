import { useMemo, useState } from "react";
import { DEFAULT_DETAIL_POINT } from "@/features/content-studio/templates/detail-zoom";
import type { Product } from "@/features/content-studio/lib/studio-content";
import type { SceneData } from "@/features/content-studio/engine/scene";

type Point = { x: number; y: number };

/**
 * Detail Zoom's subject: the point the merchant taps on the photo (kept per
 * photo, so a new photo starts at the default), and the label and note, which
 * start as the product's fabric and occasion until the merchant edits them.
 */
export function useDetailZoom({
  active,
  selected,
  mediaUrl,
}: {
  active: boolean;
  selected: Product | undefined;
  mediaUrl: string | null;
}) {
  // Each choice remembers what it belongs to, so it resets with no effect when that changes.
  const [pointFor, setPointFor] = useState<{ url: string | null; point: Point } | null>(null);
  const [labelFor, setLabelFor] = useState<{ id: string; text: string } | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; text: string } | null>(null);
  const productId = selected?.id ?? "";

  const detailPoint = pointFor?.url === mediaUrl ? pointFor.point : DEFAULT_DETAIL_POINT;
  const detailLabel =
    labelFor?.id === productId ? labelFor.text : (selected?.fabric_type ?? "").trim();
  const detailNote = noteFor?.id === productId ? noteFor.text : (selected?.occasion ?? "").trim();

  const detail = useMemo<SceneData["detail"]>(
    () => (active ? { ...detailPoint, label: detailLabel, note: detailNote } : null),
    [active, detailPoint, detailLabel, detailNote],
  );

  /** Puts a draft's detail back, for the photo and product the draft opens on. */
  const restoreDetail = (
    saved: { x: number; y: number; label: string; note: string },
    keys: { mediaUrl: string | null; productId: string },
  ) => {
    setPointFor({ url: keys.mediaUrl, point: { x: saved.x, y: saved.y } });
    setLabelFor({ id: keys.productId, text: saved.label });
    setNoteFor({ id: keys.productId, text: saved.note });
  };

  return {
    detail,
    restoreDetail,
    detailPoint,
    setDetailPoint: (point: Point) =>
      setPointFor({
        url: mediaUrl,
        point: {
          x: Math.min(1, Math.max(0, point.x)),
          y: Math.min(1, Math.max(0, point.y)),
        },
      }),
    detailLabel,
    setDetailLabel: (text: string) => setLabelFor({ id: productId, text }),
    detailNote,
    setDetailNote: (text: string) => setNoteFor({ id: productId, text }),
  };
}
