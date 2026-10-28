import { Toaster as Sonner } from "sonner";
import { SuccessCheck } from "@/components/motion/SuccessCheck";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      // On a phone a toast rises above the bars fixed at the screen's foot (the
      // storefront's buy bar, the admin's dock) instead of covering their buttons.
      mobileOffset={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
      // Every confirmation (a payment approved, stock saved, settings saved, added to the bag)
      // draws its tick once as it arrives (transitions.dev's success check).
      icons={{ success: <SuccessCheck className="size-4 text-success" /> }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
