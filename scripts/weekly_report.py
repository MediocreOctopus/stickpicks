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

def api(path, method="GET", body=None, headers=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.headers, json.loads(r.read() or "null")

def count(table, filters=""):
    """Rows matching the filters, counted by the database (nothing is downloaded)."""
    h, _ = api(f"{table}?select=*&limit=1{filters}", headers={"Prefer": "count=exact", "Range": "0-0"})
    return int(h.get("Content-Range", "*/0").split("/")[-1] or 0)

def distinct(table, column, filters=""):
    """How many different values of a column match the filters (read a page at a time)."""
    seen, start = set(), 0
    while True:
        _, rows = api(f"{table}?select={column}{filters}", headers={"Range": f"{start}-{start + 999}"})
        seen.update(r[column] for r in rows)
        if len(rows) < 1000: return len(seen)
        start += 1000

problems = []
def safe(label, fn, *args):
    """One number for the report; "?" (and a note at the end) if it can't be read, so one problem doesn't sink the report."""
    try: return fn(*args)
    except (urllib.error.URLError, ValueError, KeyError) as e:
        problems.append(f"{label}: {e}"); return "?"

def goatcounter(start, end):
    if not GC_TOKEN: return None
    q = urllib.parse.urlencode({"start": start.isoformat(), "end": end.isoformat()})
    out = {}
    for name, path in (("total", f"/api/v0/stats/total?{q}"), ("pages", f"/api/v0/stats/hits?{q}&limit=5"),
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
    iso = urllib.parse.quote(since.isoformat())
    s = season()
    lines = [f"Week of {since:%b} {since.day} – {now:%b} {now.day}, {now.year} (the 7 days to {now:%H:%M} UTC).", ""]

    players = safe("players", count, "profiles")
    new = safe("new players", count, "profiles", f"&created_at=gte.{iso}")
    active = safe("active players", distinct, "team_picks", "user_id", f"&updated_at=gte.{iso}")
    picks = safe("picks", count, "team_picks", f"&updated_at=gte.{iso}")
    po_picks = safe("playoff picks", count, "playoff_picks", f"&updated_at=gte.{iso}")
    bought = safe("shop purchases", count, "chiclet_spends", f"&bought_at=gte.{iso}")
    reminders = safe("reminder devices", count, "push_subscriptions")
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
        _, board = api("rpc/leaderboard", "POST", {"p_season": s, "p_team": None})
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

    gc = goatcounter(since.date(), now.date())
    lines += ["## Site visits", ""]
    if gc is None:
        lines += ["_Add a GOATCOUNTER_TOKEN secret to include visits (stickpicks.goatcounter.com → Settings → API)._", ""]
    else:
        t = gc.get("total", {})
        if "error" in t: lines.append(f"_Couldn't read GoatCounter: {t['error']}_")
        else: lines.append(f"**{t.get('total', '?')}** page views this week.")
        hits = gc.get("pages", {}).get("hits") or []
        if hits:
            lines += ["", "Most visited:", ""] + [f"- {h.get('path')}: {h.get('count')}" for h in hits[:5]]
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
