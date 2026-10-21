"""Writes marketing/stickpicks-instagram-starter-kit.html (pictures from build.py, captions, how to post each one)."""
import html, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
TAGS = "#NHL #hockey #icehockey #hockeyfans #pickem"
BIO = "Free NHL pick'em 🏒 Call every game (W, L or OTL + total goals) and climb your team's own leaderboard. No money, no betting, no ads."

POSTS = [
    dict(when="Wed Oct 21 · first post · pin it", what="Intro (3-picture swipe post)",
         imgs=["01-intro-1.png", "01-intro-2.png", "01-intro-3.png"],
         how="New post → tap the stacked-squares icon to pick several → choose all 3 pictures in order → Next → paste the caption. After posting: ··· → Pin to your profile.",
         cap="Pick the game. Pick the goals. Climb the board. 🏒\n\nstickpicks is a free NHL pick'em made by a fan. Pick any team, call each game (W, L or OTL) plus the combined goals, and race that team's fans up its own leaderboard. Earn Chiclets and badges along the way, and spend them on sweaters and borders.\n\nNo money, no betting, no ads, no app to download.\n\nPlay free: link in bio.\n\n" + TAGS),
    dict(when="Thu Oct 22 · afternoon", what="Game night", imgs=["03-gamenight-2026-10-22.png"],
         how="Post before the first game (4 PM your time). For any other night, ask Claude for that night's game-night picture.",
         cap="12 games tonight 🏒 Rangers at Leafs, Wild at Flames, Mammoth at Kraken and more.\n\nWho are you taking? Call the result and the total goals before puck drop. Link in bio.\n\n" + TAGS),
    dict(when="Fri Oct 23", what="Press Box 26.1", imgs=["02-pressbox-26-1.png"],
         how="A normal single-picture post.",
         cap="stickpicks 26.1 is live 🏒\n\nUpcoming Picks now goes day by day, the NHL News ticker has a new look, and the Championship border now comes in gold and your team colour. Plus a few fixes.\n\nEvery change is on the new Press Box page: link in bio.\n\n#NHL #hockey #hockeyfans"),
    dict(when="Sat Oct 24 or Sun Oct 25", what="Quick tip: OTL", imgs=["04-otl-tip.png"],
         how="A normal single-picture post.",
         cap="Quick tip: every game on stickpicks has three results, not two.\n\nThink your team loses in overtime or a shootout? That's OTL, and getting it right is worth a point. Every pick is called from your team's side.\n\nLink in bio.\n\n" + TAGS),
    dict(when="Any evening", what="Breakaway Reel (a short video)", imgs=["05-breakaway-reel-cover.png"],
         how="On your phone, open stickpicks.hockey/intermission.html and start a screen recording (iPhone: Control Center → Screen Recording; Android: Quick Settings → Screen record). Play for 15–30 seconds. In Instagram: New → Reel → choose the recording → trim → Next → Edit cover → Add from camera roll → choose this picture → paste the caption.",
         cap="Waiting for puck drop? Breakaway is a little hockey game on stickpicks: jump the pucks, duck the shots, beat your high score. 🏒\n\nFree, no download, works on your phone. Link in bio.\n\n#hockey #NHL #hockeyfans"),
    dict(when="Game nights · Story", what="Story: picks lock at puck drop", imgs=["06-story-picks-lock.png"],
         how='New → Story → choose this picture → tap the sticker icon → Link → paste the link below → place the sticker under "Tap the link". Stories disappear after 24 hours, so this one can be reused on any game night.',
         cap="stickpicks.hockey/?ref=instagram", label="Link for the sticker"),
]

def card(i, p):
    pics = "".join(f'<a href="instagram/png/{x}" target="_blank"><img src="instagram/png/{x}" alt=""></a>' for x in p["imgs"])
    e = html.escape
    return (f'<article class="post"><div class="when">{e(p["when"])} <span>· {e(p["what"])}</span></div>'
            f'<div class="pics">{pics}</div><p class="how">{e(p["how"])}</p>'
            f'<div class="capbox"><div class="capk">{e(p.get("label", "Caption"))}</div><div class="cap">{e(p["cap"])}</div>'
            f'<div class="foot"><span class="count">{len(p["cap"])} / 2,200 characters</span>'
            f'<button type="button" data-i="{i}">Copy</button></div></div></article>')

