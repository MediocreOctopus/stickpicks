"""Builds the stickpicks Instagram pictures (marketing only; never deployed).

    python marketing/instagram/build.py                 # every starter-kit picture
    python marketing/instagram/build.py gamenight 2026-10-22   # just a game-night picture for that date
    python marketing/instagram/build.py pressbox 26.2          # a Press Box picture for that update (from pressbox.js)

Each picture is an HTML page rendered to PNG with headless Microsoft Edge at Instagram's sizes:
posts 1080x1350 (4:5), Stories and Reel covers 1080x1920. Look: the site's cream knit, jersey stripes and logo.
Team names in words only: never NHL or team logos (see UPDATES.md and the trademark note in CLAUDE.md).
"""
import datetime, json, os, re, subprocess, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "png")
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

LOGO = open(os.path.join(REPO, "logo.svg"), encoding="utf-8").read().strip().replace('class="logo-svg"', 'class="logo"')
KNIT = ("url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='15' height='12'%3E%3Cpath "
        "d='M0 0 L7.5 9 L15 0' fill='none' stroke='%23000' stroke-opacity='.055' stroke-width='3'/%3E%3C/svg%3E\")")

CSS = """
:root{--logo-ink:#9B1C1F;--logo-bg:#EFE6D2;--logo-wood:#B98245;--logo-grain:#7A4E22;--logo-tape:#1C2B45;--logo-wrap:#EFE6D2;--logo-puck-rim:none;
  --navy:#1C2B45;--red:#9B1C1F;--red2:#E8463F;--cream:#EFE6D2;--panel:#FBF7EE;--ink:#17233A;--muted:#5D6473;--gold:#D9A33A;
  --win:#0E7C66;--winbg:#D5F0E8;--loss:#B3122C;--lossbg:#FBDDE2;--otl:#9A6A00;--otlbg:#FBEFCF}
*{box-sizing:border-box}
html,body{margin:0;width:%(w)dpx;height:%(h)dpx;overflow:hidden}
body{position:relative;background:#EFE6D2 %(knit)s;color:var(--ink);font-family:Barlow,sans-serif}
.top{position:absolute;left:0;right:0;top:0;height:60px;background:linear-gradient(to bottom,var(--red) 0 24px,transparent 24px 36px,var(--navy) 36px 56px,transparent 56px)}
.bot{position:absolute;left:0;right:0;bottom:0;height:92px;background:linear-gradient(to bottom,var(--red) 0 26px,transparent 26px 38px,var(--navy) 38px 54px,transparent 54px 66px,var(--red) 66px 92px)}
.page{position:absolute;left:80px;right:80px;top:110px;bottom:150px;display:flex;flex-direction:column}
.logo{width:100%%;height:auto;overflow:visible}
.kicker{font:700 30px Oswald,sans-serif;letter-spacing:9px;text-transform:uppercase;color:var(--red)}
h1{font:700 96px/1 Oswald,sans-serif;text-transform:uppercase;letter-spacing:1px;margin:14px 0 0;color:var(--navy)}
h1 em{font-style:normal;color:var(--red)}
.script{font:116px/1 Yellowtail,cursive;color:var(--red)}
.lede{font:italic 40px/1.35 "Libre Caslon Text",Georgia,serif;margin:26px 0 0;color:var(--ink)}
.foot{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font:700 30px Oswald,sans-serif;letter-spacing:5px;text-transform:uppercase;color:var(--navy)}
.foot b{color:var(--red)}
.patches{display:flex;gap:14px;flex-wrap:wrap}
.patches span{background:var(--navy);color:var(--cream);font:600 26px/1 Oswald,sans-serif;letter-spacing:4px;text-transform:uppercase;
  padding:16px 22px;border-radius:8px;outline:2px dashed rgba(239,230,210,.8);outline-offset:-7px}
.card{background:var(--panel);border:4px solid var(--navy);border-radius:18px;padding:34px 40px}
.pill{display:inline-block;min-width:150px;text-align:center;font:700 54px/1 Oswald,sans-serif;padding:16px 18px;border-radius:12px;border:4px solid}
.pill.w{color:var(--win);background:var(--winbg)} .pill.l{color:var(--loss);background:var(--lossbg)} .pill.otl{color:var(--otl);background:var(--otlbg)}
.tag{display:inline-block;width:190px;text-align:center;font:700 24px/1 Oswald,sans-serif;letter-spacing:4px;text-transform:uppercase;padding:10px 0;border-radius:8px;border:3px solid}
.tag.new{color:var(--win);background:var(--winbg)} .tag.improved{color:var(--otl);background:var(--otlbg)} .tag.fixed{color:var(--muted);background:transparent}
.ver{display:inline-block;background:var(--navy);color:var(--cream);font:700 70px/1 Oswald,sans-serif;padding:20px 24px;border-radius:12px;outline:3px dashed rgba(239,230,210,.75);outline-offset:-10px}
.banner{background:var(--navy);color:var(--cream);border-radius:18px;padding:34px 44px;position:relative;overflow:hidden;border-bottom:12px solid var(--red2)}
.banner:before{content:"";position:absolute;left:18px;top:0;bottom:0;width:22px;background:linear-gradient(to right,var(--red2) 0 9px,var(--cream) 9px 13px,transparent 13px)}
.banner > *{margin-left:30px}
.banner small{display:block;font:700 26px Oswald,sans-serif;letter-spacing:8px;text-transform:uppercase;color:var(--gold)}
.banner b{display:block;font:700 90px/1.05 Oswald,sans-serif;text-transform:uppercase}
"""

FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700'
         '&family=Barlow:wght@500;600;700&family=Libre+Caslon+Text:ital@1&family=Yellowtail&display=block">')

def page(body, w=1080, h=1350, extra=""):
    return (f'<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>' + CSS % {"w": w, "h": h, "knit": KNIT}
            + extra + f'</style></head><body><div class="top"></div>{body}<div class="bot"></div></body></html>')

def render(name, html, w=1080, h=1350):
    os.makedirs(OUT, exist_ok=True)
    src = os.path.join(OUT, f"_{name}.html")
    open(src, "w", encoding="utf-8").write(html)
    png = os.path.join(OUT, f"{name}.png")
    profile = os.path.join(os.environ.get("TEMP", OUT), "stickpicks-edge-render")   # its own profile, so an open Edge can't hold it up
    try:
        subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        f"--user-data-dir={profile}", "--no-first-run", "--virtual-time-budget=8000",
                        f"--window-size={w},{h}", f"--screenshot={png}", "file:///" + src.replace("\\", "/")],
                       capture_output=True, timeout=60)
    except subprocess.TimeoutExpired:
        if not os.path.exists(png): print("timed out:", name)
    os.remove(src)
    print("made", os.path.relpath(png, REPO))

def site_art(badge_ids):
    """The site's own badge and Chiclet drawings (badgeEl / chicletIcon in teams.js), so the pictures always match it."""
    os.makedirs(OUT, exist_ok=True)
    src = os.path.join(OUT, "_art.html")
    url = lambda f: "file:///" + os.path.join(REPO, f).replace("\\", "/")
    open(src, "w", encoding="utf-8").write(
        f'<!doctype html><meta charset="utf-8"><pre id="o"></pre><script src="{url("config.js")}"></script>'
        f'<script src="{url("teams.js")}"></script><script>document.getElementById("o").textContent=JSON.stringify('
        f'{{badges:Object.fromEntries({json.dumps(badge_ids)}.map(id=>[id,badgeEl(id,180).outerHTML])),chiclet:chicletIcon(52).outerHTML}});</script>')
    profile = os.path.join(os.environ.get("TEMP", OUT), "stickpicks-edge-render")
    try:
        r = subprocess.run([EDGE, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}", "--no-first-run",
                            "--allow-file-access-from-files", "--virtual-time-budget=4000", "--dump-dom",
                            "file:///" + src.replace("\\", "/")], capture_output=True, timeout=60)
    finally:
        os.remove(src)
    import html as _html
    m = re.search(r'<pre id="o">(.*?)</pre>', r.stdout.decode("utf-8", "replace"), re.S)
    if not m or not m.group(1).strip(): sys.exit("couldn't read the badge art from teams.js")
    return json.loads(_html.unescape(m.group(1)))

