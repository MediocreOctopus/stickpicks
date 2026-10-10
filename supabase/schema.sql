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
--    p_from / p_to (game dates, inclusive) make a weekly or monthly board: only games
--    played in that window count. Leave them out for the whole season.
--    Returns only totals per username and team, never anyone's individual picks.
drop function if exists public.leaderboard(text, text);
drop function if exists public.leaderboard(text, text, date, date);
create function public.leaderboard(p_season text default '20262027', p_team text default null,
                                   p_from date default null, p_to date default null)
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
    where (p_team is null or tp.team = p_team)
      and (p_from is null or g.game_date >= p_from)
      and (p_to is null or g.game_date <= p_to)
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

revoke all on function public.leaderboard(text, text, date, date) from public;
grant execute on function public.leaderboard(text, text, date, date) to anon, authenticated;
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

-- 11) Profile pictures, shown next to usernames (so they're public like usernames).
--     avatar_kind = 'sweater' (a jersey in avatar_team's colours with avatar_number)
--     or 'photo' (an image in this project's "avatars" storage, in the player's own folder),
--     or null for the plain initial.
alter table public.profiles add column if not exists avatar_kind text;
alter table public.profiles add column if not exists avatar_team text;
alter table public.profiles add column if not exists avatar_number smallint;
alter table public.profiles add column if not exists avatar_url text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_valid') then
    alter table public.profiles add constraint profiles_avatar_valid check (
      avatar_kind is null
      or (avatar_kind = 'sweater' and avatar_team ~ '^[A-Z]{3}$' and avatar_number between 0 and 99)
      or (avatar_kind = 'photo' and avatar_url like '%/storage/v1/object/public/avatars/' || user_id::text || '/%')
    );
  end if;
end $$;

-- 11b) Favourite and least favourite teams, chosen in profile Settings and shown on the profile (public, like usernames).
alter table public.profiles add column if not exists fav_team text;
alter table public.profiles add column if not exists least_team text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_teams_valid') then
    alter table public.profiles add constraint profiles_teams_valid check (
      (fav_team is null or fav_team ~ '^[A-Z]{3}$') and (least_team is null or least_team ~ '^[A-Z]{3}$')
    );
  end if;
end $$;

-- 12) Storage for uploaded photos: a public "avatars" bucket (small images only).
--     Each player can add, replace or remove files only in their own folder (<user id>/...).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are public" on storage.objects;
create policy "Avatar images are public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Upload own avatar" on storage.objects;
create policy "Upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Replace own avatar" on storage.objects;
create policy "Replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Remove own avatar" on storage.objects;
create policy "Remove own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 13) Puck-drop reminders (web push). Each device that turns reminders on stores its push
--     address here. Players never read or write this table directly: the two functions below
--     save or remove the caller's own device, and only the GitHub Action (service role) reads it.
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Reminders already sent, so each game is only announced once per player and sheet.
create table if not exists public.push_reminders_sent (
  user_id  uuid not null references auth.users(id) on delete cascade,
  game_id  bigint not null,
  team     text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, game_id, team)
);
alter table public.push_reminders_sent enable row level security;
revoke all on public.push_reminders_sent from anon, authenticated;

-- Save this device for the signed-in player (a device that moves to another account moves with it).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, (select auth.uid()), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Is this device signed up for reminders? (true/false only)
create or replace function public.has_push_subscription(p_endpoint text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid()));
$$;
revoke all on function public.has_push_subscription(text) from public, anon;
grant execute on function public.has_push_subscription(text) to authenticated;

-- For the GitHub Action: games starting within p_minutes on a sheet the player has started,
-- where the result or the goals aren't picked yet, and no reminder was sent for it.
create or replace function public.push_reminders_due(p_minutes int default 75)
returns table (user_id uuid, team text, game_id bigint, start_utc timestamptz, home text, away text)
language sql stable security definer set search_path = '' as $$
  with subs as (select distinct s.user_id from public.push_subscriptions s),
  sheets as (
    select distinct tp.user_id, tp.team from public.team_picks tp
    where tp.user_id in (select subs.user_id from subs)
  ),
  soon as (
    select g.game_id, g.start_utc, g.home, g.away from public.games g
    where g.start_utc > now() and g.start_utc <= now() + make_interval(mins => p_minutes)
      and coalesce(g.schedule_state, 'OK') <> 'PPD'
  )
  select sh.user_id, sh.team, s.game_id, s.start_utc, s.home, s.away
  from sheets sh
  join soon s on s.home = sh.team or s.away = sh.team
  left join public.team_picks tp on tp.user_id = sh.user_id and tp.team = sh.team and tp.game_id = s.game_id
  where (tp.pick is null or tp.goals is null)
    and not exists (select 1 from public.push_reminders_sent r
                    where r.user_id = sh.user_id and r.game_id = s.game_id and r.team = sh.team)
  order by s.start_utc;
$$;
revoke all on function public.push_reminders_due(int) from public, anon, authenticated;
grant execute on function public.push_reminders_due(int) to service_role;
grant select, insert, update, delete on public.push_subscriptions, public.push_reminders_sent to service_role;
-- 14) Invitations: who invited each new player (for the Recruiter badge). Private: nobody can read
--     this table; record_invite() saves it once, when a player who arrived from an invitation link
--     makes their profile, and badge_honours() only reports how many players each person recruited.
create table if not exists public.invites (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  invited_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint invites_not_self check (user_id <> invited_by)
);
alter table public.invites enable row level security;
revoke all on public.invites from anon, authenticated;

