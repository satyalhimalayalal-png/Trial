alter table if exists public.shared_stats_snapshots
  add column if not exists hour_totals_24 jsonb not null default '[]'::jsonb;

alter table if exists public.shared_stats_snapshots
  add column if not exists daily_totals_30d jsonb not null default '[]'::jsonb;

alter table if exists public.shared_stats_snapshots
  add column if not exists weekly_totals_12w jsonb not null default '[]'::jsonb;

alter table if exists public.shared_stats_snapshots
  add column if not exists monthly_totals_12m jsonb not null default '[]'::jsonb;

alter table if exists public.shared_stats_snapshots
  add column if not exists year_heatmap_days jsonb not null default '[]'::jsonb;