# ---- the pictures ----------------------------------------------------------------------------------------------

def intro():
    render("01-intro-1", page(f"""<div class="page">
      <div style="margin:30px 10px 0">{LOGO}</div>
      <h1 style="margin-top:70px">Pick the game.<br>Pick the goals.<br><em>Climb the board.</em></h1>
      <p class="lede">A free NHL pick'em where every team has its own leaderboard.</p>
      <div class="foot"><div class="patches"><span>No money</span><span>No betting</span><span>No ads</span></div><span>Swipe <b>→</b></span></div>
    </div>"""))
    render("01-intro-2", page("""<div class="page">
      <div class="kicker">How it works</div>
      <h1>Three steps</h1>
      <div class="card" style="margin-top:40px;display:grid;gap:34px">
        <div><div class="kicker" style="color:var(--navy)">1 · Pick your team</div><p class="lede" style="margin-top:8px">Any of the 32. Play as many as you like.</p></div>
        <div><div class="kicker" style="color:var(--navy)">2 · Call each game</div>
          <div style="display:flex;gap:18px;margin:16px 0 0"><span class="pill w">W</span><span class="pill l">L</span><span class="pill otl">OTL</span></div>
          <p class="lede" style="margin-top:14px">plus the combined goals.</p></div>
        <div><div class="kicker" style="color:var(--navy)">3 · Score points</div><p class="lede" style="margin-top:8px"><b>+1</b> for the right result, <b>+1</b> for the exact goals.</p></div>
      </div>
      <div class="foot"><span>Picks lock at puck drop</span><span>Swipe <b>→</b></span></div>
    </div>"""))
    art = site_art(["hattrick", "shutout", "overtime", "mvp"])
    badges = "".join(f'<div class="bd">{art["badges"][i]}<span>{n}</span></div>'
                     for i, n in [("hattrick", "Hat Trick"), ("shutout", "Shutout"), ("overtime", "Overtime Hero"), ("mvp", "MVP")])
    ico = art["chiclet"]
    render("01-intro-3", page(f"""<div class="page">
      <div class="kicker">Beyond the leaderboard</div>
      <h1>Earn Chiclets. <em>Collect badges.</em></h1>
      <div class="card ch">
        <div class="chh">{ico}<b>Chiclets</b><span>free points for good picks</span></div>
        <div class="earn"><span><b>+1</b> right result</span><span><b>+2</b> exact goals</span><span><b>+5</b> perfect night</span><span><b>+5 to +25</b> for badges</span></div>
      </div>
      <div class="bds">{badges}</div>
      <p class="lede shop">Spend Chiclets in the shop on profile borders, throwback sweaters and gear for your Breakaway skater.</p>
      <div class="foot"><span>Never sold for real money</span><b>Link in bio</b></div>
    </div>""", extra="""
      .ch{margin-top:36px;padding:26px 34px}
      .chh{display:flex;align-items:center;gap:16px} .chh .chiclet-ico{width:64px;height:64px;display:grid;place-items:center}
      .chh .chiclet-ico svg{width:52px;height:58px;transform:rotate(45deg)}
      .chh b{font:700 56px/1 Oswald,sans-serif;text-transform:uppercase;color:var(--navy)}
      .chh span{font:italic 30px 'Libre Caslon Text',serif;color:var(--muted)}
      .earn{display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin-top:20px;font:500 32px/1.2 Barlow,sans-serif}
      .earn b{font:700 34px Oswald,sans-serif;color:var(--red);margin-right:6px}
      .bds{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:40px;text-align:center}
      .bd .badge{display:block;margin:0 auto;width:180px;height:180px;filter:drop-shadow(0 3px 3px rgba(0,0,0,.25))} .bd svg{width:100%;height:100%;display:block}
      .bd span{display:block;margin-top:12px;font:700 24px Oswald,sans-serif;letter-spacing:2px;text-transform:uppercase;color:var(--navy)}
      .shop{margin-top:36px}"""))

