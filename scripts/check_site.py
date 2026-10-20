"""Safety-net checks run before every deploy (.github/workflows/deploy-site.yml). If any check fails, the deploy stops
and the live site stays as it was. Standard library only, so it runs anywhere with Python 3.

Checks:
  - every page's own files (teams.js, styles.css, ...) exist, and scripts/styles carry ?v=__V__ (so phones get updates)
  - no two scripts on the same page declare the same top-level name (a duplicate `const` stops the whole page;
    this is the mistake that once broke every page). Pages share one global scope: config.js, teams.js, game.js and
    each page's inline <script> blocks.
  - links between pages point at files that exist; #anchors on other pages exist (warning only: some are made by JS)
  - sitemap.xml is valid, only lists real pages, and has a pick sheet and a leaderboard for every team in teams.js
  - robots.txt points at the sitemap; manifest.webmanifest is valid and its icons exist; sw.js only caches real files
  - Press Box (pressbox.js, rules in UPDATES.md): versions in order with no repeats, real dates, known tags, named
    updates have an intro, no "you"/"your"/"we" in the wording, PRESS_BOX_LATEST in teams.js matches the newest entry

With --extract DIR it also writes each page's inline scripts to DIR (one .js file per block) so the workflow can run
`node --check` on them, catching syntax errors in the pages themselves.

Run it yourself:  python scripts/check_site.py
"""
import json, os, re, sys, xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = os.environ.get("CHECK_SITE_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # (override for testing)
SITE = "https://stickpicks.hockey/"
errors, warnings = [], []

def err(file, msg): errors.append((file, msg))
def warn(file, msg): warnings.append((file, msg))
def path(*p): return os.path.join(ROOT, *p)
def read(name): return open(path(name), encoding="utf-8").read()
def exists(name): return os.path.isfile(path(name))

class Page(HTMLParser):
    """Collects a page's script tags (src or inline), links and element ids."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.scripts, self.refs, self.ids = [], [], set()
        self._inline = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"): self.ids.add(a["id"])
        if tag == "script":
            if a.get("src"): self.scripts.append(("src", a["src"], self.getpos()[0]))
            elif a.get("type", "text/javascript") in ("", "text/javascript", "module"): self._inline = (self.getpos()[0], [])
        for attr in ("href", "src"):
            if a.get(attr): self.refs.append((tag, attr, a[attr], self.getpos()[0]))
    def handle_data(self, data):
        if self._inline is not None: self._inline[1].append(data)
    def handle_endtag(self, tag):
        if tag == "script" and self._inline is not None:
            line, parts = self._inline
            self.scripts.append(("inline", "".join(parts), line))
            self._inline = None

# Anchors a page's script handles itself, rather than an element with that id in the HTML
SCRIPT_ANCHORS = {"index.html": {"signin", "account", "teams"}}
def script_anchor(page, anchor):
    if anchor in SCRIPT_ANCHORS.get(page, ()): return True
    return page == "badges.html" and anchor.startswith("g-")   # badge groups: id "g-" + group name, made by the page's script

def local(url):
    """The site file a link points at, or None for other sites, mailto:, data:, same-page #anchors and JS links."""
    if re.match(r"^[a-z][a-z0-9+.-]*:", url, re.I) or url.startswith(("//", "#", "{", "$")): return None
    return url

# Top-level declarations: the code style puts them at the start of a line ("const X=", "function f(", "let a, b").
DECL = re.compile(r"^(const|let|var|class|function|async\s+function)\s+([A-Za-z_$][\w$]*)", re.M)
def declarations(code, where=None):
    """{name: (kind, line)} for a script's top-level declarations; reports a name declared twice in the same script."""
    out = {}
    for m in DECL.finditer(code):
        kind = "function" if "function" in m.group(1) else m.group(1)
        line = code.count("\n", 0, m.start()) + 1
        name = m.group(2)
        if name in out and where and not (kind == "var" and out[name][0] == "var"):
            err(where, f"'{name}' is declared twice in this script (lines {out[name][1]} and {line}). The second one stops the page from running.")
        out.setdefault(name, (kind, line))
    return out

def check_pages(extract_dir):
    pages = sorted(f for f in os.listdir(ROOT) if f.endswith(".html"))
    shared = {}   # declarations in the site's own script files, read once
    parsed = {}
    for f in pages:
        p = Page(); p.feed(read(f)); parsed[f] = p
    for f in pages:
        p = parsed[f]
        # files each page loads (and the cache-busting version stamp)
        for tag, attr, url, line in p.refs:
            u = local(url)
            if not u: continue
            name = u.split("#")[0].split("?")[0]
            if name in ("", "./"): name = "index.html"
            if not exists(name):
                err(f, f"line {line}: {tag} {attr}=\"{url}\" points at {name}, which doesn't exist")
                continue
            if tag in ("script", "link") and name.endswith((".js", ".css")) and "?v=__V__" not in u:
                err(f, f"line {line}: {name} is loaded without ?v=__V__, so phones may keep an old copy")
            if tag == "a" and "#" in u and name.endswith(".html"):
                anchor = u.split("#", 1)[1]
                if anchor and anchor not in parsed.get(name, Page()).ids and not script_anchor(name, anchor):
                    warn(f, f"line {line}: link to {name}#{anchor}, but {name} has no element with that id in its HTML (fine if a script adds it)")
        # one global scope per page: own script files + inline blocks
        seen = {}
        for i, (kind, value, line) in enumerate(p.scripts):
            if kind == "src":
                name = value.split("?")[0]
                if local(value) is None or not name.endswith(".js") or not exists(name): continue
                if name not in shared: shared[name] = declarations(read(name), name)
                decls, where = shared[name], name
            else:
                where = f"{f} (inline script at line {line})"; decls = declarations(value, f)
                if extract_dir:
                    os.makedirs(extract_dir, exist_ok=True)
                    with open(os.path.join(extract_dir, f"{f[:-5]}-{i}.js"), "w", encoding="utf-8") as out:
                        out.write("\n" * (line - 1) + value)   # padded so node --check reports the page's own line numbers
            for nm, (k, ln) in decls.items():
                if nm in seen and not (k == "var" and seen[nm][0] == "var"):
                    err(f, f"'{nm}' is declared twice on this page: {seen[nm][1]} line {seen[nm][2]} and {where} line {ln}. "
                           "The second one stops the page from running.")
                else:
                    seen.setdefault(nm, (k, where, ln))

def team_codes():
    return re.findall(r"^  ([A-Z]{3}):\{name:", read("teams.js"), re.M)

def check_sitemap():
    if not exists("sitemap.xml"): return err("sitemap.xml", "missing")
    try: root = ET.fromstring(read("sitemap.xml"))
    except ET.ParseError as e: return err("sitemap.xml", f"not valid XML: {e}")
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [l.text.strip() for l in root.findall("s:url/s:loc", ns)]
    if not locs: err("sitemap.xml", "lists no pages")
    for loc in locs:
        if not loc.startswith(SITE): err("sitemap.xml", f"{loc} isn't on {SITE}"); continue
        name = loc[len(SITE):].split("?")[0] or "index.html"
        if not exists(name): err("sitemap.xml", f"{loc}: {name} doesn't exist")
    codes = team_codes()
    if len(codes) != 32: warn("teams.js", f"found {len(codes)} teams (expected 32); the team check below may be off")
    for c in codes:
        for page in ("sheet.html", "leaderboard.html"):
            if f"{SITE}{page}?team={c}" not in locs: err("sitemap.xml", f"missing {page}?team={c}")
    for loc in locs:
        m = re.search(r"\?team=([A-Z]+)$", loc)
        if m and m.group(1) not in codes: err("sitemap.xml", f"{loc}: {m.group(1)} isn't a team in teams.js")

def check_misc():
    if not exists("robots.txt") or f"Sitemap: {SITE}sitemap.xml" not in read("robots.txt"):
        err("robots.txt", "missing, or doesn't point at the sitemap")
    try:
        man = json.loads(read("manifest.webmanifest"))
        for icon in man.get("icons", []):
            if not exists(icon["src"].split("?")[0]): err("manifest.webmanifest", f"icon {icon['src']} doesn't exist")
    except (OSError, ValueError, KeyError) as e:
        err("manifest.webmanifest", f"can't read it: {e}")
    sw = read("sw.js")
    m = re.search(r"const SHELL = \[(.*?)\];", sw, re.S)
    if not m: err("sw.js", "couldn't find the SHELL list")
    else:
        for entry in re.findall(r'[`"]([^`"]+)[`"]', m.group(1)):
            name = entry.replace("${V}", "").split("?")[0]
            if name.startswith("http") or name in ("./", ""): continue
            if not exists(name): err("sw.js", f"caches {name}, which doesn't exist (the app would fail to install)")
    if not exists("CNAME") or read("CNAME").strip() != "stickpicks.hockey": err("CNAME", "should contain stickpicks.hockey")

def check_pressbox():
    """Press Box entries (pressbox.js) follow the style guide in UPDATES.md."""
    import datetime
    if not exists("pressbox.js"): return err("pressbox.js", "missing (the Press Box page needs it)")
    src = read("pressbox.js")
    blocks = re.split(r"\n  \{\n", src)[1:]   # one block per entry: each entry starts with "  {" on its own line
    if not blocks: return err("pressbox.js", "no entries found (each entry starts with '  {' on its own line)")
    STR = r'"((?:[^"\\]|\\.)*)"'
    prev, prev_date, versions = None, None, []
    for b in blocks:
        def field(k):
            m = re.search(r"^    " + k + r": " + STR + ",", b, re.M)
            return m.group(1) if m else None
        v, name, date, intro = field("version"), field("name"), field("date"), field("intro")
        where = f"pressbox.js ({v or 'an entry'})"
        if not v or not re.fullmatch(r"\d{2}\.\d+", v):
            err(where, f'version "{v}" should look like 26.1 (season year, a dot, a number)'); continue
        key = tuple(int(x) for x in v.split("."))
        if v in versions: err(where, f"version {v} is used twice")
        versions.append(v)
        if prev and key >= prev: err(where, "entries must be newest first, each with a lower version than the one above it")
        prev = key
        try: d = datetime.date.fromisoformat(date or "")
        except ValueError: err(where, f'date "{date}" should be written like "2026-10-21"'); d = None
        if d and prev_date and d > prev_date: err(where, "its date is later than the entry above it (newest first)")
        if d: prev_date = d
        if d and d > datetime.date.today() + datetime.timedelta(days=1): warn(where, f"dated {date}, which is in the future")
        if name and not intro: err(where, f'named update "{name}" needs an intro (UPDATES.md section 4)')
        if key[1] == 0 and not name: err(where, f"{v} starts a season, so it needs a name (UPDATES.md section 1)")
        items = re.findall(r'\["(\w+)", ' + STR + r"\]", b)
        if not items: err(where, "has no lines (items)")
        order, last = {"new": 0, "improved": 1, "fixed": 2}, -1
        for tag, _ in items:
            if tag not in order: err(where, f'unknown tag "{tag}" (use new, improved or fixed)'); continue
            if order[tag] < last: err(where, "lines should go New, then Improved, then Fixed")
            last = order[tag]
        for text in [intro or "", name or ""] + [t for _, t in items]:
            w = re.search(r"\b(you|your|you're|youre|yours|yourself|we|we're|our|ours)\b", text, re.I)
            if w: err(where, f'"{w.group(0)}" in "{text[:60]}": Press Box wording never addresses the reader or says "we" (UPDATES.md section 4)')
    if versions:
        m = re.search(r'^const PRESS_BOX_LATEST="([^"]+)";', read("teams.js"), re.M)
        if not m: err("teams.js", "PRESS_BOX_LATEST is missing (it lights the footer's Press Box dot)")
        elif m.group(1) != versions[0]:
            err("teams.js", f"PRESS_BOX_LATEST is {m.group(1)} but the newest Press Box entry is {versions[0]}; set it to {versions[0]}")
        season = re.search(r'SEASON:\s*"(\d{4})', read("config.js"))
        if season and versions[0].split(".")[0] != season.group(1)[2:]:
            warn("pressbox.js", f"the newest entry is {versions[0]} but the season in config.js is {season.group(1)}: the season's first update should be {season.group(1)[2:]}.0")
    for page in sorted(f for f in os.listdir(ROOT) if f.endswith(".html")):
        s = read(page); i = s.find("<footer")
        if i >= 0 and 'href="pressbox.html"' not in s[i:s.find("</footer>", i)]:
            err(page, "the footer is missing the Press Box link")

def main():
    extract = None
    if "--extract" in sys.argv: extract = sys.argv[sys.argv.index("--extract") + 1]
    check_pages(extract); check_sitemap(); check_misc(); check_pressbox()
    gh = os.environ.get("GITHUB_ACTIONS") == "true"
    for f, m in warnings: print(f"::warning file={f}::{m}" if gh else f"warning  {f}: {m}")
    for f, m in errors: print(f"::error file={f}::{m}" if gh else f"ERROR    {f}: {m}")
    print(f"{len(errors)} problem(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