create or replace function public.record_invite(p_inviter text)
returns void language sql security definer set search_path = '' as $$
  insert into public.invites (user_id, invited_by)
  select (select auth.uid()), p.user_id from public.profiles p
  where lower(p.username) = lower(p_inviter) and (select auth.uid()) is not null and p.user_id <> (select auth.uid())
  on conflict (user_id) do nothing;
$$;
revoke all on function public.record_invite(text) from public, anon;
grant execute on function public.record_invite(text) to authenticated;

-- 15) Breakaway (the Intermission game) high scores: one row per player per season with their best
--     score, games played, and whether they've ever held the #1 score. Players can only write
--     through submit_breakaway(), which checks a score is possible for how long the game lasted
--     (the skater starts at speed 380, gains 9 per second up to 950, and scores speed/38 a second)
--     and that runs don't arrive faster than they could be played.
create table if not exists public.breakaway_scores (
  user_id   uuid not null references auth.users(id) on delete cascade,
  season    text not null,
  best      int not null default 0,
  best_at   timestamptz,
  runs      int not null default 0,
  held_top  boolean not null default false,
  last_at   timestamptz,
  primary key (user_id, season)
);
alter table public.breakaway_scores enable row level security;
revoke all on public.breakaway_scores from anon, authenticated;

create or replace function public.submit_breakaway(p_score int, p_ms int, p_season text default '20262027')
returns table (best int, rank int, is_best boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  secs numeric := greatest(coalesce(p_ms, 0), 0) / 1000.0;
  cap numeric;
  prev_best int;
  prev_last timestamptz;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles pr where pr.user_id = uid) then raise exception 'Choose a username first'; end if;
  cap := case when secs <= 63.34 then (380 * secs + 4.5 * secs * secs) / 38
              else (380 * 63.34 + 4.5 * 63.34 * 63.34) / 38 + 25 * (secs - 63.34) end + 10;
  if p_score is null or p_score < 0 or p_score > cap or p_ms > 3600000 then
    raise exception 'That score does not add up';
  end if;
  select b.best, b.last_at into prev_best, prev_last from public.breakaway_scores b where b.user_id = uid and b.season = p_season;
  if prev_last is not null and now() - prev_last < make_interval(secs => secs * 0.8) then
    raise exception 'Runs are arriving too fast';
  end if;
  insert into public.breakaway_scores as b (user_id, season, best, best_at, runs, last_at)
  values (uid, p_season, p_score, now(), 1, now())
  on conflict (user_id, season) do update set
    runs = b.runs + 1, last_at = now(),
    best = greatest(b.best, excluded.best),
    best_at = case when excluded.best > b.best then now() else b.best_at end;
  update public.breakaway_scores b set held_top = true
   where b.user_id = uid and b.season = p_season and b.best > 0
     and b.best >= (select max(x.best) from public.breakaway_scores x where x.season = p_season);
  return query
    select b.best,
      (1 + (select count(*) from public.breakaway_scores x join public.profiles pr on pr.user_id = x.user_id
            where x.season = p_season and x.best > b.best))::int,
      (p_score > coalesce(prev_best, 0))
    from public.breakaway_scores b where b.user_id = uid and b.season = p_season;
end $$;
revoke all on function public.submit_breakaway(int, int, text) from public, anon;
grant execute on function public.submit_breakaway(int, int, text) to authenticated;

-- The Breakaway leaderboard: best score per player (ties share a rank).
create or replace function public.breakaway_board(p_season text default '20262027', p_limit int default 10)
returns table (username text, best int, runs int, rank int)
language sql stable security definer set search_path = '' as $$
  select p.username, b.best, b.runs, (rank() over (order by b.best desc))::int
  from public.breakaway_scores b join public.profiles p on p.user_id = b.user_id
  where b.season = p_season and b.best > 0
  order by b.best desc, b.best_at asc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;
