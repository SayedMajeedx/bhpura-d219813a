import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Storefront } from "@/features/checkout/types";

/**
 * Guests typing an email or phone that already has an account are offered to
 * sign in (once; "continue as guest" silences it).
 */
export function useRegisteredAccountCheck({
  brand,
  session,
}: {
  brand: Pick<Storefront["brand"], "id">;
  session: Storefront["session"];
}) {
  const [showAccountPopup, setShowAccountPopup] = useState<{
    show: boolean;
    field: "email" | "phone" | null;
    value: string;
  }>({
    show: false,
    field: null,
    value: "",
  });
  const [ignoredAccountWarning, setIgnoredAccountWarning] = useState(false);

  const checkRegisteredAccount = async (field: "email" | "phone", value: string) => {
    if (!value || session || ignoredAccountWarning) return;
    try {
      const { data: exists, error } = await supabase.rpc("check_registered_customer_exists", {
        p_brand_id: brand.id,
        p_email: field === "email" ? value.trim() : "",
        p_phone: field === "phone" ? value.trim() : "",
      });

      if (error) {
        console.error("Error executing check_registered_customer_exists RPC:", error);
        return;
      }

      if (exists === true) {
        setShowAccountPopup({
          show: true,
          field,
          value,
        });
      }
    } catch (e) {
      console.error("Failed to check registered account via RPC", e);
    }
  };

  return {
    showAccountPopup,
    setShowAccountPopup,
    setIgnoredAccountWarning,
    checkRegisteredAccount,
  };
}
