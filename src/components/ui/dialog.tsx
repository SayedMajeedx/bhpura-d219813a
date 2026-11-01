"use client";

import * as React from "react";
import { closeLabel as pageCloseLabel } from "@/lib/page-language";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useReturnFocus } from "@/lib/return-focus";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80  ease-(--motion-ease-smooth) data-[state=open]:duration-250 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeLabel?: string;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeLabel, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  // Closing goes back to what opened it, in place: never a jump to a trigger off screen.
  const focusReturn = useReturnFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid grid-cols-[minmax(0,1fr)] w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 shadow-lg ease-(--motion-ease-smooth) data-[state=open]:duration-250 data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.96] data-[state=open]:zoom-in-[0.96] sm:w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:p-6 sm:rounded-lg",
          className,
        )}
        {...props}
        {...focusReturn}
      >
        {children}
        <DialogPrimitive.Close className="absolute end-3 top-3 z-50 grid h-8 w-8 cursor-pointer place-items-center rounded-md opacity-70 transition-all hover:opacity-100 hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">{closeLabel ?? pageCloseLabel()}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-start pe-12 ps-4", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 rtl:sm:space-x-reverse",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight text-start", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

/**
 * On a phone, a dialog as a sheet from the screen's foot: it slides up and down instead of
 * growing out of the middle, and its buttons sit where a thumb is. Add to `DialogContent`.
 */
export const PHONE_SHEET =
  "max-sm:top-auto max-sm:bottom-0 max-sm:translate-y-0 max-sm:w-full max-sm:max-w-none max-sm:max-h-[92dvh] max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10 max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100";

/** On a phone, a dialog that is a whole task (a list to work through): the full screen. */
export const PHONE_FULL_SCREEN =
  "max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:data-[state=open]:slide-in-from-bottom-10 max-sm:data-[state=closed]:slide-out-to-bottom-10 max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:zoom-out-100";
