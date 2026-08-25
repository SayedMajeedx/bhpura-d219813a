import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260825120000_order_review_rewards.sql"),
  "utf8",
);
const adminQueue = readFileSync(resolve("src/components/dashboard/ReviewRequestQueue.tsx"), "utf8");
const reviewPage = readFileSync(resolve("src/routes/review.$token.tsx"), "utf8");

describe("post-purchase review reward", () => {
  it("schedules one tokenized request three days after completion", () => {
    expect(migration).toContain("UNIQUE REFERENCES public.orders(id)");
    expect(migration).toContain("NEW.completed_at + interval '3 days'");
    expect(migration).toContain("public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()");
  });

  it("keeps review tables private and exposes token-scoped public RPCs", () => {
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain(
      "REVOKE ALL ON public.order_reviews FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("WHERE r.public_token = p_token AND r.eligible_at <= now()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.submit_public_order_review");
  });

  it("separates opening WhatsApp from confirming that the message was sent", () => {
    expect(adminQueue).toContain('updateStatus(request.request_id, "whatsapp_opened")');
    expect(adminQueue).toContain('updateStatus(request.request_id, "sent")');
  });

  it("reveals THANKU10 only after completion", () => {
    expect(migration).toContain("CASE WHEN r.status = 'completed'");
    expect(reviewPage).toContain("إرسال التقييم واستلام الخصم");
    expect(reviewPage).toContain("استخدام الخصم عبر الواتساب");
  });
});
