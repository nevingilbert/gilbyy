-- Names can be as short as two characters ("TJ"). They were three to twenty.
-- Must match NAME_PATTERN in apps/web/src/app/store.ts (play.test.ts checks).
alter table public.profiles drop constraint profiles_name_check;
alter table public.profiles add constraint profiles_name_check check (name ~ '^[A-Za-z0-9 _-]{2,20}$');
