// Puck-drop reminders: runs after the 15-minute game sync.
// Finds games starting within the next 75 minutes on sheets that players have started but
// haven't fully picked (result and goals), and sends each player one push notification
// to every device where they turned reminders on. Each game is announced once per player and sheet.
// Needs the `web-push` package (the workflow installs it) and the VAPID_PRIVATE_KEY secret.

import webpush from "web-push";

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SECRET = process.env.SUPABASE_SECRET_KEY || "";
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SITE_URL = process.env.SITE_URL || "https://stickpicks.hockey/";
const WINDOW_MINUTES = 75;

const NAMES = {
  ANA:"Ducks", BOS:"Bruins", BUF:"Sabres", CGY:"Flames", CAR:"Hurricanes", CHI:"Blackhawks", COL:"Avalanche",
  CBJ:"Blue Jackets", DAL:"Stars", DET:"Red Wings", EDM:"Oilers", FLA:"Panthers", LAK:"Kings", MIN:"Wild",
  MTL:"Canadiens", NSH:"Predators", NJD:"Devils", NYI:"Islanders", NYR:"Rangers", OTT:"Senators", PHI:"Flyers",
  PIT:"Penguins", SJS:"Sharks", SEA:"Kraken", STL:"Blues", TBL:"Lightning", TOR:"Maple Leafs", UTA:"Mammoth",
  VAN:"Canucks", VGK:"Golden Knights", WSH:"Capitals", WPG:"Jets",
};
const nick = (code) => NAMES[code] || code;

function headers(extra = {}) {
  return { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json", ...extra };
}
async function db(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: headers(opts.headers) });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: HTTP ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

function message(rows) {
  const first = rows[0];
  const mins = Math.max(1, Math.round((new Date(first.start_utc) - Date.now()) / 60000));
  const game = (r) => `${nick(r.team)} ${r.home === r.team ? "vs" : "at"} ${nick(r.home === r.team ? r.away : r.home)}`;
  if (rows.length === 1) {
    return { title: "Puck drop soon", body: `${game(first)} starts in ${mins} min. Your pick isn't in yet.` };
  }
  return {
    title: `${rows.length} games to pick`,
    body: `${game(first)} starts in ${mins} min, plus ${rows.length - 1} more on your sheets. Picks lock at puck drop.`,
  };
}

async function main() {
  if (!SUPABASE_URL || !SECRET) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) { console.log("Reminders are off: add the VAPID_PRIVATE_KEY secret to turn them on."); return; }
  webpush.setVapidDetails(SITE_URL, VAPID_PUBLIC, VAPID_PRIVATE);

  const due = await db("rpc/push_reminders_due", { method: "POST", body: JSON.stringify({ p_minutes: WINDOW_MINUTES }) });
  if (!due?.length) { console.log("No reminders due."); return; }

  const byUser = new Map();
  for (const r of due) { if (!byUser.has(r.user_id)) byUser.set(r.user_id, []); byUser.get(r.user_id).push(r); }
  const ids = [...byUser.keys()];
  const subs = await db(`push_subscriptions?select=endpoint,user_id,p256dh,auth&user_id=in.(${ids.join(",")})`);

  let sent = 0, gone = 0;
  for (const [userId, rows] of byUser) {
    const { title, body } = message(rows);
    const payload = JSON.stringify({ title, body, url: "index.html#upnext", tag: `puckdrop-${rows[0].game_id}` });
    for (const s of subs.filter((x) => x.user_id === userId)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {   // the device turned notifications off or uninstalled
          await db(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
          gone++;
        } else console.warn(`Push failed (${err.statusCode || err.message})`);
      }
    }
    // Mark these games as announced, whatever happened, so nobody gets repeats every 15 minutes.
    await db("push_reminders_sent?on_conflict=user_id,game_id,team", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows.map((r) => ({ user_id: r.user_id, game_id: r.game_id, team: r.team }))),
    });
  }
  console.log(`Sent ${sent} reminder${sent === 1 ? "" : "s"} to ${byUser.size} player${byUser.size === 1 ? "" : "s"}${gone ? `; removed ${gone} expired device${gone === 1 ? "" : "s"}` : ""}.`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
