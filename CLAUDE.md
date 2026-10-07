# Stick Picks

A fan-made NHL 2026–27 prediction game. Players pick each team's games (W / L / OTL plus combined goals), earn up to 2 points per game, and compete on per-sheet leaderboards. Static site on GitHub Pages + Supabase (Postgres, auth) + a GitHub Action (every 15 minutes) that syncs data.

Owner is not a professional developer: explain changes in plain language, and say exactly which files changed and whether `supabase/schema.sql` must be re-run.

## Stack and constraints

- **No build step, no framework, no npm dependencies for the site.** Plain HTML, CSS, and vanilla JS. Pages load `supabase-js` v2 (UMD) from jsDelivr, then `config.js`, then `teams.js`.
- **Hosting:** GitHub Pages serves the repo root from `main`. Pushing to `main` deploys.
- **Database:** Supabase. All schema lives in `supabase/schema.sql`, which must stay **idempotent** (safe to re-run on an existing database): `create table if not exists`, `drop policy if exists` before `create policy`, `create or replace function`. If a function's return columns change, `drop function if exists` first.
- **Data sync:** `.github/workflows/update-games.yml` runs `scripts/update-games.mjs` every 15 minutes (Node 20, no dependencies) with repo secrets `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Home: news ticker, short hero, sign-in / create account / password reset, account card (points, best sheet rank, my sheets), today's games, link to Intermission. Redirects old `index.html?team=X` links to `sheet.html`; `index.html#teams` opens the Choose Team menu. |
| `intermission.html` | Intermission page hosting the Breakaway game (`game.js`). |
| `sheet.html` | One team's prediction sheet (`?team=SEA`). Editable for the owner; view-only for others with `&user=Name`. |
| `compare.html` | Side-by-side: signed-in user vs another player for one team (`?team=SEA&user=Name`). |
| `leaderboard.html` | Per-team boards and an All teams board. Rows link to `sheet.html?team=…&user=…`. |
| `rules.html` | Scoring rules, examples, FAQ. Keep it in sync with any scoring change. |
| `game.js` | Breakaway, a canvas endless-runner on `intermission.html`. Self-contained IIFE. |
| `teams.js` | Shared: `TEAMS` (32 teams: name, division, `board`/`accent`/`brand` colors, optional `stripe`), `DIVISIONS`, contrast helpers, `applyTheme()`, `mountTeamMenu()` (the "Choose Team" nav dropdown on index/rules/intermission), `makeClient()`, `SEASON`, `USERNAME_RULE`, `resultFor()`, `hasStarted()`, `scorePick()`. |
| `config.js` | Supabase URL and publishable key (safe to publish). Never put the secret key here. |
| `styles.css` | All styles for every page. Theme colors are CSS custom properties set per team by `applyTheme()`. |
| `scripts/update-games.mjs` | Syncs all 32 schedules + scores from the NHL feed into `games`, and ESPN headlines into `news`. |
| `supabase/schema.sql` | Entire database: tables, row-level security, grants, functions. |
| `supabase/migrate-from-kraken-version.sql` | One-time legacy migration. Leave alone. |

## Data model (Supabase)

- `games` (PK `game_id`): season, game_date, start_utc, home, away, home_score, away_score, game_state, schedule_state (`PPD` = postponed), period_type (`REG`/`OT`/`SO`, set only when final), venue, neutral_site. Public read; only `service_role` writes.
- `team_picks` (PK user_id, team, game_id): `pick` (W/L/OTL, nullable), `goals` (0–30, nullable); at least one must be set. RLS: owner only, and only while `pick_is_open(game_id, team)` is true (before puck drop, team actually plays in that game).
- `profiles` (PK user_id): `username`, 3–20 of `[A-Za-z0-9_]`, unique case-insensitively. Public read.
- `news`: ESPN headlines for the ticker. Public read.
- Functions (security definer unless noted): `leaderboard(p_season, p_team)` returns one row **per user per team sheet**; `sheet_picks(p_username, p_team, p_season)` returns another player's picks with **upcoming picks hidden** (`revealed=false`, pick/goals null); `username_available(p_username)`; `my_sheets(p_season)` (security invoker); `pick_is_open(game_id, team)`.

## Game rules (enforce everywhere: JS, SQL, rules page)

- From the sheet team's side: **W** = any win (incl. OT/SO); **L** = regulation loss; **OTL** = OT or shootout loss.
- **Combined goals** = `home_score + away_score` from the official final score, which credits the shootout winner with one goal (2–2 then SO win = 3–2 = 5 goals).
- 1 point for correct result + 1 point for exact combined goals; max 2 per game. Scored only when `period_type` is set.
- Picks lock at **puck drop** (`start_utc`), enforced by RLS, not just the UI.
- Leaderboards rank each **team sheet separately**; points are never summed across sheets. Ties share a rank.
- Other players' picks are revealed only for games that have started.

## Conventions

- Picks in the browser: `{ [game_id]: { o: "W"|"L"|"OTL", g: number } }`. Older saved data may be a bare string; `loadLocal()` normalizes it.
- localStorage keys (don't rename; users have data in them): `nhl-picks-${SEASON}-${team}`, `nhl-picks-last-team`, `stickpicks-breakaway-hi`.
- Constants declared with `const` in `teams.js` are script-level globals, **not** `window` properties. Check them with `typeof TEAMS !== "undefined"`, not `window.TEAMS`.
- Supabase auth: email + password, sessions persist. Don't `await` Supabase calls inside `onAuthStateChange`; defer with `setTimeout(…, 0)`.
- Build DOM with `textContent` for any user-supplied text (usernames). Don't interpolate it into `innerHTML`.
- Fonts: Barlow Condensed (display) and Barlow (body). Colors come from CSS variables; don't hard-code team colors outside `teams.js`.
- Cache busting: pages link shared files as `styles.css?v=YYYY-MM-DD` (also `teams.js`, `config.js`, `game.js`). Whenever any of those files change, bump the `?v=` date in **every** HTML page, or browsers may mix new pages with stale cached files.
- Accessibility: keep `aria-pressed`, labels, focus outlines, and the `prefers-reduced-motion` handling.

## Known gotchas

- The NHL feed (`api-web.nhle.com`) is undocumented and can change. Browsers can't call it directly (CORS), which is why the GitHub Action exists.
- New tables need explicit grants. `service_role` needs `select, insert, update` (and `delete` where the job deletes) or the Action fails with `42501 permission denied`.
- PostgREST returns at most 1000 rows by default. Use aggregate functions instead of pulling raw picks.
- Supabase's built-in email sender allows only a few emails per hour (confirmations + password resets).
- GitHub pauses scheduled workflows after 60 days without repository activity.

## Testing

There's no automated test suite. When changing pages, check them in a browser with real or stubbed Supabase data, including a phone-width viewport (~390px) and dark mode. Verify scoring changes against the examples table in `rules.html`. After editing `supabase/schema.sql`, re-read it for idempotency before telling the owner to run it in Supabase's SQL Editor.
