# Level: Meals

Upload a JSON meal plan, get macro validation, an interactive grocery list, and a "what can I still cook" view that adapts when meals are skipped.

## Problem

I write meal plans in a structured format. I want a tool that:

1. Confirms the macros I claimed are accurate against a trusted database.
2. Lets me check off groceries as I shop.
3. After a few days, tells me which planned meals I can still make from what I've bought, factoring in meals already eaten or skipped.

Existing macro trackers are food-logging apps; they don't take a meal-plan-as-input.

## User and flow

Single user (me) for MVP. No multiplayer.

1. Upload a JSON meal plan: a span of named meals, each with ingredients and per-ingredient quantities, and the user's claimed macros.
2. The app looks up each ingredient's macros via free APIs. For ingredients not found, prompt me to fill them in. Save my answer to a personal foods database so it auto-resolves next time.
3. Show a per-meal and per-day macro report comparing claimed vs. computed.
4. Generate a grocery list aggregating ingredients across the plan. UI lets me check items off as I buy them.
5. As days pass, I mark each planned meal "ate," "skipped," or "made something else." The app tracks remaining inventory (groceries bought minus ingredients consumed) and shows me which still-planned meals are fully cookable from what I have, plus optionally ad-hoc suggestions ("you have eggs, spinach, feta — that's a frittata").

## Macro APIs (free)

- **USDA FoodData Central** — free with API key registration. Excellent for whole foods. Generous rate limits (1k/hour per key).
- **Open Food Facts** — free, no key. Good for packaged products with barcodes. Lower data quality on whole foods.

Strategy: try USDA first → fall back to OFF → fall back to user prompt + save to `user_foods`. Aggressive caching: every food found gets stored locally so we never re-fetch the same ingredient.

## Data model (sketch)

Schema: `meals`.

```
meals.foods              (id, user_id nullable, name, source ['usda'|'off'|'user'], macros_jsonb, ext_id)
meals.plans              (id, user_id, name, plan_jsonb, uploaded_at)
meals.plan_meals         (id, plan_id, day_index, meal_slot, name, claimed_macros)
meals.plan_ingredients   (id, plan_meal_id, food_id, quantity, unit)
meals.grocery_lists      (id, plan_id, generated_at)
meals.grocery_items      (list_id, food_id, quantity, unit, checked_off)
meals.consumption_log    (id, plan_meal_id, status, logged_at, notes)
meals.user_foods         (user_id, name, macros_jsonb)   -- personal fallback when APIs fail
```

`user_id nullable` on `foods` because public USDA/OFF foods are shared; only user-entered ones are personal.

## Auth approach

Magic-link email is fine here. Single user, low frequency, security matters more than join speed.

## "What can I still cook"

Each consumed/skipped meal updates the inventory delta. A planned meal is "still cookable" iff every ingredient quantity is still ≥ what the meal needs from current inventory. Ad-hoc suggestions from leftover ingredients is a stretch goal.

## Free-tier landmines

- **USDA rate limit** is 1k/hour per key — never an issue with caching.
- **Recipe matching for "what can I make" with arbitrary leftovers** has no good free API. Either ship a tiny local recipe library, or skip and rely only on the still-planned-meals view.
- **OCR for grocery receipts** would be a nice convenience and is *not* free at any meaningful quality. Not in MVP.

## MVP cut

1. Upload JSON, validate it parses against the documented schema.
2. Resolve macros via USDA, prompt for misses, save to `user_foods`.
3. Show macro comparison table (claimed vs. computed).
4. Show interactive grocery list with check-offs.
5. No consumption log. No leftover calculator. No suggestions.

That's a useful tool on its own.

## Future ideas

- Consumption log + leftover calculator (the originally requested headline feature).
- Ad-hoc meal suggestions from remaining inventory.
- Photo of a grocery receipt → check off matched items (probably needs paid OCR — skip until free options improve).
- Multiple plans / history / weekly archive.
- Export grocery list to text for sharing.
- Adjust macros for the substitute when "made something else" is logged.

## Open questions

- JSON schema: codify a strict shape (recommended) or accept loose input and prompt for missing fields.
- Units: free-text vs. enumerated. (Enumerated; conversions are a known headache.)
- Per-serving vs. per-recipe macros — pick one canonical form.
