import { useState, type RefObject } from "react";

/**
 * The logo bar's layout on the stage: its position (draggable), size, plate
 * and badge, and a reset.
 */
export function useHeaderLayout({
  exporting,
  stageRef,
}: {
  exporting: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const [headerScale, setHeaderScale] = useState(1.0);
  const [headerLogoHeight, setHeaderLogoHeight] = useState(48);
  const [headerPosY, setHeaderPosY] = useState(4.5);
  const [, setHeaderPosX] = useState(0);
  const [headerPlateStyle, setHeaderPlateStyle] = useState<"none" | "glass" | "solid">("none");
  const [headerPlateColor, setHeaderPlateColor] = useState("rgba(0, 0, 0, 0.48)");
  const [headerTextColor, setHeaderTextColor] = useState<"white" | "dark">("white");
  const [headerBadgeText, setHeaderBadgeText] = useState("Bahrain");
  const [headerShowBadge, setHeaderShowBadge] = useState(true);
  const [isDraggingHeader, setIsDraggingHeader] = useState(false);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (exporting) return;
    e.preventDefault();
    setIsDraggingHeader(true);
    const startY = e.clientY;
    const startPosY = headerPosY;
    const stageEl = stageRef.current;
    // getBoundingClientRect (not offsetHeight) so dragging feels the same at
    // any preview size: it reflects the stage's actual visible/scaled
    // height, matching the real screen pixels the pointer is moving across.
    const stageHeight = stageEl ? stageEl.getBoundingClientRect().height : 1;

    const onPointerMove = (moveEv: PointerEvent) => {
      const deltaY = moveEv.clientY - startY;
      const deltaPercent = (deltaY / stageHeight) * 100;
      const nextY = Math.max(1, Math.min(82, startPosY + deltaPercent));
      setHeaderPosY(Math.round(nextY * 10) / 10);
    };

    const onPointerUp = () => {
      setIsDraggingHeader(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const resetHeaderLayout = () => {
    setHeaderScale(1.0);
    setHeaderLogoHeight(48);
    setHeaderPosY(4.5);
    setHeaderPosX(0);
    setHeaderPlateStyle("none");
    setHeaderPlateColor("rgba(0, 0, 0, 0.48)");
    setHeaderTextColor("white");
    setHeaderBadgeText("Bahrain");
    setHeaderShowBadge(true);
  };

  return {
    headerScale,
    setHeaderScale,
    headerLogoHeight,
    setHeaderLogoHeight,
    headerPosY,
    setHeaderPosY,
    headerPlateStyle,
    setHeaderPlateStyle,
    headerPlateColor,
    setHeaderPlateColor,
    headerTextColor,
    setHeaderTextColor,
    headerBadgeText,
    setHeaderBadgeText,
    headerShowBadge,
    setHeaderShowBadge,
    isDraggingHeader,
    handleHeaderPointerDown,
    resetHeaderLayout,
  };
}
