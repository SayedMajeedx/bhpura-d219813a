import { useLayoutEffect, useState, type RefObject } from "react";
import { PREVIEW_BASE_WIDTH } from "@/features/content-studio/lib/studio-content";

/**
 * How much to shrink the fixed-width stage to fit the space on screen.
 */
export function usePreviewScale(stageViewportRef: RefObject<HTMLDivElement | null>) {
  // Scales the fixed-width (PREVIEW_BASE_WIDTH) stage down to fit whatever
  // width is actually available — capped at 1 so nothing changes on desktop,
  // where the viewport is already >= PREVIEW_BASE_WIDTH. This is purely a
  // display transform: it never touches offsetWidth/offsetHeight, so the
  // html2canvas export scale math below is unaffected.
  const [previewScale, setPreviewScale] = useState(1);

  // Keeps the mobile preview a scaled-down copy of the desktop one instead of
  // a re-flowed, disproportionate one: the stage always lays out at a fixed
  // PREVIEW_BASE_WIDTH, and this only ever shrinks it (never grows past 1) to
  // fit the space actually available on screen.
  useLayoutEffect(() => {
    const viewportEl = stageViewportRef.current;
    if (!viewportEl || typeof ResizeObserver === "undefined") return;

    const updateScale = () => {
      const availableWidth = viewportEl.offsetWidth;
      if (availableWidth > 0) {
        setPreviewScale(Math.min(1, availableWidth / PREVIEW_BASE_WIDTH));
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [stageViewportRef]);

  return {
    previewScale,
  };
}
