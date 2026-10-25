"""Builds the stickpicks Instagram pictures (marketing only; never deployed).

    python marketing/instagram/build.py                        # every starter-kit picture
    python marketing/instagram/build.py gamenight 2026-10-22   # a game-night picture for that date (real NHL schedule)
    python marketing/instagram/build.py results 2026-10-24     # final scores for that date (the morning-after post)
    python marketing/instagram/build.py pressbox 26.2          # a Press Box picture for that update (from pressbox.js)

Each picture is an HTML page rendered to PNG with headless Microsoft Edge at Instagram's sizes:
posts 1080x1440 (3:4, Instagram's grid shape), Stories and Reel covers 1080x1920.

Look ("road sweater"): navy knit background, red-and-cream sleeve stripes across the top, hem stripes at the bottom,
the logo in cream, cream felt-patch cards with stitched edges, gold accents, the site's own badge art and team colours.
Team names in words and team colours only: never NHL or team logos (trademark note in CLAUDE.md).
"""
import datetime, html as _html, json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "png")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
UA = {"User-Agent": "Mozilla/5.0 (stickpicks marketing)"}

LOGO = open(os.path.join(REPO, "logo.svg"), encoding="utf-8").read().strip().replace('class="logo-svg"', 'class="logo"')
KNIT = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='14'%3E%3Cpath "
        "d='M0 0 L9 10.5 L18 0' fill='none' stroke='%23EFE6D2' stroke-opacity='.055' stroke-width='3.4'/%3E%3C/svg%3E\")")
TEAMS = {c: dict(name=n, board=b, accent=a) for c, n, b, a in re.findall(
    r'^  ([A-Z]{3}):\{name:"([^"]+)",.*?board:"(#[0-9A-Fa-f]{6})", accent:"(#[0-9A-Fa-f]{6})"',
    open(os.path.join(REPO, "teams.js"), encoding="utf-8").read(), re.M)}

