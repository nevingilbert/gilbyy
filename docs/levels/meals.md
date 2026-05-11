# Level: Meals

Generate a meal plan via an AI prompt the app gives you, paste the resulting JSON back into the app, validate the macros, shop with an aggregated grocery list, and cook through the week — with each cooked meal removing one occurrence of that recipe from the menu. Built for two eaters sharing dishes but with different portions and different macro targets.

Meals is the **first level to ship** (priority set 2026-04-30 — short-term real-life need for the macro validator).

A real-world example of the input format lives at the root of the repo: `weekly_meal_plan_apr26.docx`. It's the plan style this app is built to operate on.

## Problem

I plan meals for myself and my partner once a week. Both of us eat the same dishes but in different portions, sized to our individual macro targets. The plan is a menu of recipes per meal slot, where individual recipes may appear multiple times across the week (the same omelette recipe shows up three mornings, the chicken-thigh batch covers three meals' worth of dinners/lunches). I shop once for the whole week from a single aggregated list. As the week goes on I pick which recipe to cook for each meal from whatever's still cookable.

The whole flow needs a tool that:

1. Generates a high-quality meal plan tailored to two sets of macros via a prompt I can paste into Claude (or another AI) — keeps gilbyy off paid AI APIs.
2. Validates the AI's macro math against free food databases (USDA, OFF) and prompts me to fill gaps.
3. Aggregates the grocery list and lets me check items off as I shop.
4. Shows me which recipes are still cookable given remaining inventory.
5. Walks me through cooking instructions, with per-member portion callouts.
6. Tracks consumed macros per person, so each of us sees our own daily totals against our own targets.

## Users and members

A plan has 1 or 2 members. Each member is a full gilbyy user. Members share the plan's recipes, grocery list, and inventory; they each have their own macro targets and their own consumption log. The plan owner is the creator; either member can add cooking events and log consumption.

**MVP simplification:** for any cooked recipe, both members are assumed to eat it. The case "I made dinner for just me tonight" is queued for after MVP (out of scope per user direction).

## AI-assisted plan generation

The Meals level exposes a **plan generator** UI (`/meals/plans/new/generate`) that does not call any AI from the server — it just builds a copy-pastable prompt for you to use in your own AI tool of choice.

### The flow

1. User opens `/meals/plans/new/generate`.
2. Fills in: plan name, duration in days, members (auto-fills your gilbyy account; you add the other person by email if they have an account), each member's macro targets, dietary preferences (free-text), constraints (allergies, equipment, free-text), and "recipe variety" (rough number of distinct recipes per slot across the week).
3. Clicks **Generate prompt**. App renders a fully-formed prompt with all inputs interpolated, the strict JSON schema the AI should output, **and a cache-seed list of the user's existing food names from `meals.foods`** so the AI is biased toward reusing names it'll resolve cleanly. Includes a "Copy" button.
4. User pastes the prompt into Claude.ai, ChatGPT, or any tool.
5. User pastes the AI's JSON output back into a textarea on the same page → clicks **Validate & save**.
6. App parses the JSON, resolves each ingredient against `meals.foods` (USDA → OFF → user prompt). Any unresolved ingredients trigger an inline "fill in macros" flow. Computed macros are compared against the AI's claimed macros and discrepancies surfaced.
7. On confirm, plan + recipes + ingredients are persisted; grocery list and menu are derived.

### Prompt template (rough shape — final version lives in `apps/web/src/lib/meals/promptTemplate.ts`)

```
You are generating a meal plan for {duration_days} days for {N} people sharing dishes
but eating different portions. Output strict JSON conforming to the schema at the end —
nothing before or after the JSON. No commentary, no markdown fences.

Members:
{for each member: name, daily targets in calories/protein_g/carbs_g/fat_g, preferences, constraints}

Variety: roughly {recipes_per_slot_count} distinct recipes per slot (breakfast/lunch/dinner)
across the {duration_days} days. Repeat recipes when sensible to reduce grocery waste.

For each recipe, give per-member ingredient portions (not just total — split each ingredient
between {member names}). Total ingredient quantity is the sum of the per-member portions.

Compute per-serving macros (per ONE member's portion) for each recipe-member pair, so each
member sees their own macro contribution for each cooked occurrence.

Include cooking instructions as a single markdown string per recipe with explicit "SPLIT:"
callouts where per-member portioning happens (see example).

OUTPUT JSON SCHEMA:
{schema...}

EXAMPLE OUTPUT:
{trimmed example matching the schema}
```

The exact text is long. Storing it in the codebase rather than the DB means it ships with the app and gets version-controlled — no schema drift between prompt and parser.

## JSON input format

The AI (or a hand-written upload) produces JSON conforming to this shape:

```json
{
  "plan": {
    "name": "Week of May 10",
    "duration_days": 7,
    "members": [
      {
        "email": "nevin.gil@gmail.com",
        "display_name": "Nevin",
        "targets": { "calories": 2400, "protein_g": 180, "carbs_g": 240, "fat_g": 80 }
      },
      {
        "email": "girlfriend@example.com",
        "display_name": "GF",
        "targets": { "calories": 1700, "protein_g": 120, "carbs_g": 160, "fat_g": 55 }
      }
    ]
  },
  "recipes": [
    {
      "name": "Avocado Egg Scramble with Cottage Cheese",
      "slot": "breakfast",
      "planned_count": 3,
      "instructions": "Whisk eggs separately for each member... SPLIT: plate avocado (1/3 Nevin / 1/4 GF)...",
      "ingredients": [
        {
          "food": "Egg, whole, raw",
          "unit": "unit",
          "total_quantity": 4,
          "portions": [
            { "member_email": "nevin.gil@gmail.com", "quantity": 2 },
            { "member_email": "girlfriend@example.com", "quantity": 2 }
          ]
        },
        {
          "food": "Egg white, raw",
          "unit": "unit",
          "total_quantity": 3,
          "portions": [
            { "member_email": "nevin.gil@gmail.com", "quantity": 2 },
            { "member_email": "girlfriend@example.com", "quantity": 1 }
          ]
        },
        {
          "food": "Cottage cheese, lowfat, 2% milkfat",
          "unit": "g",
          "total_quantity": 296,
          "portions": [
            { "member_email": "nevin.gil@gmail.com", "quantity": 177 },
            { "member_email": "girlfriend@example.com", "quantity": 119 }
          ]
        }
      ],
      "claimed_macros_per_serving": [
        { "member_email": "nevin.gil@gmail.com", "calories": 380, "protein_g": 38, "carbs_g": 9, "fat_g": 21 },
        { "member_email": "girlfriend@example.com", "calories": 280, "protein_g": 28, "carbs_g": 7, "fat_g": 15 }
      ]
    }
  ]
}
```

Hard requirements the validator enforces:

- Sum of `portions[*].quantity` == `total_quantity` per ingredient (within float epsilon).
- Every `member_email` in `portions[*]` and `claimed_macros_per_serving[*]` must exist in `plan.members`.
- `planned_count` is a positive integer.
- `slot` ∈ {`breakfast`, `lunch`, `dinner`, `snack`}.
- `unit` ∈ {`g`, `ml`, `unit`}.

If any of those fail, the upload is rejected with line-anchored errors.

## Domain model in prose

- **Recipe.** A plan-scoped named dish for a slot, with: an ingredient list (each ingredient has a total quantity + per-member portions), a `planned_count` (how many times this recipe appears in the plan menu), cooking instructions (markdown), and per-member claimed macros. Recipes do *not* live in a personal library in MVP — they're created against a specific plan with specific members.
- **Plan.** A window (default 7 days) with 1–2 members and a set of plan-scoped recipes. The "menu" is the set of recipes whose remaining occurrences > 0.
- **Member.** A user attached to a plan with macro targets and a display name. Members share recipes/inventory; consumption is logged per-member.
- **Cooking event.** One row per actual cooking. Decrements that recipe's remaining occurrences and depletes inventory by the recipe's total ingredient quantities.
- **Consumption.** A row marking a member ate the cooked recipe (one row per member per cooking event, with claimed-or-actual servings). Drives per-member daily macro totals.
- **Inventory.** Computed on-read: (checked-off grocery quantities, normalized to grams) − (sum of ingredient quantities across all cooking events for this plan).
- **Skipped meal.** Not modeled explicitly. If you didn't cook today, nothing happens — the recipe remains in the menu with its remaining count intact, and the ingredients stay in inventory. You can cook a different recipe later from the same ingredients if there's enough overlap, or just let the plan window end with leftover ingredients.

## Data model

Schema: `meals`. RLS on every table, default-deny, policies sketched below the DDL.

```sql
meals.foods
  id              uuid pk
  user_id         uuid null               -- null for public USDA/OFF foods; set for personal
  name            text not null
  source          text not null           -- 'usda' | 'off' | 'user'
  ext_id          text null
  macros_per_100g jsonb not null          -- { calories, protein_g, carbs_g, fat_g, fiber_g?, sugar_g?, sodium_mg? }
  created_at      timestamptz default now()
  unique (user_id, name)

meals.plans
  id              uuid pk
  owner_user_id   uuid not null references auth.users
  name            text not null
  duration_days   int not null default 7
  started_at      date null               -- null until 'activated'
  created_at      timestamptz default now()

meals.plan_members
  plan_id         uuid references meals.plans on delete cascade
  user_id         uuid references auth.users
  display_name    text not null
  targets         jsonb not null          -- { calories, protein_g, carbs_g, fat_g }
  added_at        timestamptz default now()
  primary key (plan_id, user_id)

meals.recipes
  id              uuid pk
  plan_id         uuid not null references meals.plans on delete cascade
  name            text not null
  slot            text not null           -- 'breakfast' | 'lunch' | 'dinner' | 'snack'
  planned_count   int not null default 1  -- how many times this recipe is in the menu
  instructions    text not null default ''
  position        int not null            -- display order within the slot
  unique (plan_id, name)

meals.recipe_ingredients
  id              uuid pk
  recipe_id       uuid not null references meals.recipes on delete cascade
  food_id         uuid not null references meals.foods
  unit            text not null           -- 'g' | 'ml' | 'unit'
  total_quantity  numeric not null
  position        int not null
  unique (recipe_id, position)

meals.recipe_ingredient_portions
  id              uuid pk
  recipe_ingredient_id uuid not null references meals.recipe_ingredients on delete cascade
  plan_member_user_id uuid not null
  quantity        numeric not null
  -- Per-ingredient per-member share. Sum of quantities = recipe_ingredients.total_quantity.
  -- (plan_member_user_id) joins to plan_members composite key implicitly via the recipe's plan.
  unique (recipe_ingredient_id, plan_member_user_id)

meals.recipe_claimed_macros
  id              uuid pk
  recipe_id       uuid not null references meals.recipes on delete cascade
  plan_member_user_id uuid not null
  calories        numeric not null
  protein_g       numeric not null
  carbs_g         numeric not null
  fat_g           numeric not null
  unique (recipe_id, plan_member_user_id)

meals.grocery_items
  id              uuid pk
  plan_id         uuid not null references meals.plans on delete cascade
  food_id         uuid not null references meals.foods
  total_quantity  numeric not null
  unit            text not null
  checked_off_at  timestamptz null
  unique (plan_id, food_id, unit)

meals.cooking_events
  id              uuid pk
  plan_id         uuid not null references meals.plans on delete cascade
  recipe_id       uuid not null references meals.recipes
  cooked_by_user_id uuid not null references auth.users
  cooked_at       timestamptz default now()
  -- No uniqueness constraint. A recipe with planned_count=3 can have up to 3 cooking_events.
  -- The "remaining" count is planned_count − count(cooking_events for that recipe).

meals.consumption
  id              uuid pk
  cooking_event_id uuid not null references meals.cooking_events on delete cascade
  eater_user_id   uuid not null references auth.users
  servings        numeric not null default 1   -- usually 1; manual override possible
  eaten_at        timestamptz default now()
  unique (cooking_event_id, eater_user_id)
```

### RLS policies (sketch)

- `foods`: SELECT allowed when `user_id is null` (public foods are world-readable to authenticated users) OR `user_id = auth.uid()`; INSERT/UPDATE/DELETE restricted to owner.
- `plans`: read/write to `owner_user_id = auth.uid()`.
- `plan_members`, `recipes`, `recipe_ingredients`, `recipe_ingredient_portions`, `recipe_claimed_macros`, `grocery_items`, `cooking_events`, `consumption`: read/write allowed if calling user has a `plan_members` row for the relevant `plan_id` (helper function: `is_plan_member(plan_id)`).

### Indexes

- `foods (name)` — ingredient lookup.
- `recipes (plan_id, slot, position)` — menu rendering.
- `cooking_events (plan_id, cooked_at desc)` — activity feed.
- `consumption (eater_user_id, eaten_at)` — per-member daily rollups.

## Macro resolution flow

When the JSON upload runs, each ingredient name resolves through:

1. **Local cache:** match against `meals.foods` where `user_id is null or user_id = auth.uid()`. If a match exists, link.
2. **USDA FoodData Central:** `/v1/foods/search?query=<name>`. Top match. Persist `source='usda'`, `user_id=null`.
3. **Open Food Facts:** if USDA returns nothing. Persist `source='off'`, `user_id=null`.
4. **User prompt:** if both fail, surface a "we couldn't find macros for X — enter per 100g" form. Save as `source='user'`, `user_id=auth.uid()`.

### Macro validation

After all ingredients resolve, the app **computes** per-member macros for each recipe as:

```
for each member m, for each recipe r:
  computed_macros[m][r] = sum over ingredients i of (
    portion_in_grams(i, m) × foods.macros_per_100g(i.food_id) / 100
  )
```

Compared against `recipe_claimed_macros` (what the AI claimed). Discrepancies >5% are surfaced in the validation UI; the user can accept the computed values or override.

### Plan-level macro check

Beyond per-recipe validation, the validator also computes **per-member average daily macros across the full plan**:

```
for each member m:
  total_macros[m] = sum over recipes r of (
    computed_macros[m][r] × r.planned_count
  )
  avg_daily[m] = total_macros[m] / plan.duration_days
```

If `avg_daily[m]` deviates >5% from `plan_members.targets[m]` on any of calories/protein/carbs/fat, the validation UI shows a warning ("Nevin: plan averages 2150 cal/day vs. target 2400 cal — short by 10%"). The user can save anyway; the check is informational, not blocking. Catches AI plans with correct per-recipe math but unbalanced totals.

Unit conversion to grams: MVP supports `g`, `ml` (treated as g for density 1.0), and `unit` (requires `foods.grams_per_unit` — MVP forces grams for new entries).

## Repetition, skipping, and the cooking flow

- Each recipe has `planned_count` (default 1, set by the AI based on grocery aggregation).
- Grocery list is summed as: for each recipe, `sum_ingredients(ingredient.total_quantity × recipe.planned_count)`, then aggregated by `food_id`.
- A recipe stays in the active menu until `count(cooking_events) >= planned_count`. Cooking decrements the remaining count by 1.
- Skipping is implicit — you just don't cook. The recipe's remaining count is preserved; the ingredients stay in inventory. On the last day of the plan, anything unused is leftover groceries (user problem, not app problem).
- The "still cookable" check (per recipe in the active menu): for each remaining ingredient need, is `total_quantity ≤ inventory[food_id]`?
- Cooking flow (`/meals/cook/[recipeId]`): show ingredients with per-member portions, show full instructions text with SPLIT markers, confirm button creates the `cooking_event` row. Optional checkboxes default each member's `consumption.servings = 1` and create those rows in the same transaction.

## UI surface (MVP)

All routes gated by site-wide auth (Phase 2).

- `/meals` — **Plan home or empty state.** If no plan exists yet: short explainer paragraph + two CTAs ("Generate plan via AI prompt" — primary, "Upload JSON directly" — secondary). If an active plan exists: plan name, today's date, members' macro progress bars for today, three menu sections (B/L/D) showing remaining recipes with remaining-count badges (e.g., "3 left", "1 left"). Uncookable recipes dimmed with a "missing: 50g cottage cheese" hint. "Cook this" button on each cookable recipe.
- `/meals/cook/[recipeId]` — **Cook dialog.** Per-member ingredient checklist, full markdown instructions, member-consumption checkboxes (default "both ate"), confirm button.
- `/meals/grocery` — **Grocery list.** Items grouped by food category (produce / protein / pantry / dairy / etc. — small hardcoded lookup), checkboxes persist, total weight per item shown.
- `/meals/plans/new/generate` — **AI prompt generator.** Form for plan inputs → renders the copy-pastable prompt → textarea to paste the AI's JSON output back → validate & save.
- `/meals/plans/new/upload` — **Direct JSON upload.** For hand-written plans bypassing the AI flow.
- `/meals/validate` — **Macro validation review.** Shown after upload: each recipe with claimed vs. computed macros per member, discrepancy badges, fill-in-the-blank for unresolved ingredients, confirm button.
- `/meals/plan` — **Plan detail.** Read-only view of the active plan: members, all recipes with their `planned_count`s, full instructions, expandable per-recipe per-member portion tables.

Out of MVP: per-day calendar view, recipe edit (re-upload to change), plan history/archive.

## MVP cut

What "Meals MVP done" means:

1. **AI prompt generator** — `/meals/plans/new/generate` produces a prompt that, when run through Claude.ai or ChatGPT, returns valid JSON conforming to the documented schema.
2. **JSON validation + persistence** — paste valid JSON → ingredients resolve via USDA/OFF/user-prompt → claimed-vs-computed macro comparison surfaced → plan + recipes saved.
3. **Grocery list** — auto-generated, interactive check-offs, persisted.
4. **Cook flow** — mark a recipe cooked → instructions shown → consumption defaulted "both ate" → menu updates with remaining count → inventory updates.
5. **Per-member daily macros** — for each plan member, today's consumed vs. target macros computed live.
6. **Direct JSON upload** as an alternative entry path.

**Acceptance test:** I generate a 7-day, 2-member plan via the in-app AI prompt; the JSON validates with maybe 2 unresolved-ingredient prompts; macros land within 5% of claimed values; grocery list matches what I'd write by hand from the docx; I cook the Avocado Egg Scramble three times across the week and on the fourth attempt the recipe is gone from the menu; both members see their own macro progress.

## Open assumptions (push back on any)

- **Recipes are plan-scoped.** A "personal recipe library" is queued for after MVP. Recipes in two different plans are independent rows even if they look identical.
- **`planned_count` is set at plan creation by the AI (or the JSON author).** Mid-plan editing is out of MVP.
- **Cooking always assumes both members eat.** Single-member cooking events are queued for after MVP per user direction.
- **Default `consumption.servings = 1`** when both members are auto-recorded as eating a cooked recipe. Manual override allowed.
- **Units restricted to `g` / `ml` / `unit`.** No cups, tbsp, oz in MVP. The AI prompt explicitly instructs metric output. Unit conversion table is a known rabbit hole.
- **Plan members must already have gilbyy accounts.** Adding a member by email fails if no account exists; the inviter is asked to have them sign up first. No deferred-invite flow.
- **One active plan per user at a time.** Older plans become read-only history once a new one is created (history view itself is out of MVP).
- **Macro validation is per-member-per-recipe AND per-plan-total.** Each (member, recipe) pair has its own claimed and computed macros; additionally, plan-wide per-member averages are checked against daily targets. Both checks surface >5% deviations as warnings, never blockers.
- **Skipped meals do not affect `planned_count`.** They sit in the menu and can be cooked later in the window.
- **Auth and gating inherit Phase 2's magic-link flow.** No level-specific deviations.

## Out of MVP (queued)

- Reusable recipe library across plans.
- Editing recipes / portions / `planned_count` after a plan is created.
- Single-member cooking ("just me tonight").
- Substitutions with on-the-fly macro recompute.
- Photo upload for grocery receipts.
- Recipe import from schema.org JSON-LD URLs.
- Cup ↔ gram unit conversion.
- Plan history view + archive.
- Multiple concurrent active plans.

## Free-tier landmines

- **USDA FDC** — 1k req/hour per key. Caching makes hits rare.
- **OFF** — no documented rate limit. Best-effort fallback.
- **AI plan generation** — done outside gilbyy by the user, in Claude.ai / ChatGPT / etc. Zero API cost to gilbyy. Quality depends on the model the user picks.
- **Receipt OCR** — not free at usable quality. Permanently out of MVP.
- **Supabase free** — A 7-day, 2-member plan with ~20 recipes is well under 100 KB. Plenty of headroom.

## Open questions

- **Activation timing.** Plan auto-activates on the first cooking event — `started_at` is set to the date of the first `cooking_events` row for the plan. No explicit "activate" button needed; reduces friction. (Decided 2026-04-30.)
- **Multiple concurrent plans, even later.** Real-world case: a partner manages their own plan separately. Keep deferred unless it becomes painful.
- **Macro discrepancy threshold** — currently 5%, surfaced as a warning. Tunable based on user feel.
- **AI prompt versioning.** As the prompt template evolves, do we version it so old plans can be re-generated against the same prompt? Probably not for MVP; the JSON schema is the contract, the prompt is just the elicitation.
- **Display of SPLIT instructions.** MVP shows raw markdown with `SPLIT:` markers. A future feature could parse those markers and render two-column views.
