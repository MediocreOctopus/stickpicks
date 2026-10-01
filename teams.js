// Shared by index.html and leaderboard.html: team list, colors, and theming.
/* board = scoreboard background, accent = team highlight, brand = main color for tints and buttons,
   stripe (optional) = forces the edge stripe color when the automatic pick isn't right */
const TEAMS = {
  // Atlantic
  BOS:{name:"Boston Bruins",         div:"Atlantic",     board:"#000000", accent:"#FFB81C", brand:"#FFB81C"},
  BUF:{name:"Buffalo Sabres",        div:"Atlantic",     board:"#003087", accent:"#FFB81C", brand:"#003087"},
  DET:{name:"Detroit Red Wings",     div:"Atlantic",     board:"#CE1126", accent:"#FFFFFF", brand:"#CE1126"},
  FLA:{name:"Florida Panthers",      div:"Atlantic",     board:"#041E42", accent:"#C8102E", brand:"#C8102E"},
  MTL:{name:"Montreal Canadiens",    div:"Atlantic",     board:"#192168", accent:"#AF1E2D", brand:"#AF1E2D"},
  OTT:{name:"Ottawa Senators",       div:"Atlantic",     board:"#000000", accent:"#DA1A32", brand:"#DA1A32"},
  TBL:{name:"Tampa Bay Lightning",   div:"Atlantic",     board:"#002868", accent:"#FFFFFF", brand:"#002868"},
  TOR:{name:"Toronto Maple Leafs",   div:"Atlantic",     board:"#00205B", accent:"#FFFFFF", brand:"#00205B"},
  // Metropolitan
  CAR:{name:"Carolina Hurricanes",   div:"Metropolitan", board:"#CE1126", accent:"#A4A9AD", brand:"#CE1126"},
  CBJ:{name:"Columbus Blue Jackets", div:"Metropolitan", board:"#002654", accent:"#CE1126", brand:"#002654"},
  NJD:{name:"New Jersey Devils",     div:"Metropolitan", board:"#000000", accent:"#CE1126", brand:"#CE1126"},
  NYI:{name:"New York Islanders",    div:"Metropolitan", board:"#00539B", accent:"#F47D30", brand:"#00539B"},
  NYR:{name:"New York Rangers",      div:"Metropolitan", board:"#0038A8", accent:"#CE1126", brand:"#0038A8", stripe:"#CE1126"},
  PHI:{name:"Philadelphia Flyers",   div:"Metropolitan", board:"#000000", accent:"#F74902", brand:"#F74902"},
  PIT:{name:"Pittsburgh Penguins",   div:"Metropolitan", board:"#000000", accent:"#FCB514", brand:"#FCB514"},
  WSH:{name:"Washington Capitals",   div:"Metropolitan", board:"#041E42", accent:"#C8102E", brand:"#C8102E"},
  // Central
  CHI:{name:"Chicago Blackhawks",    div:"Central",      board:"#000000", accent:"#CF0A2C", brand:"#CF0A2C"},
  COL:{name:"Colorado Avalanche",    div:"Central",      board:"#6F263D", accent:"#A2AAAD", brand:"#236192"},
  DAL:{name:"Dallas Stars",          div:"Central",      board:"#006847", accent:"#8F8F8C", brand:"#006847"},
  MIN:{name:"Minnesota Wild",        div:"Central",      board:"#154734", accent:"#EAAA00", brand:"#A6192E"},
  NSH:{name:"Nashville Predators",   div:"Central",      board:"#041E42", accent:"#FFB81C", brand:"#FFB81C"},
  STL:{name:"St. Louis Blues",       div:"Central",      board:"#002F87", accent:"#FCB514", brand:"#002F87"},
  UTA:{name:"Utah Mammoth",          div:"Central",      board:"#000000", accent:"#6CACE4", brand:"#6CACE4"},
  WPG:{name:"Winnipeg Jets",         div:"Central",      board:"#041E42", accent:"#AC162C", brand:"#004C97"},
  // Pacific
  ANA:{name:"Anaheim Ducks",         div:"Pacific",      board:"#000000", accent:"#FC4C02", brand:"#FC4C02"},
  CGY:{name:"Calgary Flames",        div:"Pacific",      board:"#C8102E", accent:"#F1BE48", brand:"#C8102E"},
  EDM:{name:"Edmonton Oilers",       div:"Pacific",      board:"#041E42", accent:"#FF4C00", brand:"#FF4C00"},
  LAK:{name:"Los Angeles Kings",     div:"Pacific",      board:"#111111", accent:"#A2AAAD", brand:"#A2AAAD"},
  SJS:{name:"San Jose Sharks",       div:"Pacific",      board:"#006D75", accent:"#EA7200", brand:"#006D75"},
  SEA:{name:"Seattle Kraken",        div:"Pacific",      board:"#001628", accent:"#99D9D9", brand:"#355464"},
  VAN:{name:"Vancouver Canucks",     div:"Pacific",      board:"#00205B", accent:"#00843D", brand:"#00843D"},
  VGK:{name:"Vegas Golden Knights",  div:"Pacific",      board:"#333F42", accent:"#B4975A", brand:"#B4975A"},
};
const DIVISIONS=["Atlantic","Metropolitan","Central","Pacific"];

