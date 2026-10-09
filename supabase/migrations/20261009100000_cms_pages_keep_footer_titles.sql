-- Pages & Policies: keep what the screen saves.
--
-- `business_settings.pages` is saved by the admin as { items: [...pages],
-- footer_titles: {...} } (a plain array is the older shape, still read).
-- `sanitize_cms_page_seo_fields` (20260714050000) only knew the array: for any
-- other shape it replaced the whole value with '[]', so every save from the
-- Pages screen emptied the store's pages and footer headings without an error.
--
-- This version accepts both shapes. It cleans each page's SEO text as before,
-- keeps a page's footer group to company or help, and cleans the footer
-- headings (text only, trimmed, 40 characters). Anything that is neither an
-- array nor an object with an `items` array still becomes an empty list.

CREATE OR REPLACE FUNCTION public.sanitize_cms_page_seo_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  raw_items jsonb;
  raw_titles jsonb;
  page jsonb;
  sanitized_pages jsonb := '[]'::jsonb;
  clean_title text;
  clean_description text;
  titles jsonb := '{}'::jsonb;
  title_key text;
  clean_heading text;
BEGIN
  IF NEW.pages IS NULL THEN
    NEW.pages := '[]'::jsonb;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.pages) = 'array' THEN
    raw_items := NEW.pages;
  ELSIF jsonb_typeof(NEW.pages) = 'object' AND jsonb_typeof(NEW.pages -> 'items') = 'array' THEN
    raw_items := NEW.pages -> 'items';
    raw_titles := NEW.pages -> 'footer_titles';
  ELSE
    NEW.pages := '[]'::jsonb;
    RETURN NEW;
  END IF;

  FOR page IN SELECT value FROM jsonb_array_elements(raw_items)
  LOOP
    CONTINUE WHEN jsonb_typeof(page) <> 'object';
    clean_title := left(trim(regexp_replace(regexp_replace(coalesce(page->>'meta_title', ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 70);
    clean_description := left(trim(regexp_replace(regexp_replace(coalesce(page->>'meta_description', ''), '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 160);
    page := jsonb_set(page, '{meta_title}', coalesce(to_jsonb(NULLIF(clean_title, '')), 'null'::jsonb), true);
    page := jsonb_set(page, '{meta_description}', coalesce(to_jsonb(NULLIF(clean_description, '')), 'null'::jsonb), true);
    IF page ? 'group' THEN
      page := jsonb_set(
        page, '{group}',
        to_jsonb(CASE WHEN page->>'group' = 'company' THEN 'company' ELSE 'help' END),
        true
      );
    END IF;
    sanitized_pages := sanitized_pages || jsonb_build_array(page);
  END LOOP;

  IF jsonb_typeof(NEW.pages) = 'array' THEN
    NEW.pages := sanitized_pages;
    RETURN NEW;
  END IF;

  IF jsonb_typeof(raw_titles) = 'object' THEN
    FOREACH title_key IN ARRAY ARRAY['company_en', 'company_ar', 'help_en', 'help_ar']
    LOOP
      IF jsonb_typeof(raw_titles -> title_key) = 'string' THEN
        clean_heading := left(trim(regexp_replace(regexp_replace(raw_titles ->> title_key, '<[^>]*>', ' ', 'g'), '[[:cntrl:]]', ' ', 'g')), 40);
        IF clean_heading <> '' THEN
          titles := titles || jsonb_build_object(title_key, clean_heading);
        END IF;
      END IF;
    END LOOP;
  END IF;

  NEW.pages := jsonb_build_object('items', sanitized_pages, 'footer_titles', titles);
  RETURN NEW;
END;
$$;
