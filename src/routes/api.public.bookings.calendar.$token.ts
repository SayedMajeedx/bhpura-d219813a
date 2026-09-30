import { createFileRoute } from "@tanstack/react-router";
import { feedToken } from "@/lib/bookings/ics";
import { calendarFeedFor } from "@/lib/bookings/calendar-feed.server";

/**
 * A store's bookings as a calendar feed for its private link
 * (/api/public/bookings/calendar/<token>.ics). Anyone with the link can read
 * it, like a calendar app's own private address; the store resets it to
 * revoke it.
 */
export const Route = createFileRoute("/api/public/bookings/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = feedToken(params.token);
        if (!token) return new Response("Not found.", { status: 404 });
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const ics = await calendarFeedFor(supabaseAdmin, token);
          if (!ics) return new Response("Not found.", { status: 404 });
          return new Response(ics, {
            status: 200,
            headers: {
              "Content-Type": "text/calendar; charset=utf-8",
              "Content-Disposition": 'inline; filename="bookings.ics"',
              "Cache-Control": "private, max-age=300",
              "X-Robots-Tag": "noindex",
            },
          });
        } catch {
          return new Response("Calendar is temporarily unavailable.", { status: 503 });
        }
      },
    },
  },
});
