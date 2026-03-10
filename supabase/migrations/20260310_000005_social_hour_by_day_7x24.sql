alter table if exists public.shared_stats_snapshots
  add column if not exists hour_by_day_totals_7x24 jsonb not null default '[]'::jsonb;