revoke all on function public.breakaway_board(text, int) from public;
grant execute on function public.breakaway_board(text, int) to anon, authenticated;
-- 16) Honours: badges that depend on everyone's results over time, or on when picks were made,
--     worked out here. One row per player and honour; n is a count where one is useful.
--     captain:     a sheet that was #1 (with points) on its team's leaderboard at the end of any
--                  game day. Once earned it stays, even if the sheet drops later.
--     mvp:         only once every regular-season game is final: the player(s) whose best sheet is
--                  #1 on the All-Teams season leaderboard (ties share it).
--     playerweek:  #1 on the All-Teams board for a finished week (Monday to Sunday); one row per week.
--     playermonth: #1 on the All-Teams board for a finished calendar month; one row per month.
--     earlybird:   n = picks on games that have started that were last changed 24+ hours before puck drop.
--     buzzer:      n = right results last changed in the 5 minutes before puck drop.
--     recruiter:   n = players who joined from your invitation link.
--     breakaway:   n = best Breakaway score; breakawayruns: n = games played; breakawaychamp: has held the #1 score.
--     Returns usernames, dates and counts only, never anyone's picks.
drop function if exists public.badge_honours(text);
create function public.badge_honours(p_season text default '20262027')
returns table (username text, badge text, team text, earned_on date, n int)
language sql stable security definer set search_path = ''
as $$
  with graded as (       -- every pick on a finished game, with its points
    select tp.user_id, tp.team, g.game_date, g.start_utc, tp.updated_at,
      (tp.pick is not null and tp.pick =
         (case when (case when g.home = tp.team then g.home_score else g.away_score end)
                  > (case when g.home = tp.team then g.away_score else g.home_score end) then 'W'
               when g.period_type = 'REG' then 'L' else 'OTL' end)) as result_hit,
      (tp.goals is not null and tp.goals = g.home_score + g.away_score) as goals_hit
    from public.team_picks tp
    join public.profiles p on p.user_id = tp.user_id
    join public.games g on g.game_id = tp.game_id and g.season = p_season
    where g.period_type is not null and g.home_score is not null and g.away_score is not null
  ),
  daily as (             -- points each sheet earned on each game day
    select x.user_id, x.team, x.game_date,
      sum((case when x.result_hit then 1 else 0 end) + (case when x.goals_hit then 1 else 0 end)) as pts
    from graded x group by x.user_id, x.team, x.game_date
  ),
  sheets as (select distinct d.user_id, d.team from daily d),
  days as (select distinct d.team, d.game_date from daily d),
  running as (           -- each sheet's season total at the end of each of its team's game days
    select s.user_id, s.team, dy.game_date,
      sum(coalesce(d.pts, 0)) over (partition by s.user_id, s.team order by dy.game_date) as total
    from sheets s
    join days dy on dy.team = s.team
    left join daily d on d.user_id = s.user_id and d.team = s.team and d.game_date = dy.game_date
  ),
  ranked as (select r.*, max(r.total) over (partition by r.team, r.game_date) as top from running r),
  captains as (
    select k.user_id, k.team, min(k.game_date) as earned_on
    from ranked k where k.total > 0 and k.total = k.top
    group by k.user_id, k.team
  ),
  -- weeks and months whose games are all over (postponed games move to their new date)
  periods as (
    select 'week' as kind, date_trunc('week', g.game_date)::date as start, max(g.game_date) as last_day,
      count(*) filter (where g.period_type is null and coalesce(g.schedule_state, 'OK') = 'OK') as open
    from public.games g where g.season = p_season group by 2
    union all
    select 'month', date_trunc('month', g.game_date)::date, max(g.game_date),
      count(*) filter (where g.period_type is null and coalesce(g.schedule_state, 'OK') = 'OK')
    from public.games g where g.season = p_season group by 2
  ),
  period_pts as (        -- each sheet's points in each week and month
    select 'week' as kind, date_trunc('week', d.game_date)::date as start, d.user_id, d.team, sum(d.pts) as pts
    from daily d group by 2, 3, 4
    union all
    select 'month', date_trunc('month', d.game_date)::date, d.user_id, d.team, sum(d.pts)
    from daily d group by 2, 3, 4
  ),
  period_top as (
    select pp.*, max(pp.pts) over (partition by pp.kind, pp.start) as top from period_pts pp
    join periods pr on pr.kind = pp.kind and pr.start = pp.start and pr.open = 0 and pr.last_day < current_date
  ),
  period_wins as (select distinct t.kind, t.start, t.user_id from period_top t where t.pts > 0 and t.pts = t.top),
  season_over as (       -- every regular-season game final (cancelled games don't count)
    select max(g.game_date) as last_day from public.games g
    where g.season = p_season
    having count(*) > 0
       and count(*) filter (where g.period_type is null and coalesce(g.schedule_state, 'OK') not in ('CNCL', 'CANCELLED')) = 0
  ),
  finals as (select d.user_id, d.team, sum(d.pts) as pts from daily d group by d.user_id, d.team),
  best as (select f.user_id, max(f.pts) as pts from finals f group by f.user_id),
  mvps as (
    select b.user_id, (select so.last_day from season_over so) as earned_on
    from best b
    where exists (select 1 from season_over)
      and b.pts > 0 and b.pts = (select max(x.pts) from best x)
  ),
  early as (             -- picks on games that have started, last changed a day or more before puck drop
    select tp.user_id, count(*)::int as n
    from public.team_picks tp
    join public.profiles p on p.user_id = tp.user_id
    join public.games g on g.game_id = tp.game_id and g.season = p_season
    where g.start_utc <= now() and tp.updated_at <= g.start_utc - interval '24 hours'
    group by tp.user_id
  ),
  buzzer as (            -- right results last changed in the final 5 minutes before puck drop
    select x.user_id, count(*)::int as n from graded x
    where x.result_hit and x.updated_at > x.start_utc - interval '5 minutes' and x.updated_at <= x.start_utc
    group by x.user_id
  ),
  recruits as (
    select i.invited_by as user_id, count(*)::int as n
    from public.invites i join public.profiles p on p.user_id = i.user_id
    group by i.invited_by
  ),
  brk as (select b.user_id, b.best, b.runs, b.held_top from public.breakaway_scores b where b.season = p_season)
  select p.username, 'captain', c.team, c.earned_on, null::int from captains c join public.profiles p on p.user_id = c.user_id
  union all
  select p.username, 'mvp', null, m.earned_on, null from mvps m join public.profiles p on p.user_id = m.user_id
  union all
  select p.username, 'player' || w.kind, null, w.start, null from period_wins w join public.profiles p on p.user_id = w.user_id
  union all
  select p.username, 'earlybird', null, null, e.n from early e join public.profiles p on p.user_id = e.user_id
  union all
  select p.username, 'buzzer', null, null, b.n from buzzer b join public.profiles p on p.user_id = b.user_id
  union all
  select p.username, 'recruiter', null, null, r.n from recruits r join public.profiles p on p.user_id = r.user_id
  union all
  select p.username, 'breakaway', null, null, k.best from brk k join public.profiles p on p.user_id = k.user_id
  union all
  select p.username, 'breakawayruns', null, null, k.runs from brk k join public.profiles p on p.user_id = k.user_id
  union all
  select p.username, 'breakawaychamp', null, null, 1 from brk k join public.profiles p on p.user_id = k.user_id where k.held_top;
$$;
revoke all on function public.badge_honours(text) from public;
grant execute on function public.badge_honours(text) to anon, authenticated;

-- 17) Chiclets: the stickpicks currency. Free to earn, never sold, no cash value, can't be transferred.
--     Worked out from picks and final scores, in game order, so the balance is always right and can't be
--     faked. Badge rewards (section 18) are the only stored part, and only the database writes them.
--       +1  right result                 +2  exact combined goals (so a perfect game is +3)
--           Each game pays once per player: picked on two sheets (both teams' sheets), the result pays only
--           if every result pick on it was right, and the goals only if every goals pick was right. So
--           hedging (each team to win on its own sheet) earns nothing, and grinders can't double up.
--       +5  perfect night: every game's result right on a night with 3 or more games picked
--       +5 / +10 / +25  a navy / red / gold badge, once (rivalry badges +5; Bad habits nothing)
--       -1  each game missed on a sheet you've started (a game that started with no pick, after your
--           first pick on that sheet), at most -5 a week (Monday to Sunday). The balance never goes below 0.
--     chiclets_ledger() returns every change in order with the running balance; chiclets_balance() just the total.
--       -price  a shop purchase (section 19)
--     (kind = 'pick' | 'night' | 'badge' | 'spend' | 'miss'; for 'badge' note is the badge id, for 'spend' the item id.)
--     The statement is private: chiclets_ledger() only answers for the signed-in player's own username.
--     Totals are public: chiclets_balance() works for anyone. Both use chiclets_ledger_uid(), which nobody calls directly.
create or replace function public.chiclets_ledger_uid(uid uuid)
returns table (at timestamptz, delta int, balance int, kind text, team text, home text, away text, note text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  r record;
  bal int := 0;
  nb int;
begin
  if uid is null then return; end if;
  for r in
    with my as (select tp.team, tp.game_id, tp.pick, tp.goals from public.team_picks tp where tp.user_id = uid),
    fin as (
      select m.team, m.game_id, g.game_date, g.start_utc, g.home, g.away, (m.pick is not null) as picked, (m.goals is not null) as guessed,
        (m.pick is not null and m.pick =
          (case when (case when g.home = m.team then g.home_score else g.away_score end)
                   > (case when g.home = m.team then g.away_score else g.home_score end) then 'W'
                when g.period_type = 'REG' then 'L' else 'OTL' end)) as rh,
        (m.goals is not null and m.goals = g.home_score + g.away_score) as gh
      from my m join public.games g on g.game_id = m.game_id
      where g.period_type is not null and g.home_score is not null and g.away_score is not null
    ),
    per_game as (        -- one row per game: right only if every pick of that kind on it was right
      select f.game_id, min(f.game_date) as game_date, min(f.start_utc) as start_utc, min(f.home) as home, min(f.away) as away,
        count(*) as sheets, min(f.team) as team,
        bool_or(f.picked) as picked,
        coalesce(bool_and(f.rh) filter (where f.picked), false) as rh,
        coalesce(bool_and(f.gh) filter (where f.guessed), false) as gh
      from fin f group by f.game_id
    ),
    earn as (
      select f.start_utc as at, (case when f.rh then 1 else 0 end) + (case when f.gh then 2 else 0 end) as delta,
        'pick'::text as kind, (case when f.sheets > 1 then null else f.team end) as team, f.home, f.away,
        (case when f.rh and f.gh then 'Right result and exact goals' when f.rh then 'Right result' else 'Exact goals' end)
          || (case when f.sheets > 1 then ' (picked on ' || f.sheets || ' sheets, counted once)' else '' end) as note
      from per_game f where f.rh or f.gh
    ),
    nights as (
      select max(f.start_utc) + interval '1 second', 5, 'night'::text, null::text, null::text, null::text,
        'Perfect night: every result right (' || count(*) || ' games)'
      from per_game f where f.picked group by f.game_date having count(*) >= 3 and bool_and(f.rh)
    ),
    badges as (
      select a.awarded_at, a.amount, 'badge'::text, null::text, null::text, null::text, a.badge
      from public.chiclet_awards a where a.user_id = uid and a.amount > 0
    ),
    spends as (          -- shop purchases (section 19); note is the item id
      select s.bought_at, -s.price, 'spend'::text, null::text, null::text, null::text, s.item_id
      from public.chiclet_spends s where s.user_id = uid
    ),
    sheets as (select m.team, min(g.start_utc) as first_at from my m join public.games g on g.game_id = m.game_id group by m.team),
    missed as (
      select g.start_utc, g.game_date, s.team, g.home, g.away
      from sheets s join public.games g on (g.home = s.team or g.away = s.team)
      where g.start_utc > s.first_at and g.start_utc <= now() and coalesce(g.schedule_state, 'OK') = 'OK'
        and not exists (select 1 from my m where m.team = s.team and m.game_id = g.game_id)
    ),
    capped as (select x.*, row_number() over (partition by date_trunc('week', x.game_date) order by x.start_utc) as k from missed x),
    loss as (select c.start_utc, -1, 'miss'::text, c.team, c.home, c.away, 'Missed pick on a started sheet' from capped c where c.k <= 5)
    select * from earn union all select * from nights union all select * from badges union all select * from spends union all select * from loss
    order by 1, 2 desc
  loop
    nb := greatest(0, bal + r.delta);
    if nb <> bal then
      at := r.at; delta := nb - bal; balance := nb; kind := r.kind; team := r.team; home := r.home; away := r.away; note := r.note;
      bal := nb;
      return next;
    end if;
  end loop;
end $$;
revoke all on function public.chiclets_ledger_uid(uuid) from public, anon, authenticated;

create or replace function public.chiclets_ledger(p_username text)
returns table (at timestamptz, delta int, balance int, kind text, team text, home text, away text, note text)
language sql stable security definer set search_path = '' as $$
  select l.* from public.profiles p cross join lateral public.chiclets_ledger_uid(p.user_id) l
  where lower(p.username) = lower(p_username) and p.user_id = auth.uid();
$$;
revoke all on function public.chiclets_ledger(text) from public, anon;
grant execute on function public.chiclets_ledger(text) to authenticated;

create or replace function public.chiclets_balance(p_username text)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select l.balance from public.profiles p
                     cross join lateral public.chiclets_ledger_uid(p.user_id) with ordinality as l(at, delta, balance, kind, team, home, away, note, n)
                   where lower(p.username) = lower(p_username)
                   order by l.n desc limit 1), 0);
