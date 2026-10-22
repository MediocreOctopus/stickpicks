// Press Box: the site updates players read on pressbox.html, newest first.
// Read UPDATES.md (the Press Box style guide) before adding one: versions, tags and how to write each line.
// When adding one, also set PRESS_BOX_LATEST in teams.js to the new version (it lights the footer's New dot).
const PRESS_BOX = [
  {
    version: "26.3",
    name: "",
    date: "2026-10-21",
    intro: "A livelier look, and a smoother phone experience.",
    items: [
      ["new", "Games in progress show a pulsing red Live marker."],
      ["new", "Pick sheets open at the next game. Finished games fold away; tap to show them."],
      ["new", "Pick Team now lists the teams already picked at the top."],
      ["new", "Confetti when a new badge is earned, and a +1 pop on the Chiclets counter when the balance grows."],
      ["new", "The Leaderboard has a scoreboard: rank, points, results and goals for the best sheet, at a glance."],
      ["improved", "The Leaderboard table now spans the full width, with the board switch and Season, Month and Week in one bar above it."],
      ["improved", "Bigger W, L, OTL and goal buttons on phones, sized for thumbs."],
      ["improved", "On phones, the home page leads with the next picks, and Pick Team and the shop show two per row."],
      ["improved", "Rules and Chiclets are now felt patches at the top of the screen on phones."],
      ["improved", "New felt-patch look for the Pick Team button."],
      ["improved", "Bolder section headings, a knit texture on banners, and buttons that press down when tapped."],
      ["fixed", "Leaderboard names no longer break mid-word. Long names end in \"…\"."],
      ["fixed", "The Chiclets count no longer shows twice on the Locker Room, Chiclets and shop pages."],
      ["fixed", "Opening stickpicks on a new phone no longer announces every old badge as new."],
    ],
  },
  {
    version: "26.2",
    name: "",
    date: "2026-10-20",
    intro: "",
    items: [
      ["new", "stickpicks is on Instagram: @stickpicks.hockey. Link at the bottom of the home page, next to Bluesky."],
    ],
  },
  {
    version: "26.1",
    name: "",
    date: "2026-10-20",
    intro: "Everything new since opening night.",
    items: [
      ["new", "Press Box: every site update in one place. Link at the bottom of every page."],
      ["new", "Upcoming Picks on the home page now shows one day at a time. Swipe or tap the arrows to change days."],
      ["new", "stickpicks is on Bluesky: @stickpicks.hockey. Link at the bottom of the home page."],
      ["new", "Contact link added to the bottom of every page."],
      ["improved", "New look for the NHL News ticker."],
      ["improved", "Sweater numbers sit higher, closer to the collar."],
      ["improved", "The Championship border is now gold and the player's team colour."],
      ["improved", "Usernames can no longer include swear words, slurs or look-alike spellings."],
      ["fixed", "Past days with no picks now say \"Nothing picked\"."],
      ["fixed", "Sign-in now retries once after a dropped connection and shows a clear message."],
    ],
  },
];
