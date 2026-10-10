-- Cartier chains: snow chains in gold, set with stones, for 10,000 miles.
--
-- They grip exactly like the steel ones (30 miles); the price is for the look. It is the
-- owner's number, some thirty-six times the dearest rig, and deliberately out of reach of
-- ordinary play: the one thing in the shop that is only for showing off.
--
-- Sold in every garage, in both worlds. equip() needs no change: 'winter' is already a
-- slot, and it fits whatever shop_items lists and the player owns.
--
-- The price must match apps/web/src/app/shop.ts; shop.test.ts checks.
--
-- The row went onto the live project by hand on 2026-10-10, as plain SQL, so the
-- project's migration history doesn't list this file. Hence the `on conflict`: pushing
-- it later changes nothing.

insert into public.shop_items (key, price) values ('winter:cartier', 10000)
on conflict (key) do update set price = excluded.price;
