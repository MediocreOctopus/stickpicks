# stickpicks: NHL 2026–27 pick sheets

Pick sheets for all 32 NHL teams. Pick a team, then call every regular-season game a win, loss, or overtime loss, and guess the combined goals. Each sheet uses its team's colors, final scores fill in automatically, and leaderboards rank every sheet by points. A home page handles accounts and shows an NHL news ticker and the day's games. It's hosted free on GitHub Pages, with a Supabase database.

```
index.html                                  home page: sign-in, news ticker, today's games
sheet.html                                  the pick sheet for one team
rules.html                                  the rules and scoring explained, with examples
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
```

## How it works

Every 15 minutes, a GitHub Action downloads all 32 team schedules from the NHL's public feed and saves every game into your database, including start times, reschedules, postponements, and final scores. The same run saves the latest NHL headlines from ESPN's public news feed. The pages read from that database, so everything stays current without you editing anything.

- **Home page:** shows a scrolling NHL news ticker (hover over it to pause; each headline opens the full story on ESPN) and the day's games with start times or final scores. If there are no games today, it shows the next day that has games. Each upcoming game has **Pick** buttons that open that team's sheet scrolled to the game. Returning players get a **Continue** button for the last sheet they opened, a **Since your last visit** recap (points and results from games that went final since they were last here, and how their best rank moved), and **Up next on your sheets**: the next 3 days of games for every sheet they've started, with W / L / OTL and goals right in the list. On a computer, the **Pick Team** menu at the top of the page lists all 32 teams by division. On phones and in the app, a tab bar along the bottom of every page links Home, Pick Team, Leaders, Intermission, and Rules; Pick Team opens a page of team tiles (`teams.html`).
- **Look and feel:** the site dresses like an old-school hockey sweater. In light mode it's the cream "home sweater" with red and navy stripes; in dark mode it's the navy "road sweater". The logo (`logo.svg`) is "stickpicks" in script over a taped wooden stick. Each team's pick sheet keeps the stickpicks look and puts the team's colors in one banner at the top: sleeve stripes on the left, and hem stripes along the bottom that fill in as you make picks. Under it are the game rows, with W / L / OTL, a goals counter, the final score once a game ends, and a points badge (gold for +2). Download picks (CSV) and Clear all picks are in the sheet's **More** menu.
- **Profile:** the Me tab (phones) or your username (top bar) opens `profile.html`: your Est. date, points, best rank and sheets, plus settings to choose a profile picture, change your username, password and email, pick a Look (Auto, Home sweater, or Road sweater = dark mode), sign out, or delete your account. The Look choice is saved on the device and to your account. Other players can open your profile from the leaderboard (`profile.html?user=Name`): they see only your picture, username, Est. date, points, best rank and sheets, never your email, settings or Look.
- **Profile pictures:** choose a **sweater** (any team's jersey with a number from 0 to 99) or upload a **photo**. Photos are cropped square and shrunk to 256 pixels on your device before upload, and stored in Supabase Storage (the `avatars` space, which `schema.sql` creates). Each player can only add, replace or remove their own picture. Your picture appears on your profile, the Me tab, the top-bar account button, and next to your name on the leaderboard. Pictures are public, like usernames.
- **Install as an app:** the home page shows a "Get the stickpicks app" bar. On Android and in Chrome or Edge on a computer it has an **Install** button; on iPhone and iPad it explains how to use Share → **Add to Home Screen**. The installed app opens full screen from a script "sp" icon, and a long press on the icon offers shortcuts to the Leaderboard, Breakaway, and the Rules. Shared links show a preview image (`og-image.png`).
- **Works offline:** `sw.js` keeps a copy of the site on the device, so it opens quickly and still works without a connection. Pages always check for a newer version first. Offline, a notice appears at the top, team sheets show the last schedule they loaded, and picks are kept on the device until you're back online. Live scores, the leaderboard, and sign-in need a connection.
- **Intermission page:** has **Breakaway**, a hockey take on the endless-runner game: jump the pucks, cones, and nets, duck the slap shots, and try to beat your best score (saved in your browser). The skater wears the colors of the last team sheet you opened.
- **Rules page:** explains picks, scoring, shootouts, locking, and leaderboards, with worked examples and a short FAQ. It's linked from the home page, every sheet, and the leaderboard. Players sign in, create accounts, and manage their username here. Once signed in, they see their points, overall rank, and a shortcut to each sheet they've started.
- **Accounts:** players sign in with an email and password and stay signed in on that device until they sign out. After signing out, they sign back in with their password, with no email needed. "Forgot password?" emails a link to choose a new one.

- **Choosing a team:** pick a team on the home page, or switch teams with the menu in a sheet's header. You can link straight to one sheet with `?team=`. For example, `.../nhl-picks/sheet.html?team=TOR` opens the Maple Leafs sheet. Older links like `.../nhl-picks/?team=TOR` still work.
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
3. Your site will be live at `https://YOUR-GITHUB-NAME.github.io/nhl-picks/`.

### 4. Allow sign-in

In Supabase, go to **Authentication → URL Configuration**:

- Set **Site URL** to your GitHub Pages address.
- Under **Redirect URLs**, add the same address with `**` on the end, for example `https://YOUR-GITHUB-NAME.github.io/nhl-picks/**`. This covers account confirmation and password reset links.

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
- **Ties:** sheets with the same points share a rank.
- **Updates:** the page refreshes itself every minute and whenever you come back to its tab. Scores change when the 15-minute job records final results.
- **Locking:** both predictions lock at **puck drop**. The database enforces this, so nobody can change a pick after a game starts, even by editing the page. "Clear all picks" only clears games that haven't started yet.

When you're signed in, the home page account box lists your **Current Picks** (each sheet you've started, with its points) and a **Continue** button for the last sheet you opened. Your total points, best rank, and settings (including sign out) are on your profile page.

## Visitor stats

Every page loads [GoatCounter](https://www.goatcounter.com/) (stickpicks.goatcounter.com), a free, privacy-friendly visitor counter: no cookies and no personal data. Page addresses are counted without usernames (for example `sheet.html?team=SEA`). Visits from `localhost` aren't counted. See the numbers by signing in at https://stickpicks.goatcounter.com.

## Things to know

- **The NHL feed isn't official.** Schedules and scores come from `api-web.nhle.com`, which the NHL's own website uses but doesn't document publicly, so it could change without notice. If sheets stop updating, check the latest run in the **Actions** tab. If one team's schedule fails to download, the job skips it for that run, logs a warning, and tries again on the next run.
- **Keep the repository active.** GitHub pauses scheduled workflows in a public repository after 60 days without a commit. It emails you when that happens, and you can re-enable the workflow with one click from the **Actions** tab.
- **Supabase pauses idle projects.** Free projects pause after a week of inactivity. The 15-minute job should keep the database active during the season.
- **The team colors are approximate.** They're a best effort at each team's colors, not official brand values. No logos are used.
