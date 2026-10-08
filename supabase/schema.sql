-- NHL 2026-27 prediction sheets: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run again: re-running it applies updates without deleting any data.

-- 1) Every regular-season game in the league, one row per game.
--    Filled and kept current by the GitHub Action; readable by anyone.
create table if not exists public.games (
  game_id         bigint primary key,       -- NHL game id
  season          text not null,            -- e.g. 20262027
  game_date       date not null,            -- local date of the game
  start_utc       timestamptz,
  home            text not null,            -- team abbreviation, e.g. SEA
  away            text not null,
  home_score      int,
  away_score      int,
  game_state      text,                     -- FUT, LIVE, CRIT, FINAL, OFF ...
  schedule_state  text,                     -- OK, PPD (postponed), ...
  period_type     text,                     -- REG, OT or SO once final
  venue           text,
  neutral_site    boolean,
  updated_at      timestamptz not null default now()
);

create index if not exists games_home_idx on public.games (season, home);
create index if not exists games_away_idx on public.games (season, away);

alter table public.games enable row level security;

drop policy if exists "Anyone can read games" on public.games;
create policy "Anyone can read games"
  on public.games for select
  using (true);
-- No insert/update policy: only the secret key used by the GitHub Action
-- can write games.

grant select on public.games to anon, authenticated;
-- The GitHub Action signs in with the secret key as service_role, which needs
-- these to upsert games (some projects don't grant them automatically).
grant select, insert, update on public.games to service_role;

-- 2) Picks: one row per user, per team sheet, per game. Private to each user.
--    The same game can be picked on two sheets (e.g. SEA's and CGY's).
--    Each row holds an outcome pick, a combined-goals pick, or both.
create table if not exists public.team_picks (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team        text not null,
  game_id     bigint not null,
  pick        text check (pick in ('W','L','OTL')),
  goals       smallint,
  updated_at  timestamptz not null default now(),
  primary key (user_id, team, game_id)
);
-- Upgrades for databases created by earlier versions of this file:
alter table public.team_picks add column if not exists goals smallint;
alter table public.team_picks alter column pick drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_picks_goals_range') then
    alter table public.team_picks add constraint team_picks_goals_range check (goals between 0 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_picks_has_a_pick') then
    alter table public.team_picks add constraint team_picks_has_a_pick check (pick is not null or goals is not null);
  end if;
end $$;

alter table public.team_picks enable row level security;

drop policy if exists "Read own picks" on public.team_picks;
create policy "Read own picks" on public.team_picks
  for select to authenticated using ((select auth.uid()) = user_id);

-- Picks can only be added, changed, or removed before puck drop, and only
-- for a game the chosen team actually plays in. This keeps the leaderboard fair.
create or replace function public.pick_is_open(p_game_id bigint, p_team text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.games g
    where g.game_id = p_game_id
      and (g.home = p_team or g.away = p_team)
      and g.period_type is null
      and coalesce(g.start_utc > now(), g.game_date >= current_date)
  );
$$;

drop policy if exists "Add own picks" on public.team_picks;
create policy "Add own picks" on public.team_picks
  for insert to authenticated
  with check ((select auth.uid()) = user_id and public.pick_is_open(game_id, team));

drop policy if exists "Change own picks" on public.team_picks;
create policy "Change own picks" on public.team_picks
  for update to authenticated
  using ((select auth.uid()) = user_id and public.pick_is_open(game_id, team))
  with check ((select auth.uid()) = user_id and public.pick_is_open(game_id, team));

drop policy if exists "Remove own picks" on public.team_picks;
create policy "Remove own picks" on public.team_picks
  for delete to authenticated
  using ((select auth.uid()) = user_id and public.pick_is_open(game_id, team));

grant select, insert, update, delete on public.team_picks to authenticated;

-- 3) Usernames shown on the leaderboard. Anyone can see usernames; each person
--    can only create or change their own. 3-20 letters, numbers, or underscores,
--    unique regardless of capitalization.
create table if not exists public.profiles (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username    text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "Anyone can see usernames" on public.profiles;
create policy "Anyone can see usernames" on public.profiles
  for select using (true);

drop policy if exists "Create own profile" on public.profiles;
create policy "Create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Change own profile" on public.profiles;
create policy "Change own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

-- 4) Leaderboard: one row per player PER TEAM SHEET, so a player can appear
--    several times (once for each team they predict). Each finished game is worth
--    1 point for the right result and 1 point for the exact combined goals.
--    Combined goals = home_score + away_score from the official final score.
--    p_team = null returns every sheet for every team; otherwise one team's sheets.
--    Returns only totals per username and team, never anyone's individual picks.
drop function if exists public.leaderboard(text, text);
create function public.leaderboard(p_season text default '20262027', p_team text default null)
returns table (username text, team text, points bigint, outcome_points bigint, goals_points bigint,
               outcome_graded bigint, goals_graded bigint, total_picks bigint)
