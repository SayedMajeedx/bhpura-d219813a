import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { allowTry, clientIp } from "@/lib/request-tries";
import { problemFromRefusal, type AnswerProblem } from "@/lib/platform-pages/answers";

/**
 * A visitor sends a platform page's form (`boutq.store/p/<slug>`). Anyone may call it, so it
 * keeps what a stranger can make it do small: a few sends an hour per address, a bounded body,
 * and the database checks the answers against the page's own form
 * (`submit_platform_page_response`, which only the server may call).
 */

const SEND = z.object({
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$/),
  answers: z
    .record(
      z.string().max(40),
      z.union([z.string().max(2000), z.array(z.string().max(80)).max(40)]),
    )
    .refine((answers) => Object.keys(answers).length <= 60),
});

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "closed" | "not_found" | "too_many" | "failed" }
  | { ok: false; reason: "answer"; problem: AnswerProblem };

/** Sends a page per address per hour, enough for a family sharing one connection. */
export const SENDS_PER_HOUR = 5;

export const sendPlatformPage = createServerFn({ method: "POST" })
  .validator((input: unknown) => SEND.parse(input))
  .handler(async ({ data }): Promise<SendResult> => {
    if (!allowTry(`platform-page:${clientIp()}`, Date.now(), SENDS_PER_HOUR)) {
      return { ok: false, reason: "too_many" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("submit_platform_page_response", {
      p_slug: data.slug,
      p_answers: data.answers,
    });
    if (!error) return { ok: true };
    const message = error.message ?? "";
    if (message.includes("PAGE_CLOSED")) return { ok: false, reason: "closed" };
    if (message.includes("PAGE_NOT_FOUND")) return { ok: false, reason: "not_found" };
    const problem = problemFromRefusal(message);
    if (problem) return { ok: false, reason: "answer", problem };
    console.error("platform page send failed", { slug: data.slug, message });
    return { ok: false, reason: "failed" };
  });