$$;
revoke all on function public.chiclets_balance(text) from public;
grant execute on function public.chiclets_balance(text) to anon, authenticated;

-- 18) Badge rewards in Chiclets. The site works badges out in the browser, which a player could fake, so the
--     database checks every badge itself here (badges_earned: the same rules as computeBadges in teams.js)
--     before paying. Each badge pays once, recorded in chiclet_awards, and stays paid.
--     navy +5, red +10, gold +25, rivalry badges +5; Bad habits and Season Dynasty pay nothing.
--     Awards are made by claim_badge_chiclets() (the signed-in player, when the site loads their badges) and
--     award_all_badge_chiclets() (everyone; the GitHub Action runs it after each score update).
create table if not exists public.chiclet_awards (
  user_id     uuid not null references auth.users(id) on delete cascade,
  badge       text not null,
  amount      int not null check (amount between 0 and 100),
  awarded_at  timestamptz not null default now(),
  primary key (user_id, badge)
);
alter table public.chiclet_awards enable row level security;
-- No policies: nobody reads or writes this table directly; only the functions below and the ledger do.
revoke all on public.chiclet_awards from anon, authenticated;

create or replace function public.badge_reward(p_badge text)
returns int language sql immutable set search_path = '' as $$
  select case
    when p_badge like 'riv\_%' then 5
    when p_badge in ('star1','shutout','fullsheet','pointstreak','captain','mvp','playermonth','dynasty','monthlydynasty',
                     'naturalhattrick','perfectweek','commissioner','pt100','highlightreel','breakawaychamp') then 25
    when p_badge in ('season2627','hattrick','star2','topshelf','lamp','playerweek','buzzer','openingnight','heritageclassic',
                     'numberonefan','roadwarrior','goalfest','goalieduel','ocanada','divisionchamp','pt50','ppg','talentscout',
                     'dekemaster','coasttocoast') then 10
    when p_badge in ('inaugural','faceoff','star3','overtime','shootout','original6','barnstormer','ironman','earlybird',
                     'fullslate','halfseason','winterclassic','stadiumseries','globalseries','mixedfeelings','pt20','recruiter',
                     'firstshift','dangler','rinkrat') then 5
    else 0 end;
