alter table if exists public.app_users
  add column if not exists username_is_custom boolean not null default false;

update public.app_users
set username_is_custom = true
where username is not null
  and username <> '';

