# Press Box style guide

How stickpicks names, groups, writes up and announces site updates. **Press Box** is the public page
(`pressbox.html`) where players read what's new. This guide is for whoever ships an update, Claude included:
follow it every time.

## 1. Version numbers

Every update players can see gets a version: **season year, a dot, then a number.**

- The first part is the year the NHL season *starts*: **26** = the 2026–27 season, **27** = 2027–28. It matches
  `SEASON` in `config.js` (`"20262027"` → 26).
- The second part counts up through that season: **26.1, 26.2, 26.3 …** There is no limit (26.10, 26.11 are fine).
- The season year goes up at the yearly switch-over (July 1 reminder). The first update of a season is **.0**, and
  it is always a named update (see below). If nothing big is ready, call it the season opener: *27.0 "Opening Night"*.
- Versions never repeat or go backwards, and a published version is never renumbered.

## 2. The rule: every site update gets a Press Box entry

**Every push that changes something players can see or use gets a new Press Box entry in the same push**, with its
own version number. No exceptions: a push with one small fix is still an update (a numbered update with a single
**Fixed** line). Pushes that only touch behind-the-scenes files (section 3, "Out") don't get an entry.

**Every new Press Box entry gets social media posts** (section 7), drafted when the entry is written, each linking to
that entry on Press Box.

| Kind | Looks like | When | Extra steps |
|---|---|---|---|
| **Named** | **27.0 "League Play"** | A big feature set, a few times a year at most | Previews first, a short intro, a GitHub release |
| **Numbered** | **26.4** | Every other push that players will notice: new features, improvements, fixes | Previews for anything visual |

Group changes where it's sensible: collect small ones for a week or two and push them together as one numbered update,
rather than pushing (and posting) each the moment it's ready. An urgent fix ships at once, as its own numbered update.

**Named updates:** one or two words, Title Case, hockey-flavoured where it fits naturally (*League Play*,
*Opening Night*, *Second Season*). Never a pun that hides what the update is.

## 3. What goes on Press Box, and what doesn't

**In:** anything a player can see or feel: new pages and features, changed layouts, new badges or shop items, rule
or scoring changes, fixes for bugs players could have run into, privacy or terms changes (also update the date on
`privacy.html`).

**Out:** behind-the-scenes work players never notice: workflows, backups, monitoring, email setup, search-engine
tags, code tidying, notes files. These still get a good commit message, just no Press Box line.

**Rule changes** always go on Press Box, even if small, and say exactly what changed and from when
(*"From Nov 1, an exact goals pick is worth 2 points"*). Scoring is never changed mid-week.

## 4. Writing an entry

Each entry has: version, optional name, date, an optional short intro (required for named updates; same rules, no "you"), then
lines tagged **New**, **Improved** or **Fixed**, in that order.

- **Write for players, not developers.** Say what changed, in plain words. No code words (cache, database, deploy,
  component, bug ID).
- **No "you", "your" or "you're".** Describe the site, not the reader: *"Sweater numbers sit higher"*, not *"Your
  sweater number now sits higher"*. Short instructions are fine as commands: *"Swipe or tap the arrows."* No "we"
  either.
- **Concise and to the point.** One idea per line, one short sentence where possible, two at most. Cut filler
  ("now you can", "we're happy to", "just").
- **Point the way.** Say where it is: *"on the home page"*, *"in the Locker Room"*.
- **Friendly and plain, not hype.** No "exciting", "huge", "revolutionary", no exclamation marks in lines (one in an
  intro is fine).
- **Brand:** always lowercase **stickpicks**, even at the start of a sentence. Team names in words; never NHL or team
  logos.
- **Never** anything that sounds like money, betting, odds or gambling. Chiclets are "earned", never "won" or
  "bought with money".
- **Fixed lines** say what works now, in plain terms: *"Past days with no picks now say 'Nothing picked'."* Don't
  blame players or devices.
- **Dates** on the page read like *October 21, 2026*. In `pressbox.js` they're written `"2026-10-21"`.

Good: *New: Upcoming Picks on the home page now shows one day at a time. Swipe or tap the arrows to change days.*
Not this: *You can now swipe through your upcoming picks!* (second person, hype)
Not this: *Implemented day-strip carousel for #upnext with upIdx state.* (code words)

## 5. The routine (every update)

1. Collect the changes on a short list as they're made.
2. Show previews of anything visual and get a yes.
3. Add the entry to the **top** of `PRESS_BOX` in `pressbox.js` (format below), dated the day it goes live. It goes
   in the **same push** as the changes.
4. Draft the social media posts for the entry (section 7) and hand them over with the push.
5. Set `PRESS_BOX_LATEST` in `teams.js` to the new version, then push. The safety checks before every deploy check
   the entries (section 6).
6. Check the live site, including the new entry on Press Box and its link.
7. Post the drafts once the entry is live (the links only work after the push).
8. **Named updates:** also a GitHub release with the same version and notes.

## 6. Adding an entry (`pressbox.js`)

Newest first. Copy the shape of the entry below it:

```js
{
  version: "26.2",
  name: "",                       // "" for numbered updates; "League Play" for named ones
  date: "2026-11-04",
  intro: "",                      // one sentence; required when there's a name
  items: [
    ["new", "Line one."],
    ["improved", "Line two."],
    ["fixed", "Line three."],
  ],
},
```

Then set `PRESS_BOX_LATEST` in `teams.js` to the new version. It lights the small red **New** dot on the Press Box
link in every page's footer for returning players until they've opened Press Box.

The safety checks before every deploy (`scripts/check_site.py`) stop the deploy if: versions are out of order or
repeated, a date isn't written like `"2026-10-21"`, a tag isn't new/improved/fixed or the lines aren't in that order,
a named update has no intro, a season's .0 has no name, any line says "you", "your", "you're" or "we",
`PRESS_BOX_LATEST` doesn't match the newest entry, or a page's footer is missing the Press Box link.

## 7. Social media posts for each entry

Draft one post per social media account for **every** new entry. Accounts today:

| Account | Limit | Link tag |
|---|---|---|
| Bluesky · @stickpicks.hockey | 300 characters (link and emoji included) | `?ref=bluesky` |

When a new account is added (Instagram, Threads, X, TikTok…), add a row here with its limit and its own `?ref=` tag,
and draft for it from then on.

**The link** goes straight to the entry: `stickpicks.hockey/pressbox.html?ref=bluesky#v26.1` (the `?ref=` tag before
the `#`, so visits show up by account in the Monday report). The `#v26.1` part opens the page at that entry.

**Writing the post:**
- Lead with the one or two changes players will care about most; don't list every line.
- Same brand rules as Press Box: lowercase stickpicks, no hype, nothing about money or betting.
- Unlike Press Box entries, posts can talk to the reader ("Pick tonight's games…"), matching the account's usual
  voice; keep them short.
- Named updates: say the name and version (*"27.0 League Play is here"*). Numbered updates: *"stickpicks 26.4:"*.
- Fit each account's limit, and check the count before handing it over.
- If the post goes out on a game day, it can mention tonight's games, but the update stays the main point.

