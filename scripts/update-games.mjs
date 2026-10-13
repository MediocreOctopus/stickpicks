// 1) Pulls every team's regular-season schedule for the current season from the
//    NHL's public feed and upserts one row per game into the Supabase `games`
//    table: dates, start times, reschedules, and final scores.
// 2) Pulls the latest NHL headlines from ESPN's public news feed into the
//    `news` table for the home page ticker (failures here never stop step 1).
// Node 18+, no dependencies. Safe to run repeatedly.
import { readFileSync } from "node:fs";

// The season comes from config.js, the one place it's set (e.g. "20262027").
export const SEASON = readFileSync(new URL("../config.js", import.meta.url), "utf8").match(/SEASON:\s*"(\d{8})"/)?.[1];
if (!SEASON) throw new Error('config.js needs a SEASON like "20262027".');
export const TEAMS = [
  "ANA","BOS","BUF","CGY","CAR","CHI","COL","CBJ","DAL","DET","EDM","FLA","LAK","MIN","MTL","NSH",
  "NJD","NYI","NYR","OTT","PHI","PIT","SJS","SEA","STL","TBL","TOR","UTA","VAN","VGK","WSH","WPG",
];

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How many overtime periods a final game went to (0 if it ended in regulation). Playoff games can go to double or
// triple overtime and beyond. The feed's periodDescriptor gives the last period's number (4 = first OT, 5 = second...)
// and, for multiple overtimes, otPeriods directly.
export function otPeriods(g) {
  const pd = g.periodDescriptor || {};
  const last = pd.periodType || g.gameOutcome?.lastPeriodType;
  if (last === "REG") return 0;
  if (Number.isInteger(pd.otPeriods) && pd.otPeriods > 0) return pd.otPeriods;
  if (Number.isInteger(g.gameOutcome?.otPeriods) && g.gameOutcome.otPeriods > 0) return g.gameOutcome.otPeriods;
  const reg = pd.maxRegulationPeriods || 3;
  if (last === "OT" && pd.number > reg) return pd.number - reg;
  return last === "OT" || last === "SO" ? 1 : 0;   // a shootout comes after one overtime
}

// Turn one team's feed into game rows. Games appear in both teams' feeds;
// the caller dedupes by game_id.
export function toGameRows(feed, season = SEASON) {
  const rows = [];
  for (const g of feed.games || []) {
    if (g.gameType !== 2 && g.gameType !== 3) continue; // regular season and playoffs (not preseason)
    const final = ["FINAL", "OFF"].includes(g.gameState);
    const ser = g.gameType === 3 ? g.seriesStatus || {} : {};
    rows.push({
      game_id: g.id,
      season,
      game_date: g.gameDate,
      start_utc: g.startTimeUTC || null,
      home: g.homeTeam?.abbrev,
      away: g.awayTeam?.abbrev,
      home_score: g.homeTeam?.score ?? null,
      away_score: g.awayTeam?.score ?? null,
      game_state: g.gameState || null,
      schedule_state: g.gameScheduleState || null,
      period_type: final ? g.gameOutcome?.lastPeriodType || "REG" : null,
      venue: g.venue?.default || null,
      neutral_site: typeof g.neutralSite === "boolean" ? g.neutralSite : null,
      game_type: g.gameType,
      ot_periods: final ? otPeriods(g) : null,
      // playoffs only: which round, which series (A–O) and which game of the series (Game 7 ...)
      playoff_round: Number.isInteger(ser.round) ? ser.round : null,
      series_letter: ser.seriesLetter || null,
      series_game: Number.isInteger(ser.gameNumberOfSeries) ? ser.gameNumberOfSeries : null,
      updated_at: new Date().toISOString(),
    });
  }
  return rows.filter((r) => r.game_id && r.home && r.away && r.game_date);
}

// The NHL's playoff bracket → playoff_series rows (one per series that has at least one team set).
// Letters: A–H first round, I–L second, M–N conference finals, O the Final. top = the higher seed.
export function toSeriesRows(bracket, season = SEASON) {
  return (bracket.series || [])
    .filter((s) => s.seriesLetter && (s.topSeedTeam?.abbrev || s.bottomSeedTeam?.abbrev))
    .map((s) => {
      const top = s.topSeedTeam || {}, bottom = s.bottomSeedTeam || {};
      const winner = s.winningTeamId == null ? null
        : s.winningTeamId === top.id ? top.abbrev : s.winningTeamId === bottom.id ? bottom.abbrev : null;
      return {
        season,
        letter: s.seriesLetter,
        round: s.playoffRound,
        top_team: top.abbrev || null,
        top_rank: Number.isInteger(s.topSeedRank) ? s.topSeedRank : null,
        top_rank_abbrev: s.topSeedRankAbbrev || null,
        top_wins: s.topSeedWins ?? 0,
        bottom_team: bottom.abbrev || null,
        bottom_rank: Number.isInteger(s.bottomSeedRank) ? s.bottomSeedRank : null,
        bottom_rank_abbrev: s.bottomSeedRankAbbrev || null,
        bottom_wins: s.bottomSeedWins ?? 0,
        winner,
        updated_at: new Date().toISOString(),
      };
    });
}

