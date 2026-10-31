import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { cardBack } from "../lib/back";
import { cardFront } from "../lib/front";
import { cardSize } from "../lib/geometry";
import { cardSvg } from "../lib/svg";
import { pageMeasure } from "../lib/canvas";
import { cardContent, type CardDetails } from "../lib/content";
import type { CardDesign } from "../lib/design";
import type { CardKit } from "../hooks/use-card-kit";

/**
 * One face of a card, drawn as the print is (the same SVG, its text real text). Its width follows
 * its box; its height follows the card's own shape.
 */
export function GiftCardFace({
  kit,
  design,
  details,
  primary,
  face = "front",
  label,
  className,
}: {
  kit: CardKit;
  design: CardDesign;
  details: CardDetails;
  primary: "ar" | "en";
  face?: "front" | "back";
  /** What a screen reader says the picture is. */
  label: string;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const svg = useMemo(() => {
    // Measured again once the card's faces load (`kit.ready`).
    const measure = pageMeasure();
    const content = cardContent(kit, design.photo, details, primary);
    const draw = face === "front" ? cardFront : cardBack;
    return cardSvg(draw(design, content, kit.colours, measure), cardSize(design.orientation), {
      idPrefix: `c${id}${face[0]}`,
      title: label,
    });
  }, [kit, design, details, primary, face, label, id]);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md shadow-md [&>svg]:block [&>svg]:h-auto [&>svg]:w-full",
        className,
      )}
      // Our own SVG: every text and address in it is escaped by `cardSvg`.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
