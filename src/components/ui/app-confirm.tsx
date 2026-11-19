import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  AppDialog,
  AppDialogBody,
  AppDialogFooter,
  AppDialogHeader,
} from "@/components/ui/app-dialog";
import { pageLanguage } from "@/lib/page-language";

/**
 * "Are you sure?" on the admin's pop-up frame (the review of 2026-11-19): a small box on a
 * laptop, a sheet from the foot of a phone, announced as an alert dialog. It says what will
 * happen, the figures that matter (`facts`: "Amount 72.000 BHD"), anything else the step needs
 * (`children`: a reason to type, a warning), and offers one main step and a way back.
 *
 * `onConfirm` may be async; the box closes when it is done unless it answers `false` (a refusal
 * said elsewhere, so the person can try again). `action` replaces the main button (a link to
 * where the step is taken), or removes it with `null`.
 */
export type ConfirmFact = { label: React.ReactNode; value: React.ReactNode };

export type AppConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  facts?: readonly ConfirmFact[];
  children?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  /** A delete, or a step that cannot be undone: the main button is in the danger colour. */
  destructive?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  onConfirm?: () => unknown;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  dir?: "rtl" | "ltr";
};

export function AppConfirm({
  open,
  onOpenChange,
  title,
  description,
  facts,
  children,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  confirmDisabled = false,
  onConfirm,
  action,
  icon,
  dir,
}: AppConfirmProps) {
  const ar = (dir ?? (pageLanguage() === "ar" ? "rtl" : "ltr")) === "rtl";
  const [working, setWorking] = React.useState(false);
  const waiting = busy || working;

  const runConfirm = async () => {
    setWorking(true);
    try {
      const answer = await onConfirm?.();
      if (answer !== false) onOpenChange(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      kind="confirm"
      busy={waiting}
      dir={dir ?? (ar ? "rtl" : "ltr")}
    >
      <AppDialogHeader title={title} description={description} icon={icon} />
      {(facts?.length || children) && (
        <AppDialogBody>
          {facts && facts.length > 0 && (
            <dl className="divide-y divide-border-subtle rounded-xl border border-border text-sm">
              {facts.map((fact, index) => (
                <div
                  key={index}
                  className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2"
                >
                  <dt className="min-w-0 text-muted-foreground">{fact.label}</dt>
                  <dd className="min-w-0 break-words text-end font-semibold tabular-nums">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {children}
        </AppDialogBody>
      )}
      <AppDialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={waiting}
          onClick={() => onOpenChange(false)}
        >
          {cancelLabel ?? (ar ? "إلغاء" : "Cancel")}
        </Button>
        {action !== undefined ? (
          action
        ) : (
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={waiting || confirmDisabled}
            onClick={() => void runConfirm()}
          >
            {confirmLabel ?? (destructive ? (ar ? "حذف" : "Delete") : ar ? "تأكيد" : "Confirm")}
          </Button>
        )}
      </AppDialogFooter>
    </AppDialog>
  );
}
