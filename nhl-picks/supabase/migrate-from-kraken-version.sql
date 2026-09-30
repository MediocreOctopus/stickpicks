-- OPTIONAL: only if you already set up the Kraken-only version.
-- Run this AFTER schema.sql and AFTER the "Update NHL games" workflow has run
-- once (so the games table is filled). It copies your old Kraken picks into
-- the new team_picks table, matching games by date.

insert into public.team_picks (user_id, team, game_id, pick, updated_at)
select p.user_id, 'SEA', g.game_id, p.pick, p.updated_at
from public.picks p
join public.games g
  on g.game_date = p.game_date
 and g.season = '20262027'
 and (g.home = 'SEA' or g.away = 'SEA')
on conflict (user_id, team, game_id) do nothing;

-- Check the copy, then remove the old tables if you like:
-- select count(*) from public.team_picks where team = 'SEA';
-- drop table public.picks;
-- drop table public.results;
