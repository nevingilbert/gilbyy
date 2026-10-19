-- Just enough of Supabase's auth and realtime schemas to run the migration on a plain
-- Postgres and exercise it. Not applied anywhere real. See supabase/tests/README.md.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean);
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true)
$$;
-- Broadcast from the database, as say_convoy() does: here, just a row of messages on the topic.
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
language plpgsql as $$
begin
  perform set_config('realtime.topic', topic, true);
  insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private);
end;
$$;
grant usage on schema realtime to anon, authenticated;
grant execute on function realtime.topic() to anon, authenticated;
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema realtime to authenticated;
