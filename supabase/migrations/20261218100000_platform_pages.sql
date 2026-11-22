-- Platform pages: pages of Boutq's own, like the grant survey, made in the super admin (PR 1 of 3,
-- 2026-11-22; the owner's request: "/grant" and its form were written in the code, so changing a
-- word or starting a new campaign needed a programmer).
--
-- * `platform_pages`: one page at `boutq.store/p/<slug>`: its blocks (a header, text, benefits,
--   questions and answers), its form (steps of questions) and its settings (thank-you words, the
--   message once closed, a closing day, how a shared link previews). Draft, published or closed.
--   Written by a super admin only.
-- * `platform_page_responses`: what a visitor sent, the answers cleaned by the page's own form.
--   Read and handled by a super admin only; written by `submit_platform_page_response` alone,
--   which the server calls (the visitor's server function limits tries per address).
-- * `platform_page_public(slug)`: what a visitor reads: a published or closed page (published
--   past its closing day reads as closed), never a draft.
-- * `platform_page_clean_answers(form, answers)`: the form's rule for answers (a required answer,
--   each type's shape and size, a choice among the page's own options, unknown keys dropped);
--   `cleanAnswers` in src/lib/platform-pages/answers.ts is its twin.
-- * The grant survey is seeded as the page `grant`, as a draft: /grant stays as it is until the
--   responses inbox (PR 3) reads this table.
-- Run in a real Postgres by tests/platform-pages-migration.test.ts.

