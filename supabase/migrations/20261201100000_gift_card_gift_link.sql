-- A gift card's own link for the person it is given to (the owner's request of 2026-11-11).
--
-- A card was sent as a WhatsApp text with its code in it, or as the buyer's own page, which shows
-- how it was paid and where its code goes. A card now has a link of its own, for the person it is
-- for: `/<store>/gift/<share_token>` shows the card in its design with a way to copy its code, and
-- nothing about the purchase. The token is the card's (not the purchase's), so a card issued in
-- the store has one too; it is long and random, read by the store's staff with the card and by the
-- server for the page. A link sent to the wrong person is replaced: the old one stops answering,
-- the card and its code stay as they are.

ALTER TABLE public.gift_cards
  ADD COLUMN IF NOT EXISTS share_token text NOT NULL
  DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));

CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_share_token ON public.gift_cards (share_token);

-- Staff who handle the store's orders give a card a new link.
CREATE OR REPLACE FUNCTION public.reset_gift_card_share_link(p_card_id uuid)
RETURNS public.gift_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.gift_cards;
BEGIN
  SELECT * INTO v_card FROM public.gift_cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND OR NOT public.gift_card_staff(v_card.brand_id) THEN
    RAISE EXCEPTION 'GIFT_CARD_NOT_FOUND';
  END IF;
  UPDATE public.gift_cards
     SET share_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
   WHERE id = p_card_id
   RETURNING * INTO v_card;
  RETURN v_card;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_gift_card_share_link(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_gift_card_share_link(uuid) TO authenticated, service_role;
