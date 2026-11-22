import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import migration from "../supabase/migrations/20261218100000_platform_pages.sql?raw";
import grantTable from "../supabase/migrations/20260922130000_merchant_grant_applications.sql?raw";
import grantMove from "../supabase/migrations/20261219100000_grant_applications_to_platform_page.sql?raw";
import { cleanAnswers, problemFromRefusal } from "../src/lib/platform-pages/answers";
import { readPage, type PlatformPage } from "../src/lib/platform-pages/page";

// Platform pages (migration 20261218100000), in a real Postgres (PGlite): a visitor reads a
// published or closed page and never a draft, sends answers only through the server, the answers
// are cleaned by the page's own form, and the browser's rule (`cleanAnswers`) answers as the
// database does.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let db: PGlite;

const as = async <T>(role: "anon" | "authenticated" | null, run: () => Promise<T>) => {
  if (role) await db.exec(`SET ROLE ${role}`);
  try {
    return await run();
  } finally {
    if (role) await db.exec("RESET ROLE");
  }
};
const setSuperAdmin = (on: boolean) =>
  db.query("UPDATE public.test_session SET super_admin = $1", [on]);
const setGrant = (patch: string) =>
  db.exec(`UPDATE public.platform_pages SET ${patch} WHERE slug = 'grant'`);

const readPublic = async (slug = "grant") =>
  (
    await as("anon", () =>
      db.query<{ page: unknown }>("SELECT public.platform_page_public($1) AS page", [slug]),
    )
  ).rows[0].page;

