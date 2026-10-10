# stickpicks: NHL 2026–27 pick sheets

Pick sheets for all 32 NHL teams. Pick a team, then call every regular-season game a win, loss, or overtime loss, and guess the combined goals. Each sheet uses its team's colors, final scores fill in automatically, and leaderboards rank every sheet by points. A home page handles accounts and shows an NHL news ticker and the day's games. It's hosted free on GitHub Pages, with a Supabase database.

**Live at [stickpicks.hockey](https://stickpicks.hockey/).** The old address, `mediocreoctopus.github.io/nhl-picks/`, forwards there automatically.

```
index.html                                  home page: sign-in, news ticker, today's games
sheet.html                                  the pick sheet for one team
rules.html                                  the rules and scoring explained, with examples
privacy.html                                the Privacy Policy and Terms of Use
badges.html                                 every badge, in groups (yours, or ?user=Name for another player's)
compare.html                                your sheet and another player's, side by side
intermission.html                           the Intermission page with the Breakaway game
game.js                                     Breakaway, the hockey mini-game
leaderboard.html                            the leaderboard
config.js                                   your Supabase URL and publishable key
teams.js                                    team names, colors, and shared helpers
styles.css                                  shared styles
supabase/schema.sql                         database tables and security rules
supabase/migrate-from-kraken-version.sql    optional, only if you set up the Kraken-only version
scripts/update-games.mjs                    syncs schedules, scores, and news headlines
.github/workflows/update-games.yml          runs that sync every 15 minutes
CNAME                                       the custom domain (stickpicks.hockey) for GitHub Pages
```

## How it works

Every 15 minutes, a GitHub Action downloads all 32 team schedules from the NHL's public feed and saves every game into your database, including start times, reschedules, postponements, and final scores. The same run saves the latest NHL headlines from ESPN's public news feed. The pages read from that database, so everything stays current without you editing anything.

- **Home page:** shows a scrolling NHL news ticker (hover over it to pause; each headline opens the full story on ESPN) and the day's games with start times or final scores, opening on today. Swipe sideways, or use the ‹ › buttons, to move one day forward or back (days without NHL games say so), from the first day of the season's schedule to the last, including earlier days' final scores. Each upcoming game has **Pick** buttons that open that team's sheet scrolled to the game. Returning players get a **Since your last visit** recap (points and results from games that went final since they were last here, and how their best rank moved), and **Upcoming Picks**: the next 3 days of games for every sheet they've started, grouped under day headers, with W / L / OTL and goals right in the list. On a computer, the **Pick Team** menu at the top of the page lists all 32 teams by division. On phones and in the app, a tab bar along the bottom of every page links Home, Pick Team, Leaders, Intermission, and Rules; Pick Team opens a page of team tiles (`teams.html`).
- **Look and feel:** the site dresses like an old-school hockey sweater. In light mode it's the cream "home sweater" with red and navy stripes; in dark mode it's the navy "road sweater". The logo (`logo.svg`) is "stickpicks" in script over a taped wooden stick, with a hockey puck dotting the second "i". Each team's pick sheet keeps the stickpicks look and puts the team's colors in one banner at the top: sleeve stripes on the left, and hem stripes along the bottom that fill in as you make picks. Under it are the game rows, with W / L / OTL, a goals counter, the final score once a game ends, and a points badge (gold for +2). Download picks (CSV) and Clear all picks are in the sheet's **More** menu.
- **Profile:** the Me tab (phones) or your username (top bar) opens `profile.html`: your Est. date, points, best rank and sheets, plus settings to choose a profile picture, change your username, password and email, pick a Look (Auto, Home sweater, or Road sweater = dark mode), sign out, or delete your account. The Look choice is saved on the device and to your account. Other players can open your profile from the leaderboard (`profile.html?user=Name`): they see only your picture, username, Est. date, points, best rank and sheets, never your email, settings or Look.
- **Profile pictures:** choose a **sweater** (any team's jersey with a number from 0 to 99) or upload a **photo**. Photos are cropped square and shrunk to 256 pixels on your device before upload, and stored in Supabase Storage (the `avatars` space, which `schema.sql` creates). Each player can only add, replace or remove their own picture. Your picture appears on your profile, the Me tab, the top-bar account button, and next to your name on the leaderboard. Pictures are public, like usernames.
- **Install as an app:** the home page shows a "Get the stickpicks app" bar. On Android and in Chrome or Edge on a computer it has an **Install** button; on iPhone and iPad it explains how to use Share → **Add to Home Screen**. The installed app opens full screen from a script "sp" icon, and a long press on the icon offers shortcuts to the Leaderboard, Breakaway, and the Rules. Shared links show a preview image (`og-image.png`).
- **Works offline:** `sw.js` keeps a copy of the site on the device, so it opens quickly and still works without a connection. Pages always check for a newer version first. Offline, a notice appears at the top, team sheets show the last schedule they loaded, and picks are kept on the device until you're back online. Live scores, the leaderboard, and sign-in need a connection.
- **Intermission page:** a sweater banner, then **Breakaway** (`game.js`), a hockey take on the endless-runner game: jump the pucks, cones and nets, duck the shots. It gets harder by period (1st, 2nd and 3rd at 0, 300 and 700 points, then overtime at 1,200; the period shows on the scoreboard and is called out when it changes): more obstacles with tighter, steadier gaps, faster shots, and more you can only duck (slap shots at head height, "point shots" stacked too high to jump, and combos where a shot arrives just after you land a jump). Shots flash a red warning at the edge of the rink first, and the timing always leaves room to land before ducking and to stand up before jumping. Speed and scoring are unchanged, so scores stay comparable. (On a local preview only, ``window.breakaway.test`` can jump to a score and report what's on the ice, for testing.) It's drawn in the stickpicks look (navy stands with rafter banners, boards with stickpicks and BREAKAWAY ads, a navy-and-gold scoreboard) with an NHL skater in full gear (helmet and visor, sweater with hem and sleeve stripes and your sweater number, breezers, striped socks, skates, two hands on a wooden stick), in the colours of the last team sheet you opened. Signed-in players' runs post to the database (`submit_breakaway()`, which rejects scores that are impossible for how long the run lasted, and runs that arrive faster than they could be played). Below the game: **Breakaway leaders** (top 10 best scores this season, `breakaway_board()`) and your **Breakaway badges**.
- **Rules page:** explains picks, scoring, shootouts, locking, and leaderboards, with worked examples and a short FAQ. It's linked from the home page, every sheet, and the leaderboard. Players sign in, create accounts, and manage their username here. Once signed in, they see their points, overall rank, and a shortcut to each sheet they've started.
- **Accounts:** players sign in with an email and password and stay signed in on that device until they sign out. After signing out, they sign back in with their password, with no email needed. "Forgot password?" emails a link to choose a new one.

- **Choosing a team:** pick a team on the home page, or switch teams with the menu in a sheet's header. You can link straight to one sheet with `?team=`. For example, `https://stickpicks.hockey/sheet.html?team=TOR` opens the Maple Leafs sheet. Older links like `https://stickpicks.hockey/?team=TOR` still work.
- **Picks:** each team's sheet has its own separate picks. The same game can have different picks on two sheets, such as the Kraken's sheet and the Flames' sheet.
- **Times:** start times are shown in whatever time zone the viewer's device uses.
- **Colors:** team colors are set in the `TEAMS` list inside `teams.js`. Each team has a `board` color (header background), an `accent` color (highlights), and a `brand` color (buttons and row shading). Change any of them there. The page automatically checks contrast and falls back to white or black text where a color wouldn't be readable.

## Setup (about 20 minutes)

### 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL**, which looks like `https://abcdxyz.supabase.co`
   - the **publishable key**, which starts with `sb_publishable_` (older projects call it the `anon` key)
   - the **secret key**, which starts with `sb_secret_` (older projects call it the `service_role` key). **Keep this one private.** It only goes into GitHub secrets.

### 2. Connect the pages

Open `config.js` and replace the placeholders with your Project URL and publishable key. Both pages read from this one file. These two values are safe to publish, because the database rules only let each signed-in person read and change their own picks.

### 3. Publish on GitHub Pages

1. Create a **public** GitHub repository, for example `nhl-picks`, and upload everything in this folder. Keep the folder structure, and make sure the hidden `.github` folder is included.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`, and click **Save**.
3. Your site will be live at `https://YOUR-GITHUB-NAME.github.io/nhl-picks/`. To use your own domain instead, see [Custom domain](#custom-domain) below.

### 4. Allow sign-in

In Supabase, go to **Authentication → URL Configuration**:

- Set **Site URL** to your site's address (stickpicks uses `https://stickpicks.hockey/`).
- Under **Redirect URLs**, add the same address with `**` on the end, for example `https://stickpicks.hockey/**` or `https://YOUR-GITHUB-NAME.github.io/nhl-picks/**`. This covers account confirmation and password reset links.

Then open your home page, choose **Create account**, and enter a username, email, and password. Supabase emails a confirmation link once. After you open it, you sign in with your email and password from then on.

**About emails:** Supabase's built-in email service only sends a few emails per hour, and both account confirmations and password resets count toward that limit. If friends are joining, you have two options. You can turn off **Confirm email** under **Authentication → Sign In / Providers → Email**, so new accounts can sign in right away with no email at all. Or you can connect your own email service under **Authentication → Emails → SMTP Settings** for higher limits.

**Optional:** after you've signed in once, you can turn off **Allow new users to sign up** under **Authentication → Sign In / Providers**. Leave it on if you want friends to be able to join the leaderboard.

### 5. Load the schedules and turn on score updates

1. In GitHub, go to **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_SECRET_KEY`: your secret key
2. Open the **Actions** tab, enable workflows if GitHub asks, select **Update NHL games**, and click **Run workflow**.
3. When the run shows a green check, its log should say something like "Saved 1344 games." Reload your page and every team's schedule will be there.

From then on, the workflow runs every 15 minutes, and scores usually appear within about 15–30 minutes of the final horn.

### Already set up an earlier version?

1. Run the updated `supabase/schema.sql` again in the SQL Editor. It adds anything new, including the combined-goals column and the new leaderboard, without touching your existing games, picks, or usernames.
2. Upload the new and changed files to your repository: `index.html`, `sheet.html`, `leaderboard.html`, `styles.css`, `teams.js`, `scripts/update-games.mjs`, and `.github/workflows/update-games.yml`. Keep your existing `config.js`, which already has your Supabase URL and key.
3. Run the **Update NHL games** workflow once from the **Actions** tab so the news ticker fills in.

If you signed up with emailed sign-in links, you're still signed in. To be able to sign back in after signing out, choose **Forgot password?** on the home page once and set a password.

### Coming from the Kraken-only version?

Run `schema.sql` first, then run the workflow once so the games are loaded. After that, run `supabase/migrate-from-kraken-version.sql` to copy your existing Kraken picks onto the new Kraken sheet. That file also includes optional lines to remove the old tables once you've checked the copy.

## Scoring and the leaderboard

For each game on a sheet, a player makes two predictions: the outcome (W, L, or OTL) and the combined goals for both teams. Once the game is final, each one is worth **1 point**, so a game is worth up to **2 points**. Either prediction can be left blank.

- **Outcome:** **W** means the sheet's team won in regulation, overtime, or a shootout. **L** means it lost in regulation. **OTL** means it lost in overtime or a shootout.
- **Combined goals:** the guess must match the official final score exactly. For example, a 4–2 game has 6 goals. A shootout counts as one goal for the winner, as it does in the official score, so a game that's 2–2 after overtime and ends in a shootout is 3–2, or 5 goals.

On each sheet, every row uses − and + buttons (or typing) to set the goal total. Once a game is final, the row shows the result, the score, the goal total, and how many points the pick earned. The sheet's header shows your score with results and goals counted separately.

To appear on the leaderboard, a player needs a username (3–20 letters, numbers, or underscores, and unique). New players choose one when they create an account, and anyone can change theirs later from Settings on their profile page. Leaderboards show usernames, never email addresses.

- **Every sheet is ranked on its own.** A player who fills out the Kraken and Maple Leafs sheets has two separate entries, one for each team. Points are never added together across sheets.
- **Team leaderboards:** choose a team to see everyone's sheets for that team.
- **All teams:** shows every sheet for every team in one ranking, with a team column, so the same player can appear more than once. Use the team menu at the top to switch to one team's leaderboard.
- **Columns:** points, then correct results and exact goal totals, each shown as hits out of graded picks.
- **Viewing sheets:** click any player on a leaderboard to open that sheet in view-only mode. Picks for games that have started are shown, along with the points each one earned. Picks for upcoming games stay hidden until puck drop, and the sheet shows only that a pick was made. The database enforces this, so it can't be worked around from the page. Clicking your own entry opens your normal, editable sheet. From someone else's sheet, **Compare side by side** opens `compare.html`, which lines up your picks and theirs for the same team, game by game. It shows both point totals, the result and goals hit rates, who won each finished game, and how many picks you agree on. It can filter to finished games, upcoming games, or only the games where your picks differ. Their upcoming picks stay hidden there too.
- **Season, Month or Week:** a switch in the leaderboard banner shows the whole season, one calendar month, or one week (Monday to Sunday). Monthly and weekly boards count only games played in that window, so everyone starts level; ‹ › steps back to earlier months and weeks, as far as the season's first game. The address keeps the choice (for example `leaderboard.html?period=week&from=2026-10-05`). The database does the counting (`leaderboard()` takes optional `p_from` and `p_to` dates).
- **Ties:** sheets with the same points share a rank.
- **Updates:** the page refreshes itself every minute and whenever you come back to its tab. Scores change when the 15-minute job records final results.
- **Locking:** both predictions lock at **puck drop**. The database enforces this, so nobody can change a pick after a game starts, even by editing the page. "Clear all picks" only clears games that haven't started yet.

When you're signed in, the home page account box lists your **Current Picks** (each sheet you've started, with its points) and **Badges in reach**: progress bars for the three badges you're closest to earning, easiest first. If you haven't made a pick yet, it shows a **Pick Now** button (to the Pick Team page) and the Rookie and 2026–27 Season badges instead. Your total points, best rank, and settings (including sign out) are on your profile page.

## Sharing and invitations

Players can share how they're doing and invite friends:

- **Share my results** in "Since your last visit" on the home page (after a run with points, or a climb up the board).
- **Share my spot** in the "Your standing" card on the leaderboard, for whichever board and time frame is showing; the link opens that same board.
- **Share** on the "New badge" pop-up, and under each badge you've earned on your profile.
- **Invite friends** on the home page, your profile and the leaderboard. Invitation links look like `https://stickpicks.hockey/?invite=Name`, and the home page then greets the visitor with "Name invited you".

Each share draws a 1200 × 630 picture card in the browser (road-sweater navy with sleeve and hem stripes, the logo, the news, and stickpicks.hockey), then opens the phone's or computer's own share sheet with the picture, a line of text and a link. Browsers without a share sheet get a stickpicks share box instead: Copy link, Email, WhatsApp, X, Facebook, Instagram, TikTok and Save picture (Instagram and TikTok have no link-sharing address, so those buttons save the picture, copy the caption and open the site ready to post). It's all in `teams.js` (`shareButton()`, `drawCard()`, `inviteSpec()`, `badgeSpec()`), with no database changes. GoatCounter counts shares (`share-result`, `share-badge`, `share-standing`, `share-invite`) and arrivals from invitations (`invite-landing`) as events, without usernames.

## Puck-drop reminders

Players can turn on **Puck-drop reminders** in Settings on their profile (each device separately). About an hour before puck drop, if a game on one of their sheets doesn't have both a result and goals picked, they get one notification ("Kraken at Red Wings starts in 45 min. Your pick isn't in yet."); tapping it opens Upcoming Picks on the home page. Each game is announced once.

- Works in Chrome, Edge, Firefox and Safari, and in the installed app. On iPhone and iPad it only works in the installed app (Share → Add to Home Screen), iOS 16.4 or newer.
- The **Update NHL games** workflow sends them right after each 15-minute sync (`scripts/send-reminders.mjs`).
- Setup (once): the workflow needs a repository secret named `VAPID_PRIVATE_KEY` (the private half of the push key pair; the public half is in `config.js` and the workflow file). Without it, reminders are simply skipped. If you ever replace the key pair, update all three places; everyone then turns reminders on again.

## Badges and streaks

Profiles show a **Hot streak** (results right in a row across all sheets, plus the best run) and 49 **badges**, drawn as old-school felt sweater patches: navy rings for everyday badges, red for scoring, gold for rare ones. A pop-up on the home page announces new badges. The profile shows a trophy case of your **5 rarest** badges (gold rings first, then red, then navy; hardest first within a ring), the 3 you're closest to under **Next up**, and **See all badges**, which opens `badges.html`. That page lists all of them in 9 groups (Getting started, Calling games, Streaks, Habits, Collector, Big games, Leaderboard honours, Breakaway, Social), each with its own count, plus All / Earned / Not yet filters. Tap a patch for a card with how to earn it, a progress bar, and Share for badges you've earned. `badges.html?user=Name` shows another player's, and `&badge=id` opens one badge's card. The groups are `BADGE_GROUPS` in `teams.js`.

| Badge | How to earn it |
|---|---|
| Inaugural Season | Create your stickpicks profile (the banner shows the year you joined) |
| Rookie | Make your first pick |
| 2026–27 Season | Make a pick in the 2026–27 season |
| Hat Trick | A W, an L and an OTL all called right on one sheet |
| 3rd Star | 3 results right in a row on one sheet |
| 2nd Star | 5 results right in a row on one sheet |
| 1st Star | 10 results right in a row on one sheet |
| Top Shelf | Result and exact goals right in the same game |
| Lamp Lighter | Exact combined goals 5 times |
| Shutout | Every result right on a night with 3+ of your games |
| Overtime Hero | A correct OTL call |
| Shootout Ace | Result right in a game decided by a shootout |
| Full Sheet | Every game on a sheet picked, result and goals |
| Original Six | Sheets for BOS, CHI, DET, MTL, NYR and TOR |
| Barnstormer | Sheets in all four divisions |
| Point Streak | At least a point in 10 straight finished games |
| Captain | #1 on a team leaderboard at the end of any game day (it stays, even if you drop later) |
| MVP | #1 on the All-Teams leaderboard when the regular season ends (ties share it) |
| Player of the Week | #1 on the All-Teams weekly board when a week (Mon–Sun) ends |
| Player of the Month | #1 on the All-Teams monthly board when a month ends |
| Dynasty | Player of the Week 3 times |
| Iron Man | Picks on games in 4 weeks in a row |
| Early Bird | 10 picks made at least a day before puck drop |
| Buzzer Beater | A right result picked in the last 5 minutes before puck drop |
| Full Slate | Every game on all your sheets fully picked for a whole week (3+ games) |
| Half Season | Half of a team's games picked on one sheet |
| Opening Night | A pick on the season's first night of games |
| Winter Classic / Heritage Classic / Stadium Series / Global Series | A pick on that game (found from neutral-site games: outdoor stadiums around New Year's, the fall outdoor game in Canada, other outdoor games Jan–Mar, and games overseas) |
| Rivalry Night | Sheets for both sides of a rivalry (Battle of Alberta, Battle of Ontario, Battle of Pennsylvania, and more) |
| Natural Hat Trick | 2-point games (result and exact goals) 3 in a row on one sheet |
| Road Warrior | 5 road wins called right |
| Goal Fest | Exact goals in a game with 9+ goals |
| Goalie Duel | Exact goals in a game with 3 or fewer goals |
| Perfect Week | Every result right in a week with 5+ of your games |
| O, Canada | Sheets for all 7 Canadian teams |
| Division Champ | Sheets for every team in one division |
| Commissioner | Sheets for all 32 teams |
| 100pt Player | 100 points on one sheet in a season |
| Recruiter | A friend you invited creates an account |
| First Shift | Play a game of Breakaway while signed in |
| Dangler / Deke Master / Coast to Coast / Highlight Reel | Score 250 / 500 / 1,000 / 2,000 in Breakaway |
| Rink Rat | Play 50 games of Breakaway |
| Breakaway Champ | Hold the #1 score on the Breakaway leaderboard (it stays) |

Badges are worked out in the browser from picks and final scores (`BADGES` and `computeBadges()` in `teams.js`), so changing a rule or adding a badge needs no database change. The exceptions depend on everyone's results over time, or on when picks were made, so the database works them out (`badge_honours()` in `schema.sql`, section 16): Captain (it replays the season one game day at a time to find every sheet that has held a #1 spot), MVP (only once every regular-season game is final), Player of the Week and Month (finished weeks and months only), Early Bird and Buzzer Beater (from when each pick was last changed), Recruiter (from the private `invites` table, section 14, filled in when someone who arrived from an invitation link makes their profile), and the Breakaway badges (from `breakaway_scores`, section 15). Badges about games (Iron Man, Full Slate, Opening Night, the big-game badges) count only games that have started, so filling a sheet in advance doesn't earn them early. On another player's profile only picks for games that have started count, so their upcoming picks stay hidden.
## Visitor stats

Every page loads [GoatCounter](https://www.goatcounter.com/) (stickpicks.goatcounter.com), a free, privacy-friendly visitor counter: no cookies and no personal data. Page addresses are counted without usernames (for example `sheet.html?team=SEA`). Visits from `localhost` aren't counted. See the numbers by signing in at https://stickpicks.goatcounter.com.

## Custom domain

stickpicks lives at **stickpicks.hockey**, registered at Porkbun (bought October 2026). Here's how it's connected, in case it ever needs redoing or the site moves to another domain:

1. **DNS (at Porkbun, Domain Management → DNS):** four `A` records for the domain itself (Host left blank) pointing to GitHub's servers `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`, plus the matching `AAAA` records, and a `CNAME` record for `www` pointing to `mediocreoctopus.github.io`. Porkbun's **Quick DNS Config → GitHub** adds these in one step. Porkbun's parking records (pointing to `pixie.porkbun.com`) must be deleted.
2. **GitHub:** **Settings → Pages → Custom domain** is set to `stickpicks.hockey`, with **Enforce HTTPS** ticked. Saving the domain there creates the `CNAME` file in the repository; don't delete it.
3. **Supabase:** **Authentication → URL Configuration** has the new address as the Site URL and in Redirect URLs (see step 4 of Setup).
4. **Full web addresses in the code:** every page's `og:image` (the link-preview picture) and `SITE_URL` in `scripts/send-reminders.mjs` use `https://stickpicks.hockey/`. Every other link on the site is relative, so it works on any address.

Browsers treat a new address as a separate site, so after a move, players sign in once more, turn puck-drop reminders back on, and re-add the app to their Home Screen. Their picks are stored online and carry over.

## Privacy Policy and Terms

`privacy.html` holds both, in plain language: what's collected (email, password, username, picks, picture, Look, reminder sign-ups), what other players can see, what stays on the device, the services involved (Supabase, GitHub Pages, Google Fonts, jsDelivr, GoatCounter, browser push services), account deletion, the 13+ age limit, and the terms (free fan game with no prizes, not affiliated with the NHL, fair play, scores can be corrected, provided as is). It's linked from every footer, the Create account form and profile Settings. **Keep it in sync** when the site starts collecting something new or uses a new service, and update the date in its banner. Contact goes through the repository's GitHub Issues page.

## Things to know

- **The NHL feed isn't official.** Schedules and scores come from `api-web.nhle.com`, which the NHL's own website uses but doesn't document publicly, so it could change without notice. If sheets stop updating, check the latest run in the **Actions** tab. If one team's schedule fails to download, the job skips it for that run, logs a warning, and tries again on the next run.
- **Keep the repository active.** GitHub pauses scheduled workflows in a public repository after 60 days without a commit. It emails you when that happens, and you can re-enable the workflow with one click from the **Actions** tab.
- **Supabase pauses idle projects.** Free projects pause after a week of inactivity. The 15-minute job should keep the database active during the season.
- **The team colors are approximate.** They're a best effort at each team's colors, not official brand values. No logos are used.
