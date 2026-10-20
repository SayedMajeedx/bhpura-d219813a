import { useId } from "react";
import { Lock, Package, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { costLocked, type FormProblem, type FormProduct } from "../lib/order-form";
import { customerOrderName } from "../lib/customer-pieces";
import { piecesLabel } from "../lib/order-state";
import type { SupplierCatalog } from "../hooks/use-supplier-catalog";

/** One product of a supplier's order: its cost per piece and how many of each size. */
export function ProductLinesCard({
  product,
  catalog,
  problems,
  perPiece,
  currency,
  moneyLabel,
  lang,
  onChange,
  onRemove,
}: {
  product: FormProduct;
  catalog: SupplierCatalog;
  problems: readonly FormProblem[];
  /** The cost of a piece with its share of the order's other costs, when there are any. */
  perPiece: number | undefined;
  currency: string;
  moneyLabel: string;
  lang: "ar" | "en";
  onChange: (next: FormProduct) => void;
  onRemove: () => void;
}) {
  const isAr = lang === "ar";
  const uid = useId();
  const info = catalog.productById.get(product.productId);
  const sizes = catalog.sizes.get(product.productId) ?? [];
  const locked = costLocked(product);
  const anyReceived = locked;
  const costProblem = problems.some((p) => p.field === "cost" && p.key === product.key);
  const emptyProblem = problems.some((p) => p.field === "product" && p.key === product.key);
  const unit = Number(product.unitCost) || 0;
  const name = catalog.productName(product.productId);

  const setQuantity = (variantId: string, quantity: string) =>
    onChange({
      ...product,
      sizes: {
        ...product.sizes,
        [variantId]: { ...(product.sizes[variantId] ?? { received: 0 }), quantity },
      },
    });

  // A customer's piece, sent from their order: its price is all this card changes.
  if (product.customer) {
    const size = product.sizes[product.customer.itemId];
    return (
      <Card className="space-y-2 border-primary/30 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">
              {customerOrderName(product.customer.invoice, isAr)}
            </p>
            <h3 dir="auto" className="text-page-start line-clamp-2 break-words font-bold">
              {product.customer.label}
            </h3>
            <p className="text-xs text-muted-foreground">
              {piecesLabel(Number(size?.quantity) || 1, lang)}
              {(size?.received ?? 0) > 0 &&
                (isAr ? ` · وصل ${size?.received}` : ` · ${size?.received} arrived`)}
            </p>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-cost`} className="text-xs font-semibold">
            {isAr ? `تكلفة القطعة (${moneyLabel})` : `Cost per piece (${moneyLabel})`}
          </label>
          <Input
            id={`${uid}-cost`}
            inputMode="decimal"
            value={product.unitCost}
            disabled={locked}
            onChange={(e) => onChange({ ...product, unitCost: e.target.value })}
            aria-invalid={costProblem || undefined}
            className="max-w-40 font-mono tabular-nums"
          />
          {perPiece !== undefined && perPiece !== unit && (
            <p className="text-xs text-muted-foreground">
              {isAr
                ? `مع نصيبها من التكاليف الأخرى: ${formatMoney(perPiece, currency, lang)}`
                : `With its share of the other costs: ${formatMoney(perPiece, currency, lang)}`}
            </p>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("space-y-3 p-3 sm:p-4", emptyProblem && "border-destructive/50")}>
      <div className="flex min-w-0 items-start gap-3">
        {info?.image_url ? (
          <img src={info.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="text-page-start line-clamp-2 break-words font-bold">
            {name}
          </h3>
          {emptyProblem && (
            <p className="text-xs text-destructive">
              {isAr
                ? "اكتب كم قطعة من مقاس واحد على الأقل."
                : "Type how many of at least one size."}
            </p>
          )}
        </div>
        {!anyReceived && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label={isAr ? `حذف ${name} من الطلبية` : `Remove ${name} from the order`}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${uid}-cost`} className="text-xs font-semibold">
          {isAr ? `تكلفة القطعة (${moneyLabel})` : `Cost per piece (${moneyLabel})`}
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            id={`${uid}-cost`}
            inputMode="decimal"
            value={product.unitCost}
            disabled={locked}
            onChange={(e) => onChange({ ...product, unitCost: e.target.value })}
            aria-invalid={costProblem || undefined}
            className="max-w-40 font-mono tabular-nums"
          />
          {locked && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              {isAr ? "وصلت قطع بهذه التكلفة" : "Pieces arrived at this cost"}
            </span>
          )}
        </div>
        {costProblem && (
          <p className="text-xs text-destructive">
            {isAr ? "اكتب التكلفة رقماً، أو 0." : "Type the cost as a number, or 0."}
          </p>
        )}
        {perPiece !== undefined && perPiece !== unit && (
          <p className="text-xs text-muted-foreground">
            {isAr
              ? `مع نصيبها من التكاليف الأخرى: ${formatMoney(perPiece, currency, lang)} للقطعة`
              : `With its share of the other costs: ${formatMoney(perPiece, currency, lang)} a piece`}
          </p>
        )}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-semibold">
          {isAr ? "الكمية لكل مقاس" : "Quantity per size"}
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sizes.map((variant) => {
            const size = product.sizes[variant.id];
            const received = size?.received ?? 0;
            const fieldId = `${uid}-${variant.id}`;
            const bad = problems.some(
              (p) => p.field === "quantity" && p.key === product.key && p.variantId === variant.id,
            );
            const onHand = catalog.shelf.get(variant.id)?.onHand ?? 0;
            return (
              <div
                key={variant.id}
                className={cn(
                  "min-w-0 rounded-lg border border-border-subtle p-2",
                  Number(size?.quantity) > 0 && "border-primary/40 bg-primary/5",
                  bad && "border-destructive/60",
                )}
              >
                <label
                  htmlFor={fieldId}
                  className="flex min-w-0 items-baseline justify-between gap-2"
                >
                  <span dir="auto" className="break-words text-sm font-semibold">
                    {catalog.sizeName(variant.id)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {isAr ? `بالمخزون ${onHand}` : `${onHand} in stock`}
                  </span>
                </label>
                <Input
                  id={fieldId}
                  inputMode="numeric"
                  placeholder="0"
                  value={size?.quantity ?? ""}
                  onChange={(e) => setQuantity(variant.id, e.target.value)}
                  aria-invalid={bad || undefined}
                  className="mt-1 font-mono tabular-nums"
                />
                {received > 0 && (
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      bad ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {isAr ? `وصل ${received}، لا تقل عنه` : `${received} arrived: not below`}
                  </p>
                )}
                {bad && received === 0 && (
                  <p className="mt-1 text-xs text-destructive">
                    {isAr ? "عدد صحيح من القطع" : "A whole number of pieces"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    </Card>
  );
}
