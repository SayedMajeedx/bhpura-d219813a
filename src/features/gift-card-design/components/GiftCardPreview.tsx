import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CardDetails } from "../lib/content";
import type { CardDesign } from "../lib/design";
import type { CardKit } from "../hooks/use-card-kit";
import { GiftCardFace } from "./GiftCardFace";

/**
 * A card held up to look at: its front, and its back a tap away (it turns over, as a card does;
 * still for a reader who asked for less motion). `showBack` false keeps the back away, as before a
 * card is paid.
 */
export function GiftCardPreview({
  kit,
  design,
  details,
  primary,
  lang,
  showBack = true,
  className,
}: {
  kit: CardKit;
  design: CardDesign;
  details: CardDetails;
  primary: "ar" | "en";
  lang: "ar" | "en";
  showBack?: boolean;
  className?: string;
}) {
  const [back, setBack] = useState(false);
  const turned = showBack && back;
  const isAr = lang === "ar";
  const widthClass = design.orientation === "landscape" ? "max-w-md" : "max-w-72";
  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("mx-auto w-full [perspective:1600px]", widthClass)}>
        <div
          className={cn(
            "relative transition-transform duration-(--motion-slow) ease-(--motion-ease-in-out) [transform-style:preserve-3d] motion-reduce:transition-none",
            turned && "[transform:rotateY(180deg)]",
          )}
        >
          <GiftCardFace
            kit={kit}
            design={design}
            details={details}
            primary={primary}
            face="front"
            label={isAr ? "وجه البطاقة" : "Front of the card"}
            className="[backface-visibility:hidden]"
          />
          {showBack && (
            <GiftCardFace
              kit={kit}
              design={design}
              details={details}
              primary={primary}
              face="back"
              label={isAr ? "ظهر البطاقة" : "Back of the card"}
              className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]"
            />
          )}
        </div>
      </div>
      {showBack && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setBack((value) => !value)}
            aria-pressed={turned}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            {turned
              ? isAr
                ? "عرض الوجه"
                : "Show the front"
              : isAr
                ? "اقلب البطاقة"
                : "Turn the card over"}
          </Button>
        </div>
      )}
    </div>
  );
}
