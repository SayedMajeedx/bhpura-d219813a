import { createFileRoute } from "@tanstack/react-router";
import { executeNabdaOtp, type NabdaOtpRequest } from "@/lib/nabda-otp.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

interface PhoneAttemptRecord {
  lastSent: number;
  timestamps: number[];
}

const otpPhoneAttempts = new Map<string, PhoneAttemptRecord>();
const otpUserAttempts = new Map<string, number[]>();

export const Route = createFileRoute("/api/admin/nabda-otp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const accessToken = authorization.startsWith("Bearer ")
          ? authorization.slice(7).trim()
          : "";
        if (!accessToken) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

        const { data: profile } = await (supabaseAdmin.from("profiles") as any)
          .select("role,status")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (
          !profile ||
          profile.status !== "active" ||
          !["admin", "brand_admin", "super_admin"].includes(String(profile.role))
        ) {
          return json({ error: "Forbidden" }, 403);
        }

        let body: NabdaOtpRequest;
        try {
          body = await request.json<NabdaOtpRequest>();
        } catch {
          return json({ error: "Invalid request" }, 400);
        }
        if (!body || !["status", "send", "verify"].includes(body.action)) {
          return json({ error: "Invalid action" }, 400);
        }

        // Rate limiting & cooldown protection against OTP bombing
        if (body.action === "send") {
          const rawPhone = String(body.phone || "").replace(/[^0-9]/g, "");
          if (!rawPhone || rawPhone.length < 8) {
            return json({ ok: false, enabled: true, action: "send", error: "رقم هاتف غير صالح" }, 400);
          }
          const now = Date.now();

          // 1. Phone-level cooldown (minimum 60s between sends)
          const phoneRecord = otpPhoneAttempts.get(rawPhone);
          if (phoneRecord) {
            if (now - phoneRecord.lastSent < 60_000) {
              const waitSeconds = Math.ceil((60_000 - (now - phoneRecord.lastSent)) / 1000);
              return json(
                {
                  ok: false,
                  enabled: true,
                  action: "send",
                  error: `يرجى الانتظار ${waitSeconds} ثانية قبل إعادة طلب رمز لهذا الرقم (Cooldown active)`,
                },
                429,
              );
            }
            // Max 3 sends per 10 minutes (600,000ms)
            if (phoneRecord.timestamps.filter((t) => now - t < 600_000).length >= 3) {
              return json(
                {
                  ok: false,
                  enabled: true,
                  action: "send",
                  error: "تم تجاوز الحد الأقصى لإرسال الرموز لهذا الرقم مؤقتاً. حاول بعد 10 دقائق.",
                },
                429,
              );
            }
            phoneRecord.lastSent = now;
            phoneRecord.timestamps = [...phoneRecord.timestamps.filter((t) => now - t < 600_000), now];
          } else {
            otpPhoneAttempts.set(rawPhone, { lastSent: now, timestamps: [now] });
          }

          // 2. User-level throttling (max 15 sends per hour per admin user)
          const userHistory = otpUserAttempts.get(auth.user.id) || [];
          const recentUserSends = userHistory.filter((t) => now - t < 3_600_000);
          if (recentUserSends.length >= 15) {
            return json(
              {
                ok: false,
                enabled: true,
                action: "send",
                error: "تم تجاوز الحد الأقصى لإرسال الرسائل المسموح به لحسابك في هذه الساعة.",
              },
              429,
            );
          }
          otpUserAttempts.set(auth.user.id, [...recentUserSends, now]);
        }

        try {
          const result = await executeNabdaOtp(body);
          return json(result, result.ok ? 200 : result.enabled ? 400 : 503);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Nabda request failed";
          console.error(JSON.stringify({ event: "nabda_otp_pilot_failed", action: body.action }));
          return json({ ok: false, enabled: true, action: body.action, error: message }, 502);
        }
      },
    },
  },
});
