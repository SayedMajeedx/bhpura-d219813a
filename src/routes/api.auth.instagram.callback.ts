import { createFileRoute } from "@tanstack/react-router";
import {
  decodeOAuthState,
  exchangeCodeForLongLivedToken,
  storeInstagramConnection,
} from "@/lib/instagram-oauth.server";

export const Route = createFileRoute("/api/auth/instagram/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawCode = url.searchParams.get("code");
        const rawState = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorReason = url.searchParams.get("error_reason");
        const errorDescription = url.searchParams.get("error_description");

        // Handle user cancellation or error from Meta
        if (error || !rawCode) {
          console.warn("Instagram OAuth callback reported error:", {
            error,
            errorReason,
            errorDescription,
          });

          let returnUrl = "/onboard";
          if (rawState) {
            const state = decodeOAuthState(rawState);
            if (state?.returnTo) returnUrl = state.returnTo;
          }

          const redirectUrl = new URL(returnUrl, request.url);
          redirectUrl.searchParams.set(
            "instagram_error",
            errorDescription || errorReason || error || "user_cancelled",
          );
          return Response.redirect(redirectUrl.toString(), 302);
        }

        // Validate HMAC-signed state
        if (!rawState) {
          return new Response("Missing OAuth state parameter", { status: 400 });
        }

        const state = decodeOAuthState(rawState);
        if (!state || !state.brandId) {
          return new Response("Invalid or expired OAuth state parameter", { status: 400 });
        }

        // Clean code (Meta sometimes appends #_ to the code parameter)
        const code = rawCode.replace(/#_$/, "");

        try {
          // 1. Exchange code for short-lived token then upgrade to 60-day long-lived token
          const tokenResult = await exchangeCodeForLongLivedToken(code);

          // 2. Encrypt and store token in Supabase Vault linked to brandId
          await storeInstagramConnection({
            brandId: state.brandId,
            userId: state.userId,
            accessToken: tokenResult.longLivedToken,
            expiresIn: tokenResult.expiresIn,
            instagramUserId: tokenResult.instagramUserId,
            instagramUsername: tokenResult.instagramUsername,
          });

          // 3. Redirect back to store onboarding or admin dashboard
          const returnTo = state.returnTo || "/onboard";
          const redirectUrl = new URL(returnTo, request.url);
          redirectUrl.searchParams.set("instagram_connected", "true");
          redirectUrl.searchParams.set("brandId", state.brandId);
          if (tokenResult.instagramUsername) {
            redirectUrl.searchParams.set("instagram_handle", tokenResult.instagramUsername);
          }

          return Response.redirect(redirectUrl.toString(), 302);
        } catch (err: any) {
          console.error("Instagram OAuth exchange failed:", err);
          const redirectUrl = new URL(state.returnTo || "/onboard", request.url);
          redirectUrl.searchParams.set(
            "instagram_error",
            err.message || "Failed to complete Instagram connection",
          );
          return Response.redirect(redirectUrl.toString(), 302);
        }
      },
    },
  },
});