CREATE TABLE IF NOT EXISTS public.platform_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  content jsonb NOT NULL DEFAULT '{"blocks": []}'::jsonb
    CHECK (jsonb_typeof(content) = 'object' AND octet_length(content::text) <= 65536),
  form jsonb NOT NULL DEFAULT '{"steps": []}'::jsonb
    CHECK (jsonb_typeof(form) = 'object' AND octet_length(form::text) <= 65536),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.platform_page_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.platform_pages(id) ON DELETE CASCADE,
  answers jsonb NOT NULL
    CHECK (jsonb_typeof(answers) = 'object' AND octet_length(answers::text) <= 16384),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'shortlisted', 'accepted', 'rejected')),
  admin_notes text CHECK (admin_notes IS NULL OR char_length(admin_notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_page_responses_page_created
  ON public.platform_page_responses (page_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.platform_pages_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_pages_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_platform_pages_touch ON public.platform_pages;
CREATE TRIGGER trg_platform_pages_touch BEFORE UPDATE ON public.platform_pages
  FOR EACH ROW EXECUTE FUNCTION public.platform_pages_touch();
DROP TRIGGER IF EXISTS trg_platform_page_responses_touch ON public.platform_page_responses;
CREATE TRIGGER trg_platform_page_responses_touch BEFORE UPDATE ON public.platform_page_responses
  FOR EACH ROW EXECUTE FUNCTION public.platform_pages_touch();

-- ── Who may read and write ──────────────────────────────────────────────────
ALTER TABLE public.platform_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_page_responses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_pages, public.platform_page_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_pages TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.platform_page_responses TO authenticated;

DROP POLICY IF EXISTS "super admins manage platform pages" ON public.platform_pages;
CREATE POLICY "super admins manage platform pages" ON public.platform_pages
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "super admins read platform page responses" ON public.platform_page_responses;
CREATE POLICY "super admins read platform page responses" ON public.platform_page_responses
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS "super admins handle platform page responses" ON public.platform_page_responses;
CREATE POLICY "super admins handle platform page responses" ON public.platform_page_responses
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "super admins delete platform page responses" ON public.platform_page_responses;
CREATE POLICY "super admins delete platform page responses" ON public.platform_page_responses
  FOR DELETE TO authenticated USING (public.is_super_admin());

-- ── The form's rule for answers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_page_clean_answers(p_form jsonb, p_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_step jsonb;
  v_question jsonb;
  v_key text;
  v_type text;
  v_required boolean;
  v_raw jsonb;
  v_text text;
  v_ids text[];
  v_picked text[];
  v_item jsonb;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'ANSWERS_INVALID';
  END IF;

  FOR v_step IN SELECT value FROM jsonb_array_elements(COALESCE(p_form->'steps', '[]'::jsonb)) LOOP
    FOR v_question IN
      SELECT value FROM jsonb_array_elements(COALESCE(v_step->'questions', '[]'::jsonb))
    LOOP
      v_key := v_question->>'key';
      v_type := v_question->>'type';
      v_required := COALESCE((v_question->>'required')::boolean, false);
      v_raw := p_answers->v_key;
      SELECT COALESCE(array_agg(o->>'id'), ARRAY[]::text[])
        INTO v_ids
        FROM jsonb_array_elements(COALESCE(v_question->'options', '[]'::jsonb)) o;

      IF v_type = 'choices' THEN
        IF v_raw IS NULL OR jsonb_typeof(v_raw) = 'null' THEN
          v_picked := ARRAY[]::text[];
        ELSIF jsonb_typeof(v_raw) <> 'array' THEN
          RAISE EXCEPTION 'ANSWER_INVALID:%', v_key;
        ELSE
          v_picked := ARRAY[]::text[];
          FOR v_item IN SELECT value FROM jsonb_array_elements(v_raw) LOOP
            IF jsonb_typeof(v_item) <> 'string' OR NOT (v_item #>> '{}') = ANY(v_ids) THEN
              RAISE EXCEPTION 'ANSWER_INVALID:%', v_key;
            END IF;
            IF NOT (v_item #>> '{}') = ANY(v_picked) THEN
              v_picked := v_picked || (v_item #>> '{}');
            END IF;
          END LOOP;
        END IF;
        IF cardinality(v_picked) = 0 THEN
          IF v_required THEN RAISE EXCEPTION 'ANSWER_MISSING:%', v_key; END IF;
          CONTINUE;
        END IF;
        v_out := v_out || jsonb_build_object(v_key, to_jsonb(v_picked));
        CONTINUE;
      END IF;

      IF v_raw IS NULL OR jsonb_typeof(v_raw) = 'null' THEN
        v_text := '';
      ELSIF jsonb_typeof(v_raw) <> 'string' THEN
        RAISE EXCEPTION 'ANSWER_INVALID:%', v_key;
      ELSE
        v_text := btrim(v_raw #>> '{}');
      END IF;

      IF v_type = 'instagram' THEN
        v_text := regexp_replace(v_text, '^(@|https?://(www\.)?instagram\.com/)', '', 'i');
        v_text := btrim(regexp_replace(v_text, '[/?].*$', ''));
      ELSIF v_type = 'phone' THEN
        v_text := regexp_replace(v_text, '[^0-9+]', '', 'g');
      END IF;

      IF v_text = '' THEN
        IF v_required THEN RAISE EXCEPTION 'ANSWER_MISSING:%', v_key; END IF;
        CONTINUE;
      END IF;

      IF (v_type = 'text' AND char_length(v_text) > 200)
         OR (v_type = 'long_text' AND char_length(v_text) > 2000)
         OR (v_type = 'instagram' AND v_text !~ '^[A-Za-z0-9._]{1,30}$')
         OR (v_type = 'phone' AND v_text !~ '^\+[0-9]{8,15}$')
         OR (v_type = 'cards' AND NOT v_text = ANY(v_ids))
         OR v_type NOT IN ('text', 'long_text', 'instagram', 'phone', 'cards') THEN
        RAISE EXCEPTION 'ANSWER_INVALID:%', v_key;
      END IF;
      v_out := v_out || jsonb_build_object(v_key, v_text);
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_page_clean_answers(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ── What a visitor reads ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.platform_page_public(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'slug', p.slug,
           'status', CASE
             WHEN p.status = 'published'
                  AND (p.settings->>'closes_at') IS NOT NULL
                  AND (p.settings->>'closes_at')::timestamptz <= now() THEN 'closed'
             ELSE p.status END,
           'content', p.content,
           'form', p.form,
           'settings', p.settings - 'notes')
    FROM public.platform_pages p
   WHERE p.slug = lower(btrim(p_slug)) AND p.status IN ('published', 'closed');
$$;
REVOKE ALL ON FUNCTION public.platform_page_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_page_public(text) TO anon, authenticated;

-- ── What a visitor sends (the server calls it) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_platform_page_response(p_slug text, p_answers jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page public.platform_pages%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_page FROM public.platform_pages WHERE slug = lower(btrim(p_slug));
  IF NOT FOUND OR v_page.status = 'draft' THEN
    RAISE EXCEPTION 'PAGE_NOT_FOUND';
  END IF;
  IF v_page.status = 'closed'
     OR ((v_page.settings->>'closes_at') IS NOT NULL
         AND (v_page.settings->>'closes_at')::timestamptz <= now()) THEN
    RAISE EXCEPTION 'PAGE_CLOSED';
  END IF;
  INSERT INTO public.platform_page_responses (page_id, answers)
  VALUES (v_page.id, public.platform_page_clean_answers(v_page.form, p_answers))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_platform_page_response(text, jsonb) FROM PUBLIC, anon, authenticated;

-- ── The grant survey, as it reads today ─────────────────────────────────────
INSERT INTO public.platform_pages (slug, status, content, form, settings)
VALUES (
  'grant',
  'draft',
  $json${
    "blocks": [
      {
        "kind": "hero",
        "image_url": "/boutq-grant-banner.png",
        "badge": {"ar": "مبادرة دعم المشاريع والبراندات المحلية"},
        "title": {"ar": "برنامج انطلاقة للمتاجر"},
        "lead": {"ar": "منحة اشتراك مجاني كامل لمدة 6 أشهر (نصف سنة) لمتجرين محليين، مع مساعدة ومتابعة مباشرة حتى ينطلق متجركم الإلكتروني بأفضل صورة."},
        "points": [
          {"ar": "بدون رسوم اشتراك"},
          {"ar": "دعم فني وإعداد مخصص"},
          {"ar": "تعبئة الاستبيان: دقيقة واحدة"}
        ]
      }
    ]
  }$json$::jsonb,
  $json${
    "submit_label": {"ar": "إرسال طلب الانضمام للمنحة"},
    "steps": [
      {
        "short": {"ar": "بيانات المشروع"},
        "title": {"ar": "بيانات المشروع والتواصل"},
        "lead": {"ar": "عرفنا على اسم براندك وكيف يمكننا الوصول إليك ومراجعة منتجاتك."},
        "questions": [
          {"key": "business_name", "type": "text", "required": true, "in_summary": true,
           "label": {"ar": "اسم المشروع أو البراند التجاري"},
           "placeholder": {"ar": "مثال: بوتيك لافندر"}},
          {"key": "instagram_handle", "type": "instagram", "required": true, "in_summary": true,
           "label": {"ar": "حساب الإنستغرام للمتجر"},
           "help": {"ar": "سنقوم بمراجعة حسابك لمعاينة صور وتفاعل المتجر."}},
          {"key": "whatsapp_number", "type": "phone", "required": true, "in_summary": true,
           "label": {"ar": "رقم الواتساب للتواصل"},
           "help": {"ar": "سنرسل نتائج الاختيار والعروض المخصصة عبر الواتساب."}}
        ]
      },
      {
        "short": {"ar": "الجاهزية والنشاط"},
        "title": {"ar": "تصنيف المتجر والجاهزية"},
        "lead": {"ar": "ساعدنا في فهم نوع منتجاتك ومدى استعدادك للبدء الفعلي."},
        "questions": [
          {"key": "product_category", "type": "cards", "layout": "tiles", "required": true,
           "label": {"ar": "ما هو مجال أو نوع منتجاتك؟"},
           "options": [
             {"id": "fashion", "icon": "shirt", "title": {"ar": "أزياء"}},
             {"id": "perfumes_beauty", "icon": "sparkles", "title": {"ar": "عطور وتجميل"}},
             {"id": "accessories_gifts", "icon": "gift", "title": {"ar": "إكسسوارات وهدايا"}},
             {"id": "food_sweets", "icon": "utensils", "title": {"ar": "حلويات ومأكولات"}},
             {"id": "other", "icon": "store", "title": {"ar": "نشاط آخر"}}
           ]},
          {"key": "readiness_status", "type": "cards", "layout": "list", "required": true,
           "label": {"ar": "هل لديك منتجات وصور جاهزة للبيع حالياً؟"},
           "options": [
             {"id": "ready_with_photos", "title": {"ar": "المنتجات والصور جاهزة تماماً"},
              "body": {"ar": "نملك صوراً جاهزة للمنتجات ومستعدون لإطلاق المتجر فوراً"},
              "tag": {"ar": "أولوية ترشيح"}},
             {"id": "products_only", "title": {"ar": "المنتجات جاهزة وباقي الصور"},
              "body": {"ar": "المنتجات متوفرة ولكن نحتاج وقتاً بسيطاً لتجهيز وتصوير العينات"}},
             {"id": "idea_stage", "title": {"ar": "المشروع فكرة جديدة وقيد التجهيز"},
              "body": {"ar": "نعمل على التجهيز وسنبدأ قريباً"}}
           ]}
        ]
      },
      {
        "short": {"ar": "البيع والتحدي"},
        "title": {"ar": "قناة البيع وأكبر تحدي"},
        "lead": {"ar": "أخبرنا عن طريقة بيعك الحالية والعقبات التي تريد التخلص منها."},
        "questions": [
          {"key": "current_sales_channel", "type": "cards", "layout": "grid", "required": true,
           "label": {"ar": "كيف تستقبل طلباتك وتبيع حالياً؟"},
           "options": [
             {"id": "whatsapp_dm", "title": {"ar": "الواتساب والإنستغرام دايركت"},
              "body": {"ar": "نستقبل الطلبات يدويّاً عبر المحادثات"}},
             {"id": "existing_store", "title": {"ar": "متجر إلكتروني آخر"},
              "body": {"ar": "لدينا منصة حالية ونرغب بالترقية والانتقال لنظام أرقى"}},
             {"id": "physical_store", "title": {"ar": "محل / كشك / معرض فعلي"},
              "body": {"ar": "نبيع على أرض الواقع ونرغب بالتوسع أونلاين"}},
             {"id": "not_started", "title": {"ar": "لم نبدأ البيع بعد"},
              "body": {"ar": "ننتظر إطلاق المتجر الإلكتروني لبدء المبيعات"}}
           ]},
          {"key": "biggest_challenge", "type": "long_text", "required": false,
           "label": {"ar": "ما هو أكبر تحدٍ يواجهك في إدارة مبيعاتك وطلباتك؟"},
           "placeholder": {"ar": "مثال: صعوبة تتبع الطلبات في محادثات الواتساب..."}}
        ]
      }
    ]
  }$json$::jsonb,
  $json${
    "thank_you": {
      "badge": {"ar": "تم استلام طلبك بنجاح"},
      "title": {"ar": "شكراً لمشاركتنا شغفك ومشروعك"},
      "body": {"ar": "سعيدون جداً باهتمامك، سنقوم بمراجعة حسابكم والتواصل معكم عبر الواتساب في الموعد المحدد."},
      "share_label": {"ar": "مشاركة المبادرة مع صديق"}
    },
    "closed_message": {
      "title": {"ar": "انتهى التقديم"},
      "body": {"ar": "شكراً لاهتمامكم، أُغلق التقديم على هذه المبادرة."}
    },
    "closes_at": null,
    "share": {
      "title": {"ar": "برنامج انطلاقة للمتاجر — Boutq OS"},
      "description": {"ar": "منحة اشتراك مجاني لمدة 6 أشهر لمتجرين محليين، مع مساعدة ومتابعة حتى ينطلق متجركم."},
      "image_url": "/boutq-grant-banner.png"
    },
    "footer": [
      {"ar": "© 2026 Boutq OS — منصة إدارة وتجارة البوتيكات الخليجية والمشاريع المحلية."},
      {"ar": "يتم تقييم واختيار المشاريع بناءً على الجدية وجودة المنتجات لتوفير تجربة تشغيل متكاملة."}
    ]
  }$json$::jsonb
)
ON CONFLICT (slug) DO NOTHING;
