import * as React from "react";
import { AppConfirm, type ConfirmFact } from "@/components/ui/app-confirm";
import { useLastWhileClosing } from "@/hooks/use-last-while-closing";
import { pageLanguage } from "@/lib/page-language";

/**
 * "Are you sure?" in the app's own dialog, asked from anywhere: `await confirmDialog({ title })`
 * resolves true when the person confirms. Sixteen places once used the browser's grey
 * `window.confirm`, which looks like a website, ignores the theme and the language's direction,
 * and may not show inside the phone app's web view. The dialog is drawn by the one
 * `ConfirmDialogHost` mounted in the root, on the admin's pop-up frame (`AppConfirm`: a sheet
 * from the foot of a phone); with none mounted (a test rendering one screen) it falls back to
 * `window.confirm`.
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  /** The confirm button's words; "Delete" when `destructive`, else "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** A delete or another step that cannot be undone: the button is drawn in the danger colour. */
  destructive?: boolean;
  /** The figures the step turns on, one a line: "Amount to approve 72.000 BHD". */
  facts?: readonly ConfirmFact[];
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((request: Request) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!show) {
    const text = [options.title, options.description].filter(Boolean).join("\n\n");
    return Promise.resolve(typeof window !== "undefined" ? window.confirm(text) : false);
  }
  const open = show;
  return new Promise((resolve) => open({ ...options, resolve }));
}

export function ConfirmDialogHost() {
  const [request, setRequest] = React.useState<Request | null>(null);

  React.useEffect(() => {
    show = (next) =>
      setRequest((current) => {
        current?.resolve(false);
        return next;
      });
    return () => {
      show = null;
    };
  }, []);

  const finish = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  const ar = pageLanguage() === "ar";
  // What the box says stays while it fades out.
  const shown = useLastWhileClosing(request);
  return (
    <AppConfirm
      open={request !== null}
      onOpenChange={(open) => !open && finish(false)}
      dir={ar ? "rtl" : "ltr"}
      title={shown?.title}
      description={shown?.description}
      facts={shown?.facts}
      destructive={shown?.destructive}
      confirmLabel={shown?.confirmLabel}
      cancelLabel={shown?.cancelLabel}
      onConfirm={() => finish(true)}
    />
  );
}