CSS = """
:root{--logo-ink:#EFE6D2;--logo-bg:#1C2B45;--logo-wood:#C8914F;--logo-grain:#7A4E22;--logo-tape:#E8463F;--logo-wrap:#EFE6D2;--logo-puck-rim:#EFE6D2;
  --navy:#1C2B45;--navy2:#14203A;--red:#9B1C1F;--red2:#E8463F;--cream:#EFE6D2;--paper:#F7F1E3;--ink:#17233A;--muted:#5D6473;--gold:#D9A33A;
  --win:#0E7C66;--winbg:#D5F0E8;--loss:#B3122C;--lossbg:#FBDDE2;--otl:#9A6A00;--otlbg:#FBEFCF}
*{box-sizing:border-box}
html,body{margin:0;width:%(w)dpx;height:%(h)dpx;overflow:hidden}
body{position:relative;color:var(--cream);font-family:Barlow,sans-serif;
  background:%(knit)s,radial-gradient(ellipse at 50%% 30%%,#24375A 0%%,#1C2B45 55%%,#14203A 100%%)}
/* sleeve stripes across the top, hem stripes at the bottom */
.top{position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(to bottom,var(--navy2) 0 30px,
  var(--red2) 30px 58px,var(--cream) 58px 70px,var(--red2) 70px 98px,transparent 98px)}
.bot{position:absolute;left:0;right:0;bottom:0;height:96px;background:linear-gradient(to bottom,transparent 0 6px,
  var(--cream) 6px 18px,var(--red2) 18px 50px,var(--cream) 50px 62px,var(--navy2) 62px)}
.page{position:absolute;left:80px;right:80px;top:150px;bottom:140px;display:flex;flex-direction:column}
.logo{width:100%%;height:auto;overflow:visible;filter:drop-shadow(0 6px 0 rgba(0,0,0,.25))}
.kicker{font:700 30px Oswald,sans-serif;letter-spacing:10px;text-transform:uppercase;color:var(--gold)}
h1{font:700 104px/.98 Oswald,sans-serif;text-transform:uppercase;letter-spacing:1px;margin:12px 0 0;color:var(--cream);
  text-shadow:0 5px 0 rgba(0,0,0,.28)}
h1 em{font-style:normal;color:var(--red2)}
.script{font:120px/1 Yellowtail,cursive;color:var(--gold);text-shadow:0 5px 0 rgba(0,0,0,.28)}
.lede{font:italic 40px/1.35 "Libre Caslon Text",Georgia,serif;margin:24px 0 0;color:#DCD3BF}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font:700 30px Oswald,sans-serif;letter-spacing:6px;text-transform:uppercase;color:var(--cream)}
.foot b{color:var(--navy);background:var(--gold);padding:12px 22px 11px;border-radius:8px;outline:2px dashed rgba(28,43,69,.45);outline-offset:-6px}
/* felt patches: cream cards with a stitched edge */
.card{background:var(--paper);color:var(--ink);border-radius:22px;padding:36px 42px;position:relative;
  box-shadow:0 10px 0 rgba(0,0,0,.25);outline:3px dashed rgba(28,43,69,.28);outline-offset:-14px}
.patches{display:flex;gap:14px;flex-wrap:wrap}
.patches span{background:var(--red2);color:var(--cream);font:600 27px/1 Oswald,sans-serif;letter-spacing:4px;text-transform:uppercase;
  padding:17px 22px 16px;border-radius:9px;outline:2px dashed rgba(239,230,210,.85);outline-offset:-7px;box-shadow:0 5px 0 rgba(0,0,0,.25)}
.pill{display:inline-block;min-width:150px;text-align:center;font:700 56px/1 Oswald,sans-serif;padding:16px 18px;border-radius:12px;border:4px solid}
.pill.w{color:var(--win);background:var(--winbg)} .pill.l{color:var(--loss);background:var(--lossbg)} .pill.otl{color:var(--otl);background:var(--otlbg)}
.tag{display:inline-block;flex:none;width:190px;text-align:center;font:700 24px/1 Oswald,sans-serif;letter-spacing:4px;text-transform:uppercase;padding:10px 0;border-radius:8px;border:3px solid}
.tag.new{color:var(--win);background:var(--winbg)} .tag.improved{color:var(--otl);background:var(--otlbg)} .tag.fixed{color:var(--muted);background:#EEE8DA}
.ver{display:inline-block;background:var(--red2);color:var(--cream);font:700 78px/1 Oswald,sans-serif;padding:22px 26px;border-radius:14px;
  outline:3px dashed rgba(239,230,210,.8);outline-offset:-11px;box-shadow:0 8px 0 rgba(0,0,0,.25)}
.num{display:grid;place-items:center;flex:none;width:96px;height:96px;border-radius:50%%;background:var(--navy);color:var(--cream);
  font:700 54px/1 Oswald,sans-serif;box-shadow:0 0 0 6px var(--paper),0 0 0 10px var(--gold)}
.step{display:flex;gap:30px;align-items:center}
.step h3{margin:0;font:700 44px/1.05 Oswald,sans-serif;text-transform:uppercase;color:var(--navy)}
.step p{margin:6px 0 0;font:italic 32px/1.3 "Libre Caslon Text",serif;color:var(--muted)}
.stripe{position:absolute;top:98px;bottom:200px;width:120px;right:-40px;transform:skewX(-14deg);
  background:linear-gradient(to right,var(--red2) 0 34px,var(--cream) 34px 44px,var(--red2) 44px 78px,transparent 78px);opacity:.9}
"""

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700'
         '&family=Barlow:wght@500;600;700&family=Libre+Caslon+Text:ital@1&family=Yellowtail&display=block">')

def page(body, w=1080, h=1440, extra=""):
    return (f'<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>' + CSS % {"w": w, "h": h, "knit": KNIT}
            + extra + f'</style></head><body><div class="top"></div>{body}<div class="bot"></div></body></html>')