$$;
grant execute on function public.badge_reward(text) to anon, authenticated;

-- The badges a player has earned this season, worked out from the database alone (rewardable badges only).
create or replace function public.badges_earned(p_uid uuid, p_season text default '20262027')
returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  uname text; fav text; lst text;
begin
  select p.username, p.fav_team, p.least_team into uname, fav, lst from public.profiles p where p.user_id = p_uid;
  if uname is null then return; end if;
  return query
  with
  tm(team, div) as (values
    ('BOS','Atlantic'),('BUF','Atlantic'),('DET','Atlantic'),('FLA','Atlantic'),('MTL','Atlantic'),('OTT','Atlantic'),('TBL','Atlantic'),('TOR','Atlantic'),
    ('CAR','Metropolitan'),('CBJ','Metropolitan'),('NJD','Metropolitan'),('NYI','Metropolitan'),('NYR','Metropolitan'),('PHI','Metropolitan'),('PIT','Metropolitan'),('WSH','Metropolitan'),
    ('CHI','Central'),('COL','Central'),('DAL','Central'),('MIN','Central'),('NSH','Central'),('STL','Central'),('UTA','Central'),('WPG','Central'),
    ('ANA','Pacific'),('CGY','Pacific'),('EDM','Pacific'),('LAK','Pacific'),('SJS','Pacific'),('SEA','Pacific'),('VAN','Pacific'),('VGK','Pacific')),
  riv(id, a, b) as (values
    ('riv_alberta','EDM','CGY'),('riv_ontario','TOR','OTT'),('riv_penn','PHI','PIT'),('riv_florida','FLA','TBL'),
    ('riv_newyork','NYR','NYI'),('riv_hudson','NYR','NJD'),('riv_habsleafs','MTL','TOR'),('riv_bruinshabs','BOS','MTL'),
    ('riv_hawkswings','CHI','DET'),('riv_avswings','COL','DET'),('riv_freeway','LAK','ANA'),('riv_capspens','WSH','PIT'),
    ('riv_bluehawks','STL','CHI'),('riv_cascadia','SEA','VAN'),('riv_cryptids','SEA','NJD'),('riv_whalersnords','CAR','COL')),
  sg as (select g.* from public.games g where g.season = p_season),
  mp as (                -- this player's picks on this season's games
    select tp.team, tp.game_id, tp.pick, tp.goals, g.game_date, g.start_utc, g.home, g.away, g.home_score, g.away_score,
      g.period_type, g.venue, g.neutral_site, (g.period_type is not null or g.start_utc <= now()) as started
    from public.team_picks tp join sg g on g.game_id = tp.game_id where tp.user_id = p_uid
  ),
  sheets as (select distinct m.team from mp m),
  sc as (                -- picks on finished games: rh / gh are null when that part wasn't picked
    select m.*, m.home_score + m.away_score as tot,
      (case when m.pick is null then null else m.pick =
        (case when (case when m.home = m.team then m.home_score else m.away_score end)
                 > (case when m.home = m.team then m.away_score else m.home_score end) then 'W'
              when m.period_type = 'REG' then 'L' else 'OTL' end) end) as rh,
      (case when m.goals is null then null else m.goals = m.home_score + m.away_score end) as gh
    from mp m where m.period_type is not null and m.home_score is not null and m.away_score is not null
  ),
  res as (select * from sc where sc.rh is not null),
  pts as (select s.*, (case when s.rh then 1 else 0 end) + (case when s.gh then 1 else 0 end) as p
          from sc s where s.rh is not null or s.gh is not null),
  -- longest run of right results on one sheet (stars)
  srun as (select r.team, r.rh, sum(case when r.rh then 0 else 1 end) over (partition by r.team order by r.start_utc, r.game_id) as grp from res r),
  star as (select coalesce(max(x.n), 0) as n from (select s.team, s.grp, count(*) filter (where s.rh) as n from srun s group by s.team, s.grp) x),
  -- longest run of games with a point, across sheets in game order (Point Streak)
  prun as (select q.p, sum(case when q.p > 0 then 0 else 1 end) over (order by q.start_utc, q.team) as grp from pts q),
  pstreak as (select coalesce(max(x.n), 0) as n from (select r.grp, count(*) filter (where r.p > 0) as n from prun r group by r.grp) x),
  -- longest run of 2-point games on one sheet (Natural Hat Trick)
  nrun as (select q.team, q.p, sum(case when q.p = 2 then 0 else 1 end) over (partition by q.team order by q.start_utc, q.game_id) as grp from pts q),
  nat as (select coalesce(max(x.n), 0) as n from (select r.team, r.grp, count(*) filter (where r.p = 2) as n from nrun r group by r.team, r.grp) x),
  sheetpts as (select coalesce(max(x.t), 0) as n from (select q.team, sum(q.p) as t from pts q group by q.team) x),
  -- every game of each sheet's team, and whether it has both a result and goals picked
  fullp as (
    select s.team, g.game_id, g.game_date, (g.period_type is not null or g.start_utc <= now()) as started,
      exists (select 1 from mp m where m.team = s.team and m.game_id = g.game_id and m.pick is not null and m.goals is not null) as ok
    from sheets s join sg g on g.home = s.team or g.away = s.team
  ),
  fill as (select f.team, count(*) as n, count(*) filter (where f.ok) as k from fullp f group by f.team),
  -- weeks (Monday to Sunday) with picks on games that have started, and the longest run of them (Iron Man)
  wk as (select distinct date_trunc('week', m.game_date)::date as w from mp m where m.started),
  wkg as (select k.w, k.w - (7 * row_number() over (order by k.w))::int as grp from wk k),
  iron as (select coalesce(max(x.c), 0) as n from (select g.grp, count(*) as c from wkg g group by g.grp) x),
  -- neutral-site games: outdoor (Winter Classic, Stadium Series, Heritage Classic) or overseas (Global Series)
  big as (
    select (case
      when not coalesce(m.neutral_site, false) then null
      when coalesce(m.venue, '') ~* '(stadium|field|park|bowl)' and coalesce(m.venue, '') !~* 'dome' then
        (case when (extract(month from m.game_date) = 12 and extract(day from m.game_date) >= 30)
                or (extract(month from m.game_date) = 1 and extract(day from m.game_date) <= 3) then 'winterclassic'
              when extract(month from m.game_date) between 1 and 3 then 'stadiumseries'
              when m.home in ('CGY','EDM','MTL','OTT','TOR','VAN','WPG') then 'heritageclassic'
              else 'outdoor' end)
      else 'globalseries' end) as k
    from mp m where m.started
  ),
  hon as (select h.badge, h.n from public.badge_honours(p_season) h where lower(h.username) = lower(uname)),
  hn as (select h.badge, coalesce(max(h.n), 0) as n, count(*) as c from hon h group by h.badge),
  graded as (select count(*) as n, coalesce(sum(q.p), 0) as pts from pts q),
  season_done as (       -- every game of this player's sheets' teams is final (or postponed)
    select coalesce(bool_and(g.period_type is not null or g.schedule_state = 'PPD'), false) as done
    from sg g where exists (select 1 from sheets s where s.team = g.home or s.team = g.away)
  )
  select v.b::text from (values
    ('inaugural',       true),
    ('faceoff',         exists (select 1 from mp)),
    ('season2627',      exists (select 1 from mp)),
    ('hattrick',        exists (select 1 from res r where r.rh group by r.team having count(distinct r.pick) = 3)),
    ('star3',           (select n from star) >= 3),
    ('star2',           (select n from star) >= 5),
    ('star1',           (select n from star) >= 10),
    ('topshelf',        exists (select 1 from sc s where s.rh and s.gh)),
    ('lamp',            (select count(*) from sc s where s.gh) >= 5),
    ('shutout',         exists (select 1 from res r group by r.game_date having count(*) >= 3 and bool_and(r.rh))),
    ('overtime',        exists (select 1 from res r where r.pick = 'OTL' and r.rh)),
    ('shootout',        exists (select 1 from res r where r.period_type = 'SO' and r.rh)),
    ('fullsheet',       exists (select 1 from fill f where f.n > 0 and f.k = f.n)),
    ('original6',       (select count(*) from sheets s where s.team in ('BOS','CHI','DET','MTL','NYR','TOR')) = 6),
    ('barnstormer',     (select count(distinct t.div) from sheets s join tm t on t.team = s.team) = 4),
    ('pointstreak',     (select n from pstreak) >= 10),
    ('captain',         exists (select 1 from hn where hn.badge = 'captain')),
    ('mvp',             exists (select 1 from hn where hn.badge = 'mvp')),
    ('playerweek',      exists (select 1 from hn where hn.badge = 'playerweek')),
    ('playermonth',     exists (select 1 from hn where hn.badge = 'playermonth')),
    ('dynasty',         coalesce((select c from hn where hn.badge = 'playerweek'), 0) >= 3),
    ('monthlydynasty',  coalesce((select c from hn where hn.badge = 'playermonth'), 0) >= 3),
    ('ironman',         (select n from iron) >= 4),
    ('earlybird',       coalesce((select n from hn where hn.badge = 'earlybird'), 0) >= 10),
    ('buzzer',          coalesce((select n from hn where hn.badge = 'buzzer'), 0) >= 1),
    ('fullslate',       exists (select 1 from fullp f group by date_trunc('week', f.game_date)
                                having count(*) >= 3 and bool_and(f.started) and bool_and(f.ok))),
    ('halfseason',      exists (select 1 from fill f where f.n > 0 and f.k >= ceil(f.n / 2.0))),
    ('openingnight',    exists (select 1 from mp m where m.started and m.game_date = (select min(g.game_date) from sg g))),
    ('winterclassic',   exists (select 1 from big where big.k = 'winterclassic')),
    ('heritageclassic', exists (select 1 from big where big.k = 'heritageclassic')),
    ('stadiumseries',   exists (select 1 from big where big.k = 'stadiumseries')),
    ('globalseries',    exists (select 1 from big where big.k = 'globalseries')),
    ('numberonefan',    fav is not null and exists (select 1 from sheets s where s.team = fav)),
    ('mixedfeelings',   lst is not null and exists (select 1 from sheets s where s.team = lst)),
    ('naturalhattrick', (select n from nat) >= 3),
    ('roadwarrior',     (select count(*) from res r where r.pick = 'W' and r.rh and r.away = r.team) >= 5),
    ('goalfest',        exists (select 1 from sc s where s.gh and s.tot >= 9)),
    ('goalieduel',      exists (select 1 from sc s where s.gh and s.tot <= 3)),
    ('perfectweek',     exists (select 1 from res r group by date_trunc('week', r.game_date) having count(*) >= 5 and bool_and(r.rh))),
    ('ocanada',         (select count(*) from sheets s where s.team in ('CGY','EDM','MTL','OTT','TOR','VAN','WPG')) = 7),
    ('divisionchamp',   exists (select 1 from sheets s join tm t on t.team = s.team group by t.div having count(*) = 8)),
    ('commissioner',    (select count(*) from sheets) >= 32),
    ('pt20',            (select n from sheetpts) >= 20),
    ('pt50',            (select n from sheetpts) >= 50),
    ('pt100',           (select n from sheetpts) >= 100),
    ('ppg',             (select done from season_done) and (select n from graded) > 0
                        and (select pts from graded)::numeric / (select n from graded) >= 1),
    ('recruiter',       coalesce((select n from hn where hn.badge = 'recruiter'), 0) >= 1),
    ('talentscout',     coalesce((select n from hn where hn.badge = 'recruiter'), 0) >= 3),
    ('firstshift',      coalesce((select n from hn where hn.badge = 'breakawayruns'), 0) >= 1),
    ('rinkrat',         coalesce((select n from hn where hn.badge = 'breakawayruns'), 0) >= 100),
    ('dangler',         coalesce((select n from hn where hn.badge = 'breakaway'), 0) >= 250),
    ('dekemaster',      coalesce((select n from hn where hn.badge = 'breakaway'), 0) >= 500),
    ('coasttocoast',    coalesce((select n from hn where hn.badge = 'breakaway'), 0) >= 1000),
    ('highlightreel',   coalesce((select n from hn where hn.badge = 'breakaway'), 0) >= 2000),
    ('breakawaychamp',  exists (select 1 from hn where hn.badge = 'breakawaychamp'))
  ) as v(b, ok) where v.ok
  union all
  select r.id::text from riv r where exists (select 1 from sheets s where s.team = r.a) and exists (select 1 from sheets s where s.team = r.b);
