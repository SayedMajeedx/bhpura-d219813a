import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useStorefront } from "@/lib/storefront-context";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { signOut, brand, t } = useStorefront();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full text-xs font-semibold gap-1.5 transition duration-(--motion-medium) hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/20 dark:hover:text-rose-400"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
      }}
    >
      <LogOut className="h-3.5 w-3.5 me-1" />
      {t("تسجيل خروج", "Sign out")}
    </Button>
  );
}