def edge(args, timeout=60):
    profile = os.path.join(os.environ.get("TEMP", OUT), f"stickpicks-edge-render-{os.getpid()}")   # a fresh profile each run, so a stuck or open Edge can't hold it up
    try:
        return subprocess.run([EDGE, "--headless", "--disable-gpu", f"--user-data-dir={profile}", "--no-first-run"] + args,
                              capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return None

def render(name, html, w=1080, h=1440):
    os.makedirs(OUT, exist_ok=True)
    src = os.path.join(OUT, f"_{name}.html")
    open(src, "w", encoding="utf-8").write(html)
    png = os.path.join(OUT, f"{name}.png")
    if os.path.exists(png): os.remove(png)   # so the wait below only sees the new one
    edge(["--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=8000",
          f"--window-size={w},{h}", f"--screenshot={png}", "file:///" + src.replace("\\", "/")])
    # Edge 156+ hands the work to a background process and returns at once: wait for the picture to be written
    import time
    for _ in range(60):
        if os.path.exists(png) and os.path.getsize(png) > 0:
            size = os.path.getsize(png); time.sleep(0.6)
            if os.path.getsize(png) == size: break
        time.sleep(0.5)
    os.remove(src)
    print("made" if os.path.exists(png) else "FAILED", os.path.relpath(png, REPO))

def site_art(badge_ids):
    """Placeholders for the site's own badge and Chiclet drawings; ART_JS (put in the page) fills them in with badgeEl() and
    chicletIcon() from teams.js, so the pictures always match the site."""
    return {"badges": {i: f'<span class="art-badge" data-id="{i}"></span>' for i in badge_ids},
            "chiclet": '<span class="art-chiclet"></span>'}

def _file_url(f): return "file:///" + os.path.join(REPO, f).replace("\\", "/")
ART_JS = (f'<script src="{_file_url("config.js")}"></script><script src="{_file_url("teams.js")}"></script>'
          '<script>document.querySelectorAll(".art-badge").forEach(e=>e.replaceWith(badgeEl(e.dataset.id,180)));'
          'document.querySelectorAll(".art-chiclet").forEach(e=>e.replaceWith(chicletIcon(52)));'
          # teams.js also adds the site's tab bar and other page parts: keep only the picture's own pieces
          'const keep=()=>[...document.body.children].forEach(c=>{ if(!c.matches(".top,.bot,.page,.stripe,script")) c.remove(); });'
          'keep(); document.addEventListener("DOMContentLoaded",()=>setTimeout(keep,0)); addEventListener("load",keep);</script>')

def schedule(date):
    with urllib.request.urlopen(urllib.request.Request(f"https://api-web.nhle.com/v1/schedule/{date}", headers=UA)) as r:
        return json.load(r)["gameWeek"][0]["games"]

def _lum(hx):
    c = [int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= .03928 else ((x + .055) / 1.055) ** 2.4 for x in c]
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]

def _contrast(a, b):
    x, y = sorted([_lum(a), _lum(b)], reverse=True)
    return (x + .05) / (y + .05)

def chip(code):
    """A team chip in its colours; the text falls back to white or black when the team's own pair is hard to read."""
    t = TEAMS.get(code, dict(board="#1C2B45", accent="#EFE6D2"))
    ink = next(c for c in (t["accent"], "#FFFFFF", "#111111") if _contrast(c, t["board"]) >= 3.6 or c == "#111111")
    return f'<span class="chip" style="background:{t["board"]};color:{ink}">{code}</span>'

# ---- the pictures ----------------------------------------------------------------------------------------------

