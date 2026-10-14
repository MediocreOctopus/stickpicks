"""The weekly stickpicks report (.github/workflows/weekly-report.yml): players, sign-ups, picks, the top of the board and
site visits for the last 7 days. Prints the report as Markdown; the workflow posts it as a GitHub issue, which emails it
to the repository owner.

The repository is public, so the report sticks to totals and the public leaderboard: no emails, no private data.

Needs SUPABASE_URL and SUPABASE_SECRET_KEY (the same secrets as the update job). Optional: GOATCOUNTER_TOKEN
(an API token from stickpicks.goatcounter.com → Settings → API) adds site visits. Standard library only.
Run it yourself:  SUPABASE_URL=... SUPABASE_SECRET_KEY=... python scripts/weekly_report.py
"""
import datetime as dt, json, os, re, sys, urllib.error, urllib.parse, urllib.request

URL = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
KEY = os.environ.get("SUPABASE_SECRET_KEY") or ""
GC_TOKEN = os.environ.get("GOATCOUNTER_TOKEN") or ""
GC_SITE = "https://stickpicks.goatcounter.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def season():
    m = re.search(r'SEASON\s*:\s*"(\d{8})"', open(os.path.join(ROOT, "config.js"), encoding="utf-8").read())
    return m.group(1) if m else "20262027"

def public_key():
    """The site's publishable key from config.js (safe to share), for what any visitor can see (the leaderboard)."""
    m = re.search(r"sb_publishable_[A-Za-z0-9_-]+", open(os.path.join(ROOT, "config.js"), encoding="utf-8").read())
    return m.group(0) if m else ""

def api(path, body, key=None):
    key = key or KEY
    headers = {"apikey": key, "Content-Type": "application/json"}
    if key.startswith("eyJ"): headers["Authorization"] = f"Bearer {key}"   # legacy JWT keys; sb_ keys go only in apikey
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method="POST", data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read() or "null")

problems = []
def safe(label, fn, *args):
    """One number for the report; "?" (and a note at the end) if it can't be read, so one problem doesn't sink the report."""
    try: return fn(*args)
    except (urllib.error.URLError, ValueError, KeyError) as e:
        problems.append(f"{label}: {e}"); return "?"

def goatcounter(start, end):
    if not GC_TOKEN: return None
    hour = lambda t: t.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")   # GoatCounter wants whole hours
    q = urllib.parse.urlencode({"start": hour(start), "end": hour(end)})
    out = {}
    for name, path in (("total", f"/api/v0/stats/total?{q}"), ("pages", f"/api/v0/stats/hits?{q}&limit=10"),
                       ("refs", f"/api/v0/stats/toprefs?{q}&limit=5")):
        try:
            req = urllib.request.Request(GC_SITE + path, headers={"Authorization": f"Bearer {GC_TOKEN}", "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as r: out[name] = json.loads(r.read())
        except (urllib.error.URLError, ValueError) as e:
            out[name] = {"error": str(e)}
    return out

def main():
    if not URL or not KEY: sys.exit("Missing SUPABASE_URL or SUPABASE_SECRET_KEY.")
    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(days=7)
    s = season()
    lines = [f"Week of {since:%b} {since.day} – {now:%b} {now.day}, {now.year} (the 7 days to {now:%H:%M} UTC).", ""]

    # totals from the database's weekly_report_stats() (schema.sql section 20): the secret key never reads picks directly
    stats = safe("player and pick totals", api, "rpc/weekly_report_stats", {"p_since": since.isoformat()})
    num = lambda k: stats.get(k, "?") if isinstance(stats, dict) else "?"
    players, new, active, picks = num("players"), num("new_players"), num("active_players"), num("picks")
    po_picks, bought, reminders = num("playoff_picks"), num("purchases"), num("reminder_devices")
    lines += ["## Players", "",
              "| | |", "|---|---|",
              f"| Players (with a username) | **{players}** |",
              f"| New this week | **{new}** |",
              f"| Made or changed a pick this week | **{active}** |",
              f"| Devices with puck-drop reminders on | {reminders} |", "",
              "## Picks", "",
              "| | |", "|---|---|",
              f"| Picks made or changed this week | **{picks}** |"]
    if po_picks not in (0, "?"): lines.append(f"| Playoff picks this week | **{po_picks}** |")
    lines += [f"| Shop purchases this week | {bought} |", ""]

    try:
        board = api("rpc/leaderboard", {"p_season": s, "p_team": None}, public_key())   # public, like the site
        board = sorted(board or [], key=lambda r: -int(r["points"]))[:5]
        if board:
            lines += ["## Top of the All-Teams board", "", "| # | Player | Sheet | Points |", "|---|---|---|---|"]
            rank, prev = 0, None
            for i, r in enumerate(board):
                if r["points"] != prev: rank, prev = i + 1, r["points"]
                lines.append(f"| {rank} | {r['username']} | {r['team']} | {r['points']} |")
            lines.append("")
    except urllib.error.URLError as e:
        lines += [f"_Couldn't read the leaderboard: {e}_", ""]

    gc = goatcounter(since, now)
    lines += ["## Site visits", ""]
    if gc is None:
        lines += ["_Add a GOATCOUNTER_TOKEN secret to include visits (stickpicks.goatcounter.com → Settings → API)._", ""]
    else:
        t = gc.get("total", {})
        if "error" in t: lines.append(f"_Couldn't read GoatCounter: {t['error']}_")
        else: lines.append(f"**{t.get('total', '?')}** page views this week.")
        pages = {}   # "/" and "/index.html" are the same page
        for h in gc.get("pages", {}).get("hits") or []:
            path = "/" if h.get("path") in ("/", "/index.html") else h.get("path")
            pages[path] = pages.get(path, 0) + (h.get("count") or 0)
        if pages:
            top = sorted(pages.items(), key=lambda kv: -kv[1])[:5]
            lines += ["", "Most visited:", ""] + [f"- {p}: {c}" for p, c in top]
        refs = gc.get("refs", {}).get("stats") or []
        if refs:
            lines += ["", "Where visitors came from:", ""] + [f"- {r.get('name') or '(direct)'}: {r.get('count')}" for r in refs[:5]]
        lines.append("")
    if problems: lines += ["_Some numbers couldn't be read (shown as ?):_", ""] + [f"- {p}" for p in problems] + [""]
    lines += ["---", "_Sent every Monday by the weekly-report workflow. Totals only; this repository is public._"]
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