CSS = """
:root{--navy:#1C2B45;--red:#9B1C1F;--cream:#F4EDDC;--panel:#FBF7EE;--muted:#5D6473}
*{box-sizing:border-box} body{margin:0;background:var(--cream);color:var(--navy);font:16px/1.45 Barlow,system-ui,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:24px 16px 48px}
h1{font:700 1.6rem Oswald,sans-serif;text-transform:uppercase;margin:0 0 4px}
h2{font:700 1.15rem Oswald,sans-serif;text-transform:uppercase;letter-spacing:.03em;margin:30px 0 8px;border-bottom:3px double var(--navy);padding-bottom:4px}
.lede{font:italic .98rem "Libre Caslon Text",Georgia,serif;color:var(--muted);margin:0 0 6px}
.box,.capbox{background:var(--panel);border:2px solid var(--navy);border-radius:8px;padding:14px 16px;margin:10px 0}
table{border-collapse:collapse;width:100%} td{padding:6px 8px;border-top:1px solid #DDD3BF;vertical-align:top} td:first-child{font-weight:600;white-space:nowrap}
code{background:#efe6d2;padding:1px 5px;border-radius:3px}
.post{margin:22px 0} .when{font:600 .8rem Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--red);margin-bottom:8px} .when span{color:var(--muted)}
.pics{display:flex;gap:8px;overflow-x:auto} .pics img{height:300px;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.2);display:block}
.how{font-size:.95rem;margin:10px 0 0}
.capk{font:600 .72rem Oswald,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--red)}
.cap{white-space:pre-wrap;font-size:.97rem;margin-top:4px;overflow-wrap:anywhere}
.foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px} .count{font-size:.8rem;color:var(--muted)}
button{background:var(--navy);color:#EFE6D2;border:0;border-radius:4px;padding:6px 12px;font:600 .75rem Oswald,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}
button.done{background:#2E7D4F}
@media(max-width:560px){.pics img{height:220px}}
"""

SCRIPT = """
document.addEventListener("click",async e=>{const b=e.target.closest("button[data-i]");if(!b)return;const old=b.textContent;
 try{await navigator.clipboard.writeText(TEXTS[+b.dataset.i]);b.textContent="Copied ✓";b.classList.add("done");setTimeout(()=>{b.textContent=old;b.classList.remove("done")},1600)}
 catch(err){b.textContent="Select the text instead"}});
"""

def main():
    texts = [p["cap"] for p in POSTS] + [BIO]
    e = html.escape
    body = f"""<div class="wrap">
<h1>stickpicks on Instagram</h1>
<p class="lede">@stickpicks.hockey: profile settings, a first week of posts with their pictures and captions, and how to post each one. Captions say "link in bio" because Instagram links only work in the profile and in Story link stickers.</p>
<h2>1 · Profile</h2>
<div class="box"><table>
<tr><td>Username</td><td>stickpicks.hockey</td></tr>
<tr><td>Name</td><td>stickpicks</td></tr>
<tr><td>Picture</td><td>the "sp" app icon: <code>icon-512.png</code> from the site</td></tr>
<tr><td>Link</td><td><code>stickpicks.hockey/?ref=instagram</code> (visits show as Instagram in the Monday report)</td></tr>
<tr><td>Account</td><td>Professional → Creator (free; adds Insights)</td></tr>
<tr><td>Bio</td><td>{e(BIO)} <span class="count">({len(BIO)}/150)</span> <button type="button" data-i="{len(POSTS)}">Copy bio</button></td></tr>
</table></div>
<h2>2 · The first week</h2>
<p class="lede">Tap a picture to open it full size, then save it to your phone (press and hold → Save). The pictures are in <code>marketing/instagram/png/</code>.</p>
{''.join(card(i, p) for i, p in enumerate(POSTS))}
<h2>3 · Keeping it going</h2>
<div class="box"><ul>
<li><b>Game nights:</b> ask Claude for "an Instagram game-night picture for [date]". It's made from the real schedule.</li>
<li><b>Every Press Box update</b> gets an Instagram picture and caption too, as part of the update (style guide section 7).</li>
<li><b>Reply</b> to comments, and follow and comment on team and hockey accounts you like; that's how new accounts get found.</li>
<li>Never use NHL or team logos; team names in words are fine.</li>
</ul></div>
</div>"""
    page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>stickpicks Instagram starter kit</title>'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Barlow:wght@400;500;600&family=Libre+Caslon+Text:ital@1&display=swap">'
            f'<style>{CSS}</style></head><body>{body}<script>const TEXTS={json.dumps(texts)};{SCRIPT}</script></body></html>')
    out = os.path.join(os.path.dirname(HERE), "stickpicks-instagram-starter-kit.html")
    open(out, "w", encoding="utf-8").write(page)
    print("wrote", out, "| bio", len(BIO), "| captions", [len(t) for t in texts[:-1]])

if __name__ == "__main__":
    main()