def intro():
    render("01-intro-1", page(f"""<div class="page">
      <div style="margin:10px 30px 0">{LOGO}</div>
      <h1 style="margin-top:90px">Pick the game.<br>Pick the goals.<br><em>Climb the board.</em></h1>
      <p class="lede">A free NHL pick'em where every team has its own leaderboard.</p>
      <div class="foot"><div class="patches"><span>No money</span><span>No betting</span><span>No ads</span></div><span>Swipe →</span></div>
    </div>"""))
    render("01-intro-2", page("""<div class="page">
      <div class="kicker">How it works</div>
      <h1>Three <em>steps</em></h1>
      <div class="card" style="margin-top:40px;display:grid;gap:40px;padding:44px 46px">
        <div class="step"><span class="num">1</span><div><h3>Pick a team</h3><p>Any of the 32. Play as many as you like.</p></div></div>
        <div class="step"><span class="num">2</span><div><h3>Call each game</h3>
          <div style="display:flex;gap:16px;margin:14px 0 0"><span class="pill w">W</span><span class="pill l">L</span><span class="pill otl">OTL</span></div>
          <p>plus the combined goals.</p></div></div>
        <div class="step"><span class="num">3</span><div><h3>Score points</h3><p><b style="color:var(--red2)">+1</b> right result, <b style="color:var(--red2)">+1</b> exact goals.</p></div></div>
      </div>
      <div class="foot"><span>Picks lock at puck drop</span><span>Swipe →</span></div>
    </div>"""))
    art = site_art(["hattrick", "shutout", "overtime", "mvp"])
    badges = "".join(f'<div class="bd">{art["badges"][i]}<span>{n}</span></div>'
                     for i, n in [("hattrick", "Hat Trick"), ("shutout", "Shutout"), ("overtime", "Overtime Hero"), ("mvp", "MVP")])
    render("01-intro-3", page(f"""<div class="page">
      <div class="kicker">Beyond the leaderboard</div>
      <h1>Earn Chiclets. <em>Collect badges.</em></h1>
      <div class="card ch">
        <div class="chh">{art["chiclet"]}<b>Chiclets</b><span>free points for good picks</span></div>
        <div class="earn"><span><b>+1</b> right result</span><span><b>+2</b> exact goals</span><span><b>+5</b> perfect night</span><span><b>+5 to +25</b> for badges</span></div>
      </div>
      <div class="bds">{badges}</div>
      <p class="lede shop">Spend them on profile borders, throwback sweaters and gear for a Breakaway skater.</p>
      <div class="foot"><span>Never sold for real money</span><b>Link in bio</b></div>
    </div>""" + ART_JS, extra="""
      .ch{margin-top:34px;padding:30px 40px}
      .chh{display:flex;align-items:center;gap:16px} .chh .chiclet-ico{width:64px;height:64px;display:grid;place-items:center}
      .chh .chiclet-ico svg{width:52px;height:58px;transform:rotate(45deg)}
      .chh b{font:700 58px/1 Oswald,sans-serif;text-transform:uppercase;color:var(--navy)}
      .chh span{font:italic 30px 'Libre Caslon Text',serif;color:var(--muted)}
      .earn{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-top:20px;font:500 32px/1.2 Barlow,sans-serif}
      .earn b{font:700 36px Oswald,sans-serif;color:var(--red2);margin-right:6px}
      .bds{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:40px;text-align:center}
      .bd .badge{display:block;margin:0 auto;width:178px;height:178px;filter:drop-shadow(0 7px 0 rgba(0,0,0,.3))} .bd svg{width:100%;height:100%;display:block}
      .bd span{display:block;margin-top:14px;font:700 24px Oswald,sans-serif;letter-spacing:2px;text-transform:uppercase;color:var(--cream)}
      .shop{margin-top:30px}"""))

def pressbox(version, name=None, lines=None):
    """A Press Box picture for any entry, read straight from pressbox.js (up to 6 lines)."""
    src = open(os.path.join(REPO, "pressbox.js"), encoding="utf-8").read()
    STR = r'"((?:[^"\\]|\\.)*)"'
    for b in re.split(r"\n  \{\n", src)[1:]:
        f = lambda k: (re.search(r"^    " + k + r": " + STR + ",", b, re.M) or [None, ""])[1]
        if f("version") != version: continue
        items = lines or re.findall(r'\["(\w+)", ' + STR + r"\]", b)
        fit, used = [], 0
        for it in items:
            if fit and used + len(it[1]) > (230 if f("intro") else 300): break   # an intro line takes room too
            fit.append(it); used += len(it[1])
        more = len(items) - len(fit)
        d = datetime.date.fromisoformat(f("date"))
        label = {"new": "New", "improved": "Improved", "fixed": "Fixed"}
        size = 38 if used <= 160 else 33
        rows = "".join(f'<div class="pl"><span class="tag {t}">{label[t]}</span><span>{x.replace(chr(92) + chr(34), chr(34))}</span></div>'
                       for t, x in fit) + (f'<div class="pl more">+ {more} more in Press Box</div>' if more else "")
        title = (f'<div class="script" style="font-size:96px;text-shadow:none;color:var(--red2)">{f("name")}</div>' if f("name") else
                 f'<div style="font:700 60px/1 Oswald,sans-serif;text-transform:uppercase;color:var(--navy)">Update {version}</div>')
        return render(name or f"pressbox-{version.replace('.', '-')}", page(f"""<div class="page">
          <div class="kicker">stickpicks · site update</div>
          <h1 style="font-size:150px">Press <em>Box</em></h1>
          <div class="card" style="margin-top:36px">
            <div style="display:flex;align-items:center;gap:30px"><span class="ver">{version}</span>
              <div>{title}<div style="font:italic 32px 'Libre Caslon Text',serif;color:var(--muted);margin-top:6px">{d.strftime('%B')} {d.day}, {d.year}</div></div></div>
            {f'<p class="lede" style="color:var(--ink);font-size:34px">{f("intro")}</p>' if f("intro") else ""}
            <div class="pls" style="font-size:{size}px">{rows}</div>
          </div>
          <div class="foot"><span>Every change in Press Box</span><b>Link in bio</b></div>
        </div>""", extra=""".pls{display:grid;gap:22px;margin-top:30px;padding-top:28px;border-top:3px solid #DDD3BF;font-family:Barlow,sans-serif;font-weight:500;line-height:1.28;color:var(--ink)}
          .pl{display:flex;gap:24px;align-items:baseline} .more{font:italic .85em 'Libre Caslon Text',serif;color:var(--muted)}"""))
    print("no Press Box entry", version)

