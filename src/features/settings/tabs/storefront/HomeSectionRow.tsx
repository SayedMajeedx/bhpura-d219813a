import * as React from "react";
import { ChevronDown, ChevronUp, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/**
 * One section of the home page as a row: its name and what it shows now, its switch when it has
 * one, and everything about it inside when opened. A section that is off stays editable.
 */
export function HomeSectionRow({
  id,
  icon: Icon,
  title,
  summary,
  on,
  onToggle,
  open,
  onOpen,
  isAr,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  /** Null for a section that is always there. */
  on: boolean | null;
  onToggle?: (on: boolean) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
  isAr: boolean;
  /** In place of a switch: a section edited elsewhere (the hero) offers the way there. */
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const panelId = `home-section-${id}`;
  const hasBody = React.Children.count(children) > 0;
  const heading = (
    <>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
          on === false ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block break-words text-xs text-muted-foreground">{summary}</span>
      </span>
      {hasBody &&
        (open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ))}
    </>
  );
  return (
    <div
      className={`rounded-xl border bg-card shadow-2xs ${
        open ? "border-primary/40" : "border-border"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2 p-2 sm:p-3">
        {hasBody ? (
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal px-2 py-1.5 text-start font-normal"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onOpen(!open)}
          >
            {heading}
          </Button>
        ) : (
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2 py-1.5">
            {heading}
          </div>
        )}
        {action}
        {on !== null && onToggle && (
          <Switch
            checked={on}
            onCheckedChange={onToggle}
            aria-label={isAr ? `إظهار: ${title}` : `Show: ${title}`}
            className="shrink-0"
          />
        )}
      </div>
      {open && hasBody && (
        <div id={panelId} className="space-y-4 border-t border-border p-3 sm:p-4">
          {children}
        </div>
      )}
    </div>
  );
}
