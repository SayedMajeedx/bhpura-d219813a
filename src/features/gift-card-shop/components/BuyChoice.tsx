import type { CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

/** One choice of a row of choices (a payment method, how the code arrives). */
export function Choice({
  icon: Icon,
  label,
  chosen,
  onChoose,
  centred = false,
}: {
  icon: typeof CreditCard;
  label: string;
  chosen: boolean;
  onChoose: () => void;
  centred?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
        centred && "justify-center",
        chosen
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}
