"""stickpicks social posts, run by .github/workflows/social.yml (every hour on game days, and after each deploy).

Each run looks at three posts and makes any that are due and not yet made:
  1. Press Box: the newest pressbox.js entry, once it's live on stickpicks.hockey.
  2. "Last night": the finals recap, the morning after a night with 4+ games (9am to 3pm Eastern).
  3. Game night: today's slate, from 4 hours before the first puck drop until it drops.
At most one game-day post per run, so a recap and a slate never go out in the same minute.

Bluesky: posted automatically (picture + text + a link card-free link facet). Needs the repo secret BSKY_APP_PASSWORD
(Bluesky → Settings → Privacy and security → App passwords) and BSKY_HANDLE (default stickpicks.hockey).
Instagram: semi-automatic. Each Bluesky post also becomes a closed GitHub issue labelled "instagram" with the picture
and a ready-to-paste caption, which emails it to alerts@ (Gmail files it under the Instagram label).

Never posts twice: every post's link carries a hidden marker (?ref=bluesky&p=slate-2026-10-25) that the next run looks
for in the account's recent posts. A slate is also skipped if the owner already posted about tonight's games.

  python scripts/social.py            # do whatever is due (needs the secrets)
  python scripts/social.py --dry-run  # show what would be posted, and make the pictures, without posting
  python scripts/social.py --dry-run --now 2026-10-25T17:00   # pretend it's that time (UTC)
"""
import datetime, json, os, re, sys, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "marketing", "instagram"))
import build   # the picture builder (marketing/instagram/build.py)

SITE = "https://stickpicks.hockey/"
HANDLE = os.environ.get("BSKY_HANDLE") or "stickpicks.hockey"
PDS = "https://bsky.social"
UA = {"User-Agent": "stickpicks-social (https://stickpicks.hockey)"}
DRY = "--dry-run" in sys.argv
TAGS = "#NHL #hockey #icehockey #hockeyfans #pickem"

def get(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=30) as r:
        return json.load(r)

def post_json(url, body, headers=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={**UA, "Content-Type": ctype, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"{url} said {e.code}: {e.read().decode()[:400]}")

# ── times ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def now_utc():
    if "--now" in sys.argv:
        return datetime.datetime.fromisoformat(sys.argv[sys.argv.index("--now") + 1]).replace(tzinfo=None)
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
utc = lambda iso: datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).replace(tzinfo=None)
et_clock = lambda d: build.eastern(d).strftime("%I:%M").lstrip("0").replace(":00", "")

# ── the NHL feed ──────────────────────────────────────────────────────────────────────────────────────────────────
def schedule(day): return get(f"https://api-web.nhle.com/v1/schedule/{day}")["gameWeek"][0]["games"]
def scores(day): return get(f"https://api-web.nhle.com/v1/score/{day}")["games"]
nick = lambda t: t.get("commonName", {}).get("default") or t["abbrev"]
NICK_SHORT = {"Maple Leafs": "Leafs", "Golden Knights": "Knights", "Blue Jackets": "Jackets", "Red Wings": "Wings",
              "Hurricanes": "Canes", "Canadiens": "Habs", "Islanders": "Isles", "Blackhawks": "Hawks", "Senators": "Sens",
              "Penguins": "Pens", "Predators": "Preds", "Avalanche": "Avs", "Capitals": "Caps"}
short = lambda t: NICK_SHORT.get(nick(t), nick(t))

# ── Bluesky ───────────────────────────────────────────────────────────────────────────────────────────────────────
def recent_posts():
    """The account's own recent posts (not reposts): [(created_utc, text, [link uris])]"""
    feed = get("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?" + urllib.parse.urlencode({"actor": HANDLE, "limit": 40}))
    out = []
    for it in feed.get("feed", []):
        if it.get("reason"): continue
        rec = it["post"]["record"]
        uris = [f.get("uri", "") for fa in rec.get("facets", []) for f in fa.get("features", [])]
        ext = (it["post"].get("embed") or {}).get("external") or {}
        if ext.get("uri"): uris.append(ext["uri"])
        out.append((utc(rec["createdAt"]), rec.get("text", ""), uris))
    return out

def already(marker, posts):
    return any(marker in u for _, _, uris in posts for u in uris)

