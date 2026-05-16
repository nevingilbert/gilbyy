-- 0001_init.sql
-- Meals schema — full initial migration.
-- Run against the live Supabase project via:
--   supabase db push  (or paste into the Supabase SQL editor)

create schema if not exists meals;

-- ============================================================
-- Tables
-- ============================================================

create table meals.foods (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users,
  -- null  → public food (USDA or OFF); set → personal food
  name            text not null,
  source          text not null check (source in ('usda', 'off', 'user')),
  ext_id          text,
  macros_per_100g jsonb not null,
  -- required keys: calories, protein_g, carbs_g, fat_g
  -- optional:      fiber_g, sugar_g, sodium_mg
  created_at      timestamptz not null default now(),
  unique (user_id, name)
);

create table meals.plans (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users,
  name            text not null,
  duration_days   int not null default 7,
  started_at      date,
  -- null until first cooking_event; auto-set by the app then
  created_at      timestamptz not null default now()
);

create table meals.plan_members (
  plan_id         uuid not null references meals.plans on delete cascade,
  user_id         uuid not null references auth.users,
  display_name    text not null,
  targets         jsonb not null,
  -- required keys: calories, protein_g, carbs_g, fat_g
  added_at        timestamptz not null default now(),
  primary key (plan_id, user_id)
);

-- ============================================================
-- Helper function (defined after plan_members so the table exists)
-- ============================================================

-- SECURITY DEFINER lets RLS policies call this without the
-- callers needing direct access to plan_members.
create or replace function meals.is_plan_member(p_plan_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from meals.plan_members
    where plan_id = p_plan_id
      and user_id = auth.uid()
  );
$$;

create table meals.recipes (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references meals.plans on delete cascade,
  name            text not null,
  slot            text not null check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  planned_count   int not null default 1,
  instructions    text not null default '',
  position        int not null,
  -- display order within slot; assigned at upload time
  unique (plan_id, name)
);

create table meals.recipe_ingredients (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid not null references meals.recipes on delete cascade,
  food_id         uuid not null references meals.foods,
  unit            text not null check (unit in ('g', 'ml', 'unit')),
  total_quantity  numeric not null,
  position        int not null,
  unique (recipe_id, position)
);

create table meals.recipe_ingredient_portions (
  id                   uuid primary key default gen_random_uuid(),
  recipe_ingredient_id uuid not null references meals.recipe_ingredients on delete cascade,
  plan_member_user_id  uuid not null references auth.users,
  quantity             numeric not null,
  -- invariant: sum of quantity over (recipe_ingredient_id) = recipe_ingredients.total_quantity
  unique (recipe_ingredient_id, plan_member_user_id)
);

create table meals.recipe_claimed_macros (
  id                  uuid primary key default gen_random_uuid(),
  recipe_id           uuid not null references meals.recipes on delete cascade,
  plan_member_user_id uuid not null references auth.users,
  calories            numeric not null,
  protein_g           numeric not null,
  carbs_g             numeric not null,
  fat_g               numeric not null,
  unique (recipe_id, plan_member_user_id)
);

create table meals.grocery_items (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references meals.plans on delete cascade,
  food_id        uuid not null references meals.foods,
  total_quantity numeric not null,
  unit           text not null check (unit in ('g', 'ml', 'unit')),
  checked_off_at timestamptz,
  unique (plan_id, food_id, unit)
);

create table meals.cooking_events (
  id                uuid primary key default gen_random_uuid(),
  plan_id           uuid not null references meals.plans on delete cascade,
  recipe_id         uuid not null references meals.recipes,
  cooked_by_user_id uuid not null references auth.users,
  cooked_at         timestamptz not null default now()
  -- no uniqueness constraint: a recipe with planned_count = 3 may have up to 3 rows
);

create table meals.consumption (
  id               uuid primary key default gen_random_uuid(),
  cooking_event_id uuid not null references meals.cooking_events on delete cascade,
  eater_user_id    uuid not null references auth.users,
  servings         numeric not null default 1,
  eaten_at         timestamptz not null default now(),
  unique (cooking_event_id, eater_user_id)
);

-- ============================================================
-- Indexes
-- ============================================================

