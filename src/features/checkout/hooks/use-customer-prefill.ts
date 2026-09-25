import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SetCheckoutForm, Storefront } from "@/features/checkout/types";

/**
 * A signed-in shopper's customer record: fills empty contact fields and the
 * default saved address, and lets them switch address or type a new one.
 */
export function useCustomerPrefill({
  brand,
  session,
  setForm,
}: {
  brand: Pick<Storefront["brand"], "id">;
  session: Storefront["session"];
  setForm: SetCheckoutForm;
}) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");

  // Pre-fill from linked customer when signed in
  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      try {
        const { data: customer } = await supabase
          .from("customers")
          .select("id, name, phone, email, region, block, road, house, flat")
          .eq("brand_id", brand.id)
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (customer) {
          setCustomerId(customer.id);
          // Fetch saved addresses from customer_addresses
          const { data: addresses } = await supabase
            .from("customer_addresses")
            .select("id, label, region, block, road, house, flat, is_default")
            .eq("customer_id", customer.id);

          if (addresses && addresses.length > 0) {
            setSavedAddresses(addresses);
            const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
            setSelectedAddressId(defaultAddr.id);
            setForm((f) => ({
              ...f,
              name: f.name || customer.name || "",
              phone: f.phone || customer.phone || "",
              email: f.email || customer.email || session.user.email || "",
              label: defaultAddr.label || "",
              region: defaultAddr.region || "",
              block: defaultAddr.block || "",
              road: defaultAddr.road || "",
              house: defaultAddr.house || "",
              flat: defaultAddr.flat || "",
            }));
          } else {
            setForm((f) => ({
              ...f,
              name: f.name || customer.name || "",
              phone: f.phone || customer.phone || "",
              email: f.email || customer.email || session.user.email || "",
              region: f.region || customer.region || "",
              block: f.block || (customer as any).block || "",
              road: f.road || customer.road || "",
              house: f.house || customer.house || "",
              flat: f.flat || customer.flat || "",
            }));
          }
        } else if (session.user.email) {
          setForm((f) => ({ ...f, email: f.email || session.user.email || "" }));
        }
      } catch (e) {
        console.error("checkout prefill failed", e);
      }
    })();
  }, [session, brand.id, setForm]);

  const handleAddressChange = (addressId: string) => {
    setSelectedAddressId(addressId);
    if (addressId === "manual") {
      setForm((f) => ({
        ...f,
        label: "",
        region: "",
        block: "",
        road: "",
        house: "",
        flat: "",
      }));
    } else {
      const selected = savedAddresses.find((a) => a.id === addressId);
      if (selected) {
        setForm((f) => ({
          ...f,
          label: selected.label || "",
          region: selected.region || "",
          block: selected.block || "",
          road: selected.road || "",
          house: selected.house || "",
          flat: selected.flat || "",
        }));
      }
    }
  };

  return {
    customerId,
    savedAddresses,
    selectedAddressId,
    setSelectedAddressId,
    handleAddressChange,
  };
}
