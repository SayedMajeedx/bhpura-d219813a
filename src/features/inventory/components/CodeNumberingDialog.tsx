import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Hash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { countOf } from "@/lib/arabic-count";
import { getFriendlyErrorMessage } from "@/lib/utils";
import { useProfile } from "@/lib/profile-context";
import { assignVariantCodes, catalogKeys, codeNumberingQueries } from "@/lib/data/catalog";
import { incubatorsKeys, incubatorsQueries } from "@/lib/data/incubators";
import {
  codeAssignError,
  codePlan,
  codePlanProblem,
  sizesNeedingCodes,
  type NumberingProduct,
  type NumberingVariant,
  type PartnerCode,
} from "@/features/inventory/lib/code-numbering";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";

type Props = {
  brandId: string;
  isAr: boolean;
  products: readonly NumberingProduct[];
  variants: readonly NumberingVariant[];
  onSaved: () => void;
};

const asPartnerCodes = (rows: unknown[]) => rows as PartnerCode[];

/**
 * One line above the inventory list while sizes have no code (or one no barcode can carry), the
 * way in to numbering them. For staff who may manage stock.
 */
export function CodeNumberingLine(props: Props) {
  const { hasPermission } = useProfile();
  const [open, setOpen] = useState(false);
  const count = sizesNeedingCodes(props.variants);
  if (!hasPermission("manage_inventory") || (count === 0 && !open)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-start transition-colors hover:bg-warning-subtle/70"
      >
        <Hash className="size-4 shrink-0 text-warning" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          {props.isAr
            ? `بلا كود: ${countOf(count, "size", "ar")}`
            : `${countOf(count, "size", "en")} without a code`}
        </span>
        <span className="shrink-0 text-sm font-bold text-warning">
          {props.isAr ? "ترقيم الأكواد" : "Number the codes"}
        </span>
        <ChevronRight className="size-4 shrink-0 text-warning rtl:rotate-180" aria-hidden="true" />
      </button>
      {open && <CodeNumberingDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function CodeNumberingDialog({
  brandId,
  isAr,
  products,
  variants,
  onSaved,
  onClose,
}: Props & { onClose: () => void }) {
  const lang = isAr ? "ar" : "en";
  const qc = useQueryClient();
  const numbering = useQuery(codeNumberingQueries.next(brandId));
  const partners = useQuery({ ...incubatorsQueries.inventory(brandId), select: asPartnerCodes });
  const [restyle, setRestyle] = useState(true);
  const [withBarcodes, setWithBarcodes] = useState(true);
  const [fillPartners, setFillPartners] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const prefix = numbering.data?.prefix ?? "";

  const plan = useMemo(
    () =>
      numbering.data && partners.data
        ? codePlan({
            variants,
            products,
            partnerCodes: partners.data,
            prefix,
            nextNumber: numbering.data.nextNumber,
            withBarcodes,
            restyle,
            lang,
          })
        : [],
    [variants, products, partners.data, numbering.data, prefix, withBarcodes, restyle, lang],
  );
  const rows = plan.map((row) => ({ ...row, proposed: edits[row.variantId] ?? row.proposed }));
  const changing = new Set(rows.map((row) => row.variantId));
  const kept = variants
    .filter((variant) => !changing.has(variant.id) && variant.sku?.trim())
    .map((variant) => variant.sku!.trim());
  const problem = codePlanProblem(rows, kept, lang);
  const loading = numbering.isPending || partners.isPending;
  const barcodes = rows.filter((row) => row.barcode).length;

  const save = async () => {
    if (problem || rows.length === 0) return;
    setSaving(true);
    try {
      const done = await assignVariantCodes(
        rows.map((row) => ({
          variantId: row.variantId,
          sku: row.proposed.trim().toUpperCase(),
          barcode: row.barcode,
        })),
        fillPartners,
      );
      toast.success(
        isAr
          ? `تم ترقيم ${countOf(done.codes, "size", "ar")}`
          : `${countOf(done.codes, "size", "en")} numbered`,
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: catalogKeys.variants(brandId) }),
        qc.invalidateQueries({ queryKey: incubatorsKeys.all(brandId) }),
      ]);
      onSaved();
      onClose();
    } catch (error) {
      // The database's own code ("CODE_TAKEN:<variant>") names the piece; anything else is worded.
      const raw = String((error as { message?: unknown } | null)?.message ?? "");
      toast.error(codeAssignError(raw, rows, lang) ?? getFriendlyErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open
      onOpenChange={(next) => !next && onClose()}
      kind="task"
      size="lg"
      dir={isAr ? "rtl" : "ltr"}
    >
      <AppDialogHeader
        title={
          <>
            <Hash className="h-4 w-4" aria-hidden />
            {isAr ? "ترقيم الأكواد" : "Number the codes"}
          </>
        }
        description={
          isAr
            ? `كل مقاس له كود واحد يستخدمه المتجر والمحلات الشريكة. القطعة التي لها كود عند محل شريك تأخذه، والباقي يأخذ الأرقام التالية من ${prefix}${numbering.data?.nextNumber ?? "…"}. راجع وعدّل قبل الحفظ.`
            : `Each size has one code, used by the store and its partner shops. A piece with a code at a partner shop keeps it, and the rest take the next numbers from ${prefix}${numbering.data?.nextNumber ?? "…"}. Check and change them before saving.`
        }
      />

      <AppDialogBody>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Option checked={restyle} onChange={setRestyle} id="code-restyle">
            {isAr
              ? "رقّم الأكواد بنمط آخر أيضاً (S79-56، PL1-BLK)"
              : "Also renumber codes in another style (S79-56, PL1-BLK)"}
          </Option>
          <Option checked={withBarcodes} onChange={setWithBarcodes} id="code-barcodes">
            {isAr ? "أنشئ باركود للمقاسات التي ليس لها" : "Create a barcode for sizes without one"}
          </Option>
          <Option checked={fillPartners} onChange={setFillPartners} id="code-partners">
            {isAr
              ? "أعطِ القطع عند المحلات الشريكة كودنا إن لم يكن لها كود"
              : "Give pieces at partner shops our code where they have none"}
          </Option>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحضير…" : "Preparing…"}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {isAr ? "كل المقاسات لها أكواد." : "Every size has a code."}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border text-sm">
            {rows.map((row) => (
              <li
                key={row.variantId}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 break-words font-medium" dir="auto">
                    {row.product}
                    {[row.size, row.color].filter(Boolean).length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {[row.size, row.color].filter(Boolean).join(" / ")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.current
                      ? `${isAr ? "الحالي" : "Now"}: ${row.current}`
                      : isAr
                        ? "بلا كود"
                        : "No code"}
                    {row.source === "partner"
                      ? ` · ${isAr ? "كود المحل الشريك" : "the partner's code"}`
                      : ""}
                    {row.barcode ? ` · ${isAr ? "باركود جديد" : "new barcode"}` : ""}
                  </p>
                </div>
                <Input
                  aria-label={isAr ? `الكود الجديد: ${row.product}` : `New code: ${row.product}`}
                  className="w-28 font-mono"
                  dir="ltr"
                  value={row.proposed}
                  maxLength={40}
                  onChange={(event) =>
                    setEdits((was) => ({
                      ...was,
                      [row.variantId]: event.target.value.toUpperCase(),
                    }))
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </AppDialogBody>
      <AppDialogFooter
        error={problem || undefined}
        summary={
          !problem && rows.length > 0 ? (
            <span className="text-xs">
              {countOf(rows.length, "size", lang)}
              {barcodes > 0 ? ` · ${isAr ? "باركود جديد" : "new barcodes"}: ${barcodes}` : ""}
            </span>
          ) : undefined
        }
      >
        <Button variant="outline" onClick={onClose}>
          {isAr ? "إلغاء" : "Cancel"}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || loading || Boolean(problem) || rows.length === 0}
        >
          {isAr
            ? `حفظ ${countOf(rows.length, "code", "ar")}`
            : `Save ${countOf(rows.length, "code", "en")}`}
        </Button>
      </AppDialogFooter>
    </AppDialog>
  );
}

function Option({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{children}</span>
    </label>
  );
}