/* ───────── Color helpers ───────── */
function lum(hex){
  const c=hex.replace("#","").match(/../g).map(h=>parseInt(h,16)/255)
    .map(v=>v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
function contrast(a,b){ const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); }
const inkOn=bg=>contrast(bg,"#FFFFFF")>=Math.min(4.5,contrast(bg,"#000000"))?"#FFFFFF":"#000000";
function firstReadable(bg,candidates,min=3){ return candidates.find(c=>contrast(c,bg)>=min)||candidates[candidates.length-1]; }

// Neutral league-wide look, used by the leaderboard's "All teams" view.
const NEUTRAL_THEME = {board:"#1B2733", accent:"#C9D3DB", brand:"#3A4E60"};

// Accepts a team code ("SEA") or a theme object like NEUTRAL_THEME.
function applyTheme(code){
  const t=typeof code==="string"?TEAMS[code]:code, s=document.documentElement.style;
  const stripe = t.stripe || firstReadable(t.board,[t.accent,t.brand,"#FFFFFF"],2);
  const ctlLight = firstReadable("#F5F7F8",[t.brand,t.board,"#222222"],3);
  const ctlDark  = firstReadable("#10171C",[t.brand,t.accent,"#E6EEF1"],3);
  s.setProperty("--board",t.board); s.setProperty("--accent",t.accent); s.setProperty("--brand",t.brand);
  s.setProperty("--stripe",stripe);
  s.setProperty("--title",firstReadable(t.board,[t.accent,"#FFFFFF"],3));
  s.setProperty("--ctl-light",ctlLight); s.setProperty("--ctl-ink-light",inkOn(ctlLight));
  s.setProperty("--ctl-dark",ctlDark);   s.setProperty("--ctl-ink-dark",inkOn(ctlDark));
  document.querySelector('meta[name="theme-color"]')?.remove();
  const m=document.createElement("meta"); m.name="theme-color"; m.content=t.board; document.head.appendChild(m);
}

/* ───────── Shared helpers ───────── */
function makeClient(){
  const cfg=window.PICKS_CONFIG||{};
  const ok=window.supabase && cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT");
  return ok ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY) : null;
}
const SEASON=(window.PICKS_CONFIG||{}).SEASON||"20262027";
const USERNAME_RULE=/^[A-Za-z0-9_]{3,20}$/;

// A game's outcome from one team's side: "W", "L", "OTL", or null if not final.
function resultFor(g, team){
  if(!g.period_type || g.home_score==null || g.away_score==null) return null;
  const home=g.home===team, us=home?g.home_score:g.away_score, them=home?g.away_score:g.home_score;
  return us>them ? "W" : g.period_type==="REG" ? "L" : "OTL";
}
// Picks lock at puck drop (the database enforces the same rule).
function hasStarted(g, now=Date.now()){
  if(g.period_type) return true;
  if(g.start_utc) return new Date(g.start_utc).getTime()<=now;
  return false;
}

// Score one pick on a finished game: 1 point for the right result, 1 point for
// the exact combined goals (from the official final score). Returns null until final.
function scorePick(g, team, pick){
  const result=resultFor(g, team);
  if(!result) return null;
  const goals=g.home_score+g.away_score;
  const outcomeHit = pick?.o ? pick.o===result : null;
  const goalsHit = pick?.g!=null ? pick.g===goals : null;
  return {result, goals, outcomeHit, goalsHit, points:(outcomeHit?1:0)+(goalsHit?1:0)};
}