create index on meals.foods (name);
create index on meals.recipes (plan_id, slot, position);
create index on meals.cooking_events (plan_id, cooked_at desc);
create index on meals.consumption (eater_user_id, eaten_at);

-- ============================================================
-- Enable RLS (default-deny on every table)
-- ============================================================

alter table meals.foods                      enable row level security;
alter table meals.plans                      enable row level security;
alter table meals.plan_members               enable row level security;
alter table meals.recipes                    enable row level security;
alter table meals.recipe_ingredients         enable row level security;
alter table meals.recipe_ingredient_portions enable row level security;
alter table meals.recipe_claimed_macros      enable row level security;
alter table meals.grocery_items              enable row level security;
alter table meals.cooking_events             enable row level security;
alter table meals.consumption                enable row level security;

-- ============================================================
-- RLS policies — foods
-- Public foods (user_id IS NULL) are world-readable to all
-- authenticated users.  Personal foods are owner-only.
-- ============================================================

create policy "foods: read public or own"
  on meals.foods for select to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "foods: insert own"
  on meals.foods for insert to authenticated
  with check (user_id = auth.uid());

create policy "foods: update own"
  on meals.foods for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "foods: delete own"
  on meals.foods for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- RLS policies — plans (owner-only)
-- ============================================================

create policy "plans: owner read"
  on meals.plans for select to authenticated
  using (owner_user_id = auth.uid());

create policy "plans: owner insert"
  on meals.plans for insert to authenticated
  with check (owner_user_id = auth.uid());

