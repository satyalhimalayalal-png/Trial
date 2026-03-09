alter table if exists public.app_users
  add column if not exists username text;

with seeded as (
  select
    id,
    created_at,
    case
      when trim(both '_' from regexp_replace(lower(split_part(google_email, '@', 1)), '[^a-z0-9._-]', '_', 'g')) = '' then 'user'
      else trim(both '_' from regexp_replace(lower(split_part(google_email, '@', 1)), '[^a-z0-9._-]', '_', 'g'))
    end as base_username
  from public.app_users
  where username is null
),
ranked as (
  select
    id,
    base_username,
    row_number() over (partition by base_username order by created_at, id) - 1 as suffix_n
  from seeded
)
update public.app_users u
set username = case
  when r.suffix_n = 0 then left(r.base_username, 32)
  else left(r.base_username, greatest(3, 32 - length(r.suffix_n::text) - 1)) || '_' || r.suffix_n::text
end
from ranked r
where u.id = r.id
  and u.username is null;

update public.app_users
set username = case
  when length(username) < 3 then rpad(username, 3, 'x')
  else username
end
where username is not null
  and length(username) < 3;

alter table public.app_users
  alter column username set not null;

alter table public.app_users
  add constraint app_users_username_format
  check (username ~ '^[a-z0-9._-]{3,32}$');

create unique index if not exists app_users_username_key on public.app_users (username);

