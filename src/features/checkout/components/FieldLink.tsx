import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A field most shoppers never need (a discount code, a gift card, a note), shown as a link that
 * opens it, focused (the checkout review of 2026-11-15: three open boxes made a phone's checkout
 * about 3,200px long). It starts open while it holds something.
 */
export function FieldLink({
  label,
  startOpen = false,
  focusId,
  children,
}: {
  label: string;
  /** Open from the start: the field already holds a value. */
  startOpen?: boolean;
  /** The field to focus once it opens. */
  focusId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const opened = useRef(false);
  useEffect(() => {
    if (open && opened.current && focusId) document.getElementById(focusId)?.focus();
  }, [open, focusId]);

  if (open) return <>{children}</>;
  return (
    <Button
      type="button"
      variant="link"
      aria-expanded={false}
      onClick={() => {
        opened.current = true;
        setOpen(true);
      }}
      className="h-auto min-h-11 justify-start gap-1.5 p-0 text-sm font-medium text-foreground underline-offset-4"
    >
      <Plus aria-hidden className="h-4 w-4" />
      {label}
    </Button>
  );
}
