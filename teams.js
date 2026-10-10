// Shared by every page: team list, colors, theming, the "Pick Team" menu, tab bar, logo, and app setup.
/* board = the team's PRIMARY colour (header, tiles; text on it switches between white and black automatically),
   accent = secondary highlight, brand = colour for tints and buttons,
   stripe (optional) = forces the edge stripe colour when the automatic pick isn't right.
   Primaries follow the teams' official palettes (e.g. Chicago/New Jersey/Washington red, Nashville gold,
   Philadelphia and Anaheim orange). */
const TEAMS = {
  // Atlantic
  BOS:{name:"Boston Bruins",         div:"Atlantic",     board:"#000000", accent:"#FFB81C", brand:"#FFB81C"},
  BUF:{name:"Buffalo Sabres",        div:"Atlantic",     board:"#003087", accent:"#FFB81C", brand:"#003087"},
  DET:{name:"Detroit Red Wings",     div:"Atlantic",     board:"#CE1126", accent:"#FFFFFF", brand:"#CE1126"},
  FLA:{name:"Florida Panthers",      div:"Atlantic",     board:"#C8102E", accent:"#B9975B", brand:"#041E42"},
  MTL:{name:"Montreal Canadiens",    div:"Atlantic",     board:"#AF1E2D", accent:"#FFFFFF", brand:"#192168", stripe:"#192168"},
  OTT:{name:"Ottawa Senators",       div:"Atlantic",     board:"#000000", accent:"#DA1A32", brand:"#DA1A32"},
  TBL:{name:"Tampa Bay Lightning",   div:"Atlantic",     board:"#002868", accent:"#FFFFFF", brand:"#002868"},
  TOR:{name:"Toronto Maple Leafs",   div:"Atlantic",     board:"#00205B", accent:"#FFFFFF", brand:"#00205B"},
  // Metropolitan
  CAR:{name:"Carolina Hurricanes",   div:"Metropolitan", board:"#CE1126", accent:"#A4A9AD", brand:"#CE1126"},
  CBJ:{name:"Columbus Blue Jackets", div:"Metropolitan", board:"#002654", accent:"#CE1126", brand:"#002654"},
  NJD:{name:"New Jersey Devils",     div:"Metropolitan", board:"#CE1126", accent:"#FFFFFF", brand:"#CE1126", stripe:"#000000"},
  NYI:{name:"New York Islanders",    div:"Metropolitan", board:"#00539B", accent:"#F47D30", brand:"#00539B"},
  NYR:{name:"New York Rangers",      div:"Metropolitan", board:"#0038A8", accent:"#CE1126", brand:"#0038A8", stripe:"#CE1126"},
  PHI:{name:"Philadelphia Flyers",   div:"Metropolitan", board:"#F74902", accent:"#000000", brand:"#F74902"},
  PIT:{name:"Pittsburgh Penguins",   div:"Metropolitan", board:"#000000", accent:"#FCB514", brand:"#FCB514"},
  WSH:{name:"Washington Capitals",   div:"Metropolitan", board:"#C8102E", accent:"#FFFFFF", brand:"#041E42", stripe:"#041E42"},
  // Central
  CHI:{name:"Chicago Blackhawks",    div:"Central",      board:"#CF0A2C", accent:"#FFFFFF", brand:"#CF0A2C", stripe:"#000000"},
  COL:{name:"Colorado Avalanche",    div:"Central",      board:"#6F263D", accent:"#236192", brand:"#236192", stripe:"#A2AAAD"},
  DAL:{name:"Dallas Stars",          div:"Central",      board:"#006847", accent:"#8F8F8C", brand:"#006847"},
  MIN:{name:"Minnesota Wild",        div:"Central",      board:"#154734", accent:"#EAAA00", brand:"#A6192E"},
  NSH:{name:"Nashville Predators",   div:"Central",      board:"#FFB81C", accent:"#041E42", brand:"#041E42"},
  STL:{name:"St. Louis Blues",       div:"Central",      board:"#002F87", accent:"#FCB514", brand:"#002F87"},
  UTA:{name:"Utah Mammoth",          div:"Central",      board:"#000000", accent:"#6CACE4", brand:"#6CACE4"},
  WPG:{name:"Winnipeg Jets",         div:"Central",      board:"#041E42", accent:"#A2AAAD", brand:"#004C97"},
  // Pacific
  ANA:{name:"Anaheim Ducks",         div:"Pacific",      board:"#FC4C02", accent:"#000000", brand:"#FC4C02"},
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

// Colours a team chip/tile/button: --t-board (fill), --t-stripe (edge stripe), --t-ink (readable text).
function teamStyle(el, code){
  const t=TEAMS[code];
  el.style.setProperty("--t-board", t ? t.board : "#555");
  el.style.setProperty("--t-stripe", t ? (t.stripe||firstReadable(t.board,[t.accent,t.brand,"#FFFFFF"],2)) : "#999");
  el.style.setProperty("--t-ink", t ? inkOn(t.board) : "#FFFFFF");
  return el;
}

// Neutral league-wide look, used by the leaderboard's "All teams" view: the navy road sweater.
const NEUTRAL_THEME = {board:"#1C2B45", accent:"#EFE6D2", brand:"#9B1C1F"};

// Accepts a team code ("SEA") or a theme object like NEUTRAL_THEME.
function applyTheme(code){
  const t=typeof code==="string"?TEAMS[code]:code, s=document.documentElement.style;
  const stripe = t.stripe || firstReadable(t.board,[t.accent,t.brand,"#FFFFFF"],2);
  const ctlLight = firstReadable("#F5F7F8",[t.brand,t.board,"#222222"],3);
  const ctlDark  = firstReadable("#10171C",[t.brand,t.accent,"#E6EEF1"],3);
  s.setProperty("--board",t.board); s.setProperty("--accent",t.accent); s.setProperty("--brand",t.brand);
  s.setProperty("--stripe",stripe);
  // text on the header: white on dark team colours, black on light ones (e.g. Nashville gold)
  s.setProperty("--board-ink",inkOn(t.board));
  s.setProperty("--title",firstReadable(t.board,[t.accent,inkOn(t.board)],3));
  s.setProperty("--ctl-light",ctlLight); s.setProperty("--ctl-ink-light",inkOn(ctlLight));
  s.setProperty("--ctl-dark",ctlDark);   s.setProperty("--ctl-ink-dark",inkOn(ctlDark));
  document.querySelector('meta[name="theme-color"]')?.remove();
  const m=document.createElement("meta"); m.name="theme-color"; m.content=t.board; document.head.appendChild(m);
}

/* ───────── "Pick Team" dropdown in the top nav (desktop; phones use teams.html) ───────── */
// Fills <div class="teammenu" id="teamMenu"></div> with a button and a panel of
// all 32 teams grouped by division. Returns {open, close} so pages can open it.
function mountTeamMenu(root){
  if(!root) return null;
  const btn=document.createElement("button");
  btn.type="button"; btn.className="teammenu-btn"; btn.setAttribute("aria-expanded","false"); btn.setAttribute("aria-controls","teamMenuPanel");
  btn.textContent="Pick Team";
  // The panel: a navy sweater banner, then the four divisions with each team's mini sweater,
  // then a link to the full Pick Teams page.
  ensureJerseyDefs();
  const panel=document.createElement("div");
  panel.className="teammenu-panel"; panel.id="teamMenuPanel"; panel.hidden=true;
  const head=document.createElement("div"); head.className="tm-head";
  head.innerHTML='<small>2026–27 season</small><b>Pick Teams</b>';
  const grid=document.createElement("div"); grid.className="tm-grid";
  DIVISIONS.forEach(div=>{
    const col=document.createElement("div"); col.className="teammenu-div";
    const h=document.createElement("h3"); h.textContent=div; col.appendChild(h);
    Object.keys(TEAMS).filter(c=>TEAMS[c].div===div).sort((a,b)=>TEAMS[a].name.localeCompare(TEAMS[b].name)).forEach(c=>{
      const t=TEAMS[c], a=document.createElement("a");
      a.href=`sheet.html?team=${c}`; teamStyle(a,c);
      const j=document.createElement("span"); j.className="tm-jersey"; j.setAttribute("aria-hidden","true");
      j.innerHTML='<svg viewBox="0 0 100 100"><use href="#spJersey"/></svg>';
      const nm=document.createElement("span"); nm.textContent=t.name;
      a.append(j,nm); col.appendChild(a);
    });
    grid.appendChild(col);
  });
  const foot=document.createElement("a"); foot.className="tm-all"; foot.href="teams.html"; foot.textContent="All 32 teams →";
  panel.append(head,grid,foot);
  root.append(btn,panel);
  const open=()=>{ panel.hidden=false; btn.setAttribute("aria-expanded","true"); panel.querySelector("a")?.focus(); };
  const close=(refocus)=>{ if(panel.hidden) return; panel.hidden=true; btn.setAttribute("aria-expanded","false"); if(refocus) btn.focus(); };
  btn.addEventListener("click",()=>panel.hidden?open():close());
  document.addEventListener("click",e=>{ if(!root.contains(e.target)) close(); });
  root.addEventListener("keydown",e=>{ if(e.key==="Escape") close(true); });
  root.addEventListener("focusout",e=>{ if(e.relatedTarget && !root.contains(e.relatedTarget)) close(); });
  return {open,close};
}

/* ───────── Phone tab bar (shown under 560px by styles.css) ───────── */
const TAB_ICONS={
  home:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  teams:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  board:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  play:'<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  me:'<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'
};
function mountTabBar(){
  if(document.querySelector(".tabbar")) return;
  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();
  const items=[
    ["home","Home","index.html",page==="index.html"],
    ["teams","Pick Team","teams.html",page==="teams.html"||page==="sheet.html"||page==="compare.html"],
    ["board","Leaders","leaderboard.html",page==="leaderboard.html"],
    ["play","Intermission","intermission.html",page==="intermission.html"],
    ["me","Me","profile.html",page==="profile.html"]
  ];
  const nav=document.createElement("nav"); nav.className="tabbar"; nav.setAttribute("aria-label","Sections");
  items.forEach(([icon,label,href,current])=>{
    const a=document.createElement("a"); a.href=href;
    if(current) a.setAttribute("aria-current","page");
    if(icon==="me"){ a.classList.add("tab-me"); a.appendChild(meBadge()); }
    else a.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${TAB_ICONS[icon]}</svg>`;
    a.append(label);
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
}
document.addEventListener("DOMContentLoaded", mountTabBar);

/* ───────── Avatars: sweater (team + number), photo, or initial ───────── */
// The jersey is drawn once per page (hidden <svg> with a <symbol>) and reused at any size.
// Sleeves have two equal bands parallel to the cuff, matching the two hem stripes.
const JERSEY_DEFS='<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
 +'<clipPath id="spSlR" clipPathUnits="userSpaceOnUse"><polygon points="69,12 93,31 82,47 74,41"/></clipPath>'
 +'<clipPath id="spSlL" clipPathUnits="userSpaceOnUse"><polygon points="31,12 7,31 18,47 26,41"/></clipPath>'
 +'<symbol id="spJersey" viewBox="0 0 100 100">'
 +'<path d="M31 12 L44 7 Q50 15 56 7 L69 12 L93 31 L82 47 L74 41 L74 93 L26 93 L26 41 L18 47 L7 31 Z" style="fill:var(--j1)"/>'
 +'<g clip-path="url(#spSlR)" style="fill:var(--j2)"><polygon points="95.06,22.71 75,51.89 72.53,50.19 92.59,21.01"/><polygon points="90.94,19.88 70.88,49.06 68.41,47.36 88.47,18.18"/></g>'
 +'<g clip-path="url(#spSlL)" style="fill:var(--j2)"><polygon points="4.94,22.71 25,51.89 27.47,50.19 7.41,21.01"/><polygon points="9.06,19.88 29.12,49.06 31.59,47.36 11.53,18.18"/></g>'
 +'<rect x="26" y="82" width="48" height="3" style="fill:var(--j2)"/><rect x="26" y="87" width="48" height="3" style="fill:var(--j2)"/>'
 +'<path d="M44 7 Q50 15 56 7" fill="none" style="stroke:var(--j2)" stroke-width="3"/>'
 +'</symbol></defs></svg>';
function ensureJerseyDefs(){
  if(document.getElementById("spJersey")) return;
  const host=document.createElement("div"); host.innerHTML=JERSEY_DEFS; document.body.prepend(host.firstChild);
}
// Photos are only shown from this project's own "avatars" storage.
const AVATAR_BASE=((window.PICKS_CONFIG||{}).SUPABASE_URL||"").replace(/\/$/,"")+"/storage/v1/object/public/avatars/";
// A profile row (from Supabase) → the avatar settings the pages pass around.
function avatarFromProfile(p){ return p ? {kind:p.avatar_kind||null, team:p.avatar_team||null, number:p.avatar_number??null, url:p.avatar_url||null} : null; }
// Builds a round avatar <span>: av = {kind, team, number, url}; falls back to the username's initial.
function avatarEl(av, name, px){
  const el=document.createElement("span"); el.className="avatar"; el.setAttribute("aria-hidden","true");
  el.style.setProperty("--av-size", px+"px");
  const team=av?.kind==="sweater" ? TEAMS[av.team] : null;
  if(av?.kind==="photo" && av.url && AVATAR_BASE.length>40 && av.url.startsWith(AVATAR_BASE)){
    const img=document.createElement("img"); img.src=av.url; img.alt=""; img.loading="lazy"; img.decoding="async";
    el.classList.add("avatar-photo"); el.appendChild(img);
  }else if(team){
    ensureJerseyDefs();
    const stripe=team.stripe||firstReadable(team.board,[team.accent,team.brand,"#FFFFFF"],2);
    const num=Math.max(0,Math.min(99,parseInt(av.number,10)||0));
    el.classList.add("avatar-sweater");
    el.style.setProperty("--j1",team.board); el.style.setProperty("--j2",stripe); el.style.setProperty("--av-ring",firstReadable("#F4EDDC",[stripe,team.board],1.5));   // white stripes would vanish on the cream ring
    el.innerHTML=`<svg viewBox="0 0 100 100"><use href="#spJersey"/><text x="50" y="70"text-anchor="middle" fill="${inkOn(team.board)}">${num}</text></svg>`;
  }else if(name){
    el.textContent=name[0].toUpperCase();
  }else{
    el.classList.add("avatar-empty");
    el.innerHTML=`<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`;
  }
  return el;
}

/* ───────── "Me": who's signed in on this device ───────── */
// Each page signs in on its own, so the username and picture are remembered here (just on this
// device) to show the Me tab and the top-bar account button right away.
const ME_KEY="stickpicks-me";
function readMe(){ try{ return JSON.parse(localStorage.getItem(ME_KEY)||"null"); }catch(e){ return null; } }
function rememberMe(name, avatar){
  const keep = avatar===undefined ? readMe()?.avatar||null : avatar;   // keep the saved picture if none given
  try{ localStorage.setItem(ME_KEY, JSON.stringify({name, avatar:keep})); }catch(e){}
  refreshMe();
}
function forgetMe(){ try{ localStorage.removeItem(ME_KEY); }catch(e){} refreshMe(); }
function meBadge(){ const me=readMe(); const b=avatarEl(me?.avatar, me?.name, 24); b.classList.add("me-badge"); return b; }
// Top-bar account buttons marked data-me: your picture + username (to your profile), or "Sign in".
function refreshMe(){
  const me=readMe();
  document.querySelectorAll("a.navaccount[data-me]").forEach(a=>{
    a.href = me?.name ? "profile.html" : "index.html#signin";
    if(me?.name){
      const nm=document.createElement("span"); nm.className="navaccount-name"; nm.textContent=me.name;
      a.replaceChildren(avatarEl(me.avatar, me.name, 22), nm); a.classList.add("has-avatar");
    }else{ a.textContent="Sign in"; a.classList.remove("has-avatar"); }
  });
  document.querySelectorAll(".tab-me .me-badge").forEach(old=>old.replaceWith(meBadge()));
}
document.addEventListener("DOMContentLoaded", refreshMe);

/* ───────── Look (Auto / Home sweater / Road sweater) ───────── */
// The <head> script on every page applies the choice saved on this device (window.stickpicksLook).
// Signed-in players also keep it in their private user_settings row so it follows them to other devices.
async function syncLook(sb){
  if(!sb || !window.stickpicksLook) return;
  const {data:{session}}=await sb.auth.getSession(); if(!session) return;
  const {data}=await sb.from("user_settings").select("look").eq("user_id",session.user.id).maybeSingle();
  if(data?.look && data.look!==stickpicksLook.get()) stickpicksLook.set(data.look);
}
async function saveLook(sb, look){
  window.stickpicksLook?.set(look);
  if(!sb) return null;
  const {data:{session}}=await sb.auth.getSession(); if(!session) return null;
  const {error}=await sb.from("user_settings").upsert({user_id:session.user.id, look, updated_at:new Date().toISOString()},{onConflict:"user_id"});
  return error;
}

/* ───────── Logo ───────── */
// Swaps the "stickpicks" text in each <a class="brand"> for logo.svg (script + hockey stick).
// The SVG is inlined so it can use the page's Yellowtail font and the --logo-* colours,
// which switch between the home (light) and road (dark) sweaters.
// The ?v= date this page loaded teams.js with; the logo uses the same one (and so does sw.js).
const ASSET_V = new URL(document.currentScript?.src || location.href).searchParams.get("v") || "";
function mountLogo(){
  const spots=document.querySelectorAll("a.brand");
  if(!spots.length) return;
  fetch(`logo.svg?v=${ASSET_V}`).then(r=>r.ok?r.text():Promise.reject()).then(svg=>{
    spots.forEach(a=>{ a.innerHTML=svg; a.classList.add("has-logo"); });
  }).catch(()=>{}); // keep the text fallback
}
document.addEventListener("DOMContentLoaded", mountLogo);

/* ───────── App: offline support, install button, offline notice ───────── */
// sw.js keeps a copy of the site on the device so it opens fast and works offline.
if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")){
  addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
}
const IS_APP = matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
let installPrompt=null;   // Chrome/Edge/Android hand us this so our own button can show the install dialog
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); installPrompt=e; mountInstall(); });
addEventListener("appinstalled", ()=>{ installPrompt=null; document.getElementById("installBar")?.classList.add("hidden"); });

const INSTALL_HIDE_KEY="stickpicks-install-dismissed";
function installDismissed(){ try{ return Date.now() - Number(localStorage.getItem(INSTALL_HIDE_KEY)||0) < 30*864e5; }catch(e){ return false; } }

// Fills <div id="installBar"> (home page only): an Install button where the browser supports it,
// or Add to Home Screen steps on iPhone/iPad. Hidden once installed, or for 30 days after "Not now".
function mountInstall(){
  const bar=document.getElementById("installBar");
  if(!bar || IS_APP || installDismissed()) return;
  if(!installPrompt && !IS_IOS) return;
  bar.innerHTML="";
  const txt=document.createElement("div"); txt.className="installbar-text";
  const h=document.createElement("b"); h.textContent="Get the stickpicks app";
  const p=document.createElement("span");
  if(installPrompt) p.textContent="Opens full screen from your home screen, and works offline.";
  else p.innerHTML='Tap <svg class="ios-share" viewBox="0 0 24 24" aria-label="Share"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg> Share, then <b>Add to Home Screen</b>.';
  txt.append(h,p); bar.appendChild(txt);
  const actions=document.createElement("div"); actions.className="installbar-actions";
  if(installPrompt){
    const go=document.createElement("button"); go.type="button"; go.className="btn"; go.textContent="Install";
    go.addEventListener("click", async ()=>{
      const e=installPrompt; if(!e) return;
      e.prompt(); const choice=await e.userChoice.catch(()=>null);
      if(choice?.outcome==="accepted") bar.classList.add("hidden");
      installPrompt=null;
    });
    actions.appendChild(go);
  }
  const no=document.createElement("button"); no.type="button"; no.className="linkbtn"; no.textContent="Not now";
  no.addEventListener("click", ()=>{ try{ localStorage.setItem(INSTALL_HIDE_KEY,String(Date.now())); }catch(e){} bar.classList.add("hidden"); });
  actions.appendChild(no); bar.appendChild(actions);
  bar.classList.remove("hidden");
}
document.addEventListener("DOMContentLoaded", mountInstall);

// A small notice while the device is offline.
function mountOffline(){
  const el=document.createElement("div"); el.className="offline"; el.setAttribute("role","status");
  el.textContent="You’re offline. Showing your last saved version; picks you make are kept on this device until you’re back online.";
  document.body.prepend(el);
  const sync=()=>el.classList.toggle("on", !navigator.onLine);
  addEventListener("online",sync); addEventListener("offline",sync); sync();
}
document.addEventListener("DOMContentLoaded", mountOffline);

/* ───────── Puck-drop reminders (web push) ───────── */
// About an hour before puck drop, the GitHub Action notifies players whose sheets have games
// they haven't fully picked. Each device opts in on its own (Settings on the profile page).
// iPhone/iPad only allow this inside the installed app (Add to Home Screen), iOS 16.4 or newer.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;
// "ok" | "ios-install" (needs the Home Screen app first) | "unsupported" | "blocked" (denied in settings)
function pushSupport(){
  if(!(window.PICKS_CONFIG||{}).VAPID_PUBLIC_KEY) return "unsupported";
  if(isIOS && !isStandalone) return "ios-install";
  if(!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if(Notification.permission==="denied") return "blocked";
  return "ok";
}
function vapidKey(){
  const s=PICKS_CONFIG.VAPID_PUBLIC_KEY.replace(/-/g,"+").replace(/_/g,"/"), raw=atob(s+"=".repeat((4-s.length%4)%4));
  return Uint8Array.from(raw, c=>c.charCodeAt(0));
}
async function pushSub(){ const reg=await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
// Is this device signed up (for the signed-in player)?
async function remindersOn(sb){
  if(pushSupport()!=="ok" || Notification.permission!=="granted") return false;
  const sub=await pushSub(); if(!sub) return false;
  const {data,error}=await sb.rpc("has_push_subscription",{p_endpoint:sub.endpoint});
  return !error && data===true;
}
// Returns null when done, or a short message saying what went wrong.
async function enableReminders(sb){
  const s=pushSupport(); if(s!=="ok") return s;
  const perm=await Notification.requestPermission();
  if(perm!=="granted") return perm==="denied" ? "blocked" : "dismissed";
  const reg=await navigator.serviceWorker.ready;
  const sub=(await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:vapidKey()});
  const j=sub.toJSON();
  const {error}=await sb.rpc("save_push_subscription",{p_endpoint:j.endpoint, p_p256dh:j.keys.p256dh, p_auth:j.keys.auth});
  return error ? (error.message||"error") : null;
}
async function disableReminders(sb){
  const sub=await pushSub(); if(!sub) return null;
  await sb.rpc("remove_push_subscription",{p_endpoint:sub.endpoint});
  await sub.unsubscribe().catch(()=>{});
  return null;
}

/* ───────── Badges and streaks ───────── */
// Each badge is a felt sweater patch: cream felt, a stitched ring (navy = everyday, red = scoring,
// gold = rare) and a simple pictogram in navy, cardinal red and stick-tape colours.
const BADGE_RING={navy:"#1C2B45", red:"#9B1C1F", gold:"#C08A2A"};
const BI={n:"#1C2B45", r:"#9B1C1F", w:"#B98245", s:"#8E98A6", p:"#FBF7EE", c:"#F4EDDC"};   // navy, red, wood, steel, paper, felt
// A five-point felt star with its number (3rd, 2nd, 1st Star), outlined in navy.
function starArt(fill, ink, n){
  return `<path d="M32 14.5L36.6 26.6L49.6 27.2L39.5 35.4L43 48L32 40.8L21 48L24.5 35.4L14.4 27.2L27.4 26.6Z" fill="${fill}" stroke="${BI.n}" stroke-width="1.2" stroke-linejoin="round"/>`+
    `<text x="32" y="37.6" text-anchor="middle" font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" font-size="11.5" fill="${ink}">${n}</text>`;
}
const BADGES=[
  // (id stays "faceoff" so devices that already announced it don't announce it again)
  {id:"faceoff", name:"Inaugural Season", ring:"navy", how:"Make your first pick of the 2026–27 season.",
   // a felt rafter banner, like a championship banner hanging from the rafters
   art:`<path d="M17 15h30" stroke="${BI.n}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16.5" cy="15" r="2" fill="${BI.n}"/><circle cx="47.5" cy="15" r="2" fill="${BI.n}"/>`+
       `<path d="M20.5 16.5H43.5V45L32 39L20.5 45Z" fill="${BI.r}"/><path d="M22.5 18.5H41.5" stroke="${BI.c}" stroke-width="1" opacity=".7"/>`+
       `<path d="M32 21.3L33 23.9L35.8 24L33.6 25.8L34.4 28.5L32 27L29.6 28.5L30.4 25.8L28.2 24L31 23.9Z" fill="${BI.c}"/>`+
       `<text x="32" y="35.6" text-anchor="middle" font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" font-size="7.4" fill="${BI.c}">26–27</text>`},
  {id:"hattrick", name:"Hat Trick", ring:"red", how:"Get a W, an L and an OTL right on one sheet.",
   art:`<path d="M20 38Q19 22 26 21Q29 24 32 22Q35 24 38 21Q45 22 44 38Z" fill="${BI.n}"/><rect x="20" y="32" width="24" height="4.5" fill="${BI.r}"/><ellipse cx="32" cy="39.5" rx="17" ry="4.2" fill="${BI.n}"/>`},
  // The three stars of the game: results right in a row on one sheet
  {id:"star3", name:"3rd Star", ring:"navy", how:"Get 3 results right in a row on one sheet.", art:starArt(BI.n,BI.c,"3")},
  {id:"star2", name:"2nd Star", ring:"red", how:"Get 5 results right in a row on one sheet.", art:starArt(BI.r,BI.c,"2")},
  {id:"star1", name:"1st Star", ring:"gold", how:"Get 10 results right in a row on one sheet.", art:starArt("#C08A2A",BI.n,"1")},
  {id:"topshelf", name:"Top Shelf", ring:"red", how:"Get the result and the exact goals right in the same game.",
   art:`<path d="M24 22v20M30 22v20M36 22v20M42 22v20M19 28h26M19 34h26" stroke="${BI.n}" stroke-width=".9" opacity=".55"/><path d="M18 44V24q0-4 4-4h20q4 0 4 4v20" fill="none" stroke="${BI.r}" stroke-width="3"/><path d="M13 44h38" stroke="${BI.n}" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="39.5" cy="25.5" rx="4.6" ry="2.4" fill="${BI.n}"/><rect x="34.9" y="25.5" width="9.2" height="2.2" fill="${BI.n}"/>`},
  {id:"lamp", name:"Lamp Lighter", ring:"red", how:"Nail the exact combined goals 5 times.",
   art:`<path d="M23 31Q23 18 32 18Q41 18 41 31Z" fill="${BI.r}"/><path d="M27 24q1-3 4-3.6" stroke="${BI.c}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".8"/><rect x="21" y="31" width="22" height="5" rx="1" fill="${BI.n}"/><rect x="30.3" y="36" width="3.4" height="9" fill="${BI.n}"/><rect x="25" y="45" width="14" height="3" rx="1" fill="${BI.n}"/><path d="M32 10.5v3.5M18.5 16l2.6 2.6M45.5 16l-2.6 2.6M14.5 27h3.5M46 27h3.5" stroke="${BI.r}" stroke-width="2.2" stroke-linecap="round"/>`},
  {id:"shutout", name:"Shutout", ring:"gold", how:"Get every result right on a night with 3 or more of your games.",
   art:`<path d="M32 13C22 13 19 21 19 30.5C19 42 25 50.5 32 50.5S45 42 45 30.5C45 21 42 13 32 13Z" fill="${BI.n}"/><path d="M32 14v11" stroke="${BI.r}" stroke-width="2.6"/><ellipse cx="26.6" cy="30.5" rx="3.6" ry="2.3" fill="${BI.c}"/><ellipse cx="37.4" cy="30.5" rx="3.6" ry="2.3" fill="${BI.c}"/><g fill="${BI.c}"><circle cx="32" cy="37.5" r="1.3"/><circle cx="28.6" cy="41.5" r="1.2"/><circle cx="35.4" cy="41.5" r="1.2"/><circle cx="32" cy="45.2" r="1.2"/></g>`},
  {id:"overtime", name:"Overtime Hero", ring:"navy", how:"Call an overtime or shootout loss (OTL) correctly.",
   art:`<rect x="28.5" y="13" width="7" height="4.2" rx="1" fill="${BI.n}"/><rect x="30.8" y="16.5" width="2.4" height="3" fill="${BI.n}"/><circle cx="32" cy="34" r="13" fill="${BI.p}" stroke="${BI.n}" stroke-width="3"/><path d="M32 23.5v2.4M42.5 34h-2.4M32 44.5v-2.4M21.5 34h2.4" stroke="${BI.n}" stroke-width="1.6"/><path d="M32 34V26.5M32 34l5 3" stroke="${BI.r}" stroke-width="2.6" stroke-linecap="round"/><circle cx="32" cy="34" r="1.8" fill="${BI.n}"/>`},
  {id:"shootout", name:"Shootout Ace", ring:"navy", how:"Get the result right in a game decided by a shootout.",
   art:`<path d="M20 20L39 46" stroke="${BI.w}" stroke-width="3.4" stroke-linecap="round"/><path d="M44 20L25 46" stroke="${BI.w}" stroke-width="3.4" stroke-linecap="round"/><path d="M38 46h9" stroke="${BI.n}" stroke-width="4.2" stroke-linecap="round"/><path d="M26 46h-9" stroke="${BI.n}" stroke-width="4.2" stroke-linecap="round"/><ellipse cx="32" cy="15.6" rx="6" ry="2.6" fill="${BI.n}"/><rect x="26" y="13.4" width="12" height="2.2" fill="${BI.n}"/><ellipse cx="32" cy="13.4" rx="6" ry="2.6" fill="#33476A"/>`},
  {id:"fullsheet", name:"Full Sheet", ring:"gold", how:"Pick every game on a sheet, result and goals.",
   art:`<rect x="20" y="16" width="24" height="32" rx="2.4" fill="${BI.w}"/><rect x="23.5" y="20.5" width="17" height="24" fill="${BI.p}"/><rect x="27.5" y="13.5" width="9" height="5.5" rx="1.4" fill="${BI.n}"/><path d="M26.5 25.5h11M26.5 30h11M26.5 34.5h5" stroke="${BI.n}" stroke-width="1.5"/><path d="M30.5 39l3 3 6.5-7.5" stroke="${BI.r}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`},
  {id:"original6", name:"Original Six", ring:"navy", how:"Start sheets for Boston, Chicago, Detroit, Montréal, the Rangers and Toronto.",
   art:`<path d="M19.5 14v36" stroke="${BI.n}" stroke-width="2.8" stroke-linecap="round"/><path d="M21 16L49 26L21 36Z" fill="${BI.r}"/><text x="31" y="30" text-anchor="middle" font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" font-size="9.5" fill="${BI.c}">VI</text>`},
  {id:"barnstormer", name:"Barnstormer", ring:"navy", how:"Start sheets in all four divisions.",
   art:`<path d="M21 16h11l1.2 16Q44 32.5 46 37v4H21Z" fill="${BI.n}"/><path d="M26 22h5M26 26h5.4M26 30h5.8" stroke="${BI.c}" stroke-width="1.4" stroke-linecap="round"/><path d="M24.5 41v4M42 41v4" stroke="${BI.n}" stroke-width="2.2"/><path d="M17 45.5h29q4 0 4-4" fill="none" stroke="${BI.s}" stroke-width="2.6" stroke-linecap="round"/>`},
  {id:"pointstreak", name:"Point Streak", ring:"gold", how:"Score at least a point in 10 straight finished games.",
   art:`<path d="M20 13L37 42" stroke="${BI.w}" stroke-width="3.6" stroke-linecap="round"/><path d="M36 42h11" stroke="${BI.n}" stroke-width="4.6" stroke-linecap="round"/><path d="M39 36q2.5-3 .5-6.5M44 36q2.5-3 .5-6.5M49 37q2-2.6.4-5.4" stroke="${BI.r}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M22.6 17.5l2.6-1.5M24.2 20.2l2.6-1.5" stroke="${BI.n}" stroke-width="1.4"/>`},
  {id:"captain", name:"Captain", ring:"gold", how:"Sit at #1 on a team leaderboard.",
   art:`<text x="32" y="44" text-anchor="middle" font-family="Oswald,Arial Narrow,sans-serif" font-weight="700" font-size="31" fill="${BI.r}" stroke="${BI.n}" stroke-width="1.6" paint-order="stroke">C</text>`},
];
const BADGE_BY_ID=Object.fromEntries(BADGES.map(b=>[b.id,b]));
// A round felt patch: ring with stitching, cream felt, pictogram.
function badgeEl(id, px=56, earned=true){
  const b=BADGE_BY_ID[id], el=document.createElement("span");
  el.className="badge"+(earned?"":" locked"); el.style.setProperty("--bd-size",px+"px");
  el.innerHTML=`<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="${BADGE_RING[b.ring]}"/>`+
    `<circle cx="32" cy="32" r="28.2" fill="none" stroke="#EFE6D2" stroke-width="1.1" stroke-dasharray="2.3 2"/>`+
    `<circle cx="32" cy="32" r="25.4" fill="${BI.c}"/>${b.art}</svg>`;
  return el;
}

// Works out badges and streaks from a player's picks.
// picks: [{team, game_id, pick, goals, hidden}] (hidden = an upcoming pick another player can't see yet)
// games: [{game_id, game_date, start_utc, home, away, home_score, away_score, period_type}] for those teams
// board: the All teams leaderboard (for Captain); who: the player's username
const ORIGINAL_SIX=["BOS","CHI","DET","MTL","NYR","TOR"];
function computeBadges(picks, games, board, who){
  const G=new Map(games.map(g=>[Number(g.game_id),g]));
  const sheets=[...new Set(picks.map(p=>p.team))];
  const scored=[];
  picks.forEach(p=>{
    const g=G.get(Number(p.game_id)); if(!g || p.hidden) return;
    const sc=scorePick(g,p.team,{o:p.pick||undefined,g:p.goals??undefined}); if(sc) scored.push({p,g,sc});
  });
  scored.sort((a,b)=>String(a.g.start_utc).localeCompare(String(b.g.start_utc)) || a.p.team.localeCompare(b.p.team));
  const results=scored.filter(x=>x.sc.outcomeHit!==null);
  // streaks: results right in a row, across every sheet in game order
  let cur=0, best=0; results.forEach(x=>{ cur = x.sc.outcomeHit ? cur+1 : 0; best=Math.max(best,cur); });
  // longest run on a single sheet (3rd, 2nd and 1st Star)
  let sheetBest=0; sheets.forEach(t=>{ let c=0; results.filter(x=>x.p.team===t).forEach(x=>{ c = x.sc.outcomeHit ? c+1 : 0; sheetBest=Math.max(sheetBest,c); }); });
  // Hat Trick: a W, an L and an OTL all called right on the same sheet
  let hatBest=0;
  sheets.forEach(t=>{ const kinds=new Set(results.filter(x=>x.p.team===t && x.sc.outcomeHit).map(x=>x.p.pick)); hatBest=Math.max(hatBest,kinds.size); });
  // Point Streak: at least one point in consecutive finished games (any sheet, in game order)
  let ptRun=0, ptBest=0;
  scored.filter(x=>x.sc.outcomeHit!==null || x.sc.goalsHit!==null).forEach(x=>{ ptRun = x.sc.points>0 ? ptRun+1 : 0; ptBest=Math.max(ptBest,ptRun); });
  const exact=scored.filter(x=>x.sc.goalsHit).length;
  // nights: every result right with 3+ results graded that day
  const nights={}; results.forEach(x=>{ const d=x.g.game_date; (nights[d]=nights[d]||[]).push(x.sc.outcomeHit); });
  const shutout=Object.values(nights).some(a=>a.length>=3 && a.every(Boolean));
  // full sheet: every game of a team's season has both a result and goals picked (or a hidden pick)
  const fullSheet=sheets.some(t=>{
    const tg=games.filter(g=>g.home===t||g.away===t); if(!tg.length) return false;
    const mine=new Map(picks.filter(p=>p.team===t).map(p=>[Number(p.game_id),p]));
    return tg.every(g=>{ const p=mine.get(Number(g.game_id)); return p && (p.hidden || (p.pick && p.goals!=null)); });
  });
  const divs=new Set(sheets.map(t=>TEAMS[t]?.div).filter(Boolean));
  const o6=ORIGINAL_SIX.filter(t=>sheets.includes(t)).length;
  let captain=false;
  if(who && board?.length){
    const top={}; board.forEach(r=>{ const p=Number(r.points); if(top[r.team]===undefined || p>top[r.team]) top[r.team]=p; });
    captain=board.some(r=>r.username.toLowerCase()===who.toLowerCase() && Number(r.points)>0 && Number(r.points)===top[r.team]);
  }
  // for progress bars
  const maxPts=scored.reduce((m,x)=>Math.max(m,x.sc.points),0);
  const nightBest=Object.values(nights).reduce((m,a)=>a.every(Boolean)?Math.max(m,a.length):m,0);
  let fill=0, fillOf=84;
  sheets.forEach(t=>{
    const tg=games.filter(g=>g.home===t||g.away===t);
    const mine=new Map(picks.filter(p=>p.team===t).map(p=>[Number(p.game_id),p]));
    const n=tg.filter(g=>{ const p=mine.get(Number(g.game_id)); return p && (p.hidden || (p.pick && p.goals!=null)); }).length;
    if(n>fill || (n===fill && tg.length)){ fill=n; fillOf=tg.length||84; }
  });
  let bestRank=null;
  if(who && board?.length){
    const ranks={}; board.forEach(r=>{ (ranks[r.team]=ranks[r.team]||[]).push(Number(r.points)); });
    board.filter(r=>r.username.toLowerCase()===who.toLowerCase()).forEach(r=>{
      const rk=1+ranks[r.team].filter(p=>p>Number(r.points)).length; if(bestRank===null || rk<bestRank) bestRank=rk; });
  }
  const earned={
    faceoff: picks.length>0,
    hattrick: hatBest>=3,
    star3: sheetBest>=3,
    star2: sheetBest>=5,
    star1: sheetBest>=10,
    topshelf: scored.some(x=>x.sc.points===2),
    lamp: exact>=5,
    shutout,
    overtime: results.some(x=>x.p.pick==="OTL" && x.sc.outcomeHit),
    shootout: results.some(x=>x.g.period_type==="SO" && x.sc.outcomeHit),
    fullsheet: fullSheet,
    original6: o6===6,
    barnstormer: divs.size===4,
    pointstreak: ptBest>=10,
    captain,
  };
  const run=n=>`Best run on a sheet: ${Math.min(sheetBest,n)} of ${n}`;
  const progress={ hattrick:`${hatBest} of 3 kinds on one sheet`, star3:run(3), star2:run(5), star1:run(10),
    lamp:`${exact} of 5`, pointstreak:`Best point streak: ${Math.min(ptBest,10)} of 10`,
    original6:`${o6} of 6 sheets`, barnstormer:`${divs.size} of 4 divisions` };
  // [have, need, what's being counted] for each badge's progress bar
  const meter={
    faceoff:[Math.min(picks.length,1),1,"pick made"],
    hattrick:[hatBest,3,"kinds (W, L, OTL) right on one sheet"],
    star3:[Math.min(sheetBest,3),3,"right in a row on one sheet"],
    star2:[Math.min(sheetBest,5),5,"right in a row on one sheet"],
    star1:[Math.min(sheetBest,10),10,"right in a row on one sheet"],
    topshelf:[maxPts,2,"points in your best game"],
    lamp:[Math.min(exact,5),5,"exact goal totals"],
    shutout:[Math.min(nightBest,3),3,"right on your best perfect night"],
    overtime:[earned.overtime?1:0,1,"correct OTL call"],
    shootout:[earned.shootout?1:0,1,"shootout game called right"],
    fullsheet:[fill,fillOf,"games picked on your fullest sheet"],
    original6:[o6,6,"Original Six sheets"],
    barnstormer:[divs.size,4,"divisions"],
    pointstreak:[Math.min(ptBest,10),10,"games in a row with a point"],
    captain:[bestRank===1?1:0,1, bestRank ? `#1 spot (best so far: #${bestRank})` : "#1 spot"],
  };
  Object.keys(earned).forEach(id=>{ if(earned[id]) meter[id][0]=meter[id][1]; });
  return {earned:BADGES.filter(b=>earned[b.id]).map(b=>b.id), progress, meter, streak:{current:cur, best}};
}

// Roughly easiest to hardest, for "Badges in reach" on the home page.
const BADGE_ORDER=["faceoff","star3","topshelf","overtime","hattrick","shootout","barnstormer","lamp","star2","original6","shutout","captain","pointstreak","star1","fullsheet"];
// The n unearned badges you're closest to (highest share done; easier first on ties), listed easiest to hardest.
function badgesInReach(r, n=3){
  const rank=id=>BADGE_ORDER.indexOf(id), share=id=>{ const [h,need]=r.meter[id]; return need ? h/need : 0; };
  return BADGE_ORDER.filter(id=>!r.earned.includes(id))
    .sort((a,b)=>share(b)-share(a) || rank(a)-rank(b)).slice(0,n)
    .sort((a,b)=>rank(a)-rank(b));
}
// A progress bar row: patch, name, bar, "3 of 5 ...". Bar colour follows the badge's ring.
function badgeProgressEl(id, meter, compact=false){
  const b=BADGE_BY_ID[id], [have,need,what]=meter, pct=need?Math.round(Math.min(have,need)/need*100):0;
  const row=document.createElement("div"); row.className="bprog"+(compact?" compact":"");
  row.dataset.ring=b.ring;
  if(compact) row.append(badgeEl(id,40,have>=need));
  const body=document.createElement("div"); body.className="bprog-body";
  if(compact){ const nm=document.createElement("b"); nm.textContent=b.name; body.append(nm); }
  const bar=document.createElement("div"); bar.className="bprog-bar";
  bar.setAttribute("role","progressbar"); bar.setAttribute("aria-valuemin","0"); bar.setAttribute("aria-valuemax",String(need)); bar.setAttribute("aria-valuenow",String(Math.min(have,need)));
  bar.setAttribute("aria-label",`${b.name}: ${have} of ${need}`);
  const fillEl=document.createElement("i"); fillEl.style.width=pct+"%"; bar.append(fillEl);
  const txt=document.createElement("small"); txt.textContent = have>=need ? "Earned" : `${have} of ${need} ${what}`;
  body.append(bar,txt); row.append(body);
  return row;
}

// Every row of a query, 1000 at a time (Supabase returns at most 1000 rows per request).
async function fetchAllRows(make){
  const out=[];
  for(let from=0;;from+=1000){
    const {data,error}=await make().range(from,from+999);
    if(error) throw error;
    out.push(...data); if(data.length<1000) break;
  }
  return out;
}
async function gamesForTeams(sb, teams){
  if(!teams.length) return [];
  const list=teams.join(",");
  return fetchAllRows(()=>sb.from("games").select("game_id,game_date,start_utc,home,away,home_score,away_score,period_type")
    .eq("season",SEASON).or(`home.in.(${list}),away.in.(${list})`).order("game_id"));
}
// Your own badges (signed in): all your picks + those teams' games + the leaderboard.
async function myBadges(sb, username){
  const picks=await fetchAllRows(()=>sb.from("team_picks").select("team,game_id,pick,goals").order("game_id"));
  const teams=[...new Set(picks.map(p=>p.team))];
  const [games, board] = await Promise.all([gamesForTeams(sb,teams), username ? sb.rpc("leaderboard",{p_season:SEASON,p_team:null}).then(r=>r.data||[]) : []]);
  return computeBadges(picks, games, board, username);
}
// Another player's badges, from what anyone can see: their revealed picks (upcoming ones count as made).
async function playerBadges(sb, username, board){
  const teams=[...new Set(board.filter(r=>r.username.toLowerCase()===username.toLowerCase()).map(r=>r.team))];
  const sets=await Promise.all(teams.map(t=>sb.rpc("sheet_picks",{p_username:username,p_team:t,p_season:SEASON})
    .then(({data})=>(data||[]).map(r=>({team:t, game_id:r.game_id, pick:r.pick, goals:r.goals, hidden:!r.revealed})))));
  const picks=sets.flat();
  return computeBadges(picks, await gamesForTeams(sb,teams), board, username);
}

// "New badge" pop-up: compares with the badges this device has already shown you.
function announceBadges(userId, earned, who){
  const key=`stickpicks-badges-${userId}`;
  let seen=null; try{ seen=JSON.parse(localStorage.getItem(key)||"null"); }catch(e){}
  try{ localStorage.setItem(key, JSON.stringify(earned)); }catch(e){}
  const fresh = seen ? earned.filter(id=>!seen.includes(id)) : earned;
  if(!fresh.length) return;
  document.querySelector(".badge-toast")?.remove();
  const t=document.createElement("div"); t.className="badge-toast"; t.setAttribute("role","status");
  const b=BADGE_BY_ID[fresh[0]];
  const text=document.createElement("div"); text.className="badge-toast-text";
  const k=document.createElement("small"); k.textContent = fresh.length===1 ? "New badge" : `${fresh.length} new badges`;
  const n=document.createElement("b"); n.textContent = fresh.length===1 ? b.name : fresh.map(id=>BADGE_BY_ID[id].name).join(" · ");
  const a=document.createElement("a"); a.href="profile.html#badges"; a.textContent="See your badges";
  const row=document.createElement("div"); row.className="badge-toast-acts";
  row.append(shareButton("Share", badgeSpec(fresh[0], who), "linkbtn"), a);
  text.append(k,n,row);
  const x=document.createElement("button"); x.type="button"; x.className="badge-toast-x"; x.setAttribute("aria-label","Close"); x.textContent="×";
  x.addEventListener("click",()=>t.remove());
  t.append(badgeEl(fresh[0],52), text, x);
  document.body.appendChild(t);
  // fades after 12 seconds, unless you're pointing at it or using it
  let hold=false; t.addEventListener("pointerenter",()=>hold=true); t.addEventListener("focusin",()=>hold=true);
  setTimeout(()=>{ if(hold) return; t.classList.add("out"); setTimeout(()=>t.remove(), 600); }, 12000);
}

/* ───────── Sharing: results, badges, standings and invitations ───────── */
// Each Share button draws a picture card (sweater banner, logo, the news) ahead of time, then opens the
// phone's or computer's own share sheet with the picture, a line of text and a link. Browsers without
// one get a small stickpicks share box instead (copy, email, WhatsApp, X, Facebook, save picture).
const SITE_URL="https://stickpicks.hockey/";
// Invitation links name the player who sent them, so the home page can say "Name invited you".
function inviteUrl(name){ return SITE_URL+(name && USERNAME_RULE.test(name) ? `?invite=${encodeURIComponent(name)}` : ""); }
// What each badge means, as a brag ("I just earned the Hat Trick badge on stickpicks: …")
const BADGE_BRAG={
  faceoff:"made my first pick of the 2026–27 season", hattrick:"called a W, an L and an OTL right on one sheet",
  star3:"got 3 results right in a row on one sheet", star2:"got 5 results right in a row on one sheet", star1:"got 10 results right in a row on one sheet",
  topshelf:"nailed the result and the exact goals in the same game", lamp:"nailed the exact combined goals 5 times",
  shutout:"got every result right on a night with 3+ games", overtime:"called an overtime loss right", shootout:"called a shootout game right",
  fullsheet:"picked every game on a sheet", original6:"started sheets for all of the Original Six", barnstormer:"started sheets in all four divisions",
  pointstreak:"scored a point in 10 straight games", captain:"took the #1 spot on a team leaderboard" };

function badgeSpec(id, who){
  const b=BADGE_BY_ID[id];
  return {kind:"badge", title:`${b.name} · stickpicks`, url:inviteUrl(who),
    text:`I just earned the ${b.name} badge on stickpicks: ${BADGE_BRAG[id]||b.how}. Think you can pick better?`,
    card:{kicker:"New badge", title:b.name, sub:b.how, badge:id, who}};
}
function inviteSpec(who){
  return {kind:"invite", title:"Join me on stickpicks", url:inviteUrl(who),
    text:"Join me on stickpicks: call every NHL game (W, L or OTL, plus the combined goals) and climb the leaderboard. Free to play.",
    card:{kicker: who ? `${who} invited you` : "You're invited", title:"Join me on stickpicks", sub:"Call every NHL game this season. Free to play.", medals:true}};
}

const SHARE_ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M7 11H5v10h14V11h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// A Share button. spec: {kind, title, text, url, card:{kicker, title, sub, stats:[[value,label]], badge, medals, who}}
// lazy: draw the card only once the button scrolls into view (for long lists, like the profile's badges).
function shareButton(label, spec, cls="btn ghost", lazy=false){
  const b=document.createElement("button"); b.type="button"; b.className=cls+" sharebtn";
  const t=document.createElement("span"); t.textContent=label; b.innerHTML=SHARE_ICON; b.append(t);
  let file=null, ready=null;
  const draw=()=>ready ||= (spec.card ? cardFor(spec.card).then(blob=>{ file=new File([blob],"stickpicks.png",{type:"image/png"}); }).catch(()=>{}) : Promise.resolve());
  if(lazy && "IntersectionObserver" in window){
    const io=new IntersectionObserver(es=>{ if(es.some(e=>e.isIntersecting)){ io.disconnect(); draw(); } }); io.observe(b);
  }else draw();
  b.addEventListener("click", async ()=>{
    draw();
    if(!file) await Promise.race([ready, new Promise(r=>setTimeout(r,1500))]);
    shareNow(spec, file);
  });
  return b;
}
// Cards already drawn on this page, so a refreshed button doesn't draw the same picture again
const cardCache=new Map();
function cardFor(card){
  const key=JSON.stringify(card);
  if(!cardCache.has(key)) cardCache.set(key, drawCard(card).catch(e=>{ cardCache.delete(key); throw e; }));
  return cardCache.get(key);
}
async function shareNow(spec, file){
  try{ window.goatcounter?.count?.({path:`share-${spec.kind}`, title:`Share: ${spec.kind}`, event:true}); }catch(e){}
  if(navigator.share){
    try{
      if(file && navigator.canShare?.({files:[file]})) await navigator.share({title:spec.title, text:`${spec.text}\n${spec.url}`, files:[file]});
      else await navigator.share({title:spec.title, text:spec.text, url:spec.url});
      return;
    }catch(e){ if(e.name==="AbortError") return; }   // cancelled; anything else falls through to our own box
  }
  openShareSheet(spec, file);
}
// Our own share box, for browsers without a share sheet.
function openShareSheet(spec, file){
  document.querySelector(".sharesheet")?.remove();
  const d=document.createElement("dialog"); d.className="sharesheet"; d.setAttribute("aria-label","Share");
  const head=document.createElement("div"); head.className="ss-head";
  const h=document.createElement("b"); h.textContent = spec.kind==="invite" ? "Invite friends" : "Share";
  const x=document.createElement("button"); x.type="button"; x.className="ss-x"; x.setAttribute("aria-label","Close"); x.textContent="×";
  x.addEventListener("click",()=>d.close()); head.append(h,x);
  const body=document.createElement("div"); body.className="ss-body";
  if(file){ const img=document.createElement("img"); img.alt=""; img.src=URL.createObjectURL(file); body.append(img); }
  const p=document.createElement("p"); p.textContent=`${spec.text} ${spec.url}`; body.append(p);
  const acts=document.createElement("div"); acts.className="ss-acts";
  const status=document.createElement("small"); status.className="ss-status"; status.setAttribute("role","status");
  const copy=document.createElement("button"); copy.type="button"; copy.className="btn"; copy.textContent="Copy link";
  copy.addEventListener("click", async ()=>{
    try{ await navigator.clipboard.writeText(`${spec.text} ${spec.url}`); status.textContent="Copied. Paste it anywhere."; }
    catch(e){ status.textContent="Couldn’t copy. Select the text above instead."; }
  });
  acts.append(copy);
  const enc=encodeURIComponent, link=(label,href)=>{ const a=document.createElement("a"); a.className="btn ghost"; a.textContent=label; a.href=href; a.target="_blank"; a.rel="noopener"; acts.append(a); };
  link("Email", `mailto:?subject=${enc(spec.title)}&body=${enc(`${spec.text}\n\n${spec.url}`)}`);
  link("WhatsApp", `https://wa.me/?text=${enc(`${spec.text} ${spec.url}`)}`);
  link("X", `https://x.com/intent/post?text=${enc(spec.text)}&url=${enc(spec.url)}`);
  link("Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(spec.url)}`);
  if(file){
    const pic=URL.createObjectURL(file);
    // Instagram and TikTok have no "share this link" address, so: save the picture, copy the caption,
    // and open the site so it's ready to post (the app's own share sheet does this on phones).
    [["Instagram","https://www.instagram.com/"],["TikTok","https://www.tiktok.com/upload"]].forEach(([name,site])=>{
      const b=document.createElement("button"); b.type="button"; b.className="btn ghost"; b.textContent=name;
      b.addEventListener("click", async ()=>{
        window.open(site,"_blank","noopener");   // first, while the tap still counts (pop-up blockers)
        const a=document.createElement("a"); a.href=pic; a.download="stickpicks.png"; document.body.append(a); a.click(); a.remove();
        let copied=false; try{ await navigator.clipboard.writeText(`${spec.text} ${spec.url}`); copied=true; }catch(e){}
        status.textContent=`Picture saved${copied?" and caption copied":""}. Post it in ${name}${copied?" and paste the caption":""}.`;
      });
      acts.append(b);
    });
    const a=document.createElement("a"); a.className="btn ghost"; a.textContent="Save picture"; a.href=pic; a.download="stickpicks.png"; acts.append(a);
  }
  body.append(acts, status); d.append(head, body);
  d.addEventListener("close",()=>d.remove());
  d.addEventListener("click",e=>{ if(e.target===d) d.close(); });   // click outside the box
  document.body.append(d); d.showModal();
}

// ── The picture card: 1200 × 630, the road sweater (navy knit, red and cream sleeve and hem stripes) ──
const CARD={w:1200, h:630, navy:"#1C2B45", red:"#E8463F", wool:"#EFE6D2", gold:"#D9A33A"};
function svgImage(svg){
  return new Promise((ok,fail)=>{ const i=new Image(); i.onload=()=>ok(i); i.onerror=fail; i.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg); });
}
let cardLogo=null;
// The logo as two pictures (the stick, then the puck that dots the "i"); the script itself is drawn as text.
function cardLogoParts(){
  if(cardLogo) return cardLogo;
  cardLogo=fetch(`logo.svg?v=${ASSET_V}`).then(r=>r.text()).then(svg=>{
    const col={"--logo-wood":"#C99456","--logo-grain":"#7A4E22","--logo-tape":"#F3EEE2","--logo-wrap":"#1C2B45","--logo-puck-rim":"#EFE6D2"};
    svg=svg.replace(/var\((--logo-[a-z-]+)(?:,\s*none)?\)/g,(m,k)=>col[k]||"none").replace("<svg ",'<svg width="1144" height="405" ');
    const noText=svg.replace(/<text[\s\S]*?<\/text>/,"");
    return Promise.all([
      svgImage(noText.replace(/<path d="M134\.9[^>]*\/>/,"").replace(/<ellipse[^>]*\/>/,"")),   // stick
      svgImage(noText.replace(/<g transform="translate[\s\S]*?<\/g>/,"")),                        // puck
    ]);
  }).catch(()=>null);
  return cardLogo;
}
function badgeSvg(id){
  const b=BADGE_BY_ID[id];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="${BADGE_RING[b.ring]}"/>`+
    `<circle cx="32" cy="32" r="28.2" fill="none" stroke="#EFE6D2" stroke-width="1.1" stroke-dasharray="2.3 2"/><circle cx="32" cy="32" r="25.4" fill="${BI.c}"/>${b.art}</svg>`;
}
async function drawCard(o){
  await Promise.all(["700 90px Oswald","600 28px Oswald","italic 30px 'Libre Caslon Text'","64px Yellowtail"].map(f=>document.fonts?.load(f).catch(()=>{})));
  const {w:W,h:H}=CARD, c=document.createElement("canvas"); c.width=W; c.height=H;
  const x=c.getContext("2d");
  const spaced=(px)=>{ if("letterSpacing" in x) x.letterSpacing=px; };
  // navy knit
  x.fillStyle=CARD.navy; x.fillRect(0,0,W,H);
  x.strokeStyle="rgba(239,230,210,.045)"; x.lineWidth=2;
  for(let yy=6; yy<H; yy+=16){ x.beginPath(); for(let xx=-8; xx<W; xx+=16){ x.moveTo(xx,yy); x.lineTo(xx+8,yy+7); x.lineTo(xx+16,yy); } x.stroke(); }
  // sleeve stripes and hem
  x.fillStyle=CARD.red; x.fillRect(22,0,22,H-50); x.fillStyle=CARD.wool; x.fillRect(60,0,22,H-50);
  x.fillStyle=CARD.red; x.fillRect(0,H-50,W,18); x.fillStyle=CARD.wool; x.fillRect(0,H-22,W,22);
  // logo, top left
  const LX=122, LY=30, LH=126, s=LH/101.28, parts=await cardLogoParts();
  if(parts) x.drawImage(parts[0], LX, LY, 286.07*s, LH);
  x.save(); x.translate(LX,LY); x.scale(s,s); x.translate(11.62,63.64);
  x.translate(131.42,-13); x.rotate(-6*Math.PI/180); x.translate(-131.42,13);
  x.font="64px Yellowtail"; x.lineJoin="round"; x.lineWidth=3.2; x.strokeStyle=CARD.navy; x.fillStyle=CARD.red;
  x.strokeText("stickpicks",0,0); x.fillText("stickpicks",0,0); x.restore();
  if(parts) x.drawImage(parts[1], LX, LY, 286.07*s, LH);
  // right-hand art: a badge patch, or the three scoring medals
  const art = o.badge ? await svgImage(badgeSvg(o.badge)).catch(()=>null) : null;
  const textW = (art||o.medals) ? 600 : 960;
  if(art){ x.save(); x.shadowColor="rgba(0,0,0,.35)"; x.shadowBlur=24; x.shadowOffsetY=8; x.drawImage(art, 790, 120, 330, 330); x.restore(); }
  if(o.medals){
    [["+1","#33476A","Right result"],["+1","#9B1C1F","Exact goals"],["2","#C08A2A","Max per game"]].forEach(([v,bg,lbl],i)=>{
      const cy=150+i*125, cx=830;
      x.fillStyle=bg; x.beginPath(); x.arc(cx,cy,50,0,7); x.fill();
      x.setLineDash([7,6]); x.strokeStyle="rgba(239,230,210,.8)"; x.lineWidth=2.5; x.beginPath(); x.arc(cx,cy,41,0,7); x.stroke(); x.setLineDash([]);
      x.fillStyle=CARD.wool; x.font="700 40px Oswald"; x.textAlign="center"; x.textBaseline="middle"; spaced("0px"); x.fillText(v,cx,cy+2);
      x.textAlign="left"; x.font="600 28px Oswald"; spaced("3px"); x.fillText(lbl.toUpperCase(), cx+72, cy+2);
    });
    x.textBaseline="alphabetic"; spaced("0px");
  }
  // kicker, headline, line of italic
  let y = o.stats?.length ? 228 : 268;   // sit lower when there's no row of numbers underneath
  x.fillStyle=CARD.gold; x.font="600 28px Oswald"; spaced("5px"); x.fillText(String(o.kicker||"").toUpperCase(),130,y); spaced("0px");
  let size=96; x.font=`700 ${size}px Oswald`; const head=String(o.title||"").toUpperCase();
  while(size>48 && x.measureText(head).width>textW){ size-=4; x.font=`700 ${size}px Oswald`; }
  y+=size+6; x.fillStyle=CARD.wool; x.fillText(head,130,y);
  if(o.sub){
    x.font="italic 32px 'Libre Caslon Text'"; x.fillStyle="rgba(239,230,210,.84)";
    const words=String(o.sub).split(" "), lines=[""]; words.forEach(wd=>{ const t=(lines.at(-1)+" "+wd).trim(); if(x.measureText(t).width>textW && lines.at(-1)) lines.push(wd); else lines[lines.length-1]=t; });
    lines.slice(0,2).forEach(l=>{ y+=48; x.fillText(l,130,y); });
  }
  // stats row: big numbers with italic labels
  if(o.stats?.length){
    let sx=130; const sy=H-112;
    o.stats.forEach(([v,lbl])=>{
      x.font="700 64px Oswald"; x.fillStyle=CARD.wool; x.fillText(String(v),sx,sy);
      const vw=x.measureText(String(v)).width;
      x.font="italic 24px 'Libre Caslon Text'"; x.fillStyle=CARD.gold; x.fillText(lbl,sx,sy+34);
      sx+=Math.max(vw, x.measureText(lbl).width)+64;
    });
  }
  // address, bottom right
  x.font="600 26px Oswald"; spaced("4px"); x.fillStyle=CARD.wool; x.textAlign="right"; x.fillText("STICKPICKS.HOCKEY", W-48, H-72); x.textAlign="left";
  return new Promise((ok,fail)=>c.toBlob(b=>b?ok(b):fail(new Error("no picture")),"image/png"));
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
