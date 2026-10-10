-- A winch for the front bumper, to pull another driver off a rock they're stuck on, and
-- BBB, a tow truck a stuck driver can ring when nobody with a winch is about. See
-- docs/decisions/0020-stuck-and-the-winch.md.
--
-- Being stuck, being winched off and being towed are between the players' browsers:
-- nothing about any of them is stored or counted, so nothing here can check them. All
-- the database does is sell the winch, let it be fitted, and take BBB's fee.

-- Must match apps/web/src/app/shop.ts (shop.test.ts checks).
insert into public.shop_items (key, price) values ('winch:none', 0), ('winch:winch', 10);

-- A loadout has a sixth slot. One saved before this names no winch, which reads as none,
-- and a page loaded before this never sends one, so both carry on as they were.
create or replace function public.equip(p_vehicle text, p_loadout jsonb) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  part record;
  wanted text[];
begin
  select * into p from public.me();
  wanted := array['vehicle:' || p_vehicle];
  for part in select key, value from jsonb_each_text(p_loadout) loop
    if part.key not in ('paint', 'tyres', 'lights', 'snorkel', 'winter', 'winch') then
      raise exception 'unknown part slot: %', part.key;
    end if;
    wanted := wanted || (part.key || ':' || part.value);
  end loop;
  if exists (
    select 1 from unnest(wanted) as w(key)
    left join public.shop_items s on s.key = w.key
    where s.key is null or (s.price > 0 and not (w.key = any (p.owned)))
  ) then
    raise exception 'not owned';
  end if;
  update public.profiles set vehicle = p_vehicle, loadout = p_loadout where id = p.id returning * into p;
  return p;
end;
$$;

-- BBB's fee for a tow. The server can't see a truck on a rock, so it takes the caller's
-- word that there is one: all a made-up call does is spend the caller's own miles.
-- The fee must match TOW_FEE in apps/web/src/app/tow.ts (stuck.test.ts checks).
create function public.call_tow() returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles;
  fee constant numeric := 5;
begin
  select * into p from public.me();
  if p.balance < fee then raise exception 'not enough miles'; end if;
  update public.profiles set balance = balance - fee where id = p.id returning * into p;
  return p;
end;
$$;

revoke all on function public.call_tow() from public, anon;
grant execute on function public.call_tow() to authenticated;