def with_link(text, display, uri):
    """Text plus a link facet on the last occurrence of `display` (Bluesky counts UTF-8 bytes)."""
    i = text.rindex(display)
    start = len(text[:i].encode()); end = start + len(display.encode())
    return {"text": text, "facets": [{"index": {"byteStart": start, "byteEnd": end},
                                      "features": [{"$type": "app.bsky.richtext.facet#link", "uri": uri}]}]}

def bluesky_post(text, display, uri, png, alt):
    if len(text) > 300: sys.exit(f"post is {len(text)} characters (Bluesky's limit is 300):\n{text}")
    if DRY:
        print(f"\n── would post to Bluesky ({len(text)}/300) ──\n{text}\n   link: {display} → {uri}\n   picture: {os.path.relpath(png, ROOT)}")
        return None
    pw = os.environ.get("BSKY_APP_PASSWORD")
    if not pw: sys.exit("BSKY_APP_PASSWORD isn't set (repo secret)")
    s = post_json(f"{PDS}/xrpc/com.atproto.server.createSession", {"identifier": HANDLE, "password": pw})
    auth = {"Authorization": f"Bearer {s['accessJwt']}"}
    blob = post_json(f"{PDS}/xrpc/com.atproto.repo.uploadBlob", None, auth, raw=open(png, "rb").read(), ctype="image/png")["blob"]
    rec = {"$type": "app.bsky.feed.post", "createdAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
           "langs": ["en"], **with_link(text, display, uri),
           "embed": {"$type": "app.bsky.embed.images", "images": [{"alt": alt, "image": blob, "aspectRatio": {"width": 1080, "height": 1440}}]}}
    r = post_json(f"{PDS}/xrpc/com.atproto.repo.createRecord", {"repo": s["did"], "collection": "app.bsky.feed.post", "record": rec}, auth)
    rkey = r["uri"].rsplit("/", 1)[-1]
    img = f"https://cdn.bsky.app/img/feed_fullsize/plain/{s['did']}/{blob['ref']['$link']}@jpeg"
    print(f"posted: https://bsky.app/profile/{HANDLE}/post/{rkey}")
    return {"url": f"https://bsky.app/profile/{HANDLE}/post/{rkey}", "image": img}

