# NHL 2026–27 prediction sheets

Prediction sheets for all 32 NHL teams. Pick a team, then call every regular-season game a win, loss, or overtime loss. Each sheet uses its team's colors, and final scores fill in automatically. It's hosted free on GitHub Pages, with a Supabase database.

```
index.html                                  the sheets and the team picker
supabase/schema.sql                         database tables and security rules
supabase/migrate-from-kraken-version.sql    optional, only if you set up the Kraken-only version
scripts/update-games.mjs                    syncs schedules and scores from the NHL feed
.github/workflows/update-games.yml          runs that sync every hour
```

## How it works

Schedules aren't built into the page anymore. Once an hour, a GitHub Action downloads all 32 team schedules from the NHL's public feed and saves every game into your database, including start times, reschedules, postponements, and final scores. The page reads from that database, so the schedule stays current without you editing anything.

- **Choosing a team:** open the page and pick a team, or switch teams with the menu in the header. The page remembers your last team, and you can link straight to one sheet with `?team=`. For example, `.../nhl-picks/?team=TOR` opens the Maple Leafs sheet.
- **Picks:** each team's sheet has its own separate picks. The same game can have different picks on two sheets, such as the Kraken's sheet and the Flames' sheet.
- **Times:** start times are shown in whatever time zone the viewer's device uses.
- **Colors:** team colors are set in the `TEAMS` list inside `index.html`. Each team has a `board` color (header background), an `accent` color (highlights), and a `brand` color (buttons and row shading). Change any of them there. The page automatically checks contrast and falls back to white or black text where a color wouldn't be readable.

## Setup (about 20 minutes)

### 1. Create the database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings → API Keys** and copy:
   - the **Project URL**, which looks like `https://abcdxyz.supabase.co`
   - the **publishable key**, which starts with `sb_publishable_` (older projects call it the `anon` key)
   - the **secret key**, which starts with `sb_secret_` (older projects call it the `service_role` key). **Keep this one private.** It only goes into GitHub secrets.

### 2. Connect the page

Near the top of `index.html`, replace the placeholders with your Project URL and publishable key. These two values are safe to publish, because the database rules only let each signed-in person read and change their own picks.

### 3. Publish on GitHub Pages

1. Create a **public** GitHub repository, for example `nhl-picks`, and upload everything in this folder. Keep the folder structure, and make sure the hidden `.github` folder is included.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`, and click **Save**.
3. Your site will be live at `https://YOUR-GITHUB-NAME.github.io/nhl-picks/`.

### 4. Allow sign-in

In Supabase, go to **Authentication → URL Configuration**:

- Set **Site URL** to your GitHub Pages address.
- Under **Redirect URLs**, add the same address with `**` on the end, for example `https://YOUR-GITHUB-NAME.github.io/nhl-picks/**`. This lets sign-in links return you to whichever team sheet you were on.

**Optional:** after you've signed in once, you can turn off **Allow new users to sign up** under **Authentication → Sign In / Providers**. Leave it on if you want friends to be able to make their own sheets.

### 5. Load the schedules and turn on score updates

1. In GitHub, go to **Settings → Secrets and variables → Actions** and add two repository secrets:
   - `SUPABASE_URL`: your Project URL
   - `SUPABASE_SECRET_KEY`: your secret key
2. Open the **Actions** tab, enable workflows if GitHub asks, select **Update NHL games**, and click **Run workflow**.
3. When the run shows a green check, its log should say something like "Saved 1344 games." Reload your page and every team's schedule will be there.

From then on, the workflow runs every hour, and scores usually appear within about an hour of the final horn.

### Coming from the Kraken-only version?

Run `schema.sql` first, then run the workflow once so the games are loaded. After that, run `supabase/migrate-from-kraken-version.sql` to copy your existing Kraken picks onto the new Kraken sheet. That file also includes optional lines to remove the old tables once you've checked the copy.

## Scoring

- **W:** the team won in regulation, overtime, or a shootout.
- **L:** the team lost in regulation.
- **OTL:** the team lost in overtime or a shootout.

Once a game is final, its row shows the score and marks your pick as correct or missed. The header shows the team's actual record next to your hit rate. Picks lock when a game goes final. To turn that off, change `LOCK_FINAL_GAMES` to `false` in `index.html`.

## Things to know

- **The NHL feed isn't official.** Schedules and scores come from `api-web.nhle.com`, which the NHL's own website uses but doesn't document publicly, so it could change without notice. If sheets stop updating, check the latest run in the **Actions** tab. If one team's schedule fails to download, the job skips it for that run, logs a warning, and tries again the next hour.
- **Keep the repository active.** GitHub pauses scheduled workflows in a public repository after 60 days without a commit. It emails you when that happens, and you can re-enable the workflow with one click from the **Actions** tab.
- **Supabase pauses idle projects.** Free projects pause after a week of inactivity. The hourly job should keep the database active during the season.
- **The team colors are approximate.** They're a best effort at each team's colors, not official brand values. No logos are used.
