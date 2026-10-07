-- Gift card design everywhere (WYSIWYG).
--
-- The design, names and message a buyer composes at checkout were stored on
-- `gift_cards` but never shown again: neither in the buyer's order history nor
-- in the recipient's e-mail. This migration prepares both:
--
--   1. A buyer reads the cards of their own purchases (same column grant as
--      before: the code is never readable, only its last four characters), so
--      the order page can draw the card as it was designed.
--   2. The delivery e-mail now draws the card itself, message included
--      (`giftCardVisual()` in the Edge Functions' e-mail components). The
--      `{{message}}` paragraph is removed from the template bodies so the
--      message is not printed twice; the variable stays declared and supplied.
--      The replace only touches bodies still holding the shipped wording.

create policy "gift_cards: purchaser reads own"
  on public.gift_cards for select to authenticated
  using (purchaser_user_id = (select auth.uid()));

update public.email_templates
   set body = replace(body, E'{{message}}\n\n', '')
 where key = 'gift_card_delivery'
   and body like E'%{{message}}\n\n%';

update public.email_template_translations tr
   set body = replace(tr.body, E'{{message}}\n\n', '')
  from public.email_templates t
 where t.id = tr.template_id
   and t.key = 'gift_card_delivery'
   and tr.body like E'%{{message}}\n\n%';