def pressbox_261():
    render("02-pressbox-26-1", page("""<div class="page">
      <div class="banner"><small>stickpicks</small><b>Press Box</b></div>
      <div style="display:flex;align-items:center;gap:28px;margin-top:46px"><span class="ver">26.1</span>
        <div><div style="font:700 56px Oswald,sans-serif;text-transform:uppercase;color:var(--navy)">Update 26.1</div>
        <div style="font:italic 32px 'Libre Caslon Text',serif;color:var(--muted)">October 20, 2026</div></div></div>
      <div style="display:grid;gap:26px;margin-top:46px;font:500 36px/1.3 Barlow,sans-serif">
        <div style="display:flex;gap:24px;align-items:baseline"><span class="tag new">New</span><span>Press Box: every site update in one place</span></div>
        <div style="display:flex;gap:24px;align-items:baseline"><span class="tag new">New</span><span>Upcoming Picks, one day at a time</span></div>
        <div style="display:flex;gap:24px;align-items:baseline"><span class="tag improved">Improved</span><span>New look for the NHL News ticker</span></div>
        <div style="display:flex;gap:24px;align-items:baseline"><span class="tag improved">Improved</span><span>Championship border: gold and team colour</span></div>
        <div style="display:flex;gap:24px;align-items:baseline"><span class="tag fixed">Fixed</span><span>"Nothing picked" on days without picks</span></div>
      </div>
      <div class="foot"><span>Every change: Press Box</span><b>Link in bio</b></div>
    </div>"""))

def pressbox(version):
    """A Press Box picture for any entry, read straight from pressbox.js (up to 6 lines; longer updates show the first 6)."""
    src = open(os.path.join(REPO, "pressbox.js"), encoding="utf-8").read()
    STR = r'"((?:[^"\\]|\\.)*)"'
    for b in re.split(r"\n  \{\n", src)[1:]:
        f = lambda k: (re.search(r"^    " + k + r": " + STR + ",", b, re.M) or [None, ""])[1]
        if f("version") != version: continue
        items = re.findall(r'\["(\w+)", ' + STR + r"\]", b)
        d = datetime.date.fromisoformat(f("date"))
        label = {"new": "New", "improved": "Improved", "fixed": "Fixed"}
        rows = "".join(f'<div style="display:flex;gap:24px;align-items:baseline"><span class="tag {t}">{label[t]}</span>'
                       f'<span>{x.replace(chr(92) + chr(34), chr(34))}</span></div>' for t, x in items[:6])
        title = f'<div class="script" style="font-size:84px">{f("name")}</div>' if f("name") else \
                f'<div style="font:700 56px Oswald,sans-serif;text-transform:uppercase;color:var(--navy)">Update {version}</div>'
        intro_line = f'<p class="lede">{f("intro")}</p>' if f("intro") else ""
        return render(f"pressbox-{version.replace('.', '-')}", page(f"""<div class="page">
          <div class="banner"><small>stickpicks</small><b>Press Box</b></div>
          <div style="display:flex;align-items:center;gap:28px;margin-top:46px"><span class="ver">{version}</span>
            <div>{title}<div style="font:italic 32px 'Libre Caslon Text',serif;color:var(--muted)">{d.strftime('%B')} {d.day}, {d.year}</div></div></div>
          {intro_line}
          <div style="display:grid;gap:26px;margin-top:46px;font:500 38px/1.3 Barlow,sans-serif">{rows}</div>
          <div class="foot"><span>Every change: Press Box</span><b>Link in bio</b></div>
        </div>"""))
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
    req = urllib.request.Request(f"https://api-web.nhle.com/v1/schedule/{date}", headers={"User-Agent": "Mozilla/5.0 (stickpicks marketing)"})
    with urllib.request.urlopen(req) as r:
        day = json.load(r)["gameWeek"][0]
    games = day["games"]
    if not games: return print(f"no games on {date}")
    rows = []
    for g in games:
        t = eastern(datetime.datetime.fromisoformat(g["startTimeUTC"].replace("Z", "+00:00")))
        name = lambda s: f'{s["placeName"]["default"]} {s["commonName"]["default"]}'.replace("Utah Utah", "Utah")
        rows.append(f'<div class="g"><span>{name(g["awayTeam"])}</span><i>at</i><span>{name(g["homeTeam"])}</span>'
                    f'<b>{t.strftime("%I:%M").lstrip("0")}</b></div>')
    d = datetime.date.fromisoformat(date)
    size = 34 if len(games) <= 9 else 29 if len(games) <= 13 else 25
    render(f"03-gamenight-{date}", page(f"""<div class="page">
      <div class="kicker">{d.strftime('%A, %B')} {d.day}</div>
      <h1>{len(games)} game{'s' if len(games) != 1 else ''} <em>tonight</em></h1>
      <div class="card list">{''.join(rows)}<div class="tz">Times are Eastern</div></div>
      <div class="foot"><span>Picks lock at puck drop</span><b>Link in bio</b></div>
    </div>""", extra=f""".list{{margin-top:36px;padding:20px 34px;display:grid;gap:0}}
      .g{{display:grid;grid-template-columns:1fr 44px 1fr 90px;align-items:center;gap:10px;font:600 {size}px/1.15 Barlow,sans-serif;
         color:var(--navy);padding:{max(8, size // 3)}px 0;border-bottom:2px solid #DDD3BF}}
      .g:last-of-type{{border-bottom:0}} .g i{{font:italic 26px 'Libre Caslon Text',serif;color:var(--muted);text-align:center}}
      .g b{{font:700 {size}px Oswald,sans-serif;text-align:right;color:var(--red)}}
      .tz{{font:italic 22px 'Libre Caslon Text',serif;color:var(--muted);text-align:right;margin-top:8px}}"""))