end $$;
revoke all on function public.badges_earned(uuid, text) from public, anon, authenticated;

-- Pay any badge rewards a player hasn't had yet; returns the new ones.
create or replace function public.award_badge_chiclets(p_uid uuid)
returns table (badge text, amount int)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if p_uid is null then return; end if;
  return query
  insert into public.chiclet_awards as a (user_id, badge, amount)
  select p_uid, e.b, public.badge_reward(e.b)
  from public.badges_earned(p_uid) as e(b)
  where public.badge_reward(e.b) > 0
  on conflict (user_id, badge) do nothing
  returning a.badge, a.amount;
end $$;
revoke all on function public.award_badge_chiclets(uuid) from public, anon, authenticated;

-- The signed-in player: called by the site when it loads their badges.
create or replace function public.claim_badge_chiclets()
returns table (badge text, amount int)
language sql volatile security definer set search_path = '' as $$
  select * from public.award_badge_chiclets(auth.uid());
$$;
revoke all on function public.claim_badge_chiclets() from public, anon;
grant execute on function public.claim_badge_chiclets() to authenticated;

-- Everyone with a profile: run by the GitHub Action (secret key) after each score update.
create or replace function public.award_all_badge_chiclets()
returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  u record;
  total int := 0;
  c int;
begin
  for u in select p.user_id from public.profiles p loop
    select count(*) into c from public.award_badge_chiclets(u.user_id);
    total := total + c;
  end loop;
  return total;
