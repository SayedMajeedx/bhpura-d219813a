import { X } from "lucide-react";

export function PremiumCurrencyInput({
  value,
  onChange,
  onBlur,
  className = "",
  placeholder = "0.000",
  disabled = false,
  onClear,
  clearLabel = "Remove sale",
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  onClear?: () => void;
  clearLabel?: string;
}) {
  return (
    <div
      className="relative inline-flex items-center w-full min-w-[115px] max-w-[130px] shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="number"
        step="0.001"
        placeholder={placeholder}
        className={`w-full h-9.5 ${onClear && value ? "ps-7" : "ps-2.5"} pe-8 text-center font-mono font-bold bg-background border border-input rounded-xl outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-xs shadow-2xs transition-all disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground disabled:opacity-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={onBlur}
        disabled={disabled}
      />
      {onClear && value && !disabled && (
        <button
          type="button"
          className="absolute start-2 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={clearLabel}
          aria-label={clearLabel}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <span className="absolute end-2.5 text-xs font-black text-muted-foreground pointer-events-none uppercase tracking-tight">
        BHD
      </span>
    </div>
  );
}
