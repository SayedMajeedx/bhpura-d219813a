import { useState } from "react";
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
import { Plus, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A category picker that also takes a category typed for the first time. */
export function CreatableCategorySelect({
  value,
  categories,
  lang,
  onChange,
}: {
  value: string;
  categories: string[];
  lang: "en" | "ar";
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().replace(/\s+/g, " ");
  const exactMatch = categories.find(
    (category) => category.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase(),
  );
  const select = (category: string) => {
    onChange(category);
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
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="mt-1 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || (lang === "ar" ? "اختر أو أنشئ فئة" : "Select or create a category")}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={
              lang === "ar" ? "ابحث أو اكتب فئة جديدة..." : "Search or type a new category..."
            }
            dir={lang === "ar" ? "rtl" : "ltr"}
          />
          <CommandList>
            {!categories.length && !normalizedQuery && (
              <CommandEmpty>
                {lang === "ar" ? "لا توجد فئات بعد" : "No categories yet"}
              </CommandEmpty>
            )}
            <CommandGroup heading={lang === "ar" ? "الفئات المستخدمة" : "Existing categories"}>
              {categories
                .filter((category) =>
                  category.toLocaleLowerCase().includes(normalizedQuery.toLocaleLowerCase()),
                )
                .map((category) => (
                  <CommandItem key={category} value={category} onSelect={() => select(category)}>
                    <Check
                      className={cn("h-4 w-4", value === category ? "opacity-100" : "opacity-0")}
                    />{" "}
                    {category}
                  </CommandItem>
                ))}
              {normalizedQuery && !exactMatch && (
                <CommandItem
                  value={`create-${normalizedQuery}`}
                  onSelect={() => select(normalizedQuery)}
                >
                  <Plus className="h-4 w-4" />{" "}
                  {lang === "ar" ? `إنشاء «${normalizedQuery}»` : `Create “${normalizedQuery}”`}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
