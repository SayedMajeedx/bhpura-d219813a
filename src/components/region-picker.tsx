import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchRegions, regionLabel } from "@/lib/bahrain-regions";
import { cn } from "@/lib/utils";

/**
 * Bahrain's area for an address, found by typing (the owner's request of 2026-11-11: with 114
 * areas a plain list was a long scroll). The search reads Arabic as people write it and finds an
 * area by either language or another common spelling (`matchRegions`). `allLabel` adds an
 * "every area" choice at the top, whose value is `"all"`, for a filter.
 */
export function RegionPicker({
  id,
  value,
  onChange,
  lang,
  placeholder,
  allLabel,
  icon,
  className,
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  lang: "ar" | "en";
  placeholder?: string;
  allLabel?: string;
  icon?: ReactNode;
  className?: string;
}) {
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const found = useMemo(() => matchRegions(query, lang), [query, lang]);
  const shown = value === "all" && allLabel ? allLabel : value ? regionLabel(value, lang) : null;
  const choose = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between gap-2 px-3 font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {icon}
            <span className={cn("truncate", !shown && "text-muted-foreground")}>
              {shown ?? placeholder ?? (isAr ? "اختر المنطقة" : "Choose an area")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0"
        align="start"
        dir={isAr ? "rtl" : "ltr"}
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={isAr ? "اكتب اسم المنطقة..." : "Type the area's name..."}
            aria-label={isAr ? "ابحث عن المنطقة" : "Search for the area"}
            dir={isAr ? "rtl" : "ltr"}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              {isAr ? "لا توجد منطقة بهذا الاسم" : "No area by that name"}
            </CommandEmpty>
            {allLabel && !query.trim() && (
              <CommandItem value="all" onSelect={() => choose("all")}>
                <Check
                  className={cn("size-4", value === "all" ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                {allLabel}
              </CommandItem>
            )}
            {found.map((region) => (
              <CommandItem
                key={region.value}
                value={region.value}
                onSelect={() => choose(region.value)}
              >
                <Check
                  className={cn("size-4", value === region.value ? "opacity-100" : "opacity-0")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">{isAr ? region.ar : region.en}</span>
                <span className="text-xs text-muted-foreground" dir="auto">
                  {isAr ? region.en : region.ar}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