/** The server's send (the service role); answers the refusal's message, or the stored answers. */
async function send(answers: unknown, slug = "grant") {
  try {
    const { rows } = await db.query<{ id: string }>(
      "SELECT public.submit_platform_page_response($1, $2::jsonb) AS id",
      [slug, JSON.stringify(answers)],
    );
    const stored = await db.query<{ answers: unknown }>(
      "SELECT answers FROM public.platform_page_responses WHERE id = $1",
      [rows[0].id],
    );
    return { answers: stored.rows[0].answers };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

const GOOD = {
  business_name: "  بوتيك لافندر ",
  instagram_handle: "https://instagram.com/lavender.bh/?igsh=1",
  whatsapp_number: "+973 3900 0000",
  product_category: "fashion",
  readiness_status: "ready_with_photos",
  current_sales_channel: "whatsapp_dm",
  extra_field: "dropped",
};

let grant: PlatformPage;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
    CREATE TABLE public.test_session (super_admin boolean NOT NULL DEFAULT false);
    INSERT INTO public.test_session DEFAULT VALUES;
    GRANT SELECT ON public.test_session TO anon, authenticated;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE
      AS 'SELECT super_admin FROM public.test_session';
  `);
  await db.exec(migration);
  await setGrant("status = 'published'");
  grant = readPage(await readPublic()) as PlatformPage;
});

describe("what a visitor reads", () => {
  it("reads the grant page as seeded, three steps of the survey", () => {
    expect(grant.form.steps.map((s) => s.questions.map((q) => q.key))).toEqual([
      ["business_name", "instagram_handle", "whatsapp_number"],
      ["product_category", "readiness_status"],
      ["current_sales_channel", "biggest_challenge"],
    ]);
    expect(grant.blocks[0]).toMatchObject({
      kind: "hero",
      title: { ar: "برنامج انطلاقة للمتاجر" },
    });
  });

  it("never reads a draft, and reads a page past its closing day as closed", async () => {
    await setGrant("status = 'draft'");
    expect(await readPublic()).toBeNull();
    await setGrant(
      "status = 'published', settings = settings || '{\"closes_at\": \"2020-01-01T00:00:00Z\"}'",
    );
    expect(await readPublic()).toMatchObject({ status: "closed" });
    await setGrant("settings = settings || '{\"closes_at\": null}'");
    expect(await readPublic()).toMatchObject({ status: "published" });
  });

  it("is a page to read only: a visitor can neither list pages nor send answers", async () => {
    await expect(as("anon", () => db.query("SELECT * FROM public.platform_pages"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      as("anon", () =>
        db.query("SELECT public.submit_platform_page_response('grant', '{}'::jsonb)"),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as("authenticated", () =>
        db.query("SELECT public.submit_platform_page_response('grant', '{}'::jsonb)"),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("lets a super admin manage pages and read responses, and no other account", async () => {
    await setSuperAdmin(false);
    const none = await as("authenticated", () =>
      db.query("SELECT slug FROM public.platform_pages"),
    );
    expect(none.rows).toHaveLength(0);
    await setSuperAdmin(true);
    const all = await as("authenticated", () => db.query("SELECT slug FROM public.platform_pages"));
    expect(all.rows).toEqual([{ slug: "grant" }]);
    await setSuperAdmin(false);
  });
});

describe("what a visitor sends", () => {
  it("keeps the answers cleaned by the page's own form", async () => {
    expect(await send(GOOD)).toEqual({
      answers: {
        business_name: "بوتيك لافندر",
        instagram_handle: "lavender.bh",
        whatsapp_number: "+97339000000",
        product_category: "fashion",
        readiness_status: "ready_with_photos",
        current_sales_channel: "whatsapp_dm",
      },
    });
  });

  it("refuses a draft, a closed page and a page past its closing day", async () => {
    expect(await send(GOOD, "nowhere")).toEqual({ error: "PAGE_NOT_FOUND" });
    await setGrant("status = 'draft'");
    expect(await send(GOOD)).toEqual({ error: "PAGE_NOT_FOUND" });
    await setGrant("status = 'closed'");
    expect(await send(GOOD)).toEqual({ error: "PAGE_CLOSED" });
    await setGrant(
      "status = 'published', settings = settings || '{\"closes_at\": \"2020-01-01T00:00:00Z\"}'",
    );
    expect(await send(GOOD)).toEqual({ error: "PAGE_CLOSED" });
    await setGrant("settings = settings || '{\"closes_at\": null}'");
  });

  // Each case is sent to the database and checked by the browser's twin: both must agree.
  const cases: Array<[string, Record<string, unknown>]> = [
    ["every answer good", GOOD],
    ["a required answer missing", { ...GOOD, business_name: "  " }],
    ["a required choice missing", { ...GOOD, product_category: undefined }],
    ["a choice that is not the page's", { ...GOOD, readiness_status: "maybe" }],
    ["an Instagram name with spaces", { ...GOOD, instagram_handle: "lavender bh" }],
    ["a phone with no country code", { ...GOOD, whatsapp_number: "39000000" }],
    ["a phone too short", { ...GOOD, whatsapp_number: "+97312" }],
    ["a name too long", { ...GOOD, business_name: "ب".repeat(201) }],
    ["a long answer of 2000 letters", { ...GOOD, biggest_challenge: "ت".repeat(2000) }],
    ["a long answer of 2001 letters", { ...GOOD, biggest_challenge: "ت".repeat(2001) }],
    ["an answer that is not text", { ...GOOD, business_name: 42 }],
    ["an optional answer left empty", { ...GOOD, biggest_challenge: "" }],
  ];
  for (const [name, answers] of cases) {
    it(`agrees with the browser: ${name}`, async () => {
      const database = await send(answers);
      const browser = cleanAnswers(grant.form, answers);
      if ("problem" in browser) {
        expect(database.error && problemFromRefusal(database.error)).toEqual(browser.problem);
      } else {
        expect(database).toEqual({ answers: browser.answers });
      }
    });
  }

  it("refuses answers that are not an object", async () => {
    expect(await send([1, 2])).toEqual({ error: "ANSWERS_INVALID" });
  });
});

describe("the grant survey moving into its page (migration 20261219100000)", () => {
  it("copies every application once, publishes the page and sends new ones through it", async () => {
    await db.exec(grantTable);
    await db.exec(`
      INSERT INTO public.merchant_grant_applications
        (id, business_name, instagram_handle, whatsapp_number, product_category,
         readiness_status, current_sales_channel, biggest_challenge, status, offered_grant, admin_notes)
      VALUES
        ('00000000-0000-4000-8000-0000000000a1', 'لافندر', 'lavender.bh', '+97339000000', 'fashion',
         'ready_with_photos', 'whatsapp_dm', '  ', 'pending', 'none', NULL),
        ('00000000-0000-4000-8000-0000000000a2', 'سكر', 'sukkar', '+97336000000', 'food_sweets',
         'products_only', 'physical_store', 'الطلبات كثيرة', 'offered_3_months', '3_months_free', 'متجر جاد');
    `);
    await setGrant("status = 'draft'");
    await db.exec(grantMove);
    await db.exec(grantMove); // twice: the copy runs once

    const { rows } = await db.query<{
      id: string;
      answers: Record<string, string>;
      status: string;
      admin_notes: string | null;
    }>(
      "SELECT id, answers, status, admin_notes FROM public.platform_page_responses WHERE id::text LIKE '%a_' ORDER BY id",
    );
    expect(rows).toEqual([
      {
        id: "00000000-0000-4000-8000-0000000000a1",
        answers: {
          business_name: "لافندر",
          instagram_handle: "lavender.bh",
          whatsapp_number: "+97339000000",
          product_category: "fashion",
          readiness_status: "ready_with_photos",
          current_sales_channel: "whatsapp_dm",
        },
        status: "new",
        admin_notes: null,
      },
      {
        id: "00000000-0000-4000-8000-0000000000a2",
        answers: expect.objectContaining({ biggest_challenge: "الطلبات كثيرة" }),
        status: "accepted",
        admin_notes: "متجر جاد\nالعرض: 3 أشهر مجاناً",
      },
    ]);
    expect(await readPublic()).toMatchObject({ status: "published" });

    const sent = await as("anon", () =>
      db.query<{ id: string }>(
        "SELECT public.submit_grant_application('نخلة', '@nakhla', '+966 50 000 0000', 'other', 'idea_stage', 'not_started') AS id",
      ),
    );
    const stored = await db.query<{ answers: Record<string, string> }>(
      "SELECT answers FROM public.platform_page_responses WHERE id = $1",
      [sent.rows[0].id],
    );
    expect(stored.rows[0].answers).toMatchObject({
      instagram_handle: "nakhla",
      whatsapp_number: "+966500000000",
    });
  });
});
