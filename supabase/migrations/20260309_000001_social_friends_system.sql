create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  google_email text not null unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.privacy_settings (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  profile_visibility text not null default 'friends_only' check (profile_visibility in ('private','friends_only','public')),
  stats_visibility text not null default 'friends_only' check (stats_visibility in ('private','friends_only','public')),
  allow_friend_requests text not null default 'everyone' check (allow_friend_requests in ('everyone','nobody')),
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.app_users(id) on delete cascade,
  recipient_id uuid not null references public.app_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint friend_requests_no_self check (sender_id <> recipient_id)
);

create table if not exists public.friendships (
  user_low_id uuid not null references public.app_users(id) on delete cascade,
  user_high_id uuid not null references public.app_users(id) on delete cascade,
  created_by uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low_id, user_high_id),
  constraint friendships_canonical_pair check (user_low_id < user_high_id),
  constraint friendships_no_self check (user_low_id <> user_high_id)
);

create table if not exists public.shared_stats_snapshots (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  total_focus_minutes_7d integer not null default 0 check (total_focus_minutes_7d >= 0),
  total_focus_minutes_30d integer not null default 0 check (total_focus_minutes_30d >= 0),
  total_focus_minutes_all_time integer not null default 0 check (total_focus_minutes_all_time >= 0),
  pomodoros_completed_7d integer not null default 0 check (pomodoros_completed_7d >= 0),
  pomodoros_completed_30d integer not null default 0 check (pomodoros_completed_30d >= 0),
  current_streak_days integer not null default 0 check (current_streak_days >= 0),
  longest_streak_days integer not null default 0 check (longest_streak_days >= 0),
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists friend_requests_pending_pair_unique
  on public.friend_requests (least(sender_id, recipient_id), greatest(sender_id, recipient_id))
  where status = 'pending';

create index if not exists friend_requests_recipient_pending_idx
  on public.friend_requests (recipient_id, status, created_at desc);

create index if not exists friend_requests_sender_pending_idx
  on public.friend_requests (sender_id, status, created_at desc);

create index if not exists friendships_low_idx
  on public.friendships (user_low_id, created_at desc);

create index if not exists friendships_high_idx
  on public.friendships (user_high_id, created_at desc);

create index if not exists shared_stats_updated_idx
  on public.shared_stats_snapshots (updated_at desc);

create or replace function public.social_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_touch_app_users on public.app_users;
create trigger social_touch_app_users
before update on public.app_users
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_touch_privacy_settings on public.privacy_settings;
create trigger social_touch_privacy_settings
before update on public.privacy_settings
for each row execute function public.social_touch_updated_at();

drop trigger if exists social_touch_shared_stats on public.shared_stats_snapshots;
create trigger social_touch_shared_stats
before update on public.shared_stats_snapshots
for each row execute function public.social_touch_updated_at();

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.app_users
  where lower(google_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships
    where user_low_id = least(user_a, user_b)
      and user_high_id = greatest(user_a, user_b)
  );
$$;

create or replace function public.accept_friend_request(p_request_id bigint, p_actor_id uuid)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.friend_requests;
  low_id uuid;
  high_id uuid;
begin
  select *
  into req
  from public.friend_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if req.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  if req.recipient_id <> p_actor_id then
    raise exception 'not_request_recipient';
  end if;

  low_id := least(req.sender_id, req.recipient_id);
  high_id := greatest(req.sender_id, req.recipient_id);

  insert into public.friendships (user_low_id, user_high_id, created_by)
  values (low_id, high_id, p_actor_id)
  on conflict (user_low_id, user_high_id) do nothing;

  update public.friend_requests
  set status = 'accepted', resolved_at = now()
  where id = req.id and status = 'pending';

  update public.friend_requests
  set status = 'accepted', resolved_at = now()
  where status = 'pending'
    and sender_id = req.recipient_id
    and recipient_id = req.sender_id;

  select * into req from public.friend_requests where id = p_request_id;
  return req;
end;
$$;

alter table public.app_users enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_stats_snapshots enable row level security;

drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users
for select
using (
  id = public.current_app_user_id()
  or exists (
    select 1
    from public.privacy_settings ps
    where ps.user_id = app_users.id
      and (
        ps.profile_visibility = 'public'
        or (
          ps.profile_visibility = 'friends_only'
          and public.are_friends(public.current_app_user_id(), app_users.id)
        )
      )
  )
);

drop policy if exists app_users_insert_self on public.app_users;
create policy app_users_insert_self on public.app_users
for insert
with check (lower(google_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists app_users_update_self on public.app_users;
create policy app_users_update_self on public.app_users
for update
using (id = public.current_app_user_id())
with check (id = public.current_app_user_id());

drop policy if exists privacy_settings_select on public.privacy_settings;
create policy privacy_settings_select on public.privacy_settings
for select
using (user_id = public.current_app_user_id());

drop policy if exists privacy_settings_insert on public.privacy_settings;
create policy privacy_settings_insert on public.privacy_settings
for insert
with check (user_id = public.current_app_user_id());

drop policy if exists privacy_settings_update on public.privacy_settings;
create policy privacy_settings_update on public.privacy_settings
for update
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select on public.friend_requests
for select
using (
  sender_id = public.current_app_user_id()
  or recipient_id = public.current_app_user_id()
);

drop policy if exists friend_requests_insert_sender on public.friend_requests;
create policy friend_requests_insert_sender on public.friend_requests
for insert
with check (
  sender_id = public.current_app_user_id()
  and sender_id <> recipient_id
  and not public.are_friends(sender_id, recipient_id)
  and coalesce(
    (
      select ps.allow_friend_requests
      from public.privacy_settings ps
      where ps.user_id = recipient_id
    ),
    'everyone'
  ) = 'everyone'
);

drop policy if exists friend_requests_update_sender on public.friend_requests;
create policy friend_requests_update_sender on public.friend_requests
for update
using (sender_id = public.current_app_user_id() and status = 'pending')
with check (
  sender_id = public.current_app_user_id()
  and recipient_id <> public.current_app_user_id()
  and status = 'cancelled'
);

drop policy if exists friend_requests_update_recipient on public.friend_requests;
create policy friend_requests_update_recipient on public.friend_requests
for update
using (recipient_id = public.current_app_user_id() and status = 'pending')
with check (
  recipient_id = public.current_app_user_id()
  and sender_id <> public.current_app_user_id()
  and status in ('accepted', 'declined')
);

drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
for select
using (
  user_low_id = public.current_app_user_id()
  or user_high_id = public.current_app_user_id()
);

drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
for insert
with check (
  user_low_id = public.current_app_user_id()
  or user_high_id = public.current_app_user_id()
);

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
for delete
using (
  user_low_id = public.current_app_user_id()
  or user_high_id = public.current_app_user_id()
);

drop policy if exists snapshots_select on public.shared_stats_snapshots;
create policy snapshots_select on public.shared_stats_snapshots
for select
using (
  user_id = public.current_app_user_id()
  or exists (
    select 1
    from public.privacy_settings ps
    where ps.user_id = shared_stats_snapshots.user_id
      and (
        ps.stats_visibility = 'public'
        or (
          ps.stats_visibility = 'friends_only'
          and public.are_friends(public.current_app_user_id(), shared_stats_snapshots.user_id)
        )
      )
  )
);

drop policy if exists snapshots_insert on public.shared_stats_snapshots;
create policy snapshots_insert on public.shared_stats_snapshots
for insert
with check (user_id = public.current_app_user_id());

drop policy if exists snapshots_update on public.shared_stats_snapshots;
create policy snapshots_update on public.shared_stats_snapshots
for update
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());
