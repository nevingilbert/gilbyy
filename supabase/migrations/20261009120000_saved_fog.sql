-- The map's fog, saved: one bit for each cell of a coarse grid over the valley that the
-- player's truck has been in. See docs/decisions/0013-saved-fog.md.
--
-- The grid is 128 cells a side, so 16384 bits in 2048 bytes, and one call may carry at
-- most 512 cells. Must match apps/web/src/app/fog.ts (fog.test.ts checks).

-- Its own table, not a column on profiles: every game function returns the caller's
-- profile, and other players can read profiles.
create table public.fog (
  id uuid primary key references public.profiles on delete cascade,
  cells bytea not null check (octet_length(cells) = 2048)
);

-- No policies: only the two functions below touch it.
alter table public.fog enable row level security;

-- Marks cells as explored. The server can't see where a truck is, so like discover this
-- takes the client's word for it. Cells are only ever added, so two devices can't undo
-- each other.
create function public.explore(p_cells int[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select id from public.me());
  b bytea;
  c int;
begin
  if coalesce(cardinality(p_cells), 0) = 0 then return; end if;
  if cardinality(p_cells) > 512 then raise exception 'too many cells at once'; end if;
  if exists (select 1 from unnest(p_cells) as u(cell) where cell is null or cell < 0 or cell >= 16384) then
    raise exception 'no such cell';
  end if;
  insert into public.fog (id, cells) values (uid, decode(repeat('00', 2048), 'hex')) on conflict do nothing;
  select cells into b from public.fog where id = uid for update;
  foreach c in array p_cells loop
    b := set_bit(b, c, 1);
  end loop;
  update public.fog set cells = b where id = uid;
end;
$$;

-- The caller's explored cells as hex, or null if they have none yet.
create function public.explored() returns text
language sql security definer set search_path = '' stable as $$
  select encode(cells, 'hex') from public.fog where id = (select auth.uid());
$$;

revoke all on function public.explore(int[]), public.explored() from public, anon;
grant execute on function public.explore(int[]), public.explored() to authenticated;
