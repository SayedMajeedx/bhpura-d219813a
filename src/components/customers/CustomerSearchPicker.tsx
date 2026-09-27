import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { customersQueries } from "@/lib/data/customers";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type PickedCustomer = { id: string; label: string };

type CustomerRow = { id: string; name: string | null; phone: string | null; email: string | null };

const RESULTS = 20;

const customerLabel = (c: CustomerRow) =>
  `${c.name || "Customer"} (${c.phone || c.email || "No contact"})`;

/**
 * Picks one of the brand's customers by searching the database (name, phone
 * or email), so any customer can be found however many the brand has. With
 * no search typed it lists the first customers by name.
 */
export function CustomerSearchPicker({
  brandId,
  value,
  onChange,
  isAr,
  label,
}: {
  brandId: string;
  value: PickedCustomer | null;
  onChange: (customer: PickedCustomer) => void;
  isAr: boolean;
  /** The field's name for screen readers (a combobox is not named by its text). */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searching = debounced.length > 0;
  const searchQ = useQuery({
    ...customersQueries.search(brandId, debounced, RESULTS),
    enabled: open && searching && Boolean(brandId),
  });
  const directoryQ = useQuery({
    ...customersQueries.directory(brandId, RESULTS),
    enabled: open && !searching && Boolean(brandId),
  });
  const rows = ((searching ? searchQ.data : directoryQ.data) ?? []) as CustomerRow[];
  const loading = searching ? searchQ.isFetching : directoryQ.isFetching;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className="min-h-[44px] w-full justify-between bg-background border-border font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value?.label ?? (isAr ? "ابحث عن عميل..." : "Search for a customer...")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={isAr ? "الاسم أو الهاتف أو البريد..." : "Name, phone or email..."}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-60 overflow-y-auto">
            <CommandEmpty className="p-3 text-center text-xs text-muted-foreground">
              {loading
                ? isAr
                  ? "جارٍ البحث..."
                  : "Searching..."
                : isAr
                  ? "لم يتم العثور على عملاء"
                  : "No customers found"}
            </CommandEmpty>
            <CommandGroup>
              {rows.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange({ id: c.id, label: customerLabel(c) });
                    setOpen(false);
                    setQuery("");
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      "me-2 h-4 w-4",
                      value?.id === c.id ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  {customerLabel(c)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
