import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A count of pieces between `min` and `max`: one less, the number (typed), one more. Every part
 * takes a finger on a touch screen (44px), and the buttons say what they change.
 */
export function QuantityStepper({
  id,
  value,
  min = 0,
  max,
  onChange,
  label,
  lessLabel,
  moreLabel,
  disabled = false,
  className,
}: {
  id?: string;
  value: number;
  min?: number;
  max: number;
  onChange: (value: number) => void;
  /** The field's name for screen readers: "Quantity of 52 / Black". */
  label: string;
  lessLabel: string;
  moreLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, Math.trunc(next) || 0));
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0 pointer-coarse:size-11"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label={lessLabel}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
        className="h-9 w-14 min-w-0 px-1 text-center font-mono tabular-nums pointer-coarse:h-11"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0 pointer-coarse:size-11"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label={moreLabel}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
