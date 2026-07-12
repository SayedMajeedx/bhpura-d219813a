import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStorefront } from "@/lib/storefront-context";

export const Route = createFileRoute("/$slug/auth-confirmed")({ component: StorefrontAuthConfirmed });

function StorefrontAuthConfirmed() {
  const { brand, t } = useStorefront();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      // Supabase consumes the verification token from the URL before resolving
      // getSession. Brief retries cover slower mobile browsers.
      for (let attempt = 0; attempt < 20 && active; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const meta = data.session.user.user_metadata ?? {};
          await supabase.rpc("link_storefront_customer", {
            p_brand_slug: brand.slug,
            p_name: typeof meta.name === "string" ? meta.name : undefined,
            p_phone: typeof meta.phone === "string" ? meta.phone : undefined,
          });
          if (active) navigate({ to: "/$slug", params: { slug: brand.slug }, replace: true });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (active) setFailed(true);
    };
    void finish();
    return () => { active = false; };
  }, [brand.slug, navigate]);

  return <main className="mx-auto grid min-h-[55vh] max-w-lg place-items-center px-4 text-center">
    <div className="space-y-4">
      {failed ? <CheckCircle2 className="mx-auto h-12 w-12 text-amber-600" /> : <Loader2 className="mx-auto h-10 w-10 animate-spin" />}
      <h1 className="font-display text-2xl">{failed ? t("تم تأكيد البريد", "Email confirmed") : t("جارٍ تأكيد حسابك", "Confirming your account")}</h1>
      {failed && <button className="underline underline-offset-4" onClick={() => navigate({ to: "/$slug/auth", params: { slug: brand.slug }, replace: true })}>{t("المتابعة إلى تسجيل الدخول", "Continue to sign in")}</button>}
    </div>
  </main>;
}