create policy "plans: owner update"
  on meals.plans for update to authenticated
  using  (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "plans: owner delete"
  on meals.plans for delete to authenticated
  using (owner_user_id = auth.uid());

-- ============================================================
-- RLS policies — plan_members
-- SELECT / UPDATE / DELETE: any current plan member.
-- INSERT: plan owner OR existing plan member.
--   The owner check is needed to bootstrap the first member row:
--   is_plan_member would be false until that first INSERT lands.
-- ============================================================

create policy "plan_members: member read"
  on meals.plan_members for select to authenticated
  using (meals.is_plan_member(plan_id));

create policy "plan_members: owner or member insert"
  on meals.plan_members for insert to authenticated
  with check (
    meals.is_plan_member(plan_id)
    or exists (
      select 1 from meals.plans
      where id = plan_id
        and owner_user_id = auth.uid()
    )
  );

create policy "plan_members: member update"
  on meals.plan_members for update to authenticated
  using  (meals.is_plan_member(plan_id))
  with check (meals.is_plan_member(plan_id));

create policy "plan_members: member delete"
  on meals.plan_members for delete to authenticated
  using (meals.is_plan_member(plan_id));

-- ============================================================
-- RLS policies — recipes (plan-scoped via plan_id)
-- ============================================================

create policy "recipes: member read"
  on meals.recipes for select to authenticated
  using (meals.is_plan_member(plan_id));

create policy "recipes: member insert"
  on meals.recipes for insert to authenticated
  with check (meals.is_plan_member(plan_id));

create policy "recipes: member update"
  on meals.recipes for update to authenticated
  using  (meals.is_plan_member(plan_id))
  with check (meals.is_plan_member(plan_id));

create policy "recipes: member delete"
  on meals.recipes for delete to authenticated
  using (meals.is_plan_member(plan_id));

-- ============================================================
-- RLS policies — recipe_ingredients (join through recipes)
-- ============================================================

create policy "recipe_ingredients: member read"
  on meals.recipe_ingredients for select to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredients: member insert"
  on meals.recipe_ingredients for insert to authenticated
  with check (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredients: member update"
  on meals.recipe_ingredients for update to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  )
  with check (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredients: member delete"
  on meals.recipe_ingredients for delete to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

-- ============================================================
-- RLS policies — recipe_ingredient_portions
-- (join: portion → ingredient → recipe → plan)
-- ============================================================

create policy "recipe_ingredient_portions: member read"
  on meals.recipe_ingredient_portions for select to authenticated
  using (
    exists (
      select 1
      from meals.recipe_ingredients ri
      join meals.recipes r on r.id = ri.recipe_id
      where ri.id = recipe_ingredient_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredient_portions: member insert"
  on meals.recipe_ingredient_portions for insert to authenticated
  with check (
    exists (
      select 1
      from meals.recipe_ingredients ri
      join meals.recipes r on r.id = ri.recipe_id
      where ri.id = recipe_ingredient_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredient_portions: member update"
  on meals.recipe_ingredient_portions for update to authenticated
  using (
    exists (
      select 1
      from meals.recipe_ingredients ri
      join meals.recipes r on r.id = ri.recipe_id
      where ri.id = recipe_ingredient_id
        and meals.is_plan_member(r.plan_id)
    )
  )
  with check (
    exists (
      select 1
      from meals.recipe_ingredients ri
      join meals.recipes r on r.id = ri.recipe_id
      where ri.id = recipe_ingredient_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_ingredient_portions: member delete"
  on meals.recipe_ingredient_portions for delete to authenticated
  using (
    exists (
      select 1
      from meals.recipe_ingredients ri
      join meals.recipes r on r.id = ri.recipe_id
      where ri.id = recipe_ingredient_id
        and meals.is_plan_member(r.plan_id)
    )
  );

-- ============================================================
-- RLS policies — recipe_claimed_macros (join through recipes)
-- ============================================================

create policy "recipe_claimed_macros: member read"
  on meals.recipe_claimed_macros for select to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_claimed_macros: member insert"
  on meals.recipe_claimed_macros for insert to authenticated
  with check (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_claimed_macros: member update"
  on meals.recipe_claimed_macros for update to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  )
  with check (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

create policy "recipe_claimed_macros: member delete"
  on meals.recipe_claimed_macros for delete to authenticated
  using (
    exists (
      select 1 from meals.recipes r
      where r.id = recipe_id
        and meals.is_plan_member(r.plan_id)
    )
  );

-- ============================================================
-- RLS policies — grocery_items (plan-scoped via plan_id)
-- ============================================================

create policy "grocery_items: member read"
  on meals.grocery_items for select to authenticated
  using (meals.is_plan_member(plan_id));

create policy "grocery_items: member insert"
  on meals.grocery_items for insert to authenticated
  with check (meals.is_plan_member(plan_id));

create policy "grocery_items: member update"
  on meals.grocery_items for update to authenticated
  using  (meals.is_plan_member(plan_id))
  with check (meals.is_plan_member(plan_id));

create policy "grocery_items: member delete"
  on meals.grocery_items for delete to authenticated
  using (meals.is_plan_member(plan_id));

-- ============================================================
-- RLS policies — cooking_events (plan-scoped via plan_id)
-- ============================================================

create policy "cooking_events: member read"
  on meals.cooking_events for select to authenticated
  using (meals.is_plan_member(plan_id));

create policy "cooking_events: member insert"
  on meals.cooking_events for insert to authenticated
  with check (meals.is_plan_member(plan_id));

create policy "cooking_events: member update"
  on meals.cooking_events for update to authenticated
  using  (meals.is_plan_member(plan_id))
  with check (meals.is_plan_member(plan_id));

create policy "cooking_events: member delete"
  on meals.cooking_events for delete to authenticated
  using (meals.is_plan_member(plan_id));

-- ============================================================
-- RLS policies — consumption (join through cooking_events)
-- ============================================================

create policy "consumption: member read"
  on meals.consumption for select to authenticated
  using (
    exists (
      select 1 from meals.cooking_events ce
      where ce.id = cooking_event_id
        and meals.is_plan_member(ce.plan_id)
    )
  );

create policy "consumption: member insert"
  on meals.consumption for insert to authenticated
  with check (
    exists (
      select 1 from meals.cooking_events ce
      where ce.id = cooking_event_id
        and meals.is_plan_member(ce.plan_id)
    )
  );

create policy "consumption: member update"
  on meals.consumption for update to authenticated
  using (
    exists (
      select 1 from meals.cooking_events ce
      where ce.id = cooking_event_id
        and meals.is_plan_member(ce.plan_id)
    )
  )
  with check (
    exists (
      select 1 from meals.cooking_events ce
      where ce.id = cooking_event_id
        and meals.is_plan_member(ce.plan_id)
    )
  );

create policy "consumption: member delete"
  on meals.consumption for delete to authenticated
  using (
    exists (
      select 1 from meals.cooking_events ce
      where ce.id = cooking_event_id
        and meals.is_plan_member(ce.plan_id)
    )
  );
