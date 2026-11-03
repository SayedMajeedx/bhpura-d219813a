import { Fragment } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { OrderNumberFormat } from "@/lib/order-number";
import { customerOrderName, type SendForm, type SendGroup } from "../lib/customer-pieces";
import { piecesLabel } from "../lib/order-state";

type Line = { id: string; description: string; quantity: number };

/**
 * The pieces a send may take, each ticked or not, under its order's number when several orders
 * go at once, with this time's cost beside each for staff who price them (`prices`).
 */
export function SendPiecesList({
  lines,
  groups,
  form,
  setForm,
  prices,
  costProblem,
  onTyped,
  numberFormat,
  lang,
}: {
  lines: readonly Line[];
  groups: readonly SendGroup[];
  form: SendForm;
  setForm: (update: (form: SendForm) => SendForm) => void;
  prices: boolean;
  costProblem: (lineId: string) => boolean;
  onTyped: (lineId: string) => void;
  numberFormat: OrderNumberFormat | null | undefined;
  lang: "ar" | "en";
}) {
  const isAr = lang === "ar";
  return (
    <>
      {lines.map((line, index) => {
        const piece = form.pieces[line.id] ?? { send: true, cost: "" };
        // Several orders at once: each order's pieces under its number.
        const group = groups.find((g) => g.lines.some((l) => l.id === line.id));
        const firstOfGroup =
          groups.length > 1 &&
          group &&
          !lines.slice(0, index).some((l) => group.lines.some((g) => g.id === l.id));
        return (
          <Fragment key={line.id}>
            {firstOfGroup && (
              <p className="pt-1 text-xs font-bold text-muted-foreground">
                {customerOrderName(group.invoice ?? null, isAr, numberFormat)}
              </p>
            )}
            <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border-subtle p-2.5">
              <Checkbox
                checked={piece.send}
                onCheckedChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    pieces: { ...f.pieces, [line.id]: { ...piece, send: checked === true } },
                  }))
                }
                aria-label={isAr ? `أرسل ${line.description}` : `Send ${line.description}`}
              />
              <div className="min-w-0 flex-1">
                <p
                  dir="auto"
                  className="text-page-start line-clamp-2 break-words text-sm font-semibold"
                >
                  {line.description}
                </p>
                <p className="text-xs text-muted-foreground">{piecesLabel(line.quantity, lang)}</p>
              </div>
              {prices && (
                <Input
                  aria-label={isAr ? `تكلفة ${line.description}` : `Cost of ${line.description}`}
                  inputMode="decimal"
                  value={piece.cost}
                  placeholder="0.000"
                  disabled={!piece.send}
                  onChange={(e) => {
                    onTyped(line.id);
                    setForm((f) => ({
                      ...f,
                      pieces: { ...f.pieces, [line.id]: { ...piece, cost: e.target.value } },
                    }));
                  }}
                  aria-invalid={costProblem(line.id) || undefined}
                  className="w-24 shrink-0 font-mono tabular-nums"
                />
              )}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
