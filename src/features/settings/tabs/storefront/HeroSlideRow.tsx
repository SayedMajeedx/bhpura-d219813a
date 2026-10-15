import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Image as ImageIcon,
  Trash2,
  Type,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const KIND = {
  text: { ar: "نص", en: "Text", Icon: Type },
  image: { ar: "صورة", en: "Image", Icon: ImageIcon },
  video: { ar: "فيديو", en: "Video", Icon: Video },
} as const;

/**
 * One slide folded to a row: drag handle, picture, first phrase and kind. Tapping it opens the
 * slide; the arrows move it up or down (the way to reorder on a phone or with a keyboard).
 */
export function HeroSlideRow({
  index,
  count,
  kind,
  title,
  thumbnail,
  open,
  isAr,
  panelId,
  onToggle,
  onMove,
  onDelete,
  dragProps,
}: {
  index: number;
  count: number;
  kind: keyof typeof KIND;
  title: string | null;
  thumbnail: string | null;
  open: boolean;
  isAr: boolean;
  panelId: string;
  onToggle: () => void;
  onMove: (to: number) => void;
  onDelete: () => void;
  dragProps: React.HTMLAttributes<HTMLDivElement>;
}) {
  const { Icon } = KIND[kind];
  const label = isAr ? `الشريحة ${index + 1}` : `Slide ${index + 1}`;
  return (
    <div className="flex min-w-0 items-center gap-2" {...dragProps}>
      <span
        className="hidden shrink-0 cursor-grab text-muted-foreground sm:inline-flex"
        aria-hidden="true"
      >
        <GripVertical className="size-4" />
      </span>
      <Button
        type="button"
        variant="ghost"
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-1 py-1 text-start font-normal"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {thumbnail ? (
            <img src={thumbnail} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Icon className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {label}
            <Badge variant="secondary" className="gap-1 px-1.5 py-0 font-normal">
              <Icon />
              {isAr ? KIND[kind].ar : KIND[kind].en}
            </Badge>
          </span>
          <span
            dir="auto"
            className="block text-page-start text-sm font-medium line-clamp-2 break-words"
          >
            {title ?? (isAr ? "بدون عنوان" : "No headline")}
          </span>
        </span>
      </Button>
      {/* The arrows stack on a phone, so the row keeps its width for the phrase. */}
      <div className="grid shrink-0 grid-cols-[auto_auto] items-center sm:flex">
        <div className="flex flex-col sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 sm:size-10"
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
            aria-label={isAr ? `${label}: تحريك لأعلى` : `${label}: move up`}
          >
            <ChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 sm:size-10"
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
            aria-label={isAr ? `${label}: تحريك لأسفل` : `${label}: move down`}
          >
            <ChevronDown className="size-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={isAr ? `${label}: حذف` : `${label}: delete`}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
