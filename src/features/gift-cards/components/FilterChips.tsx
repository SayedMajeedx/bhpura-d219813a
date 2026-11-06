import { Button } from "@/components/ui/button";

/** One choice among a list's groups, each with how many it holds; a phone scrolls the row. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  count,
  word,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  count: (option: T) => number;
  word: (option: T) => string;
  onChange: (option: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1">
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="shrink-0 gap-1.5 rounded-full text-xs"
        >
          {word(option)}
          <span className="font-mono">{count(option)}</span>
        </Button>
      ))}
    </div>
  );
}