def eastern(utc):
    """US Eastern time for a UTC datetime (DST: 2nd Sunday of March to 1st Sunday of November)."""
    y = utc.year
    def nth_sunday(month, n):
        d = datetime.datetime(y, month, 1)
        return d + datetime.timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))
    dst = nth_sunday(3, 2) + datetime.timedelta(hours=7) <= utc.replace(tzinfo=None) < nth_sunday(11, 1) + datetime.timedelta(hours=6)
    return utc.replace(tzinfo=None) - datetime.timedelta(hours=4 if dst else 5)

def gamenight(date):
    games = schedule(date)
    if not games: return print(f"no games on {date}")
    d = datetime.date.fromisoformat(date)
    n = len(games)
    size = 34 if n <= 8 else 31 if n <= 11 else 29 if n <= 13 else 25
    pad = 20 if n <= 6 else 14 if n <= 9 else 11 if n <= 13 else 8   # sized for the 3:4 (1080x1440) post
    rows = []
    for g in games:
        t = eastern(datetime.datetime.fromisoformat(g["startTimeUTC"].replace("Z", "+00:00")))
        a, h = g["awayTeam"], g["homeTeam"]
        nm = lambda s: s["commonName"]["default"]
        rows.append(f'<div class="g">{chip(a["abbrev"])}<span>{nm(a)}</span><i>at</i>{chip(h["abbrev"])}<span>{nm(h)}</span>'
                    f'<b>{t.strftime("%I:%M").lstrip("0")}</b></div>')
    # Quiet night (5 games or fewer): fill the space with tomorrow's slate; its picks are already open
    ahead = ""
    nxt = schedule(d + datetime.timedelta(days=1)) if n <= 5 else []
    if nxt:
        pairs = [f'{chip(g["awayTeam"]["abbrev"])}<em>at</em>{chip(g["homeTeam"]["abbrev"])}' for g in nxt]
        ahead = (f'<div class="ahead"><div class="kicker">Tomorrow · {len(nxt)} game{"s" if len(nxt) != 1 else ""}</div>'
                 f'<div class="pairs">{"".join(f"<span>{p}</span>" for p in pairs[:12])}</div>'
                 f'<p class="lede" style="margin-top:22px;font-size:34px">Get ahead: tomorrow\'s picks are open now.</p></div>')
    render(f"03-gamenight-{date}", page(f"""<div class="page">
      <div class="kicker">{d.strftime('%A, %B')} {d.day}</div>
      <h1>{n} game{'s' if n != 1 else ''} <em>tonight</em></h1>
      <div class="card list">{''.join(rows)}<div class="tz">Times are Eastern</div></div>
      {ahead}
      <div class="foot"><span>Picks lock at puck drop</span><b>Link in bio</b></div>
    </div>""", extra=f""".list{{margin-top:34px;padding:22px 36px 18px}}
      .chip{{display:inline-grid;place-items:center;width:{size * 2.3:.0f}px;height:{size * 1.3:.0f}px;border-radius:7px;font:700 {size * .62:.0f}px/1 Oswald,sans-serif;
        letter-spacing:1px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.35),0 2px 0 rgba(0,0,0,.2)}}
      .g{{display:grid;grid-template-columns:auto 1fr 40px auto 1fr auto;align-items:center;gap:0 14px;font:600 {size}px/1.1 Barlow,sans-serif;
         color:var(--ink);padding:{pad}px 0;border-bottom:2px solid #E2D9C6}}
      .g:last-of-type{{border-bottom:0}} .g i{{font:italic 24px 'Libre Caslon Text',serif;color:var(--muted);text-align:center}}
      .g b{{font:700 {size}px Oswald,sans-serif;text-align:right;color:var(--red2);margin-left:10px}}
      .tz{{font:italic 22px 'Libre Caslon Text',serif;color:var(--muted);text-align:right;margin-top:6px}}
      .ahead{{margin-top:46px}} .pairs{{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 18px;margin-top:18px}}
      .pairs > span{{display:flex;align-items:center;gap:10px}} .pairs em{{font:italic 22px 'Libre Caslon Text',serif;color:#BFB7A5}}
      .pairs .chip{{width:84px;height:48px;font-size:24px}}"""))

