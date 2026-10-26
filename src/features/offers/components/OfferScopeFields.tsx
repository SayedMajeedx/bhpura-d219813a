import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ScopeProduct = { id: string; name: string };
export type ScopeCategory = { slug: string; name: string };

const toggle = <T,>(list: readonly T[], item: T): T[] =>
  list.includes(item) ? list.filter((other) => other !== item) : [...list, item];

/**
 * Which lines an offer reaches: every product, or the products and categories chosen (a product
 * counts when it is chosen or its category is). `allowAll` false always asks for a choice (the
 * pieces a buy X get Y gives from other products).
 */
export function OfferScopeFields({
  isAr,
  legend,
  products,
  categories,
  productIds,
  categorySlugs,
  allowAll = true,
  onChange,
}: {
  isAr: boolean;
  legend: string;
  products: ScopeProduct[];
  categories: ScopeCategory[];
  productIds: string[];
  categorySlugs: string[];
  allowAll?: boolean;
  onChange: (next: { product_ids: string[]; category_slugs: string[] }) => void;
}) {
  const id = useId();
  const [chosen, setChosen] = useState(
    !allowAll || productIds.length > 0 || categorySlugs.length > 0,
  );
  const [search, setSearch] = useState("");
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products;
    // The chosen ones first, so a long catalogue never hides what the offer already names.
    return [...list].sort(
      (a, b) => Number(productIds.includes(b.id)) - Number(productIds.includes(a.id)),
    );
  }, [products, productIds, search]);

  return (
    <fieldset className="space-y-2 rounded-xl border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-muted-foreground">{legend}</legend>
      {allowAll && (
        <div role="group" aria-label={legend} className="flex flex-wrap gap-2">
          {[false, true].map((value) => (
            <Button
              key={String(value)}
              type="button"
              size="sm"
              variant="chip"
              aria-pressed={chosen === value}
              className={cn(
                "border border-border",
                chosen === value && "border-primary bg-primary/10 text-foreground",
              )}
              onClick={() => {
                setChosen(value);
                if (!value) onChange({ product_ids: [], category_slugs: [] });
              }}
            >
              {value
                ? isAr
                  ? "منتجات أو أقسام محددة"
                  : "Chosen products or categories"
                : isAr
                  ? "كل المنتجات"
                  : "Every product"}
            </Button>
          ))}
        </div>
      )}
      {chosen && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium">{isAr ? "الأقسام" : "Categories"}</p>
            <div className="grid max-h-40 gap-1.5 overflow-auto">
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {isAr ? "لا توجد أقسام بعد." : "No categories yet."}
                </p>
              )}
              {categories.map((category) => (
                <Label
                  key={category.slug}
                  className="flex min-w-0 items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={categorySlugs.includes(category.slug)}
                    onCheckedChange={() =>
                      onChange({
                        product_ids: productIds,
                        category_slugs: toggle(categorySlugs, category.slug),
                      })
                    }
                  />
                  <span className="min-w-0 truncate">{category.name}</span>
                </Label>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor={`${id}-search`} className="text-xs font-medium">
              {isAr ? "المنتجات" : "Products"}
            </Label>
            <Input
              id={`${id}-search`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isAr ? "ابحث عن منتج" : "Search products"}
              className="h-9"
            />
            <div className="grid max-h-40 gap-1.5 overflow-auto">
              {shown.map((product) => (
                <Label
                  key={product.id}
                  className="flex min-w-0 items-center gap-2 text-sm font-normal"
                >
                  <Checkbox
                    checked={productIds.includes(product.id)}
                    onCheckedChange={() =>
                      onChange({
                        product_ids: toggle(productIds, product.id),
                        category_slugs: categorySlugs,
                      })
                    }
                  />
                  <span className="min-w-0 truncate">{product.name}</span>
                </Label>
              ))}
            </div>
          </div>
        </div>
      )}
    </fieldset>
  );
}
