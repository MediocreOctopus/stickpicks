// Breakaway: a hockey-themed endless runner for the Stick Picks home page.
// Jump over pucks, cones, and nets; duck under flying pucks. Everything is drawn
// with simple canvas shapes (no images). Space / ↑ / W to jump, ↓ / S to duck,
// or tap the rink (top half jumps, hold the bottom half to duck).
(function(){
  const canvas=document.getElementById("rink");
  if(!canvas) return;
  const ctx=canvas.getContext("2d");
  const wrap=canvas.parentElement;
  const scoreEl=document.getElementById("runScore"), hiEl=document.getElementById("runHi");
  const HI_KEY="stickpicks-breakaway-hi";

  const H=220, GROUND=196;                // logical height and ice line
  const GRAVITY=2600, JUMP_V=-860, SHORT_HOP_V=-430, FAST_FALL=5200;
  const START_SPEED=380, MAX_SPEED=950, ACCEL=9;  // px per second (and per second²)
  const STAND_H=56, DUCK_H=34, PLAYER_X=64;

  let W=600, dpr=1;
  const touch=window.matchMedia?.("(pointer:coarse)").matches;
  let state="ready";                      // ready | running | over
  let speed, dist, score, hi=0, t, spawnIn, obstacles, flashUntil=0, message="";
  const P={y:0, vy:0, ducking:false, onIce:true, stride:0};
  let jumpHeld=false, downHeld=false, last=0, visible=true, raf=0;

  try{ hi=Number(localStorage.getItem(HI_KEY))||0; }catch(e){}

  // Jersey colors follow the last team sheet the player opened.
  let jersey={main:"#0E1A26", trim:"#D7263D"};
  try{
    const code=localStorage.getItem("nhl-picks-last-team");
    if(code && typeof TEAMS!=="undefined" && TEAMS[code]){
      const tm=TEAMS[code];
      jersey={main:tm.board, trim:(tm.stripe||firstReadable(tm.board,[tm.accent,tm.brand,"#FFFFFF"],2))};
    }
  }catch(e){}

  const MESSAGES={
    pucks:["Tripped over a loose puck. Two minutes in the box.","Pucks everywhere! Down goes the skater.","Stumbled on the puck pile. Back to the bench."],
    cones:["Took out the cones. Practice is over.","Hooked by a cone. Tough break.","The cones win this shift."],
    net:["Crashed the net! Goaltender interference.","Ran into the goal. That one's going to leave a mark.","Knocked the net off its moorings."],
    slap:["Caught a slap shot. Keep your head down!","Should have ducked. That's a long shift.","Took one off the helmet. Shake it off."]
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
    speed=START_SPEED; dist=0; score=0; t=0; obstacles=[]; spawnIn=W*0.6;
    P.y=0; P.vy=0; P.ducking=false; P.onIce=true; P.stride=0; message="";
  }

  /* ───── Obstacles ───── */
  function spawn(){
    const r=Math.random(), x=W+30;
    if(score>250 && r<0.18){                        // flying puck at head height: duck!
      obstacles.push({kind:"slap", x, w:22, h:9, lift:42+Math.random()*6});
    }else if(r<0.42){                               // stack of 1–3 pucks
      const n=1+Math.floor(Math.random()*(score>150?3:2));
      obstacles.push({kind:"pucks", x, w:24, h:8*n, n});
    }else if(r<0.72){                               // one or two cones
      const n=Math.random()<(score>100?0.45:0.2)?2:1, big=Math.random()<0.4;
      const cw=big?24:18, ch=big?34:26;
      obstacles.push({kind:"cones", x, w:n*cw+(n-1)*4, h:ch, n, cw, ch});
    }else{                                          // the net
      obstacles.push({kind:"net", x, w:44, h:36});
    }
    // next gap scales with speed so every obstacle stays clearable
    const scale=Math.max(0.62,Math.min(1,W/720));
    spawnIn = speed*scale*(0.72+Math.random()*0.9) + (Math.random()<0.15?speed*scale*0.6:0);
  }

  function playerBox(){
    const h=P.ducking&&P.onIce?DUCK_H:STAND_H, w=P.ducking&&P.onIce?40:28;
    return {x:PLAYER_X+4, y:GROUND-P.y-h+4, w:w-8, h:h-6};
  }
  function obstacleBox(o){
    if(o.kind==="slap") return {x:o.x+2, y:GROUND-o.lift-o.h, w:o.w-4, h:o.h};
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

    // player physics
    if(!P.onIce){
      P.vy += (downHeld?FAST_FALL:GRAVITY)*dt;
      P.y -= P.vy*dt;
      if(P.y<=0){ P.y=0; P.vy=0; P.onIce=true; }
    }
    P.ducking = downHeld && P.onIce;
    if(P.onIce) P.stride += dx*0.045;

    // obstacles
    spawnIn-=dx;
    if(spawnIn<=0) spawn();
    obstacles.forEach(o=>o.x-=dx*(o.kind==="slap"?1.18:1));
    obstacles=obstacles.filter(o=>o.x+o.w>-20);

    const pb=playerBox();
    const crash=obstacles.find(o=>hit(pb,obstacleBox(o)));
    if(crash) gameOver(crash.kind);
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
    if(s>hi){ hi=s; try{ localStorage.setItem(HI_KEY,String(hi)); }catch(e){} message="New high score! "+message; }
    draw();
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

  /* ───── Drawing ───── */
  function draw(){
    const off=dist||0;
    // crowd
    ctx.fillStyle="#18222D"; ctx.fillRect(0,0,W,58);
    for(let i=0;i<W/9+2;i++){
      const x=((i*9 - off*0.15)%(W+18)+W+18)%(W+18)-9;
      const row=i%3, shade=["#2B3A49","#3A4A5A","#253341"][(i*7)%3];
      ctx.fillStyle=shade; ctx.beginPath(); ctx.arc(x, 14+row*15, 4.2, 0, 6.283); ctx.fill();
      ctx.fillRect(x-4.2, 14+row*15, 8.4, 7);
    }
    // glass
    ctx.fillStyle="#C9DCE6"; ctx.fillRect(0,58,W,26);
    ctx.fillStyle="rgba(255,255,255,.55)";
    for(let x=-((off*0.6)%120);x<W;x+=120){ ctx.fillRect(x,58,2,26); ctx.fillRect(x+30,62,26,3); }
    // boards: white with a blue top rail and the yellow kick plate
    ctx.fillStyle="#1F4E8C"; ctx.fillRect(0,84,W,4);
    ctx.fillStyle="#F7F9FB"; ctx.fillRect(0,88,W,30);
    ctx.fillStyle="#E9EEF2";
    for(let x=-(off%160);x<W;x+=160) ctx.fillRect(x+6,92,120,20);
    ctx.fillStyle="#F2C230"; ctx.fillRect(0,118,W,5);
    // ice
    const g=ctx.createLinearGradient(0,123,0,H); g.addColorStop(0,"#E7F1F7"); g.addColorStop(1,"#F7FBFD");
    ctx.fillStyle=g; ctx.fillRect(0,123,W,H-123);
    // rink markings scroll with the ice
    const period=900, base=-(off%period);
    for(let k=-1;k<3;k++){
      const x=base+k*period;
      ctx.fillStyle="rgba(200,16,46,.55)"; ctx.fillRect(x+150,123,7,H-123);         // red line
      ctx.fillStyle="rgba(0,82,165,.5)";  ctx.fillRect(x+420,123,9,H-123);          // blue line
      ctx.fillStyle="rgba(200,16,46,.5)"; ctx.beginPath(); ctx.arc(x+640,166,5,0,6.283); ctx.fill(); // faceoff dot
      ctx.strokeStyle="rgba(200,16,46,.35)"; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(x+640,166,40,14,0,0,6.283); ctx.stroke();
    }
    // skate-line scratches
    ctx.strokeStyle="rgba(140,170,190,.35)"; ctx.lineWidth=1;
    for(let i=0;i<14;i++){
      const x=((i*97 - off)%(W+80)+W+80)%(W+80)-40, y=GROUND+3+(i*13)%18;
      ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+18+(i%3)*8,y+1); ctx.stroke();
    }

    obstacles?.forEach(drawObstacle);
    drawSkater();

    // score
    ctx.font='700 16px "Barlow Condensed", system-ui, sans-serif'; ctx.textAlign="right"; ctx.textBaseline="top";
    const s=String(Math.floor(score||0)).padStart(5,"0");
    const flashing=state==="running" && t<flashUntil && Math.floor(t*10)%2===0;
    ctx.fillStyle="rgba(24,34,45,.55)"; ctx.fillText(`HI ${String(hi).padStart(5,"0")}`, W-86, 132);
    ctx.fillStyle=flashing?"#D7263D":"#18222D"; ctx.fillText(s, W-14, 132);
    if(scoreEl) scoreEl.textContent=Math.floor(score||0);
    if(hiEl) hiEl.textContent=hi;

    if(state!=="running") overlay();
  }

  function overlay(){
    ctx.fillStyle="rgba(14,26,38,.72)"; ctx.fillRect(0,0,W,H);
    ctx.textAlign="center"; ctx.fillStyle="#fff";
    if(state==="ready"){
      ctx.font='800 30px "Barlow Condensed", system-ui, sans-serif'; ctx.textBaseline="middle";
      ctx.fillText("BREAKAWAY", W/2, H/2-24);
      ctx.font='500 15px "Barlow", system-ui, sans-serif';
      ctx.fillText(touch?"Tap to start":"Tap or press Space to start", W/2, H/2+8);
      ctx.fillStyle="rgba(255,255,255,.7)"; ctx.font='400 13px "Barlow", system-ui, sans-serif';
      ctx.fillText(W<520?"Jump the obstacles. Duck the slap shots.":"Jump the pucks, cones, and nets. Duck the slap shots.", W/2, H/2+32);
    }else{
      ctx.font='800 28px "Barlow Condensed", system-ui, sans-serif'; ctx.textBaseline="middle";
      ctx.fillText(`SCORE ${Math.floor(score)}`, W/2, H/2-26);
      ctx.font=`500 ${W<520?13:15}px "Barlow", system-ui, sans-serif`;
      ctx.fillText(message, W/2, H/2+4, W-24);
      ctx.fillStyle="rgba(255,255,255,.75)"; ctx.font='400 13px "Barlow", system-ui, sans-serif';
      ctx.fillText(touch?"Tap to play again":"Tap or press Space to play again", W/2, H/2+30);
    }
  }

  function drawObstacle(o){
    const x=o.x;
    if(o.kind==="pucks"){
      for(let i=0;i<o.n;i++){
        const y=GROUND-8*(i+1);
        ctx.fillStyle="#111"; roundRect(x,y,o.w,7,3); ctx.fill();
        ctx.fillStyle="#3A3A3A"; ctx.fillRect(x+2,y+1,o.w-4,1.5);
      }
    }else if(o.kind==="cones"){
      for(let i=0;i<o.n;i++){
        const cx=x+i*(o.cw+4);
        ctx.fillStyle="#F26B1D";
        ctx.beginPath(); ctx.moveTo(cx+o.cw/2,GROUND-o.ch); ctx.lineTo(cx+o.cw-2,GROUND-3); ctx.lineTo(cx+2,GROUND-3); ctx.closePath(); ctx.fill();
        ctx.fillStyle="#fff"; const sy=GROUND-o.ch*0.55;
        ctx.fillRect(cx+o.cw*0.3, sy, o.cw*0.4, 4);
        ctx.fillStyle="#D4561A"; ctx.fillRect(cx, GROUND-4, o.cw, 4);
      }
    }else if(o.kind==="net"){
      const top=GROUND-o.h;
      ctx.strokeStyle="rgba(120,130,140,.8)"; ctx.lineWidth=1;
      for(let i=1;i<6;i++){ ctx.beginPath(); ctx.moveTo(x+i*7,top+4); ctx.lineTo(x+i*7+4,GROUND); ctx.stroke(); }
      for(let j=1;j<5;j++){ ctx.beginPath(); ctx.moveTo(x+3,top+j*7); ctx.lineTo(x+o.w-2,top+j*7); ctx.stroke(); }
      ctx.strokeStyle="#C8102E"; ctx.lineWidth=4; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(x+2,GROUND); ctx.lineTo(x+2,top+2); ctx.lineTo(x+o.w-2,top+2); ctx.lineTo(x+o.w-2,GROUND); ctx.stroke();
      ctx.lineCap="butt";
    }else if(o.kind==="slap"){
      const y=GROUND-o.lift-o.h;
      ctx.strokeStyle="rgba(24,34,45,.35)"; ctx.lineWidth=2;
      for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(x+o.w+6+i*3,y+2+i*2.5); ctx.lineTo(x+o.w+22+i*6,y+2+i*2.5); ctx.stroke(); }
      ctx.fillStyle="#111"; roundRect(x,y,o.w,o.h,4); ctx.fill();
    }
  }

  function drawSkater(){
    const duck=P.ducking, baseY=GROUND-P.y, x=PLAYER_X;
    const s=Math.sin(P.stride), airborne=!P.onIce;
    ctx.lineCap="round"; ctx.lineJoin="round";
    // shadow on the ice
    ctx.fillStyle="rgba(20,40,60,.15)";
    ctx.beginPath(); ctx.ellipse(x+16,GROUND+2,16-Math.min(P.y,80)/10,3,0,0,6.283); ctx.fill();

    const hipY=baseY-(duck?16:22), shoulderY=baseY-(duck?27:44), lean=duck?10:6;
    // legs and skates
    const legs = airborne ? [[-5,-2],[7,-6]] : [[-7*s,0],[7*s,0]];
    legs.forEach(([dx,lift],i)=>{
      const footX=x+12+dx, footY=baseY-3+lift;
      ctx.strokeStyle="#1B1B1B"; ctx.lineWidth=6;
      ctx.beginPath(); ctx.moveTo(x+12,hipY); ctx.lineTo(x+12+dx*0.5+(duck?6:2),(hipY+footY)/2+(duck?-2:0)); ctx.lineTo(footX,footY-3); ctx.stroke();
      ctx.fillStyle="#222"; roundRect(footX-5,footY-6,12,5,2); ctx.fill();          // boot
      ctx.strokeStyle="#9AA6B2"; ctx.lineWidth=1.6;                                  // blade
      ctx.beginPath(); ctx.moveTo(footX-6,footY); ctx.lineTo(footX+8,footY); ctx.stroke();
    });
    // pants
    ctx.fillStyle="#1B1B1B"; roundRect(x+4,hipY-5,17,10,4); ctx.fill();
    // jersey torso
    ctx.fillStyle=jersey.main;
    ctx.beginPath();
    ctx.moveTo(x+4,hipY-3); ctx.lineTo(x+21,hipY-3); ctx.lineTo(x+20+lean,shoulderY+2); ctx.lineTo(x+4+lean,shoulderY); ctx.closePath(); ctx.fill();
    ctx.fillStyle=jersey.trim; ctx.fillRect(x+4,hipY-8,17,3);                       // hem stripe
    // arm and stick
    const handX=x+26+lean, handY=shoulderY+(duck?10:14);
    ctx.strokeStyle=jersey.main; ctx.lineWidth=6;
    ctx.beginPath(); ctx.moveTo(x+14+lean,shoulderY+3); ctx.lineTo(handX,handY); ctx.stroke();
    ctx.strokeStyle=jersey.trim; ctx.lineWidth=2.4;
    ctx.beginPath(); ctx.moveTo(handX-6,handY-3); ctx.lineTo(handX-3,handY-1); ctx.stroke();
    ctx.strokeStyle="#1B1B1B"; ctx.lineWidth=3;                                        // glove
    ctx.beginPath(); ctx.moveTo(handX,handY); ctx.lineTo(handX+1,handY+1); ctx.stroke();
    ctx.strokeStyle="#7A5230"; ctx.lineWidth=2.6;                                      // stick shaft
    const bladeX=handX+18, bladeY=baseY-2;
    ctx.beginPath(); ctx.moveTo(handX-4,handY-6); ctx.lineTo(bladeX,bladeY); ctx.stroke();
    ctx.strokeStyle="#1B1B1B"; ctx.lineWidth=3;                                        // taped blade
    ctx.beginPath(); ctx.moveTo(bladeX,bladeY); ctx.lineTo(bladeX+9,bladeY); ctx.stroke();
    // head and helmet
    const hx=x+15+lean, hy=shoulderY-8;
    ctx.fillStyle="#F1C9A5"; ctx.beginPath(); ctx.arc(hx+2,hy+1,6.5,0,6.283); ctx.fill();
    ctx.fillStyle=jersey.main; ctx.beginPath(); ctx.arc(hx,hy-1,7.5,Math.PI*0.95,Math.PI*2.1); ctx.fill();
    ctx.fillStyle="rgba(180,215,235,.9)"; ctx.fillRect(hx+3,hy-1,6,3);                 // visor
    ctx.lineCap="butt";
  }

  function roundRect(x,y,w,h,r){
    ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  reset();
  resize();
  if(document.fonts?.ready) document.fonts.ready.then(()=>{ if(state!=="running") draw(); });
})();