end $$;
revoke all on function public.award_all_badge_chiclets() from public, anon, authenticated;
grant execute on function public.award_all_badge_chiclets() to service_role;

-- 19) The Chiclets shop: cosmetic items only, bought with Chiclets (never real money).
--     shop_items: what's for sale and the price (prices live here, so the browser can't change them).
--       Tiers: starter 150, classic 400, premium 800, legendary 1500. available_from / available_to make an
--       item limited-time (dates inclusive); active = false takes it out of the shop (owners keep it).
--     chiclet_spends: what each player bought (one row per item; shown in their ledger as a spend).
--     buy_item(): checks the item is on sale, not owned yet, and affordable, then records the purchase.
--     equip_item(): wears an owned item (or takes it off). The worn border lives on profiles.border so every
--       page that shows a profile picture can draw it; a trigger stops anyone setting it any other way.
create table if not exists public.shop_items (
  id              text primary key,
  slot            text not null check (slot in ('border','sweater','skater')),
  name            text not null,
  blurb           text not null default '',
  tier            text not null check (tier in ('starter','classic','premium','legendary')),
  price           int not null check (price > 0),
  sort            int not null default 0,
  available_from  date,
  available_to    date,
  active          boolean not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists "Anyone can see the shop" on public.shop_items;
create policy "Anyone can see the shop" on public.shop_items for select using (true);
grant select on public.shop_items to anon, authenticated;

insert into public.shop_items (id, slot, name, blurb, tier, price, sort) values
  ('border_stitch',     'border', 'Stitched',     'A navy ring with cream stitching, like a sweater patch.',          'starter',   150, 10),
  ('border_hem',        'border', 'Hem Stripes',  'Red, cream and red, like the hem of a home sweater.',              'starter',   150, 20),
  ('border_team',       'border', 'Team Colors',  'Your favorite team''s colors (set your favorite team in Settings).', 'starter', 150, 30),
  ('border_gold',       'border', 'Gold',         'A polished gold ring.',                                             'premium',   800, 40),
  ('border_champion',   'border', 'Championship', 'Gold and red, like a championship banner.',                         'premium',   800, 50),
  ('border_halloffame', 'border', 'Hall of Fame', 'Shimmering gold that never stops moving. For the true grinders.',  'legendary', 1500, 60)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, blurb = excluded.blurb, tier = excluded.tier,
  price = excluded.price, sort = excluded.sort, available_from = excluded.available_from,
  available_to = excluded.available_to, active = excluded.active;

create table if not exists public.chiclet_spends (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null references public.shop_items(id),
  price      int not null check (price > 0),
  bought_at  timestamptz not null default now(),
  primary key (user_id, item_id)
);
alter table public.chiclet_spends enable row level security;
-- No policies: only buy_item() writes it; my_items() and the ledger read it.
revoke all on public.chiclet_spends from anon, authenticated;

-- The worn border (public, like the profile picture). Only equip_item() can change it.
alter table public.profiles add column if not exists border text;
create or replace function public.profiles_guard_cosmetics()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('stickpicks.equip', true), '') <> 'on' then
    if tg_op = 'INSERT' then new.border := null;
    elsif new.border is distinct from old.border then new.border := old.border;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_cosmetics on public.profiles;
