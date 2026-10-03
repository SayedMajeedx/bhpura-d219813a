import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useBrand } from "@/lib/brand-context";
import { useI18n } from "@/lib/i18n";
import {
  connectInstagram,
  GiveawayApiError,
  giveawaysQueries,
  invalidateGiveaways,
  startInstagramOAuth,
} from "@/lib/data/giveaways";
import { giveawayErrorMessage, instagramOAuthMessage } from "../lib/messages";
import { goTo } from "../lib/navigate";

/** A token becomes a problem when 10 or fewer days remain (Instagram tokens last 60). */
export const EXPIRY_WARNING_DAYS = 10;

/** The brand's Instagram connection and the form that stores a new token. */
export function useInstagramConnection() {
  const brand = useBrand();
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const qc = useQueryClient();
  const query = useQuery(giveawaysQueries.connection(brand.id));
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Instagram sends the browser back here with the outcome in the address.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("instagram_error");
    const connectedNow = params.get("instagram") === "connected";
    if (!failure && !connectedNow) return;
    if (failure) {
      setNotice({ kind: "error", text: instagramOAuthMessage(failure, isAr) });
    } else {
      setNotice({
        kind: "success",
        text: isAr ? "تم ربط انستغرام بنجاح." : "Instagram connected successfully.",
      });
      void invalidateGiveaways(qc, brand.id);
    }
    // Leave the address clean so a refresh does not repeat the message.
    for (const key of ["instagram", "instagram_error", "permissions"]) params.delete(key);
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, [brand.id, isAr, qc]);

  const startOAuth = useMutation({
    mutationFn: () => startInstagramOAuth(brand.id),
    onSuccess: (url) => goTo(url),
    onError: (e) => {
      const code = e instanceof GiveawayApiError ? e.code : "server_error";
      setNotice({ kind: "error", text: instagramOAuthMessage(code, isAr) });
    },
  });

  const connect = useMutation({
    mutationFn: () => connectInstagram(brand.id, token.trim()),
    onSuccess: async (data) => {
      setToken("");
      setError(null);
      await invalidateGiveaways(qc, brand.id);
      toast.success(isAr ? `تم ربط @${data.username}` : `Connected @${data.username}`);
    },
    onError: (e) => {
      const code = e instanceof GiveawayApiError ? e.code : "server_error";
      const detail = e instanceof Error ? e.message : undefined;
      setError(
        giveawayErrorMessage(code === "token_expired" ? "instagram_error" : code, isAr, detail),
      );
    },
  });

  const status = query.data;
  return {
    isAr,
    loading: query.isLoading,
    connected: Boolean(status?.is_connected),
    username: status?.instagram_username ?? null,
    daysLeft: status?.days_until_expiry ?? null,
    expiringSoon:
      status?.is_connected === true && (status.days_until_expiry ?? 99) <= EXPIRY_WARNING_DAYS,
    expired: status != null && !status.is_connected,
    refreshError: status?.refresh_error ?? null,
    notice,
    dismissNotice: () => setNotice(null),
    startOAuth: () => startOAuth.mutate(),
    startingOAuth: startOAuth.isPending,
    token,
    setToken,
    error,
    connecting: connect.isPending,
    connect: () => connect.mutate(),
  };
}

export type InstagramConnectionState = ReturnType<typeof useInstagramConnection>;
