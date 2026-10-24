import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { pageLanguage } from "@/lib/page-language";
import { cn } from "@/lib/utils";

/**
 * "Are you sure?" in the app's own dialog, asked from anywhere: `await confirmDialog({ title })`
 * resolves true when the person confirms. Sixteen places once used the browser's grey
 * `window.confirm`, which looks like a website, ignores the theme and the language's direction,
 * and may not show inside the phone app's web view. The dialog is drawn by the one
 * `ConfirmDialogHost` mounted in the root; with none mounted (a test rendering one screen) it
 * falls back to `window.confirm`.
 */
export type ConfirmOptions = {
  title: string;
  description?: string;
  /** The confirm button's words; "Delete" when `destructive`, else "Confirm". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** A delete or another step that cannot be undone: the button is drawn in the danger colour. */
  destructive?: boolean;
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
  const confirmLabel =
    request?.confirmLabel ??
    (request?.destructive ? (ar ? "حذف" : "Delete") : ar ? "تأكيد" : "Confirm");

  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && finish(false)}>
      <AlertDialogContent dir={ar ? "rtl" : "ltr"} className="max-w-md">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.description ? (
            <AlertDialogDescription>{request.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={() => finish(false)}>
            {request?.cancelLabel ?? (ar ? "إلغاء" : "Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => finish(true)}
            className={cn(request?.destructive && buttonVariants({ variant: "destructive" }))}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
