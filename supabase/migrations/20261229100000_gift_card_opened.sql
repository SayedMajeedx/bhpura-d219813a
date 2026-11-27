-- When a gift was opened (improvement 3 of the final report, 2026-11-27, first part): the buyer
-- sees on their purchase's page that the person it is for opened it, and the store sees it on the
-- card and the order.
--
-- `gift_cards.opened_at` is the first time someone tapped to open the gift on its page
-- (`/<store>/gift/<token>`): the page asks for it on that tap, through the server, which calls
-- `mark_gift_card_opened` (server-only). A chat's preview of the link reads the page and taps
-- nothing, so it never counts. A link given anew (`share_token` replaced, after it went to the
-- wrong person) clears it: the first opening is then the right person's.

ALTER TABLE public.gift_cards ADD COLUMN IF NOT EXISTS opened_at timestamptz;
COMMENT ON COLUMN public.gift_cards.opened_at IS
  'The first time the gift was opened on its own page (set by mark_gift_card_opened; cleared when its link is replaced).';

-- The first opening of the gift a link names in the store the link is on; answers when it was
-- opened (the first time, also on a later call), or null for a link that names nothing.
CREATE OR REPLACE FUNCTION public.mark_gift_card_opened(p_slug text, p_token text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.gift_cards%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT g.* INTO v_card
    FROM public.gift_cards g
    JOIN public.brands b ON b.id = g.brand_id
   WHERE g.share_token = p_token AND b.slug = p_slug
   FOR UPDATE OF g;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_card.opened_at IS NULL THEN
    UPDATE public.gift_cards SET opened_at = now() WHERE id = v_card.id
    RETURNING opened_at INTO v_card.opened_at;
  END IF;
  RETURN v_card.opened_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_gift_card_opened(text, text) FROM PUBLIC, anon, authenticated;

-- A new link is a new gift to open.
CREATE OR REPLACE FUNCTION public.gift_cards_link_replaced()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.share_token IS DISTINCT FROM OLD.share_token THEN
    NEW.opened_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gift_cards_link_replaced() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gift_cards_link_replaced ON public.gift_cards;
CREATE TRIGGER trg_gift_cards_link_replaced
  BEFORE UPDATE OF share_token ON public.gift_cards
  FOR EACH ROW EXECUTE FUNCTION public.gift_cards_link_replaced();