def results(date):
    """Final scores for a date (the morning-after post): winner in bold, OT / SO tagged, overtime games counted for the OTL tip."""
    with urllib.request.urlopen(urllib.request.Request(f"https://api-web.nhle.com/v1/score/{date}", headers=UA)) as r:
        games = [g for g in json.load(r)["games"] if g.get("gameState") in ("OFF", "FINAL")]
    if not games: return print(f"no finished games on {date}")
    d = datetime.date.fromisoformat(date); n = len(games)
    size = 34 if n <= 8 else 31 if n <= 11 else 29 if n <= 13 else 25
    pad = 18 if n <= 6 else 12 if n <= 9 else 8 if n <= 13 else 6   # leaves room for the overtime note
    rows, ot = [], 0
    for g in games:
        a, h = g["awayTeam"], g["homeTeam"]; aw = a["score"] > h["score"]
        extra = (g.get("gameOutcome") or {}).get("lastPeriodType", "REG")
        if extra != "REG": ot += 1
        nm = lambda t, win: f'<span class="{"win" if win else ""}">{TEAMS.get(t["abbrev"], {}).get("name", t["abbrev"]).split(" ")[-1] if False else t["abbrev"]}</span>'
        tag = f'<i class="ot">{extra}</i>' if extra != "REG" else '<i></i>'
        rows.append(f'<div class="g">{chip(a["abbrev"])}<b class="{"w" if aw else ""}">{a["score"]}</b><span class="dash">–</span>'
                    f'<b class="{"" if aw else "w"}">{h["score"]}</b>{chip(h["abbrev"])}{tag}</div>')
    note = f"{ot} went to overtime. That's {ot} OTL calls that paid off." if ot > 1 else ""
    render(f"07-results-{date}", page(f"""<div class="page">
      <div class="kicker">{d.strftime('%A, %B')} {d.day} · finals</div>
      <h1>Last <em>night</em></h1>
      <div class="card list">{''.join(rows)}</div>
      {f'<p class="lede" style="font-size:36px">{note}</p>' if note else ''}
      <div class="foot"><span>Tonight's picks are open</span><b>Link in bio</b></div>
    </div>""", extra=f""".list{{margin-top:34px;padding:16px 40px}}
      .chip{{display:inline-grid;place-items:center;width:{size*2.3:.0f}px;height:{size*1.3:.0f}px;border-radius:7px;font:700 {size*.62:.0f}px/1 Oswald,sans-serif;
        letter-spacing:1px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.35),0 2px 0 rgba(0,0,0,.2)}}
      .g{{display:grid;grid-template-columns:auto 70px 30px 70px auto 1fr;align-items:center;gap:0 14px;padding:{pad}px 0;border-bottom:2px solid #E2D9C6}}
      .g:last-child{{border-bottom:0}}
      .g b{{font:700 {size*1.25:.0f}px/1 Oswald,sans-serif;color:#9AA3B2;text-align:center}} .g b.w{{color:var(--ink)}}
      .g .dash{{font:700 {size}px Oswald;color:#B9AE97;text-align:center}}
      .g i{{justify-self:end;font:700 {size*.7:.0f}px Oswald,sans-serif;font-style:normal;letter-spacing:2px}}
      .g i.ot{{color:#fff;background:var(--otl);padding:6px 12px;border-radius:6px}}"""))