def otl_tip():
    render("04-otl-tip", page("""<div class="page">
      <div class="kicker">Quick tip</div>
      <h1>Three results, <em>not two</em></h1>
      <div class="card" style="margin-top:44px;display:grid;gap:34px">
        <div style="display:flex;gap:30px;align-items:center"><span class="pill w">W</span><p class="lede" style="margin:0">Any win: regulation, overtime or shootout</p></div>
        <div style="display:flex;gap:30px;align-items:center"><span class="pill l">L</span><p class="lede" style="margin:0">A loss in regulation</p></div>
        <div style="display:flex;gap:30px;align-items:center"><span class="pill otl">OTL</span><p class="lede" style="margin:0">A loss in overtime or a shootout</p></div>
      </div>
      <p class="lede">Called from your team's side. Get it right: <b>+1 point</b>.</p>
      <div class="foot"><span>stickpicks.hockey</span><b>Link in bio</b></div>
    </div>"""))

def breakaway_cover():
    render("05-breakaway-reel-cover", page("""<div class="page" style="top:300px;bottom:360px">
      <div class="kicker" style="text-align:center">Intermission</div>
      <div class="script" style="text-align:center;font-size:190px;margin-top:20px">Breakaway</div>
      <p class="lede" style="text-align:center;font-size:48px">A little hockey game for the wait before puck drop</p>
      <div style="text-align:center;margin-top:60px"><span class="patches" style="display:inline-flex"><span>Free</span><span>No download</span></span></div>
      <div class="foot" style="justify-content:center"><span>stickpicks.hockey</span></div>
    </div>""", 1080, 1920), 1080, 1920)

def story_lock():
    render("06-story-picks-lock", page(f"""<div class="page" style="top:240px;bottom:200px">
      <div style="margin:0 40px">{LOGO}</div>
      <h1 style="font-size:120px;text-align:center;margin-top:120px">Picks lock<br><em>at puck drop</em></h1>
      <p class="lede" style="text-align:center;font-size:46px">Call tonight's games before they start.</p>
      <div class="foot" style="justify-content:center;margin-bottom:330px"><span>Tap the link <b>↓</b></span></div>
    </div>""", 1080, 1920), 1080, 1920)

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "gamenight":
        gamenight(sys.argv[2])
    elif len(sys.argv) >= 3 and sys.argv[1] == "pressbox":
        pressbox(sys.argv[2])
    else:
        intro(); pressbox_261(); gamenight("2026-10-22"); otl_tip(); breakaway_cover(); story_lock()