// Copies the bracket into playoff_series, then marks "if needed" games of finished series as not needed
// (the NHL drops them from its schedule, so they'd otherwise sit unplayed forever).
async function updateBracket() {
  const year = SEASON.slice(4); // 20262027 → the 2027 playoffs
  const res = await fetch(`https://api-web.nhle.com/v1/playoff-bracket/${year}`, { headers: { "User-Agent": "nhl-prediction-sheets" } });
  if (res.status === 404) return console.log("No playoff bracket yet.");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = toSeriesRows(await res.json());
  if (!rows.length) return console.log("No playoff matchups set yet.");
  await upsert(rows, "playoff_series", "season,letter");
  const decided = rows.filter((r) => r.winner).map((r) => r.letter);
  if (decided.length) {
    const q = `season=eq.${SEASON}&game_type=eq.3&period_type=is.null&series_letter=in.(${decided.join(",")})`;
    const done = await fetch(`${SUPABASE_URL}/rest/v1/games?${q}`, {
      method: "PATCH",
      headers: dbHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ schedule_state: "NOTNEEDED", updated_at: new Date().toISOString() }),
    });
    if (!done.ok) throw new Error(`Supabase returned ${done.status}: ${await done.text()}`);
  }
  console.log(`Saved ${rows.length} playoff series (${decided.length} decided).`);
}

async function fetchTeam(team) {
  const url = `https://api-web.nhle.com/v1/club-schedule-season/${team}/${SEASON}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nhl-prediction-sheets" } });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === 3) throw err;
    }
    await sleep(1000 * attempt);
  }
  throw new Error("no response");
}

function dbHeaders(extra = {}) {
  const headers = { apikey: SECRET, "Content-Type": "application/json", ...extra };
  // Legacy service_role keys are JWTs and also go in Authorization;
  // newer sb_secret_ keys go only in the apikey header.
  if (SECRET.startsWith("eyJ")) headers.Authorization = `Bearer ${SECRET}`;
  return headers;
}

async function upsert(rows, table = "games", key = "game_id") {
  const headers = dbHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" });
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${key}`, {
      method: "POST",
      headers,
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  if (!SUPABASE_URL || !SECRET) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY environment variable.");
  }
  // Tell the database which season it is (badge rewards use it)
  try {
    await upsert([{ key: "season", value: SEASON, updated_at: new Date().toISOString() }], "site_settings", "key");
  } catch (err) {
    console.warn(`Season setting not saved this run: ${err.message}`);
  }
  const games = new Map();
  const failed = [];
  for (const team of TEAMS) {
    try {
      for (const row of toGameRows(await fetchTeam(team))) games.set(row.game_id, row);
    } catch (err) {
      failed.push(`${team} (${err.message})`);
    }
    await sleep(250); // be polite to the NHL's servers
  }
  if (failed.length === TEAMS.length) throw new Error(`Every team request failed: ${failed.join(", ")}`);
  if (failed.length) console.warn(`Skipped this run: ${failed.join(", ")}`);

  const rows = [...games.values()];
  if (!rows.length) {
    console.log("The NHL feed returned no regular-season games. Nothing to update.");
    return;
  }
  await upsert(rows);
  const finals = rows.filter((r) => r.period_type).length;
  console.log(`Saved ${rows.length} games (${finals} final).`);

  // Playoffs: the bracket, March to July (matchups get set before any playoff game is scheduled) or whenever
  // playoff games are in the feed. A problem here never stops the rest.
  const month = new Date().getMonth() + 1;
  if (rows.some((r) => r.game_type === 3) || (month >= 3 && month <= 7)) {
    try {
      await updateBracket();
    } catch (err) {
      console.warn(`Playoff bracket not updated this run: ${err.message}`);
    }
  }

  try {
    await updateNews();
  } catch (err) {
    console.warn(`News not updated this run: ${err.message}`);
  }

  // Chiclets: pay badge rewards for badges earned with the new scores (the database checks each badge)
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/award_all_badge_chiclets`, { method: "POST", headers: dbHeaders(), body: "{}" });
    if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${await res.text()}`);
    console.log(`Badge rewards paid: ${await res.text()}`);
  } catch (err) {
    console.warn(`Badge rewards not paid this run: ${err.message}`);
  }
}

/* ───── News ticker ───── */
const NEWS_FEEDS = [
  "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=25",
  "https://site.web.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=25", // backup host
];

export function toNewsRows(feed) {
  return (feed.articles || [])
    .map((a) => ({
      id: String(a.id ?? a.links?.web?.href ?? ""),
      headline: (a.headline || "").trim(),
      url: a.links?.web?.href || "",
      source: "ESPN",
      published_at: a.published || null,
      fetched_at: new Date().toISOString(),
    }))
    .filter((r) => r.id && r.headline && /^https:\/\//.test(r.url));
}

async function updateNews() {
  let rows = [];
  for (const url of NEWS_FEEDS) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nhl-prediction-sheets" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      rows = toNewsRows(await res.json());
      if (rows.length) break;
    } catch (err) {
      console.warn(`News feed ${new URL(url).host} failed: ${err.message}`);
    }
  }
  if (!rows.length) throw new Error("no headlines returned");
  await upsert(rows, "news", "id");
  // keep the table small: drop headlines older than two weeks
  const cutoff = new Date(Date.now() - 14 * 864e5).toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/news?published_at=lt.${encodeURIComponent(cutoff)}`, {
    method: "DELETE",
    headers: dbHeaders({ Prefer: "return=minimal" }),
  });
  console.log(`Saved ${rows.length} headlines.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