def otl_tip():
    render("04-otl-tip", page("""<div class="page">
      <div class="kicker">Quick tip</div>
      <h1>Three results,<br><em>not two</em></h1>
      <div class="card" style="margin-top:44px;display:grid;gap:36px;padding:44px 46px">
        <div style="display:flex;gap:32px;align-items:center"><span class="pill w">W</span><p class="lede" style="margin:0;color:var(--ink)">Any win: regulation, overtime or shootout</p></div>
        <div style="display:flex;gap:32px;align-items:center"><span class="pill l">L</span><p class="lede" style="margin:0;color:var(--ink)">A loss in regulation</p></div>
        <div style="display:flex;gap:32px;align-items:center"><span class="pill otl">OTL</span><p class="lede" style="margin:0;color:var(--ink)">A loss in overtime or a shootout</p></div>
      </div>
      <p class="lede">Called from your team's side. Get it right: <b style="color:var(--gold)">+1 point</b>.</p>
      <div class="foot"><span>stickpicks.hockey</span><b>Link in bio</b></div>
    </div>"""))

def breakaway_cover():
    render("05-breakaway-reel-cover", page("""<div class="page" style="top:330px;bottom:380px;align-items:center;text-align:center">
      <div class="kicker">Intermission</div>
      <div class="script" style="font-size:200px;margin-top:24px">Breakaway</div>
      <p class="lede" style="font-size:48px">A little hockey game for the wait before puck drop</p>
      <div class="patches" style="margin-top:60px;justify-content:center"><span>Free</span><span>No download</span></div>
      <div class="foot" style="justify-content:center"><span>stickpicks.hockey</span></div>
    </div>""", 1080, 1920), 1080, 1920)

def story_lock():
    """Story (1080x1920). Instagram covers about the top 250px (profile bar) and bottom 340px (reply bar), so everything sits
    between them; the dashed box is where the link sticker goes."""
    render("06-story-picks-lock", page(f"""<div class="page" style="top:250px;bottom:340px;left:70px;right:70px;text-align:center;align-items:center">
      <div style="width:100%;margin:10px 0 0">{LOGO}</div>
      <div class="kicker" style="margin-top:70px">Tonight on stickpicks</div>
      <h1 style="font-size:150px;line-height:.95;margin-top:18px">Picks lock<br><em>at puck drop</em></h1>
      <p class="lede" style="font-size:50px;margin-top:34px">Call the result and the total goals<br>before each game starts.</p>
      <div class="patches" style="margin-top:44px;justify-content:center"><span>W</span><span>L</span><span>OTL</span><span>+ goals</span></div>
      <div class="tap">Tap the link ↓</div><div class="sticker"></div>
    </div>""", 1080, 1920, extra=""".tap{margin-top:auto;font:700 46px Oswald,sans-serif;letter-spacing:10px;text-transform:uppercase;color:var(--gold)}
      .sticker{margin-top:22px;width:62%;height:120px;border-radius:22px;border:4px dashed rgba(239,230,210,.4)}"""), 1080, 1920)

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "gamenight":
        gamenight(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "results":
        results(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "pressbox":
        pressbox(sys.argv[2])
    else:
        intro(); pressbox("26.1", "02-pressbox-26-1", [("new", "Press Box: every site update in one place"),
            ("new", "Upcoming Picks, one day at a time"), ("improved", "New look for the NHL News ticker"),
            ("improved", "Championship border: gold and team colour"), ("fixed", "\"Nothing picked\" on days without picks")]); pressbox("26.2"); gamenight("2026-10-21"); gamenight("2026-10-22")
        otl_tip(); breakaway_cover(); story_lock()
