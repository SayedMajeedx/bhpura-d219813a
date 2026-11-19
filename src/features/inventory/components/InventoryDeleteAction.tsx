import { useState } from "react";
import { Trash2 } from "lucide-react";
import { AppConfirm } from "@/components/ui/app-confirm";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

/** A delete button that asks first, saying what goes. */
export function InventoryDeleteAction({
  message,
  onConfirm,
  mobile = false,
}: {
  message: string;
  onConfirm: () => void | Promise<void>;
  mobile?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        className={mobile ? "h-11 w-11 touch-manipulation text-destructive" : "text-destructive"}
        variant="ghost"
        size="icon"
        aria-label={t("common.delete")}
        onClick={() => setOpen(true)}
      >
        <Trash2 className={mobile ? "h-5 w-5" : "h-4 w-4"} />
      </Button>
      <AppConfirm
        open={open}
        onOpenChange={setOpen}
        title={t("common.delete")}
        description={message}
        destructive
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={onConfirm}
      />
    </>
  );
}