# ── Instagram (semi-automatic): a closed issue with the picture and caption, which emails it ──────────────────────
def instagram_handoff(title, caption, posted, png):
    body = (f"**Instagram post, ready to go.** Save the picture (press and hold it), then post it on Instagram with this caption.\n\n"
            f"![picture]({posted['image']})\n\n**Caption** (press and hold to copy):\n\n{caption}\n\n"
            f"---\nAlso on Bluesky: {posted['url']}\n"
            f"Full-size picture: `{os.path.relpath(png, ROOT)}` (made by scripts/social.py)") if posted else ""
    if DRY:
        print(f"── would email for Instagram: 📸 {title} ──\n{caption}")
        return
    tok, repo = os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY")
    if not (tok and repo): return print("(no GITHUB_TOKEN: skipped the Instagram email)")
    h = {"Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json"}
    try: post_json(f"https://api.github.com/repos/{repo}/labels", {"name": "instagram", "color": "D62976", "description": "Instagram posts to make (sent by social.yml)"}, h)
    except SystemExit: pass   # the label already exists
    issue = post_json(f"https://api.github.com/repos/{repo}/issues", {"title": f"📸 Instagram: {title}", "body": body, "labels": ["instagram"]}, h)
    req = urllib.request.Request(issue["url"], data=json.dumps({"state": "closed"}).encode(), method="PATCH", headers={**UA, **h, "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()
    print("emailed for Instagram:", issue["html_url"])

def link(marker, path=""):
    return f"{SITE}{path}?ref=bluesky&p={marker}"

# ── 1. Press Box ──────────────────────────────────────────────────────────────────────────────────────────────────
def pressbox_due(posts):
    src = open(os.path.join(ROOT, "pressbox.js"), encoding="utf-8").read()
    m = re.search(r'\n  \{\n    version: "([^"]+)",.*?intro: "((?:[^"\\]|\\.)*)",\n    items: \[\n(.*?)\n    \],', src, re.S)
    if not m: return None
    v, intro, block = m.group(1), m.group(2), m.group(3)
    items = re.findall(r'\["(\w+)", "((?:[^"\\]|\\.)*)"\]', block)
    if already(f"#v{v}", posts) or any(f"{v} is live" in t for _, t, _ in posts): return None
    try:   # only once it's actually live
        with urllib.request.urlopen(urllib.request.Request(f"{SITE}pressbox.js?social={v}", headers=UA), timeout=30) as r:
            if f'version: "{v}"' not in r.read().decode(): return None
    except Exception: return None
    return v, intro, [(t, x.replace('\\"', '"')) for t, x in items]

def post_pressbox(v, intro, items):
    lines = [x for t, x in items if t == "new"] or [x for _, x in items]
    lead = intro or lines[0]
    more = len(items) - (0 if intro else 1)
    tail = f"\n\n{'Plus ' + str(more) + ' more changes. ' if more > 0 else ''}Every change in Press Box: stickpicks.hockey/pressbox"
    head = f"stickpicks {v} is live 🏒\n\n"
    room = 300 - len(head) - len(tail)
    if len(lead) > room: lead = lead[:room - 1].rsplit(" ", 1)[0] + "…"
    text = head + lead + tail
    build.pressbox(v)
    png = os.path.join(build.OUT, f"pressbox-{v.replace('.', '-')}.png")
    posted = bluesky_post(text, "stickpicks.hockey/pressbox", f"{SITE}pressbox.html?ref=bluesky&p=pressbox-{v}#v{v}", png,
                          f"stickpicks Press Box, update {v}: " + "; ".join(x for _, x in items[:6]))
    instagram_handoff(f"Press Box {v}", f"stickpicks {v} 🏒 {lead}\n\nEvery change is in Press Box: link in bio.\n\n#NHL #hockey #hockeyfans", posted, png)

# ── 2. Last night ─────────────────────────────────────────────────────────────────────────────────────────────────
def post_recap(day, games):
    done = sorted(games, key=lambda g: -(g["awayTeam"]["score"] + g["homeTeam"]["score"]))
    def line(g):
        a, h = g["awayTeam"], g["homeTeam"]
        w, l = (a, h) if a["score"] > h["score"] else (h, a)
        return f"{short(w)} {w['score']}, {short(l)} {l['score']}"
    ots = [g for g in games if (g.get("gameOutcome") or {}).get("lastPeriodType", "REG") != "REG"]
    shut = [g for g in games if min(g["awayTeam"]["score"], g["homeTeam"]["score"]) == 0]
    top = [line(g) for g in done[:3]]
    bits = []
    if len(ots) >= 2:
        winners = [short(g["awayTeam"] if g["awayTeam"]["score"] > g["homeTeam"]["score"] else g["homeTeam"]) for g in ots]
        bits.append(f"{len(ots)} went past regulation ({', '.join(winners)}). That's {len(ots)} OTL calls that paid off.")
    elif shut:
        g = shut[0]; w = g["awayTeam"] if g["awayTeam"]["score"] else g["homeTeam"]; l = g["homeTeam"] if w is g["awayTeam"] else g["awayTeam"]
        bits.append(f"And a shutout: {short(w)} blanked the {short(l)} {w['score']}–0.")
    today = schedule((datetime.date.fromisoformat(day) + datetime.timedelta(days=1)).isoformat())
    wd = datetime.date.fromisoformat(day).strftime("%A")
    nxt = f"{len(today)} game{'s' if len(today) != 1 else ''} today: stickpicks.hockey" if today else "Next picks are open: stickpicks.hockey"
    text = f"{wd} finals 🏒 {'. '.join(top)}.\n\n" + (bits[0] + "\n\n" if bits else "") + nxt
    while len(text) > 300 and len(top) > 1:
        top.pop(); text = f"{wd} finals 🏒 {'. '.join(top)}.\n\n" + (bits[0] + "\n\n" if bits else "") + nxt
    build.results(day)
    png = os.path.join(build.OUT, f"07-results-{day}.png")
    alt = f"Final scores from {wd}: " + "; ".join(line(g) + (" (OT)" if g in ots else "") for g in games)
    posted = bluesky_post(text, "stickpicks.hockey", link(f"recap-{day}"), png, alt)
    cap = (f"{wd}'s finals 🏒 {'. '.join(top)}." + (f"\n\n{bits[0]}" if bits else "") +
           "\n\nOn stickpicks, an overtime or shootout loss is an OTL, and calling it right is worth a point. Tonight's picks are open. Link in bio."
           f"\n\n{TAGS}")
    instagram_handoff(f"last night ({day})", cap, posted, png)

# ── 3. Game night ─────────────────────────────────────────────────────────────────────────────────────────────────
def post_slate(day, games):
    n = len(games); first = min(utc(g["startTimeUTC"]) for g in games)
    pick = [games[0], games[len(games) // 2], games[-1]] if n >= 3 else games
    seen, feats = set(), []
    for g in pick:
        if g["id"] in seen: continue
        seen.add(g["id"]); feats.append(f"{short(g['awayTeam'])} at {short(g['homeTeam'])}")
    if n == 1:
        g = games[0]
        text = f"One game tonight 🏒 {short(g['awayTeam'])} at {short(g['homeTeam'])}, {et_clock(first)} ET.\n\nCall the result and the total goals before puck drop.\n\nstickpicks.hockey"
    else:
        more = "…" if n > len(feats) else ""
        text = (f"{n} games tonight 🏒 {', '.join(feats)}{more}\n\nCall the result and the total goals before puck drop. "
                f"First one starts at {et_clock(first)} ET.\n\nstickpicks.hockey")
    build.gamenight(day)
    png = os.path.join(build.OUT, f"03-gamenight-{day}.png")
    alt = f"Tonight's {n} NHL game{'s' if n != 1 else ''}: " + "; ".join(f"{nick(g['awayTeam'])} at {nick(g['homeTeam'])}, {et_clock(utc(g['startTimeUTC']))} ET" for g in games)
    posted = bluesky_post(text, "stickpicks.hockey", link(f"slate-{day}"), png, alt)
    cap = (f"{n} game{'s' if n != 1 else ''} tonight 🏒 {', '.join(feats)}{'…' if n > len(feats) else ''}\n\n"
           f"Who are you taking? Call the result and the total goals before puck drop. Link in bio.\n\n{TAGS}")
    instagram_handoff(f"game night ({day})", cap, posted, png)

# ── run ───────────────────────────────────────────────────────────────────────────────────────────────────────────
def main():
    if not build.EDGE: sys.exit("no browser to render the pictures (Chrome or Edge)")
    now = now_utc(); et = build.eastern(now); today = et.date(); yday = today - datetime.timedelta(days=1)
    posts = recent_posts()
    print(f"{now:%Y-%m-%d %H:%M} UTC = {et:%a %b %d %I:%M %p} Eastern · {len(posts)} recent posts checked")

    pb = pressbox_due(posts)
    if pb: post_pressbox(*pb)
    else: print("Press Box: nothing new to post")

    # one game-day post per run
    hand = [(t, txt) for t, txt, uris in posts if not any("&p=" in u for u in uris)]   # posted by hand, not by this script
    hand_recap = any(build.eastern(t).date() == today and re.search(r"last night|yesterday|finals", txt, re.I) for t, txt in hand)
    if hand_recap: print("recap: the owner already posted last night's finals")
    if 9 <= et.hour < 15 and not hand_recap and not already(f"recap-{yday}", posts):
        finals = [g for g in scores(yday.isoformat()) if g.get("gameState") in ("OFF", "FINAL")]
        if len(finals) >= 4:
            return post_recap(yday.isoformat(), finals)
        print(f"recap: {len(finals)} finals yesterday, not posting")
    games = [g for g in schedule(today.isoformat()) if g.get("gameScheduleState", "OK") == "OK"]
    if not games: return print("slate: no games today")
    first = min(utc(g["startTimeUTC"]) for g in games)
    if already(f"slate-{today}", posts): return print("slate: already posted")
    if any(build.eastern(t).date() == today and re.search(r"tonight|games? today|\d+-game", txt, re.I) for t, txt in hand):
        return print("slate: the owner already posted about tonight's games")
    if not (first - datetime.timedelta(hours=4) <= now < first - datetime.timedelta(minutes=10)):
        return print(f"slate: not in the window (first puck drop {et_clock(first)} ET)")
    post_slate(today.isoformat(), games)

if __name__ == "__main__":
    main()
