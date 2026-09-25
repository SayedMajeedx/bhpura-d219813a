import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Storefront } from "@/features/checkout/types";
import type { usePaymentReturnError } from "@/features/checkout/hooks/use-payment-return-error";
import type { useRegisteredAccountCheck } from "@/features/checkout/hooks/use-registered-account-check";

/** Offers sign-in when the email or phone typed belongs to an existing account. */
export function AccountExistsDialog({
  brand,
  lang,
  mounted,
  setIgnoredAccountWarning,
  setShowAccountPopup,
  showAccountPopup,
  t,
}: {
  brand: Storefront["brand"];
  lang: Storefront["lang"];
  mounted: ReturnType<typeof usePaymentReturnError>["mounted"];
  setIgnoredAccountWarning: ReturnType<
    typeof useRegisteredAccountCheck
  >["setIgnoredAccountWarning"];
  setShowAccountPopup: ReturnType<typeof useRegisteredAccountCheck>["setShowAccountPopup"];
  showAccountPopup: ReturnType<typeof useRegisteredAccountCheck>["showAccountPopup"];
  t: Storefront["t"];
}) {
  return (
    <Dialog
      open={showAccountPopup.show}
      onOpenChange={(open) => {
        if (!open) {
          setShowAccountPopup({ show: false, field: null, value: "" });
          setIgnoredAccountWarning(true);
        }
      }}
    >
      <DialogContent className="max-w-md p-6" dir={lang === "ar" ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="text-xl font-display text-start">
            {t("لديك حساب بالفعل!", "You have an account already!")}
          </DialogTitle>
          <DialogDescription className="text-sm mt-3 text-start leading-relaxed text-muted-foreground">
            {showAccountPopup.field === "email"
              ? t(
                  `تم العثور على حساب مسجل بالبريد الإلكتروني (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                  `A registered account already exists for this email (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                )
              : t(
                  `تم العثور على حساب مسجل برقم الهاتف (${showAccountPopup.value}). هل ترغب في تسجيل الدخول لتتبع طلباتك وتسهيل ملء بياناتك، أم تفضل المتابعة كزائر؟`,
                  `A registered account already exists for this phone number (${showAccountPopup.value}). Would you like to sign in to track your orders, or continue placing this order as a guest?`,
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-5 flex flex-col sm:flex-row gap-2 justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto h-11"
            onClick={() => {
              setShowAccountPopup({ show: false, field: null, value: "" });
              setIgnoredAccountWarning(true);
            }}
          >
            {t("المتابعة كزائر", "Continue as guest")}
          </Button>
          <Button
            className="w-full sm:w-auto h-11 bg-primary text-primary-foreground rounded-lg"
            asChild
          >
            <Link
              to="/$slug/auth"
              params={{ slug: brand.slug }}
              search={{ redirect: mounted ? window.location.pathname : "" }}
            >
              {t("تسجيل الدخول", "Sign in")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
