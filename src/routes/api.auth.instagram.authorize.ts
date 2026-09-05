import { createFileRoute } from "@tanstack/react-router";
import { buildInstagramAuthorizeUrl } from "@/lib/instagram-oauth.server";

export const Route = createFileRoute("/api/auth/instagram/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const brandId = url.searchParams.get("brandId");
        const returnTo = url.searchParams.get("returnTo") || "/onboard";

        if (!brandId) {
          return new Response("Missing brandId parameter", { status: 400 });
        }

        // Authentication & Session Guard (Requirement 4)
        const authorization = request.headers.get("authorization") ?? "";
        const cookieHeader = request.headers.get("cookie") ?? "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let authenticatedUserId: string | null = null;

        if (authorization.startsWith("Bearer ")) {
          const token = authorization.slice(7).trim();
          const { data: authUser } = await supabaseAdmin.auth.getUser(token);
          if (authUser?.user) authenticatedUserId = authUser.user.id;
        }

        // If no bearer token, check session from cookie if available
        if (!authenticatedUserId && cookieHeader) {
          // Check standard auth token in cookies
          const match = cookieHeader.match(/(^|;)\s*sb-[a-z0-9]+-auth-token\s*=\s*([^;]+)/i);
          if (match && match[2]) {
            try {
              const decoded = decodeURIComponent(match[2]);
              const parsed = JSON.parse(decoded);
              const token = Array.isArray(parsed) ? parsed[0] : parsed?.access_token;
              if (token) {
                const { data: authUser } = await supabaseAdmin.auth.getUser(token);
                if (authUser?.user) authenticatedUserId = authUser.user.id;
              }
            } catch {}
          }
        }

        if (!authenticatedUserId) {
          // If called from browser directly without auth, reject or redirect to auth
          const wantsJson = request.headers.get("accept")?.includes("application/json");
          if (wantsJson) {
            return new Response(JSON.stringify({ error: "Unauthorized: Active session required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }
          const loginRedirect = new URL("/auth", request.url);
          loginRedirect.searchParams.set("redirect", request.url);
          return Response.redirect(loginRedirect.toString(), 302);
        }

        // Verify brand access
        const [{ data: hasAccess }, { data: isAdmin }] = await Promise.all([
          (supabaseAdmin.rpc as any)("can_access_brand", { _brand_id: brandId }),
          (supabaseAdmin.rpc as any)("is_admin"),
        ]);

        // Also check if user is the brand owner directly
        const { data: brand } = await (supabaseAdmin.from("brands") as any)
          .select("id, owner_id")
          .eq("id", brandId)
          .maybeSingle();

        const isOwner = brand && brand.owner_id === authenticatedUserId;

        if (!hasAccess && !isAdmin && !isOwner) {
          return new Response("Forbidden: You do not have access to this brand", { status: 403 });
        }

        try {
          const authUrl = buildInstagramAuthorizeUrl({
            brandId,
            userId: authenticatedUserId,
            returnTo,
          });

          const wantsJson = request.headers.get("accept")?.includes("application/json") || url.searchParams.get("format") === "json";
          if (wantsJson) {
            return new Response(JSON.stringify({ url: authUrl }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          return Response.redirect(authUrl, 302);
        } catch (err: any) {
          console.error("Failed to build Instagram authorization URL:", err);
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
