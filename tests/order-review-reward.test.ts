import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve("supabase/migrations/20260825120000_order_review_rewards.sql"),
  "utf8",
);
const adminQueue = readFileSync(resolve("src/components/dashboard/ReviewRequestQueue.tsx"), "utf8");
const reviewPage = readFileSync(resolve("src/routes/review.$token.tsx"), "utf8");

// Bug #33: the enqueue trigger must see completion set by the BEFORE trigger.
const enqueueFix = readFileSync(
  resolve("supabase/migrations/20260928170000_enqueue_review_request_on_completion.sql"),
  "utf8",
);

describe("post-purchase review reward", () => {
  it("schedules the request when a status change completes the order (bug #33)", () => {
    // UPDATE OF completed_at never fires: the app never sets completed_at itself.
    expect(enqueueFix).not.toMatch(/CREATE TRIGGER[^;]*UPDATE OF completed_at/);
    expect(enqueueFix).toMatch(
      /AFTER UPDATE ON public\.orders[\s\S]*?OLD\.completed_at IS DISTINCT FROM NEW\.completed_at/,
    );
    // A phone added after completion schedules it too.
    expect(enqueueFix).toContain(
      "OLD.customer_phone_snapshot IS DISTINCT FROM NEW.customer_phone_snapshot",
    );
    expect(enqueueFix).toMatch(
      /AFTER INSERT ON public\.orders[\s\S]*?WHEN \(NEW\.completed_at IS NOT NULL\)/,
    );
    // Missed orders are scheduled once, without duplicates.
    expect(enqueueFix).toContain("o.completed_at + interval '3 days'");
    expect(enqueueFix).toContain("ON CONFLICT (order_id) DO NOTHING");
  });

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
