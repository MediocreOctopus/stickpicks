"""Writes marketing/stickpicks-social.ics: when each automatic social post (scripts/social.py) should go out, for the
rest of the regular season, to import into the "stickpicks social" Google Calendar.

Uses the same rules as social.py and the times social.yml runs (every hour at :20, 13:20 to 01:20 UTC):
  - "Last night" recap: the first run from 9am Eastern, the morning after a night with 4+ games.
  - Game night: the first run in the 4 hours before the first puck drop (not the run that posted the recap).
Press Box posts follow deploys, so they can't be on the calendar. GitHub can start runs a little late, and a post is
skipped when the owner already posted one by hand that day.

  python scripts/social_calendar.py              # from tomorrow to the end of the regular season
  python scripts/social_calendar.py 2026-11-01   # from that date
"""
import datetime, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "marketing", "stickpicks-social.ics")
UA = {"User-Agent": "stickpicks-calendar (https://stickpicks.hockey)"}
RUN_HOURS = list(range(13, 24)) + [24, 25]   # UTC hours of the :20 runs (24, 25 = 00:20, 01:20 the next day)

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)

def eastern(t):
    """UTC → US Eastern (DST from the 2nd Sunday of March to the 1st Sunday of November, at 2am local)."""
    y = t.year
    start = datetime.datetime(y, 3, 8 + (6 - datetime.date(y, 3, 8).weekday()) % 7, 7)
    end = datetime.datetime(y, 11, 1 + (6 - datetime.date(y, 11, 1).weekday()) % 7, 6)
    return t - datetime.timedelta(hours=4 if start <= t < end else 5)

def season(start):
    """{date: [first puck drop UTC, number of games]} for regular-season games from `start`."""
    days, d = {}, start
    while True:
        week = get(f"https://api-web.nhle.com/v1/schedule/{d}")
        for day in week["gameWeek"]:
            gs = [g for g in day["games"] if g.get("gameType") == 2 and g.get("gameScheduleState", "OK") == "OK"]
            if gs:
                days[day["date"]] = (min(datetime.datetime.fromisoformat(g["startTimeUTC"].replace("Z", "")) for g in gs), len(gs))
        nxt = week.get("nextStartDate")
        if not nxt or not week["gameWeek"] or all(not day["games"] for day in week["gameWeek"]) and days: break
        if any(g.get("gameType") == 3 for day in week["gameWeek"] for g in day["games"]): break
        d = nxt
    return days

def runs(day):
    base = datetime.datetime.combine(day, datetime.time())
    return [base + datetime.timedelta(hours=h, minutes=20) for h in RUN_HOURS]

def event(uid, start, title, desc):
    stamp = lambda t: t.strftime("%Y%m%dT%H%M%SZ")
    desc = desc.replace("\n", "\\n").replace(",", "\\,")
    return ["BEGIN:VEVENT", f"UID:{uid}@stickpicks.hockey", f"DTSTAMP:{stamp(datetime.datetime.now(datetime.timezone.utc))}",
            f"DTSTART:{stamp(start)}", f"DTEND:{stamp(start + datetime.timedelta(minutes=15))}",
            f"SUMMARY:{title}", f"DESCRIPTION:{desc}", "TRANSP:TRANSPARENT", "END:VEVENT"]

INSTA = ("Instagram: an email arrives under the Instagram label in Gmail with the picture and caption to post.\n"
         "Skipped if a post like this went up by hand earlier that day. GitHub can run a few minutes late.")

def main():
    start = datetime.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else datetime.date.today() + datetime.timedelta(days=1)
    days = season(start - datetime.timedelta(days=1))
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//stickpicks//social calendar//EN", "CALSCALE:GREGORIAN",
             "X-WR-CALNAME:stickpicks social"]
    n = 0
    d = start
    last = max(datetime.date.fromisoformat(k) for k in days) + datetime.timedelta(days=1)
    while d <= last:
        recap_run = None
        yday = days.get((d - datetime.timedelta(days=1)).isoformat())
        if yday and yday[1] >= 4:
            recap_run = next((r for r in runs(d) if 9 <= eastern(r).hour < 15), None)
            if recap_run:
                lines += event(f"recap-{d}", recap_run, "📸 stickpicks: Last night recap post",
                               f"Bluesky: the finals from last night's {yday[1]} games post automatically.\n{INSTA}")
                n += 1
        today = days.get(d.isoformat())
        if today:
            first, count = today
            slate = next((r for r in runs(d) if first - datetime.timedelta(hours=4) <= r < first - datetime.timedelta(minutes=10)
                          and r != recap_run), None)
            if slate:
                puck = eastern(first).strftime("%I:%M %p").lstrip("0")
                lines += event(f"slate-{d}", slate, f"📸 stickpicks: Game-night post ({count} game{'s' if count != 1 else ''})",
                               f"Bluesky: tonight's {count} game{'s' if count != 1 else ''} post automatically (first puck drop {puck} ET).\n{INSTA}")
                n += 1
        d += datetime.timedelta(days=1)
    lines.append("END:VCALENDAR")
    with open(OUT, "w", encoding="utf-8", newline="\r\n") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{n} posts from {start} to {last}: {os.path.relpath(OUT, ROOT)}")

if __name__ == "__main__":
    main()
