// Breakaway: a hockey endless runner for the Intermission page.
// Jump over pucks, cones and nets; duck under slap shots. Everything is drawn with canvas shapes
// (no images): a stickpicks arena (navy stands, rafter banners, branded boards) and an NHL skater in
// full gear (helmet and visor, jersey with hem and sleeve stripes, breezers, striped socks, skates,
// two hands on a wooden stick) wearing the colours of the last team sheet you opened.
// Space / ↑ / W to jump (hold for higher), ↓ / S to duck; tap the rink (top jumps, hold the bottom to duck).
//
// The page listens for "breakaway:end" (detail: {score, ms}) to post scores, and can call
// window.breakaway.setBest(n) and window.breakaway.setNote(text) to show the saved best and a status line.
(function(){
  const canvas=document.getElementById("rink");
  if(!canvas) return;
  const ctx=canvas.getContext("2d");
  const wrap=canvas.parentElement;
  const hiEl=document.getElementById("runHi");
  const HI_KEY="stickpicks-breakaway-hi";

  const H=220, GROUND=196;                // logical height and ice line
  const GRAVITY=2600, JUMP_V=-860, SHORT_HOP_V=-430, FAST_FALL=5200;
  const START_SPEED=380, MAX_SPEED=950, ACCEL=9;  // px per second (and per second²); score adds speed/38 a second
  const STAND_H=56, DUCK_H=34, PLAYER_X=64;
  const C={navy:"#1C2B45", navy2:"#14203A", red:"#9B1C1F", red2:"#E8463F", wool:"#EFE6D2", gold:"#D9A33A", wood:"#B98245", ice:"#F4F8FA"};

  let W=600, dpr=1;
  const touch=window.matchMedia?.("(pointer:coarse)").matches;
  let state="ready";                      // ready | running | over
  let speed, dist, score, hi=0, t, spawnIn, obstacles, flashUntil=0, message="", note="", newBest=false, sparks=[];
  const P={y:0, vy:0, ducking:false, onIce:true, stride:0};
  let jumpHeld=false, downHeld=false, last=0, visible=true, raf=0;

  try{ hi=Number(localStorage.getItem(HI_KEY))||0; }catch(e){}

  // Sweater colours follow the last team sheet opened; the number comes from your sweater picture, if you made one.
  let kit={main:C.navy, trim:C.red2, num:""};
  try{
    const code=localStorage.getItem("nhl-picks-last-team");
    if(code && typeof TEAMS!=="undefined" && TEAMS[code]){
      const tm=TEAMS[code];
      kit.main=tm.board; kit.trim=tm.stripe||firstReadable(tm.board,[tm.accent,tm.brand,"#FFFFFF"],2);
    }
    const me=typeof readMe==="function" ? readMe() : null;
    if(me?.avatar?.kind==="sweater" && me.avatar.number!=null) kit.num=String(me.avatar.number);
  }catch(e){}
  kit.dark=shade(kit.main,-0.45);                     // breezers and gloves
  kit.numInk=typeof firstReadable==="function" ? firstReadable(kit.main,["#FFFFFF",kit.trim,"#111111"],3) : "#FFFFFF";

  const MESSAGES={
    pucks:["Tripped over a loose puck. Two minutes in the box.","Pucks everywhere! Down goes the skater.","Stumbled on the puck pile. Back to the bench."],
    cones:["Took out the cones. Practice is over.","Hooked by a cone. Tough break.","The cones win this shift."],
    net:["Crashed the net! Goaltender interference.","Ran into the goal. That one's going to leave a mark.","Knocked the net off its moorings."],
    slap:["Caught a slap shot. Keep your head down!","Should have ducked. That's a long shift.","Took one off the helmet. Shake it off."],
    barrage:["Stepped in front of the point shots. Blocked them with the visor.","That's a lot of rubber. Get low next time!","Caught the whole barrage. Hit the deck sooner."]
  };

  function resize(){
    dpr=Math.max(1,Math.min(window.devicePixelRatio||1,2));
    W=Math.max(320,Math.round(wrap.clientWidth));
    canvas.width=W*dpr; canvas.height=H*dpr;
    canvas.style.width=W+"px"; canvas.style.height=H+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state!=="running") draw();
  }

  function reset(){
    speed=START_SPEED; dist=0; score=0; t=0; obstacles=[]; spawnIn=W*0.6; sparks=[];
    P.y=0; P.vy=0; P.ducking=false; P.onIce=true; P.stride=0; message=""; note=""; newBest=false;
    lastGround=-9; lastShot=-9; per=0; callout={text:"",until:0};
  }

  /* ───── Periods: the game gets harder as it goes ───── */
  // 1st (0–299), 2nd (300–699), 3rd (700–1,199), then overtime. Each period brings more obstacles, tighter and
  // steadier gaps, faster shots, and more you can only duck: slap shots, "point shots" (a barrage of pucks too
  // high to jump), and combos (jump something, then a shot arrives just after you land).
  // The speed and scoring don't change, so posted scores stay comparable (and pass the server's check).
  const PERIODS=[
    {at:0,    name:"1ST", call:"",           mix:{pucks:.34,cones:.3,net:.2,slap:.16,barrage:0,  combo:0  }, minGap:.8,  spread:.9,  breather:.15, shot:1.18},
    {at:300,  name:"2ND", call:"2ND PERIOD", mix:{pucks:.2,cones:.2,net:.16,slap:.22,barrage:.1,combo:.12}, minGap:.74, spread:.62, breather:.1,  shot:1.24},
    {at:700,  name:"3RD", call:"3RD PERIOD", mix:{pucks:.16,cones:.14,net:.12,slap:.24,barrage:.16,combo:.18}, minGap:.72, spread:.48, breather:.07, shot:1.3},
    {at:1200, name:"OT",  call:"OVERTIME",   mix:{pucks:.14,cones:.14,net:.14,slap:.2,barrage:.18,combo:.2 }, minGap:.7,  spread:.38, breather:.05, shot:1.36},
  ];
  let per=0, callout={text:"",until:0}, lastGround=-9, lastShot=-9;   // when the last ground obstacle / shot reaches the skater (game time)
  const periodFor=s=>PERIODS.reduce((k,p,i)=>s>=p.at?i:k,0);
  const SHOT_GAP=0.82, STAND_GAP=0.45;   // seconds: land a jump before a shot arrives; get up from a duck before jumping again

  /* ───── Obstacles ───── */
  function pick(mix){ let r=Math.random(), k; for(k in mix){ r-=mix[k]; if(r<=0) return k; } return "pucks"; }
  function spawn(){
    const p=PERIODS[per], scale=Math.max(0.62,Math.min(1,W/720)), v=speed*scale;
    let kind=pick(p.mix);
    if(kind==="slap" && score<120) kind="pucks";        // the first few seconds are all jumps
    let x=W+30;
    const arrive=(xx,f=1)=>t+(xx-PLAYER_X)/(v*f);
    // shots (duck): never arrive while you're still coming down from the last jump
    const shot=(o)=>{
      const f=p.shot; o.v=f;
      if(arrive(o.x,f) < lastGround+SHOT_GAP) o.x=PLAYER_X+v*f*(lastGround+SHOT_GAP-t);
      lastShot=arrive(o.x,f); obstacles.push(o); return o;
    };
    // ground obstacles (jump): leave time to stand up after a shot
    const ground=(o)=>{
      if(arrive(o.x) < lastShot+STAND_GAP) o.x=PLAYER_X+v*(lastShot+STAND_GAP-t);
      lastGround=arrive(o.x); obstacles.push(o); return o;
    };
    const groundAt=(xx)=>{
      const r=Math.random();
      if(r<0.42){ const n=1+Math.floor(Math.random()*(score>150?3:2)); return ground({kind:"pucks", x:xx, w:24, h:8*n, n}); }
      if(r<0.75){ const n=Math.random()<(score>100?0.45:0.2)?2:1, big=Math.random()<0.4, cw=big?24:18, ch=big?34:26;
        return ground({kind:"cones", x:xx, w:n*cw+(n-1)*4, h:ch, n, cw, ch}); }
      return ground({kind:"net", x:xx, w:44, h:36});
    };
    let last;
    if(kind==="slap") last=shot({kind:"slap", x, w:22, h:9, lift:42+Math.random()*6});
    else if(kind==="barrage") last=shot({kind:"barrage", x, w:22, h:9, lifts:[40,72,104,136]});   // too high to jump: duck
    else if(kind==="combo"){ groundAt(x); last=shot({kind:"slap", x:x+1, w:22, h:9, lift:42+Math.random()*6}); }
    else if(kind==="pucks"){ const n=1+Math.floor(Math.random()*(score>150?3:2)); last=ground({kind:"pucks", x, w:24, h:8*n, n}); }
    else if(kind==="cones"){ const n=Math.random()<(score>100?0.45:0.2)?2:1, big=Math.random()<0.4, cw=big?24:18, ch=big?34:26;
      last=ground({kind:"cones", x, w:n*cw+(n-1)*4, h:ch, n, cw, ch}); }
    else last=ground({kind:"net", x, w:44, h:36});
    // next gap (in ice distance) scales with speed so every obstacle stays clearable; later periods are tighter and steadier
    const extra=Math.max(0,(last.x-x)/(last.v||1));      // a shot pushed back to keep it fair also pushes back what follows
    spawnIn = extra + v*(p.minGap+Math.random()*p.spread) + (Math.random()<p.breather?v*0.6:0);
  }

  function playerBox(){
    const h=P.ducking&&P.onIce?DUCK_H:STAND_H, w=P.ducking&&P.onIce?40:28;
    return {x:PLAYER_X+4, y:GROUND-P.y-h+4, w:w-8, h:h-6};
  }
  function obstacleBox(o){
    if(o.kind==="slap") return {x:o.x+2, y:GROUND-o.lift-o.h, w:o.w-4, h:o.h};
    if(o.kind==="barrage"){ const top=Math.max(...o.lifts)+o.h, low=Math.min(...o.lifts); return {x:o.x+2, y:GROUND-top, w:o.w+2, h:top-low}; }   // pucks are staggered 6px
    return {x:o.x+3, y:GROUND-o.h+3, w:o.w-6, h:o.h-3};
  }
  const hit=(a,b)=>a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;

  /* ───── Loop ───── */
  function update(dt){
    t+=dt;
    speed=Math.min(MAX_SPEED, speed+ACCEL*dt);
    const scale=Math.max(0.62,Math.min(1,W/720));   // narrow screens scroll a bit slower
    const dx=speed*scale*dt; dist+=dx;
    const before=Math.floor(score/100);
    score+=speed*dt/38;
    if(Math.floor(score/100)>before) flashUntil=t+0.6;
    const np=periodFor(score); if(np>per){ per=np; callout={text:PERIODS[per].call, until:t+1.8}; }

    // player physics
    if(!P.onIce){
      P.vy += (downHeld?FAST_FALL:GRAVITY)*dt;
      P.y -= P.vy*dt;
      if(P.y<=0){ P.y=0; P.vy=0; P.onIce=true; spray(8); }
    }
    const wasDucking=P.ducking;
    P.ducking = downHeld && P.onIce;
    if(P.ducking && !wasDucking) spray(5);
    // stride rate: long, gliding strides that quicken only a little with speed (about 1.1 to 1.5 a second)
    if(P.onIce && !P.ducking) P.stride += dt*2*Math.PI*(0.85+speed/1500);

    // ice spray
    sparks.forEach(s=>{ s.x+=s.vx*dt-dx; s.y+=s.vy*dt; s.vy+=500*dt; s.life-=dt; });
    sparks=sparks.filter(s=>s.life>0);

    // obstacles
    spawnIn-=dx;
    if(spawnIn<=0) spawn();
    obstacles.forEach(o=>o.x-=dx*(o.v||1));                 // shots fly faster than the ice moves
    obstacles=obstacles.filter(o=>o.x+o.w>-20);

    const pb=playerBox();
    const crash=obstacles.find(o=>hit(pb,obstacleBox(o)));
    if(crash) gameOver(crash.kind);
  }
  function spray(n){
    for(let i=0;i<n;i++) sparks.push({x:PLAYER_X+4+Math.random()*16, y:GROUND-1, vx:-60-Math.random()*120, vy:-60-Math.random()*110, life:0.35+Math.random()*0.25});
  }

  function frame(now){
    raf=0;
    if(state!=="running" || !visible) return;
    const dt=Math.min(0.05,(now-(last||now))/1000); last=now;
    update(dt);
    draw();
    if(state==="running") raf=requestAnimationFrame(frame);
  }
  function run(){ if(!raf && state==="running" && visible){ last=0; raf=requestAnimationFrame(frame); } }

  function start(){ reset(); state="running"; run(); }
  function gameOver(kind){
    state="over";
    const list=MESSAGES[kind]||MESSAGES.pucks;
    message=list[Math.floor(Math.random()*list.length)];
    const s=Math.floor(score);
    if(s>hi){ hi=s; newBest=true; try{ localStorage.setItem(HI_KEY,String(hi)); }catch(e){} }
    draw();
    // t is the game's own clock (the same one the score is built from), so the server can check the score
    window.dispatchEvent(new CustomEvent("breakaway:end",{detail:{score:s, ms:Math.round(t*1000)}}));
  }

  /* ───── Input ───── */
  function jump(){
    if(state!=="running"){ start(); return; }
    if(P.onIce){ P.onIce=false; P.vy=JUMP_V; P.y=0.01; }
  }
  function releaseJump(){ if(!P.onIce && P.vy<SHORT_HOP_V) P.vy=SHORT_HOP_V; } // tap = short hop

  const isJump=k=>k===" "||k==="ArrowUp"||k==="w"||k==="W";
  const isDuck=k=>k==="ArrowDown"||k==="s"||k==="S";
  canvas.addEventListener("keydown",e=>{
    if(isJump(e.key)){ e.preventDefault(); if(!jumpHeld){ jumpHeld=true; jump(); } }
    else if(isDuck(e.key)){ e.preventDefault(); downHeld=true; }
    else if(e.key==="Enter" && state!=="running"){ e.preventDefault(); start(); }
  });
  canvas.addEventListener("keyup",e=>{
    if(isJump(e.key)){ jumpHeld=false; releaseJump(); }
    else if(isDuck(e.key)) downHeld=false;
  });
  canvas.addEventListener("blur",()=>{ jumpHeld=false; downHeld=false; });

  // touch / mouse: top half jumps, holding the bottom half ducks
  canvas.addEventListener("pointerdown",e=>{
    canvas.focus({preventScroll:true});
    const r=canvas.getBoundingClientRect(), lower=(e.clientY-r.top)>r.height*0.62;
    if(state==="running" && lower){ downHeld=true; }
    else { jumpHeld=true; jump(); }
    canvas.setPointerCapture?.(e.pointerId);
  });
  const up=()=>{ if(jumpHeld){ jumpHeld=false; releaseJump(); } downHeld=false; };
  canvas.addEventListener("pointerup",up);
  canvas.addEventListener("pointercancel",up);

  document.querySelectorAll("[data-run]").forEach(b=>{
    const act=b.dataset.run;
    b.addEventListener("pointerdown",e=>{ e.preventDefault(); if(act==="jump"){ jumpHeld=true; jump(); } else { if(state!=="running") return; downHeld=true; } });
    b.addEventListener("pointerup",up); b.addEventListener("pointerleave",up); b.addEventListener("pointercancel",up);
  });

  // pause when scrolled away or the tab is hidden
  new IntersectionObserver(es=>{ visible=es[0].isIntersecting && !document.hidden; if(visible) run(); },{threshold:0.2}).observe(canvas);
  document.addEventListener("visibilitychange",()=>{ visible=!document.hidden; if(visible) run(); });
  window.addEventListener("resize",resize);

  /* ───── Drawing: the arena ───── */
  function draw(){
    const off=dist||0;
    // stands: navy, with the crowd in sweater colours and rafter banners above
    const sg=ctx.createLinearGradient(0,0,0,58); sg.addColorStop(0,C.navy2); sg.addColorStop(1,C.navy);
    ctx.fillStyle=sg; ctx.fillRect(0,0,W,58);
    const crowd=["#2E4066","#3A4E78","#6B2B33","#53627E","#8C7A55","#2A3A5C"];
    for(let row=0;row<3;row++){
      const y=20+row*13, step=10, sx=((-(off*(0.12+row*0.03)))%step+step)%step;
      for(let x=sx-step;x<W+step;x+=step){
        const k=Math.abs(Math.floor((x-sx)/step)*7+row*3)%crowd.length;
        ctx.fillStyle=crowd[k]; ctx.beginPath(); ctx.arc(x+(row%2)*5, y, 3.6, 0, 6.283); ctx.fill();
        ctx.fillRect(x+(row%2)*5-3.8, y+1, 7.6, 6);
      }
    }
    // rafter banners (like the Inaugural Season patch), drifting slowly
    for(let x=-((off*0.05)%260)+40;x<W;x+=260){
      ctx.fillStyle=C.red; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+22,0); ctx.lineTo(x+22,17); ctx.lineTo(x+11,13); ctx.lineTo(x,17); ctx.closePath(); ctx.fill();
      ctx.fillStyle=C.wool; ctx.font='700 6px "Oswald", system-ui, sans-serif'; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("26–27", x+11, 7);
    }
    // glass with reflections and stanchions
    ctx.fillStyle="#D3E3EC"; ctx.fillRect(0,58,W,26);
    ctx.fillStyle="rgba(255,255,255,.6)";
    for(let x=-((off*0.6)%120);x<W;x+=120){ ctx.fillRect(x,58,2,26); ctx.save(); ctx.globalAlpha=.5; ctx.fillRect(x+28,61,30,3); ctx.fillRect(x+40,67,16,2); ctx.restore(); }
    // boards: navy rail, cream panels with stickpicks and BREAKAWAY ads, gold kick plate
    ctx.fillStyle=C.navy; ctx.fillRect(0,84,W,5);
    ctx.fillStyle="#FBFAF6"; ctx.fillRect(0,89,W,29);
    const bp=-(off%300);
    for(let x=bp-300;x<W+300;x+=300){
      ctx.fillStyle=C.wool; ctx.fillRect(x+8,92,132,22); ctx.fillRect(x+158,92,132,22);
      ctx.fillStyle=C.red; ctx.font='22px "Yellowtail", cursive'; ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillText("stickpicks", x+74, 103);
      ctx.fillStyle=C.navy; ctx.fillRect(x+158,92,132,22);
      ctx.fillStyle=C.wool; ctx.font='700 13px "Oswald", system-ui, sans-serif';
      if("letterSpacing" in ctx) ctx.letterSpacing="3px";
      ctx.fillText("BREAKAWAY", x+224, 103.5);
      if("letterSpacing" in ctx) ctx.letterSpacing="0px";
      ctx.fillStyle=C.red2; ctx.fillRect(x+158,110,132,2); ctx.fillStyle=C.wool; ctx.fillRect(x+158,112,132,1.2);
    }
    ctx.fillStyle=C.gold; ctx.fillRect(0,118,W,5);
    // ice
    const g=ctx.createLinearGradient(0,123,0,H); g.addColorStop(0,"#E3EEF4"); g.addColorStop(1,C.ice);
    ctx.fillStyle=g; ctx.fillRect(0,123,W,H-123);
    // rink markings scroll with the ice
    const period=900, base=-(off%period);
    for(let k=-1;k<3;k++){
      const x=base+k*period;
      ctx.fillStyle="rgba(155,28,31,.5)"; ctx.fillRect(x+150,123,7,H-123);               // red line
      ctx.fillStyle="rgba(28,43,69,.42)"; ctx.fillRect(x+420,123,9,H-123);               // blue line
      ctx.fillStyle="rgba(155,28,31,.5)"; ctx.beginPath(); ctx.arc(x+640,166,5,0,6.283); ctx.fill();   // faceoff dot
      ctx.strokeStyle="rgba(155,28,31,.35)"; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x+640,166,42,14,0,0,6.283); ctx.stroke();
    }
    // skate-line scratches
    ctx.strokeStyle="rgba(140,170,190,.35)"; ctx.lineWidth=1;
    for(let i=0;i<14;i++){
      const x=((i*97 - off)%(W+80)+W+80)%(W+80)-40, y=GROUND+3+(i*13)%18;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+18+(i%3)*8,y+1); ctx.stroke();
    }

    obstacles?.forEach(drawObstacle);
    drawWarnings();
    drawSkater();
    sparks.forEach(s=>{ ctx.fillStyle=`rgba(255,255,255,${Math.min(1,s.life*3)})`; ctx.fillRect(s.x,s.y,2.2,2.2); });

    drawScoreboard();
    if(hiEl) hiEl.textContent=hi;
    if(state!=="running") overlay();
  }

  // Shots give a moment's warning: a red marker at the right edge, at the height they'll arrive
  function drawWarnings(){
    if(state!=="running") return;
    const v=speed*Math.max(0.62,Math.min(1,W/720));
    obstacles.forEach(o=>{
      if(!o.v || o.x<W-6) return;
      const secs=(o.x-W)/(v*o.v); if(secs>0.75) return;
      const a=0.55+0.45*Math.sin(t*28);
      const marks = o.kind==="barrage" ? o.lifts : [o.lift];
      ctx.fillStyle=`rgba(232,70,63,${a})`;
      marks.forEach(l=>{ const y=GROUND-l-o.h/2; ctx.beginPath(); ctx.moveTo(W-4,y-6); ctx.lineTo(W-14,y); ctx.lineTo(W-4,y+6); ctx.closePath(); ctx.fill(); });
      if(o.kind==="barrage"){ ctx.fillRect(W-3,GROUND-Math.max(...o.lifts)-o.h,2,Math.max(...o.lifts)-Math.min(...o.lifts)+o.h); }
    });
  }

  // Score in a navy scoreboard box with gold digits, the period, and a call-out when a new period starts
  function drawScoreboard(){
    const s=String(Math.floor(score||0)).padStart(5,"0"), flashing=state==="running" && t<flashUntil && Math.floor(t*10)%2===0;
    const bw=184, bx=W-bw-10, by=8;                    // up in the stands, like the arena scoreboard, clear of the ice
    ctx.fillStyle="#0F1828"; roundRect(bx,by,bw,24,4); ctx.fill();
    ctx.strokeStyle="rgba(217,163,58,.7)"; ctx.lineWidth=1; roundRect(bx+.5,by+.5,bw-1,23,4); ctx.stroke();
    ctx.fillStyle=C.red2; ctx.fillRect(bx,by+21,bw,1.5);
    ctx.textBaseline="middle"; ctx.textAlign="left";
    ctx.fillStyle=C.red; roundRect(bx+4,by+4,28,14,2); ctx.fill();
    ctx.font='700 9.5px "Oswald", system-ui, sans-serif'; ctx.fillStyle=C.wool; ctx.textAlign="center"; ctx.fillText(PERIODS[per].name, bx+18, by+11.5);
    ctx.textAlign="left";
    ctx.font='600 9px "Oswald", system-ui, sans-serif'; ctx.fillStyle="rgba(239,230,210,.65)"; ctx.fillText("HI", bx+40, by+11.5);
    ctx.font='600 13px "Oswald", system-ui, sans-serif'; ctx.fillStyle="rgba(239,230,210,.8)"; ctx.fillText(String(hi).padStart(5,"0"), bx+54, by+11.5);
    ctx.textAlign="right"; ctx.font='700 16px "Oswald", system-ui, sans-serif'; ctx.fillStyle=flashing?C.red2:C.gold; ctx.fillText(s, bx+bw-8, by+11.5);
    if(state==="running" && callout.text && t<callout.until){
      const fade=Math.min(1,(callout.until-t)/0.4);
      ctx.save(); ctx.globalAlpha=fade;
      const cw=150, cx=(W-cw)/2, cy=34;                // in the stands, so it never hides what's coming
      ctx.fillStyle=C.navy; roundRect(cx,cy,cw,26,4); ctx.fill();
      ctx.fillStyle=C.red2; ctx.fillRect(cx,cy+22,cw,2); ctx.fillStyle=C.wool; ctx.fillRect(cx,cy+24.5,cw,1.5);
      ctx.fillStyle=C.gold; ctx.font='700 14px "Oswald", system-ui, sans-serif'; ctx.textAlign="center";
      if("letterSpacing" in ctx) ctx.letterSpacing="3px";
      ctx.fillText(callout.text, W/2, cy+12);
      if("letterSpacing" in ctx) ctx.letterSpacing="0px";
      ctx.restore();
    }
  }

  // Start and game-over cards: a navy sweater panel with sleeve and hem stripes
  function overlay(){
    ctx.fillStyle="rgba(14,22,40,.55)"; ctx.fillRect(0,0,W,H);
    const pw=Math.min(W-24,420), ph=state==="ready"?132:150, px=(W-pw)/2, py=(H-ph)/2;
    ctx.fillStyle=C.navy; roundRect(px,py,pw,ph,8); ctx.fill();
    ctx.save(); roundRect(px,py,pw,ph,8); ctx.clip();
    ctx.fillStyle=C.red2; ctx.fillRect(px+5,py,5,ph-12); ctx.fillStyle=C.wool; ctx.fillRect(px+14,py,5,ph-12);
    ctx.fillStyle=C.red2; ctx.fillRect(px,py+ph-12,pw,4); ctx.fillStyle=C.wool; ctx.fillRect(px,py+ph-5,pw,5);
    ctx.restore();
    const cx=px+pw/2+8; ctx.textAlign="center"; ctx.textBaseline="middle";
    if(state==="ready"){
      ctx.fillStyle=C.red2; ctx.font='22px "Yellowtail", cursive'; ctx.fillText("stickpicks", cx, py+24);
      ctx.fillStyle=C.wool; ctx.font='700 30px "Oswald", system-ui, sans-serif'; ctx.fillText("BREAKAWAY", cx, py+54);
      ctx.fillStyle=C.gold; ctx.font='600 12px "Oswald", system-ui, sans-serif';
      ctx.fillText((touch?"TAP TO START":"TAP OR PRESS SPACE TO START"), cx, py+82);
      ctx.fillStyle="rgba(239,230,210,.75)"; ctx.font='italic 12px "Libre Caslon Text", Georgia, serif';
      ctx.fillText(W<520?"Jump the obstacles. Duck the shots.":"Jump the pucks, cones and nets. Duck the shots. It gets harder every period.", cx, py+104, pw-40);
    }else{
      ctx.fillStyle=newBest?C.gold:"rgba(239,230,210,.7)"; ctx.font='600 11px "Oswald", system-ui, sans-serif';
      ctx.fillText(newBest?"NEW PERSONAL BEST":"FINAL SCORE", cx, py+20);
      ctx.fillStyle=C.wool; ctx.font='700 34px "Oswald", system-ui, sans-serif'; ctx.fillText(String(Math.floor(score)), cx, py+48);
      ctx.font=`italic ${W<520?11:12.5}px "Libre Caslon Text", Georgia, serif`; ctx.fillStyle="rgba(239,230,210,.85)";
      ctx.fillText(message, cx, py+76, pw-40);
      if(note){ ctx.fillStyle=C.gold; ctx.font='600 11.5px "Oswald", system-ui, sans-serif'; ctx.fillText(note.toUpperCase(), cx, py+98, pw-40); }
      ctx.fillStyle="rgba(239,230,210,.6)"; ctx.font='500 11px "Barlow", system-ui, sans-serif';
      ctx.fillText(touch?"Tap to play again":"Tap or press Space to play again", cx, py+ph-26);
    }
  }

  /* ───── Drawing: obstacles ───── */
  function drawObstacle(o){
    const x=o.x;
    if(o.kind==="pucks"){
      for(let i=0;i<o.n;i++){
        const y=GROUND-8*(i+1);
        ctx.fillStyle="#141414"; roundRect(x,y,o.w,7.5,3); ctx.fill();
        ctx.fillStyle="#3B3B3B"; ctx.fillRect(x+2,y+1,o.w-4,1.6);                 // top edge
        ctx.fillStyle="rgba(255,255,255,.12)"; for(let k=4;k<o.w-2;k+=3) ctx.fillRect(x+k,y+3.5,1,2.5);   // knurled side
      }
    }else if(o.kind==="cones"){
      for(let i=0;i<o.n;i++){
        const cx=x+i*(o.cw+4);
        ctx.fillStyle="#F26B1D";
        ctx.beginPath(); ctx.moveTo(cx+o.cw/2-1.5,GROUND-o.ch); ctx.lineTo(cx+o.cw/2+1.5,GROUND-o.ch); ctx.lineTo(cx+o.cw-2,GROUND-3); ctx.lineTo(cx+2,GROUND-3); ctx.closePath(); ctx.fill();
        ctx.fillStyle="#fff"; const sy=GROUND-o.ch*0.58;
        ctx.fillRect(cx+o.cw*0.31, sy, o.cw*0.38, 4);
        ctx.fillStyle="#C9551A"; roundRect(cx-1, GROUND-4, o.cw+2, 4, 1.5); ctx.fill();
      }
    }else if(o.kind==="net"){
      // side view of an NHL net facing the skater: red post and crossbar, white frame curving to the back, mesh
      const top=GROUND-o.h, front=x+3, back=x+o.w-1;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(front,top+2); ctx.lineTo(front+16,top+2); ctx.quadraticCurveTo(back,top+6,back,GROUND); ctx.lineTo(front,GROUND); ctx.closePath();
      ctx.fillStyle="rgba(255,255,255,.35)"; ctx.fill(); ctx.clip();
      ctx.strokeStyle="rgba(110,120,135,.75)"; ctx.lineWidth=.8;
      for(let k=-40;k<60;k+=5){ ctx.beginPath(); ctx.moveTo(front+k,top); ctx.lineTo(front+k+40,GROUND); ctx.stroke(); ctx.beginPath(); ctx.moveTo(front+k+40,top); ctx.lineTo(front+k,GROUND); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle="#F2F2F2"; ctx.lineWidth=2.4; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(front+16,top+2); ctx.quadraticCurveTo(back,top+6,back,GROUND-1); ctx.lineTo(front,GROUND-1); ctx.stroke();
      ctx.strokeStyle="#C8102E"; ctx.lineWidth=4;
      ctx.beginPath(); ctx.moveTo(front,GROUND); ctx.lineTo(front,top+2); ctx.lineTo(front+16,top+2); ctx.stroke();
      ctx.lineCap="butt";
    }else if(o.kind==="barrage"){
      // point shots: a spray of pucks from shoulder height to well above a jump, each with a motion trail
      o.lifts.forEach((lift,i)=>{
        const px=x+(i%2)*6, y=GROUND-lift-o.h;
        const tr=ctx.createLinearGradient(px+o.w,0,px+o.w+40,0); tr.addColorStop(0,"rgba(155,28,31,.35)"); tr.addColorStop(1,"rgba(155,28,31,0)");
        ctx.fillStyle=tr; ctx.fillRect(px+o.w-2,y+1.5,40,o.h-3);
        ctx.fillStyle="#141414"; roundRect(px,y,o.w,o.h,4); ctx.fill();
        ctx.fillStyle="#3B3B3B"; ctx.fillRect(px+3,y+1.2,o.w-6,1.6);
      });
    }else if(o.kind==="slap"){
      const y=GROUND-o.lift-o.h;
      const tr=ctx.createLinearGradient(x+o.w,0,x+o.w+46,0); tr.addColorStop(0,"rgba(28,43,69,.35)"); tr.addColorStop(1,"rgba(28,43,69,0)");
      ctx.fillStyle=tr; ctx.fillRect(x+o.w-2,y+1.5,46,o.h-3);
      ctx.fillStyle="#141414"; roundRect(x,y,o.w,o.h,4); ctx.fill();
      ctx.fillStyle="#3B3B3B"; ctx.fillRect(x+3,y+1.2,o.w-6,1.6);
    }
  }

  /* ───── Drawing: the skater ───── */
  // Side view, facing right, crouched in a skating stance. Legs use two-bone IK so the knees bend naturally:
  // each skate pushes back along the ice, then lifts and swings forward (two legs half a stride apart).
  function legIK(hx,hy,ax,ay,a,b){
    let dx=ax-hx, dy=ay-hy, d=Math.hypot(dx,dy);
    d=Math.max(Math.abs(a-b)+0.1, Math.min(a+b-0.05, d));
    const th=Math.atan2(dy,dx), A=Math.acos((a*a+d*d-b*b)/(2*a*d));
    const k1={x:hx+a*Math.cos(th-A), y:hy+a*Math.sin(th-A)}, k2={x:hx+a*Math.cos(th+A), y:hy+a*Math.sin(th+A)};
    return k1.x>k2.x ? k1 : k2;                         // knees point forward
  }
  function seg(x1,y1,x2,y2,w,col){ ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
  const lerp=(p,q,f)=>({x:p.x+(q.x-p.x)*f, y:p.y+(q.y-p.y)*f});

  function drawSkater(){
    const duck=P.ducking, air=!P.onIce, baseY=GROUND-P.y, x0=PLAYER_X;
    ctx.lineCap="round"; ctx.lineJoin="round";
    // shadow on the ice
    ctx.fillStyle="rgba(20,40,60,.16)";
    ctx.beginPath(); ctx.ellipse(x0+16,GROUND+2,18-Math.min(P.y,80)/9,3.2,0,0,6.283); ctx.fill();
    // speed lines once you're flying
    if(state==="running" && speed>620){
      ctx.strokeStyle=`rgba(255,255,255,${Math.min(.7,(speed-620)/500)})`; ctx.lineWidth=1.4;
      for(let i=0;i<3;i++){ const yy=baseY-14-i*12, xx=x0-8-((t*900+i*37)%30); ctx.beginPath(); ctx.moveTo(xx,yy); ctx.lineTo(xx-16,yy); ctx.stroke(); }
    }

    // A skating stride, not a walk: each skate glides under the body on a deeply bent knee, then pushes
    // back (and out) until the leg is straight, then returns low along the ice, barely lifting. The two
    // legs are half a stride apart, so one is always gliding while the other pushes. The body stays
    // low and level, dipping slightly with each push.
    const stride=(((P.stride/(2*Math.PI))%1)+1)%1;
    const bob = air||duck ? 0 : Math.cos(stride*4*Math.PI)*0.7;
    const lean = duck ? 1.12 : air ? 0.52 : 0.7;            // torso tilt forward from upright (radians)
    const hipH = duck ? 17 : air ? 25 : 23.5+bob, T = duck ? 18 : 21;
    const hip={x:x0+10, y:baseY-hipH};
    const u={x:Math.sin(lean), y:-Math.cos(lean)}, pv={x:Math.cos(lean), y:Math.sin(lean)};   // spine, and chest side
    const sh={x:hip.x+u.x*T, y:hip.y+u.y*T};
    const TH=13.5, SH=13, ANK=6;                            // thigh, shin, ankle height above the ice
    const smooth=q=>q*q*(3-2*q);

    // where each skate is in the stride
    const feet=[0,1].map(i=>{
      if(air){ return i ? {x:hip.x-5, y:hip.y+15, lift:5} : {x:hip.x+7, y:hip.y+13, lift:5}; }
      if(duck) return i ? {x:hip.x-12, y:baseY-ANK, lift:0} : {x:hip.x+6, y:baseY-ANK, lift:0};   // tucked: both skates gliding
      const p=(stride+i*0.5)%1;
      if(p<0.6){                                            // on the ice: glide under the hip, then push back to a straight leg
        const q=p/0.6, e = q<0.35 ? q/0.35*0.12 : 0.12+0.88*smooth((q-0.35)/0.65);
        return {x:hip.x+5-27*e, y:baseY-ANK, lift:0};
      }
      const q=(p-0.6)/0.4, lift=Math.sin(q*Math.PI)*2.4;    // recovery: back under the body, skimming the ice
      return {x:hip.x-22+27*smooth(q), y:baseY-ANK-lift, lift};
    });
    // draw the far leg (the one further back) first, a shade darker
    const order=feet[0].x<feet[1].x ? [0,1] : [1,0];
    const leg=(f,far)=>{
      const knee=legIK(hip.x,hip.y,f.x,f.y,TH,SH);
      const sock=far?shade(kit.main,-0.25):kit.main, trim=far?shade(kit.trim,-0.25):kit.trim, pants=far?shade(kit.dark,-0.2):kit.dark;
      seg(knee.x,knee.y,f.x,f.y-1,6.6,sock);                              // sock over the shin pad
      const s1=lerp(knee,f,0.38), s2=lerp(knee,f,0.5), s3=lerp(knee,f,0.62);
      seg(s1.x,s1.y,s2.x,s2.y,6.6,trim); seg(s2.x,s2.y,s3.x,s3.y,6.6,"#FFFFFF"); // sock stripes
      seg(hip.x,hip.y,knee.x,knee.y,10.5,pants);                           // breezers down to the knee
      seg(lerp(hip,knee,.25).x,lerp(hip,knee,.25).y,lerp(hip,knee,.85).x,lerp(hip,knee,.85).y,1.6,trim);   // breezer stripe
      drawSkate(f.x,f.y,f.lift,far);
    };
    leg(feet[order[0]],true);

    // stick: blade flat on the ice ahead (lifted with the skater in the air); two hands on the shaft
    const blade={x:hip.x+(duck?33:31), y:(air?baseY:GROUND)-2.2};
    const top={x:hip.x+pv.x*7+u.x*7, y:hip.y+pv.y*7+u.y*7};             // top hand in front of the belly
    const dir=(()=>{ const dx=blade.x-top.x, dy=blade.y-top.y, d=Math.hypot(dx,dy)||1; return {x:dx/d,y:dy/d}; })();
    const low={x:top.x+dir.x*12, y:top.y+dir.y*12};                     // bottom hand down the shaft
    // far arm reaches the top hand (behind the body)
    const shB={x:sh.x-pv.x*1.5, y:sh.y-pv.y*1.5};
    const elbB=legIK(shB.x,shB.y,top.x,top.y,8.5,8.5);
    seg(shB.x,shB.y,elbB.x,elbB.y,5.6,shade(kit.main,-0.25)); seg(elbB.x,elbB.y,top.x,top.y,5,shade(kit.main,-0.25));

    // breezers at the hip, then the sweater
    ctx.fillStyle=kit.dark; ctx.beginPath(); ctx.ellipse(hip.x,hip.y,8,6.5,lean*0.5,0,6.283); ctx.fill();
    const P1={x:hip.x+pv.x*6.2, y:hip.y+pv.y*6.2}, P2={x:hip.x-pv.x*6.5, y:hip.y-pv.y*6.5};
    const P3={x:sh.x-pv.x*8.2+u.x*1, y:sh.y-pv.y*8.2+u.y*1}, P4={x:sh.x+u.x*3.5, y:sh.y+u.y*3.5}, P5={x:sh.x+pv.x*6.6, y:sh.y+pv.y*6.6};
    ctx.fillStyle=kit.main; ctx.beginPath();
    ctx.moveTo(P1.x,P1.y); ctx.lineTo(P2.x,P2.y); ctx.quadraticCurveTo(P3.x-u.x*6,P3.y-u.y*6,P3.x,P3.y);
    ctx.quadraticCurveTo(P4.x-pv.x*4,P4.y-pv.y*4,P4.x,P4.y); ctx.quadraticCurveTo(P5.x+u.x*2,P5.y+u.y*2,P5.x,P5.y); ctx.closePath(); ctx.fill();
    // hem stripes and the number on the back
    ctx.save(); ctx.clip();
    [[2.2,2.6,kit.trim],[5.2,1.4,"#FFFFFF"]].forEach(([at,w,col])=>{ const a={x:hip.x+u.x*at,y:hip.y+u.y*at}; seg(a.x-pv.x*12,a.y-pv.y*12,a.x+pv.x*12,a.y+pv.y*12,w,col); });
    ctx.restore();
    if(kit.num){
      const nb={x:hip.x+u.x*12-pv.x*3.6, y:hip.y+u.y*12-pv.y*3.6};
      ctx.save(); ctx.translate(nb.x,nb.y); ctx.rotate(lean); ctx.fillStyle=kit.numInk; ctx.font='700 7.5px "Oswald", system-ui, sans-serif';
      ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText(kit.num,0,0); ctx.restore();
    }

    // stick shaft (wood, like the logo) with a navy-taped blade and a white knob
    const butt={x:top.x-dir.x*5, y:top.y-dir.y*5};
    seg(butt.x,butt.y,blade.x,blade.y,2.6,C.wood);
    seg(butt.x,butt.y,butt.x+dir.x*2.5,butt.y+dir.y*2.5,3,"#F4F1E8");
    seg(blade.x,blade.y,blade.x+10,blade.y+0.4,3.2,C.navy);

    // near leg in front of the body
    leg(feet[order[1]],false);

    // near arm: shoulder to elbow to the bottom hand, with sleeve stripes above the elbow
    const shF={x:sh.x+pv.x*2, y:sh.y+pv.y*2};
    const elb=legIK(shF.x,shF.y,low.x,low.y,9,9.5);
    const elbow = elb.y<Math.max(shF.y,low.y) ? {x:elb.x, y:Math.max(shF.y,low.y)+1} : elb;   // elbow hangs down
    seg(shF.x,shF.y,elbow.x,elbow.y,6.2,kit.main);
    const a1=lerp(shF,elbow,.55), a2=lerp(shF,elbow,.7), a3=lerp(shF,elbow,.83);
    seg(a1.x,a1.y,a2.x,a2.y,6.2,kit.trim); seg(a2.x,a2.y,a3.x,a3.y,6.2,"#FFFFFF");
    seg(elbow.x,elbow.y,low.x,low.y,5.4,kit.main);
    // gloves
    ctx.fillStyle=kit.dark; ctx.beginPath(); ctx.arc(top.x,top.y,3.3,0,6.283); ctx.fill();
    ctx.beginPath(); ctx.arc(low.x,low.y,3.5,0,6.283); ctx.fill();
    ctx.fillStyle=kit.trim; ctx.beginPath(); ctx.arc(low.x-dir.x*2.6,low.y-dir.y*2.6,1.4,0,6.283); ctx.fill();   // cuff

    // head: helmet in the team colour, clear visor, chin strap
    const hc={x:sh.x+u.x*6.2+pv.x*3.2, y:sh.y+u.y*6.2+pv.y*3.2};
    ctx.save(); ctx.translate(hc.x,hc.y); ctx.rotate(lean*0.35);
    ctx.fillStyle="#E8B994"; ctx.beginPath(); ctx.arc(1.3,1.2,4.9,0,6.283); ctx.fill();   // face
    ctx.fillStyle=kit.main; ctx.beginPath(); ctx.arc(0,0,6.3,Math.PI*0.52,Math.PI*1.96); ctx.lineTo(4.2,-0.6); ctx.lineTo(-1,3.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(255,255,255,.28)"; ctx.beginPath(); ctx.arc(-0.8,-1.6,4.4,Math.PI*1.1,Math.PI*1.55); ctx.lineTo(-0.8,-1.6); ctx.fill();   // shine
    ctx.fillStyle=kit.dark; ctx.beginPath(); ctx.arc(-1.4,1.6,1.6,0,6.283); ctx.fill();            // ear guard
    ctx.strokeStyle="rgba(170,215,240,.95)"; ctx.lineWidth=1.8; ctx.beginPath(); ctx.moveTo(4.6,-1.2); ctx.lineTo(6.7,2.8); ctx.stroke();   // visor
    ctx.strokeStyle="rgba(20,20,20,.55)"; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(-1.2,3); ctx.quadraticCurveTo(1.6,6.6,4.6,5); ctx.stroke(); // chin strap
    ctx.restore();
    ctx.lineCap="butt"; ctx.lineJoin="miter";
  }
  // A skate: black boot with a tendon guard, white blade holder, steel runner. Tips toe-down when lifted.
  function drawSkate(ax,ay,lift,far){
    ctx.save(); ctx.translate(ax,ay); ctx.rotate(lift ? 0.06*lift/6.5 : 0);
    ctx.fillStyle=far?"#2A2A2A":"#141414";
    ctx.beginPath(); ctx.moveTo(-4.5,-4.5); ctx.lineTo(-3,-6); ctx.lineTo(2,-3); ctx.quadraticCurveTo(8.5,-2.4,8.6,1.4); ctx.lineTo(8.4,3); ctx.lineTo(-4.6,3); ctx.closePath(); ctx.fill();
    ctx.fillStyle=far?"#D8D8D8":"#F4F4F4"; ctx.beginPath(); ctx.moveTo(-4,3); ctx.lineTo(7.8,3); ctx.lineTo(6.6,5.2); ctx.lineTo(-3,5.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#9AA6B2"; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-5.2,5.9); ctx.lineTo(8.6,5.9); ctx.stroke();
    ctx.restore();
  }

  function roundRect(x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  // lighten (amt > 0) or darken (amt < 0) a #rrggbb colour
  function shade(hex,amt){
    const n=parseInt(String(hex).replace("#",""),16); if(isNaN(n)) return hex;
    const f=c=>Math.round(Math.max(0,Math.min(255, amt<0 ? c*(1+amt) : c+(255-c)*amt)));
    return "#"+[(n>>16)&255,(n>>8)&255,n&255].map(c=>f(c).toString(16).padStart(2,"0")).join("");
  }

  // For the page: show the best saved to your account, and a status line under the final score.
  window.breakaway={
    setBest(n){ n=Math.floor(Number(n)||0); if(n>hi){ hi=n; try{ localStorage.setItem(HI_KEY,String(hi)); }catch(e){} } if(state!=="running") draw(); },
    setNote(text){ note=text||""; if(state==="over") draw(); },
  };

  // Testing on a local preview only: jump ahead to a score, and peek at what's on the ice.
  if(location.hostname==="localhost") window.breakaway.test={ setScore(n){ score=n; },
    peek:()=>({score:Math.floor(score), period:PERIODS[per].name, state, v:speed*Math.max(0.62,Math.min(1,W/720)), onIce:P.onIce, ducking:P.ducking, crashed:message,
      obstacles:obstacles.map(o=>({kind:o.kind, x:o.x, w:o.w, v:o.v||1}))}) };

  reset();
  resize();
  if(document.fonts?.ready) document.fonts.ready.then(()=>{ if(state!=="running") draw(); });
})();
