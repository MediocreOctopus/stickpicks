-- NHL 2026-27 prediction sheets: database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

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

-- 2) Picks: one row per user, per team sheet, per game. Private to each user.
--    The same game can be picked on two sheets (e.g. SEA's and CGY's).
create table if not exists public.team_picks (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team        text not null,
  game_id     bigint not null,
  pick        text not null check (pick in ('W','L','OTL')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, team, game_id)
);

alter table public.team_picks enable row level security;

drop policy if exists "Read own picks" on public.team_picks;
create policy "Read own picks" on public.team_picks
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Add own picks" on public.team_picks;
create policy "Add own picks" on public.team_picks
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Change own picks" on public.team_picks;
create policy "Change own picks" on public.team_picks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Remove own picks" on public.team_picks;
create policy "Remove own picks" on public.team_picks
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.team_picks to authenticated;