language sql stable security definer set search_path = ''
as $$
  with scored as (
    select tp.user_id, tp.team, tp.pick, tp.goals,
      case
        when g.period_type is null or g.home_score is null or g.away_score is null then null
        when (case when g.home = tp.team then g.home_score else g.away_score end)
           > (case when g.home = tp.team then g.away_score else g.home_score end) then 'W'
        when g.period_type = 'REG' then 'L'
        else 'OTL'
      end as result,
      case when g.period_type is null then null else g.home_score + g.away_score end as total_goals
    from public.team_picks tp
    join public.games g on g.game_id = tp.game_id and g.season = p_season
    where p_team is null or tp.team = p_team
  ), totals as (
    select s.user_id, s.team,
      count(*) filter (where s.result is not null and s.pick = s.result) as outcome_points,
      count(*) filter (where s.total_goals is not null and s.goals = s.total_goals) as goals_points,
      count(*) filter (where s.result is not null and s.pick is not null) as outcome_graded,
      count(*) filter (where s.total_goals is not null and s.goals is not null) as goals_graded,
      count(*) as total_picks
    from scored s
    group by s.user_id, s.team
  )
  select p.username, t.team, t.outcome_points + t.goals_points, t.outcome_points, t.goals_points,
         t.outcome_graded, t.goals_graded, t.total_picks
  from totals t
  join public.profiles p on p.user_id = t.user_id
  order by 3 desc, t.outcome_graded + t.goals_graded asc, lower(p.username), t.team;
$$;

revoke all on function public.leaderboard(text, text) from public;
grant execute on function public.leaderboard(text, text) to anon, authenticated;
revoke all on function public.pick_is_open(bigint, text) from public;
grant execute on function public.pick_is_open(bigint, text) to authenticated;

-- 5) Headlines for the home page ticker, filled by the GitHub Action.
create table if not exists public.news (
  id            text primary key,           -- source's article id
  headline      text not null,
  url           text not null,
  source        text not null default 'ESPN',
  published_at  timestamptz,
  fetched_at    timestamptz not null default now()
);
create index if not exists news_published_idx on public.news (published_at desc);

alter table public.news enable row level security;

drop policy if exists "Anyone can read news" on public.news;
create policy "Anyone can read news" on public.news for select using (true);

grant select on public.news to anon, authenticated;
grant select, insert, update, delete on public.news to service_role;

-- 6) Lets the sign-up form check whether a username is free before creating
--    the account. Returns only true/false.
create or replace function public.username_available(p_username text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- 7) The signed-in player's own sheets: picks made and points per team.
--    Runs as the caller, so it only ever sees that person's picks.
drop function if exists public.my_sheets(text);
create function public.my_sheets(p_season text default '20262027')
returns table (team text, total_picks bigint, graded bigint, points bigint)
language sql stable security invoker set search_path = ''
as $$
  with scored as (
    select tp.team, tp.pick, tp.goals, g.period_type,
      case
        when g.period_type is null or g.home_score is null or g.away_score is null then null
        when (case when g.home = tp.team then g.home_score else g.away_score end)
           > (case when g.home = tp.team then g.away_score else g.home_score end) then 'W'
        when g.period_type = 'REG' then 'L'
        else 'OTL'
      end as result,
      case when g.period_type is null then null else g.home_score + g.away_score end as total_goals
    from public.team_picks tp
    join public.games g on g.game_id = tp.game_id and g.season = p_season
    where tp.user_id = (select auth.uid())
  )
  select s.team,
    count(*) as total_picks,
    count(*) filter (where s.period_type is not null) as graded,
    count(*) filter (where s.result is not null and s.pick = s.result)
      + count(*) filter (where s.total_goals is not null and s.goals = s.total_goals) as points
  from scored s
  group by s.team
  order by count(*) desc, s.team;
$$;
grant execute on function public.my_sheets(text) to authenticated;

-- 8) View another player's sheet from the leaderboard. Picks are only revealed
--    for games that have started (or finished), so upcoming picks can't be
--    copied: those rows come back with revealed = false and no pick or goals.
create or replace function public.sheet_picks(p_username text, p_team text, p_season text default '20262027')
returns table (game_id bigint, pick text, goals smallint, revealed boolean)
language sql stable security definer set search_path = ''
as $$
  select tp.game_id,
         case when r.revealed then tp.pick end,
         case when r.revealed then tp.goals end,
         r.revealed
  from public.profiles p
  join public.team_picks tp on tp.user_id = p.user_id and tp.team = p_team
  join public.games g on g.game_id = tp.game_id and g.season = p_season
  cross join lateral (
    select coalesce(g.period_type is not null or g.start_utc <= now(), false) as revealed
  ) r
  where lower(p.username) = lower(p_username);
$$;
revoke all on function public.sheet_picks(text, text, text) from public;
grant execute on function public.sheet_picks(text, text, text) to anon, authenticated;

-- 9) Private settings for each player (profile page). Unlike profiles, nobody
--    else can read these. look = auto (follow the device), home (light) or road (dark).
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  look        text not null default 'auto' check (look in ('auto','home','road')),
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Read own settings" on public.user_settings;
create policy "Read own settings" on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Create own settings" on public.user_settings;
create policy "Create own settings" on public.user_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Change own settings" on public.user_settings;
create policy "Change own settings" on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.user_settings to authenticated;

-- 10) "Delete account" on the profile page. Removes the signed-in player's
--     sign-in, and with it (through on delete cascade) their username, picks
--     and settings. Only ever acts on the person calling it.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