create trigger profiles_guard_cosmetics before insert or update on public.profiles
  for each row execute function public.profiles_guard_cosmetics();

-- What the signed-in player owns.
create or replace function public.my_items()
returns table (item_id text, bought_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.item_id, s.bought_at from public.chiclet_spends s where s.user_id = auth.uid() order by s.bought_at;
$$;
revoke all on function public.my_items() from public, anon;
grant execute on function public.my_items() to authenticated;

create or replace function public.buy_item(p_item text)
returns table (item_id text, price int, balance int)
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  uname text;
  it record;
  bal int;
begin
  if uid is null then raise exception 'Sign in to shop.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 19));   -- one purchase at a time per player
  select p.username into uname from public.profiles p where p.user_id = uid;
  if uname is null then raise exception 'Choose a username first.'; end if;
  select * into it from public.shop_items s
   where s.id = p_item and s.active
     and (s.available_from is null or current_date >= s.available_from)
     and (s.available_to is null or current_date <= s.available_to);
  if not found then raise exception 'That item isn''t for sale right now.'; end if;
  if exists (select 1 from public.chiclet_spends s where s.user_id = uid and s.item_id = p_item) then
    raise exception 'You already own that.';
  end if;
  bal := public.chiclets_balance(uname);
  if bal < it.price then raise exception 'Not enough Chiclets.'; end if;
  insert into public.chiclet_spends (user_id, item_id, price) values (uid, it.id, it.price);
  return query select it.id::text, it.price::int, public.chiclets_balance(uname);
end $$;
revoke all on function public.buy_item(text) from public, anon;
grant execute on function public.buy_item(text) to authenticated;

-- Wear an owned item in its slot, or take it off (p_item null).
create or replace function public.equip_item(p_slot text, p_item text default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first.'; end if;
  if p_slot <> 'border' then raise exception 'That can''t be worn yet.'; end if;
  if p_item is not null and not exists (
    select 1 from public.chiclet_spends s join public.shop_items i on i.id = s.item_id
    where s.user_id = uid and s.item_id = p_item and i.slot = p_slot
  ) then raise exception 'You don''t own that.'; end if;
  perform set_config('stickpicks.equip', 'on', true);
  update public.profiles set border = p_item where user_id = uid;
  perform set_config('stickpicks.equip', 'off', true);
end $$;
revoke all on function public.equip_item(text, text) from public, anon;
grant execute on function public.equip_item(text, text) to authenticated;

notify pgrst, 'reload schema';