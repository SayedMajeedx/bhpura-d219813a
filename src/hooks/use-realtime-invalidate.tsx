import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { realtimeFilter, RealtimeBurst } from "@/lib/realtime-burst";

type Sub = {
  table: string;
  brandId?: string;
  queryKey: QueryKey;
};

/**
 * Subscribe to postgres_changes for one or more tables scoped to a brand and invalidate the
 * matching React Query keys on a change (the speed review of 2026-11-22):
 *
 * - The store is filtered by the server (`brand_id=eq.<id>`): every store's changes were sent to
 *   every open admin and dropped in the browser, each checked by the database's row rules on
 *   the way.
 * - A burst is one refresh: placing one order writes the order, its lines and a few updates,
 *   and each change refetched the whole list, cancelling the read before it. Changes within
 *   `RealtimeBurst`'s wait are gathered and each key is invalidated once.
 * - Only what is on screen is read again; a list kept for later is marked stale and read when
 *   it is shown.
 */
export function useRealtimeInvalidate(subs: Sub[], channelName: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!subs.length) return;
    const burst = new RealtimeBurst((keys) => {
      for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
    });
    const channel = supabase.channel(channelName);
    for (const s of subs) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table: s.table,
          ...realtimeFilter(s.brandId),
        },
        (payload: any) => {
          if (s.brandId) {
            const newBrand = payload?.new?.brand_id;
            const oldBrand = payload?.old?.brand_id;
            if (newBrand && newBrand !== s.brandId) return;
            if (oldBrand && oldBrand !== s.brandId) return;
          }
          burst.add(s.queryKey);
        },
      );
    }
    channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        // Silently handle channel errors as Supabase handles reconnects automatically
      }
    });
    return () => {
      burst.stop();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, JSON.stringify(subs.map((s) => [s.table, s.brandId, s.queryKey]))]);
}
