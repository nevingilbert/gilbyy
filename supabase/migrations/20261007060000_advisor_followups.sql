-- Follow-ups from Supabase's security and performance advisors, run against the first
-- real project.

-- Supabase lets anon and authenticated execute every new function in public unless told
-- otherwise, and the first migration only locked down the ones the game calls. These two
-- are not part of the API: one is a trigger, the other exists for the realtime policies,
-- which run as the signed-in player.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.is_chat_member(text) from public, anon;
grant execute on function public.is_chat_member(text) to authenticated;

-- The primary keys only help lookups by their first column. Friend lists and requests
-- are read from either side ("own friendships", "own friend requests"), and deleting a
-- profile cascades through both columns.
create index friend_requests_to_id on public.friend_requests (to_id);
create index friendships_b on public.friendships (b);

-- Left alone on purpose:
-- * "signed-in users can execute security definer function" for me, set_name, add_miles,
--   buy, equip, complete_mission, mark_goal, request_friend and leaderboard. Those are
--   the game's API; each checks its caller (ADR 0007).
-- * mission_runs.mission has no index of its own. It points at a four-row table whose
--   rows are never deleted, so nothing would use one.
