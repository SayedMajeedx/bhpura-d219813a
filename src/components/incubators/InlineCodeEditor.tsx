import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { incubatorsKeys, updateIncubatorItem } from "@/lib/data/incubators";

type IncubatorCodeItem = {
  id: string;
  consignment_price: number;
  commission_type: string;
  commission_value: number;
};

/**
 * Saves an incubator item's external code through the secured item update
 * (keeping its price and commission), then refreshes the incubator stock.
 */
export function useSaveIncubatorCode(brandId: string) {
  const qc = useQueryClient();
  return async (item: IncubatorCodeItem, externalCode: string) => {
    await updateIncubatorItem({
      inventoryId: item.id,
      externalCode: externalCode.trim(),
      consignmentPrice: Number(item.consignment_price),
      commissionType: item.commission_type,
      commissionValue: Number(item.commission_value),
    });
    await qc.invalidateQueries({ queryKey: incubatorsKeys.inventory(brandId) });
  };
}

/** The incubator's code for one item, edited in its table cell: saves on blur or Enter, Escape cancels. */
export function InlineCodeEditor({
  value,
  isAr,
  onSave,
}: {
  value: string;
  isAr: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const committed = useRef(value);
  const skipNextBlur = useRef(false);

  useEffect(() => {
    if (!saving) {
      committed.current = value;
      setDraft(value);
    }
  }, [value, saving]);

  async function save() {
    if (skipNextBlur.current) {
      skipNextBlur.current = false;
      return;
    }
    const next = draft.trim();
    if (next === committed.current || saving) return;
    const previous = committed.current;
    committed.current = next;
    setSaving(true);
    try {
      await onSave(next);
      toast.success(isAr ? "تم حفظ كود الحاضنة" : "Incubator code saved");
    } catch (caught) {
      const error = caught as { code?: string; message?: string } | null;
      committed.current = previous;
      setDraft(previous);
      const duplicate = error?.code === "23505" || String(error?.message).includes("external_code");
      toast.error(
        duplicate
          ? isAr
            ? "هذا الكود مستخدم لقطعة أخرى في نفس الحاضنة"
            : "This code is already used by another item in this incubator"
          : error?.message || (isAr ? "تعذر حفظ الكود" : "Could not save code"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative min-w-32">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            skipNextBlur.current = true;
            setDraft(committed.current);
            event.currentTarget.blur();
          }
        }}
        placeholder={isAr ? "أدخل الكود" : "Enter code"}
        aria-label={isAr ? "كود الحاضنة" : "Incubator code"}
        dir="ltr"
        disabled={saving}
        className="h-9 bg-background font-mono text-xs"
      />
      {saving && (
        <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {isAr ? "حفظ..." : "Saving..."}
        </span>
      )}
    </div>
  );
}
