import { Plus, Minus } from "lucide-react";

export function StockStepper({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (val: number) => void;
  min?: number;
}) {
  return (
    <div
      dir="ltr"
      className="inline-flex items-center border border-input bg-background rounded-lg overflow-hidden h-8.5 shadow-2xs shrink-0 select-none"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="w-7 h-full flex items-center justify-center hover:bg-muted active:scale-95 transition-all text-muted-foreground hover:text-foreground border-r border-input touch-manipulation"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(Math.max(min, value - 1));
        }}
        aria-label="Decrease"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        className="w-11 text-center bg-transparent border-0 outline-none h-full font-mono font-bold text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none px-0.5"
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(Math.max(min, parseInt(e.target.value) || 0));
        }}
        onFocus={(e) => e.currentTarget.select()}
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="w-7 h-full flex items-center justify-center hover:bg-muted active:scale-95 transition-all text-muted-foreground hover:text-foreground border-l border-input touch-manipulation"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onChange(value + 1);
        }}
        aria-label="Increase"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
