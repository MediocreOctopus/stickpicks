"""Live-site check after every deploy (.github/workflows/deploy-site.yml, "Check the live site"). A real browser (Chromium,
via Playwright) opens the main pages of stickpicks.hockey, signed out, and fails the check if any page:
  - has a script error (something that would stop the page working), or
  - can't load one of the site's own files (a 404 for teams.js, a missing page...).
It also looks for each page's main content (games, a team sheet, the leaderboard...). Missing content is only a
warning, since it can legitimately be empty (no games scheduled, the off-season, the database briefly slow).

First it waits until the new version is actually being served (GitHub Pages can take a minute or two), so it tests what
was just deployed. Set EXPECT_VERSION to the deploy's version stamp; SITE_URL defaults to https://stickpicks.hockey/.
Run it yourself:  pip install playwright && playwright install chromium && python scripts/live_check.py
"""
import os, sys, time, urllib.request
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

SITE = os.environ.get("SITE_URL", "https://stickpicks.hockey/")
VERSION = os.environ.get("EXPECT_VERSION", "")
GH = os.environ.get("GITHUB_ACTIONS") == "true"
HOST = urlparse(SITE).netloc

# (page, what to wait for: a CSS selector for the page's main content, and a plain-language name for it)
PAGES = [
    ("",                     "#dayStrip .daypanel, #todayEmpty:not(.hidden)", "today's games"),
    ("sheet.html?team=SEA",  "#sheet .game",                                  "the Kraken pick sheet's games"),
    ("leaderboard.html",     ".lb tbody tr",                                  "leaderboard rows"),
    ("teams.html",           "#divisions a.tile",                             "the team list"),
    ("rules.html",           "#scoring",                                      "the rules"),
    ("intermission.html",    "canvas",                                        "the Breakaway game"),
    ("badges.html",          "#bGroups .bgroup",                              "badge groups"),
    ("shop.html",            "#shop .shop-card",                              "shop items"),
    ("locker.html",          "#locker",                                       "the Locker Room"),
    ("chiclets.html",        "main",                                          "the Chiclets page"),
    ("profile.html",         "#pf",                                           "the profile page"),
    ("playoffs.html",        "#sheet, #empty:not(.hidden)",                   "the playoff sheet"),
    ("bracket.html",         "main, .bk",                                     "the bracket"),
    ("privacy.html",         "h1",                                            "the privacy page"),
]

problems, warnings, rows = [], [], []

def note(kind, page, msg):
    (problems if kind == "error" else warnings).append((page, msg))
    if GH: print(f"::{kind} title={page or 'home'}::{msg}")
    else: print(f"{kind.upper():8} {page or 'home'}: {msg}")

def wait_for_version():
    if not VERSION: return
    deadline = time.time() + 600
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"{SITE}?check={int(time.time())}", headers={"Cache-Control": "no-cache"})
            if VERSION in urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace"):
                print(f"Version {VERSION} is live."); return
        except OSError as e:
            print(f"Waiting for the site ({e})")
        time.sleep(15)
    note("error", "", f"version {VERSION} still isn't being served after 10 minutes")

def check(browser, path, selector, what):
    url = urljoin(SITE, path)
    ctx = browser.new_context(service_workers="block")   # a first-time visitor, fresh files
    page = ctx.new_page()
    errors, bad = [], []
    page.on("pageerror", lambda e: errors.append(str(e).splitlines()[0][:200]))
    def on_response(r):
        if urlparse(r.url).netloc == HOST and r.status >= 400: bad.append(f"{r.status} {r.url}")
    page.on("response", on_response)
    page.on("requestfailed", lambda r: bad.append(f"failed {r.url}") if urlparse(r.url).netloc == HOST else None)
    status = "ok"
    try:
        resp = page.goto(url, wait_until="load", timeout=45000)
        if not resp or resp.status >= 400:
            note("error", path, f"the page itself returned {resp.status if resp else 'nothing'}"); status = "page failed"
        try:
            page.wait_for_selector(selector, state="attached", timeout=20000)
        except PWTimeout:
            note("warning", path, f"didn't find {what} within 20 seconds (fine if there's nothing to show right now)")
            status = "no content"
        page.wait_for_timeout(1500)   # let late scripts finish
    except PWTimeout:
        note("error", path, "the page took more than 45 seconds to load"); status = "timeout"
    for e in errors: note("error", path, f"script error: {e}"); status = "script error"
    for b in bad: note("error", path, f"couldn't load the site's own file: {b}"); status = "missing file"
    rows.append((path or "/", status))
    ctx.close()

def main():
    wait_for_version()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for path, selector, what in PAGES: check(browser, path, selector, what)
        browser.close()
    summary = ["## Live-site check", "", f"{SITE} · version {VERSION or '(not given)'}", "", "| Page | Result |", "|---|---|"]
    summary += [f"| {p} | {'✅' if s == 'ok' else '⚠️' if s == 'no content' else '❌'} {s} |" for p, s in rows]
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f: f.write("\n".join(summary) + "\n")
    print(f"{len(problems)} problem(s), {len(warnings)} warning(s) across {len(rows)} pages")
    sys.exit(1 if problems else 0)

if __name__ == "__main__":
    main()
