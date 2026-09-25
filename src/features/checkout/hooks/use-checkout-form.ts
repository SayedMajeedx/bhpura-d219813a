import { useEffect, useState } from "react";

/**
 * The shopper's details and gift note, restored from and saved to
 * sessionStorage so a refresh keeps them.
 */
export function useCheckoutForm() {
  const [form, setForm] = useState<{
    name: string;
    phone: string;
    email: string;
    label: string;
    region: string;
    block: string;
    road: string;
    house: string;
    flat: string;
    notes: string;
  }>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("checkout_form");
        if (saved) return JSON.parse(saved);
      } catch {
        /* ignore invalid session storage */
      }
    }
    return {
      name: "",
      phone: "",
      email: "",
      label: "",
      region: "",
      block: "",
      road: "",
      house: "",
      flat: "",
      notes: "",
    };
  });
  const [isGift, setIsGift] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("boutq_gift_details");
        if (saved) return JSON.parse(saved).is_gift === true;
      } catch {
        // sessionStorage can be unavailable (private mode, quota) — gift details just won't persist.
      }
    }
    return false;
  });
  const [giftRecipient, setGiftRecipient] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("boutq_gift_details");
        if (saved) return JSON.parse(saved).recipient_name || "";
      } catch {
        // sessionStorage can be unavailable (private mode, quota) — gift details just won't persist.
      }
    }
    return "";
  });
  const [giftMessage, setGiftMessage] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("boutq_gift_details");
        if (saved) return JSON.parse(saved).gift_message || "";
      } catch {
        // sessionStorage can be unavailable (private mode, quota) — gift details just won't persist.
      }
    }
    return "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "boutq_gift_details",
          JSON.stringify({
            is_gift: isGift,
            recipient_name: giftRecipient,
            gift_message: giftMessage,
          }),
        );
      } catch {
        // sessionStorage can be unavailable (private mode, quota) — gift details just won't persist.
      }
    }
  }, [isGift, giftRecipient, giftMessage]);

  return {
    form,
    setForm,
    isGift,
    setIsGift,
    giftRecipient,
    setGiftRecipient,
    giftMessage,
    setGiftMessage,
  };
}
