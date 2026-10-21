(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const screens = ["homeScreen","helpScreen","settingsScreen","gameScreen","upgradeScreen","resultScreen"];
  const canvas = $("gameCanvas"), ctx = canvas.getContext("2d");
  const mini = $("miniMap"), mctx = mini.getContext("2d");
  const DEFAULTS = {
    dashCooldown:4, dodgeDuration:1, dodgeCooldown:8, attackInterval:.38,
    specialCooldown:5, enemyDetect:290, enemyStop:145, normalWindup:1.05,
    bossWindup:1.35, playerHealth:100, playerAttack:12, difficulty:1
  };
  let config = {...DEFAULTS};
  let running=false, paused=false, lastTime=0, raf=0, toastTimer=0, upgradeOpen=false;
  let keys = new Set(), mouse = {x:0,y:0,worldX:0,worldY:0};
  let player, enemy, wave=1, normalsSinceBoss=0, xp=0, xpNext=40, level=1;
  let kills=0, bossKills=0, damageTaken=0, playTime=0, lastAttackAt=-99, combo=0, comboExpires=0;
  let nextEnemyId=1, particles=[], damageTexts=[], shockwaves=[], floatingLabels=[];
  let attackCooldown=0, specialCooldown=0, dashCooldown=0, dodgeCooldown=0, dodgeTimer=0, dashTimer=0, dashVector={x:0,y:0};
  let enemyAttackCooldown=0, screenShake=0, pendingLevelUps=0, totalDamage=0;
  const world = {w:1800,h:1200};
  const rand=(a,b)=>a+Math.random()*(b-a);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return{x:x/d,y:y/d};};
  const showScreen = name => { screens.forEach(s=>$(s).classList.toggle("hidden",s!==name)); };
  const formatTime = n => {n=Math.max(0,n);return n.toFixed(1)+"s";};
  function toast(msg, duration=1.8) {
    $("toast").textContent=msg; $("toast").classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").classList.add("hidden"),duration*1000);
  }
  function readSettings() {
    const out={};
    for(const key of Object.keys(DEFAULTS)) {
      const el=$(key), n=Number(el.value);
      out[key]=Number.isFinite(n)?n:DEFAULTS[key];
    }
    out.dashCooldown=clamp(out.dashCooldown,.5,20);
    out.dodgeDuration=clamp(out.dodgeDuration,.2,3);
    out.dodgeCooldown=clamp(out.dodgeCooldown,1,30);
    out.attackInterval=clamp(out.attackInterval,.1,2);
    out.specialCooldown=clamp(out.specialCooldown,1,30);
    out.enemyDetect=clamp(out.enemyDetect,100,700);
    out.enemyStop=clamp(out.enemyStop,70,260);
    out.normalWindup=clamp(out.normalWindup,.2,4);
    out.bossWindup=clamp(out.bossWindup,.2,5);
    out.playerHealth=clamp(out.playerHealth,20,500);
    out.playerAttack=clamp(out.playerAttack,1,100);
    out.difficulty=clamp(out.difficulty,.5,3);
    for(const k of Object.keys(out)) $(k).value=out[k];
    return out;
  }
  function resetSettingsForm(){for(const k in DEFAULTS) $(k).value=DEFAULTS[k];}
  function startGame() {
    config=readSettings();
    player={x:world.w/2,y:world.h/2,r:19,hp:config.playerHealth,maxHp:config.playerHealth,attack:config.playerAttack,speed:190,attackSpeed:1,level:1,invulnerable:0};
    wave=1; normalsSinceBoss=0; xp=0; xpNext=40; level=1; kills=0; bossKills=0; damageTaken=0; playTime=0; totalDamage=0;
    combo=0; comboExpires=0; lastAttackAt=-99; attackCooldown=0; specialCooldown=0; dashCooldown=0; dodgeCooldown=0; dodgeTimer=0; dashTimer=0;
    enemyAttackCooldown=1.2; particles=[]; damageTexts=[]; shockwaves=[]; floatingLabels=[]; pendingLevelUps=0; upgradeOpen=false;
    spawnEnemy(); running=true; paused=false; lastTime=performance.now(); showScreen("gameScreen"); $("pauseOverlay").classList.add("hidden");
    resizeCanvas(); cancelAnimationFrame(raf); raf=requestAnimationFrame(loop);
    toast("試煉開始！注意敵人的紅色攻擊預告。",2.5);
  }
  function spawnEnemy() {
    const isBoss=normalsSinceBoss>=3;
    const angle=rand(0,Math.PI*2), minDistance=Math.max(config.enemyDetect+90,410);
    let x=player.x+Math.cos(angle)*minDistance, y=player.y+Math.sin(angle)*minDistance;
    x=clamp(x,60,world.w-60); y=clamp(y,60,world.h-60);
    if(dist({x,y},player)<config.enemyDetect+30){x=player.x+(player.x<world.w/2?1:-1)*(config.enemyDetect+100);y=player.y+rand(-200,200);}
    x=clamp(x,60,world.w-60);y=clamp(y,60,world.h-60);
    const scale=Math.pow(1+(wave-1)*.12,1)*config.difficulty;
    enemy={
      id:nextEnemyId++,isBoss,name:isBoss?"裂境首領":"裂境獵兵",x,y,r:isBoss?30:21,
      maxHp:(isBoss?200:70)*scale,hp:(isBoss?200:70)*scale,
      attack:(isBoss?18:9)*scale,speed:(isBoss?75:92)+Math.min(45,wave*2),
      detect:config.enemyDetect,stop:config.enemyStop*(isBoss?1.15:1),
      windup:0,telegraph:null,attackCd:rand(1.2,2.2),attackIndex:0,hitThisTelegraph:false,
      knockbackX:0,knockbackY:0,stun:0,scale
    };
    enemy.hp=enemy.maxHp;
    enemyAttackCooldown=rand(.8,1.6);
    toast(isBoss?"首領出現！小心多種攻擊！":"敵人出現。",1.5);
  }
  function resizeCanvas(){
    const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function getView(){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    return {w,h,scale:Math.min(w/900,h/620,1.3),cx:player.x,cy:player.y};
  }
  function worldToScreen(x,y,v){return{x:(x-v.cx)*v.scale+v.w/2,y:(y-v.cy)*v.scale+v.h/2};}
  function screenToWorld(x,y,v){return{x:(x-v.w/2)/v.scale+v.cx,y:(y-v.h/2)/v.scale+v.cy};}
  function setMouse(e){const r=canvas.getBoundingClientRect(),v=getView();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;const p=screenToWorld(mouse.x,mouse.y,v);mouse.worldX=p.x;mouse.worldY=p.y;}
  function moveVector(){
    let x=0,y=0;
    if(keys.has("w")||keys.has("arrowup"))y--;
    if(keys.has("s")||keys.has("arrowdown"))y++;
    if(keys.has("a")||keys.has("arrowleft"))x--;
    if(keys.has("d")||keys.has("arrowright"))x++;
    return x||y?norm(x,y):{x:0,y:0};
  }
  function useDash(){
    if(!running||paused||upgradeOpen||dashCooldown>0)return;
    let v=moveVector();
    if(!v.x&&!v.y)v=norm(mouse.worldX-player.x,mouse.worldY-player.y);
    dashVector=v;dashTimer=.19;dashCooldown=config.dashCooldown;player.invulnerable=Math.max(player.invulnerable,.24);
    combo=0;comboExpires=0;addBurst(player.x,player.y,"#62f4ed",13);toast("衝刺！");
  }
  function useDodge(){
    if(!running||paused||upgradeOpen||dodgeCooldown>0)return;
    dodgeTimer=config.dodgeDuration;dodgeCooldown=config.dodgeCooldown;player.invulnerable=Math.max(player.invulnerable,config.dodgeDuration);
    combo=0;comboExpires=0;addBurst(player.x,player.y,"#b8d5ff",18);toast("閃避無敵！");
  }
  function normalAttack(){
    if(!running||paused||upgradeOpen||attackCooldown>0)return;
    const now=playTime;
    if(now>comboExpires)combo=0;
    combo=combo%3+1;comboExpires=now+1.15;
    const target=enemy;if(!target)return;
    const aim=norm(mouse.worldX-player.x,mouse.worldY-player.y);
    const range=combo===3?112:92, arc=combo===3?1.1:1.25;
    const dx=target.x-player.x,dy=target.y-player.y,d=Math.hypot(dx,dy);
    const facing=norm(dx,dy);
    if(d<=range+target.r && aim.x*facing.x+aim.y*facing.y>Math.cos(arc)) {
      const damage=player.attack*[1,1.35,1.9][combo-1];
      damageEnemy(damage,aim.x,aim.y,combo===3?110:30);
      addSlash(player.x,player.y,aim,combo);
    } else {
      addSlash(player.x,player.y,aim,combo,false);
    }
    attackCooldown=config.attackInterval/player.attackSpeed;
    lastAttackAt=now;
  }
  function specialAttack(){
    if(!running||paused||upgradeOpen||specialCooldown>0)return;
    specialCooldown=config.specialCooldown;combo=0;comboExpires=0;
    const radius=180;shockwaves.push({x:player.x,y:player.y,r:8,max:radius,life:.45,maxLife:.45,color:"#5cf8ef"});
    const d=dist(player,enemy);
    if(d<radius+enemy.r){
      const dir=norm(enemy.x-player.x,enemy.y-player.y);
      damageEnemy(player.attack*2.25,dir.x,dir.y,260);
      enemy.stun=Math.max(enemy.stun,.18);
    }
    addBurst(player.x,player.y,"#56e7ee",30);toast("裂境波動！");
  }
  function addSlash(x,y,dir,comboNo,hit=true){
    particles.push({type:"slash",x,y,dx:dir.x,dy:dir.y,combo:comboNo,life:.22,maxLife:.22,hit});
  }
  function addBurst(x,y,color,count){
    for(let i=0;i<count;i++){const a=rand(0,Math.PI*2),s=rand(40,240);particles.push({type:"spark",x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.2,.55),maxLife:.55,color,size:rand(2,5)});}
  }
  function damageEnemy(amount,dx,dy,knockback=0){
    if(!enemy||enemy.hp<=0)return;
    enemy.hp-=amount;totalDamage+=amount;
    enemy.knockbackX+=dx*knockback;enemy.knockbackY+=dy*knockback;
    damageTexts.push({x:enemy.x,y:enemy.y-enemy.r-12,text:String(Math.round(amount)),life:.8,maxLife:.8,color:"#fff0a3",size:enemy.isBoss?19:16});
    addBurst(enemy.x,enemy.y,enemy.isBoss?"#ff9b74":"#ff6077",7);
    screenShake=Math.max(screenShake,.07);
    if(enemy.hp<=0)killEnemy();
  }
  function killEnemy(){
    const wasBoss=enemy.isBoss;
    kills++;if(wasBoss)bossKills++;else normalsSinceBoss++;
    const gained=wasBoss?85+wave*8:18+wave*3;
    gainXp(gained);
    addBurst(enemy.x,enemy.y,wasBoss?"#ffce70":"#ff6077",wasBoss?35:20);
    floatingLabels.push({x:enemy.x,y:enemy.y-30,text:wasBoss?`首領擊敗 +${gained} EXP`:`擊敗敵人 +${gained} EXP`,life:1.6,maxLife:1.6,color:"#ffdb86"});
    wave++;
    enemy=null;
    if(wasBoss){normalsSinceBoss=0;pendingLevelUps++;toast("首領擊敗！額外能力強化！",2.4);}
    if(pendingLevelUps>0){openUpgrade(wasBoss);return;}
    setTimeout(()=>{if(running&&!paused&&!upgradeOpen&& !enemy)spawnEnemy();},800);
  }
  function gainXp(amount){
    xp+=amount;
    while(xp>=xpNext){xp-=xpNext;level++;player.level=level;xpNext=Math.round(xpNext*1.28+8);pendingLevelUps++;}
    if(pendingLevelUps>0&&!upgradeOpen)openUpgrade(false);
  }
  const upgrades=[
    {name:"強力打擊",desc:"一般攻擊與範圍波動傷害 +20%。",apply:()=>player.attack*=1.2},
    {name:"迅捷步伐",desc:"移動速度 +12%。",apply:()=>player.speed*=1.12},
    {name:"連擊節奏",desc:"攻擊速度 +15%。",apply:()=>player.attackSpeed*=1.15},
    {name:"生命擴張",desc:"最大生命值 +20，並立即恢復 20 點生命。",apply:()=>{player.maxHp+=20;player.hp=Math.min(player.maxHp,player.hp+20);}},
    {name:"恢復之息",desc:"立即恢復 35% 最大生命值。",apply:()=>player.hp=Math.min(player.maxHp,player.hp+player.maxHp*.35)}
  ];
  function openUpgrade(isBoss){
    if(!running)return;
    upgradeOpen=true;paused=true;$("upgradeTitle").textContent=isBoss?"首領獎勵：額外能力強化":"等級提升：選擇能力";
    $("upgradeDescription").textContent=isBoss?"首領被擊敗，選擇一項額外強化。":"選擇一項能力，讓下一場戰鬥更有利。";
    const container=$("upgradeChoices");container.innerHTML="";
    const choices=[...upgrades].sort(()=>Math.random()-.5).slice(0,3);
    choices.forEach(u=>{
      const b=document.createElement("button");b.className="upgrade-choice";
      b.innerHTML=`<strong>${u.name}</strong><span>${u.desc}</span>`;
      b.addEventListener("click",()=>{
        u.apply();pendingLevelUps=Math.max(0,pendingLevelUps-1);
        upgradeOpen=false;paused=false;$("upgradeScreen").classList.add("hidden");
        updateHud();toast(`能力強化：${u.name}`,1.8);
        if(pendingLevelUps>0){openUpgrade(false);}else if(!enemy&&running){setTimeout(()=>{if(running&&!enemy&&!upgradeOpen)spawnEnemy();},350);}
      });
      container.appendChild(b);
    });
    $("upgradeScreen").classList.remove("hidden");
  }
  function startEnemyAttack(){
    if(!enemy)return;
    const e=enemy;
    const types=e.isBoss?["circle","fan","line"]:["circle","fan","line"];
    const type=types[e.attackIndex% (e.isBoss?3:3)];
    e.attackIndex++;
    const angle=Math.atan2(player.y-e.y,player.x-e.x);
    const windup=e.isBoss?config.bossWindup:config.normalWindup;
    const scale=e.scale;
    const radius=(e.isBoss?145:105)*(1+(wave-1)*.025);
    const length=(e.isBoss?260:185)*(1+(wave-1)*.025);
    const width=(e.isBoss?72:48)*(1+(wave-1)*.02);
    e.telegraph={type,angle,remaining:windup,total:windup,radius:radius*scale**.12,length:length*scale**.12,width:width*scale**.12};
    e.hitThisTelegraph=false;
    e.attackCd=e.isBoss?2.5:3.15;
  }
  function inTelegraph(e,p,t){
    const dx=p.x-e.x,dy=p.y-e.y;
    if(t.type==="circle")return Math.hypot(dx,dy)<=t.radius+p.r;
    const angle=Math.atan2(dy,dx),d=Math.hypot(dx,dy);
    if(t.type==="fan"){let diff=Math.atan2(Math.sin(angle-t.angle),Math.cos(angle-t.angle));return d<=t.radius+p.r&&Math.abs(diff)<=Math.PI/4;}
    const forward=dx*Math.cos(t.angle)+dy*Math.sin(t.angle);
    const side=Math.abs(-dx*Math.sin(t.angle)+dy*Math.cos(t.angle));
    return forward>=-p.r&&forward<=t.length+p.r&&side<=t.width/2+p.r;
  }
  function hurtPlayer(amount,fromX,fromY){
    if(player.invulnerable>0)return;
    player.hp-=amount;damageTaken+=amount;player.invulnerable=.55;
    const away=norm(player.x-fromX,player.y-fromY);player.x+=away.x*22;player.y+=away.y*22;
    screenShake=.18;addBurst(player.x,player.y,"#ff5e72",14);
    damageTexts.push({x:player.x,y:player.y-30,text:`-${Math.round(amount)}`,life:.8,maxLife:.8,color:"#ff6b7d",size:18});
    if(player.hp<=0)endGame();
  }
  function update(dt){
    if(!running||paused||upgradeOpen)return;
    playTime+=dt;
    attackCooldown=Math.max(0,attackCooldown-dt);specialCooldown=Math.max(0,specialCooldown-dt);dashCooldown=Math.max(0,dashCooldown-dt);dodgeCooldown=Math.max(0,dodgeCooldown-dt);
    dodgeTimer=Math.max(0,dodgeTimer-dt);player.invulnerable=Math.max(0,player.invulnerable-dt);dashTimer=Math.max(0,dashTimer-dt);
    if(combo&&playTime>comboExpires)combo=0;
    const v=moveVector();
    if(dashTimer>0){player.x+=dashVector.x*900*dt;player.y+=dashVector.y*900*dt;}
    else {player.x+=v.x*player.speed*dt;player.y+=v.y*player.speed*dt;}
    player.x=clamp(player.x,player.r,world.w-player.r);player.y=clamp(player.y,player.r,world.h-player.r);
    if(enemy){
      const e=enemy,d=dist(player,e);
      e.stun=Math.max(0,e.stun-dt);
      e.x+=e.knockbackX*dt;e.y+=e.knockbackY*dt;
      e.knockbackX*=Math.pow(.001,dt);e.knockbackY*=Math.pow(.001,dt);
      if(e.telegraph){
        e.telegraph.remaining-=dt;
        if(e.telegraph.remaining<=0){
          if(!e.hitThisTelegraph){
            if(inTelegraph(e,player,e.telegraph)&&player.invulnerable<=0)hurtPlayer(e.attack, e.x,e.y);
            else if(inTelegraph(e,player,e.telegraph)&&player.invulnerable>0)floatingLabels.push({x:player.x,y:player.y-25,text:"閃避成功",life:.7,maxLife:.7,color:"#8ff8ee"});
            addBurst(e.x,e.y,"#ff526b",10);
          }
          e.telegraph=null;
        }
      }else if(e.stun<=0){
        if(d<=e.detect){
          if(d>e.stop){const n=norm(player.x-e.x,player.y-e.y);e.x+=n.x*e.speed*dt;e.y+=n.y*e.speed*dt;}
          else {e.attackCd-=dt;if(e.attackCd<=0)startEnemyAttack();}
        }
      }
      e.x=clamp(e.x,e.r,world.w-e.r);e.y=clamp(e.y,e.r,world.h-e.r);
    }
    particles.forEach(p=>{p.life-=dt;if(p.type==="spark"){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.05,dt);p.vy*=Math.pow(.05,dt);}});
    particles=particles.filter(p=>p.life>0);
    damageTexts.forEach(t=>{t.life-=dt;t.y-=28*dt;});damageTexts=damageTexts.filter(t=>t.life>0);
    floatingLabels.forEach(t=>{t.life-=dt;t.y-=22*dt;});floatingLabels=floatingLabels.filter(t=>t.life>0);
    shockwaves.forEach(s=>{s.life-=dt;s.r+=(s.max-s.r)*Math.min(1,dt*10);});shockwaves=shockwaves.filter(s=>s.life>0);
    screenShake=Math.max(0,screenShake-dt);
    updateHud();
  }
  function draw(){
    if(!canvas.clientWidth||!canvas.clientHeight)return;
    const v=getView();const w=v.w,h=v.h;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    if(screenShake>0)ctx.translate(rand(-5,5)*screenShake/.18,rand(-4,4)*screenShake/.18);
    const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#172638");bg.addColorStop(1,"#0c1724");ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    // isometric-style floor grid, with the world plane projected at a 0.72 vertical ratio
    const spacing=70*v.scale;
    ctx.strokeStyle="#294056";ctx.lineWidth=1;
    const offsetX=((v.cx* v.scale)%spacing),offsetY=((v.cy*v.scale*.72)%spacing);
    for(let x=-spacing-offsetX;x<w+spacing;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+((h/0.72)%spacing),h);ctx.stroke();}
    for(let y=-spacing-offsetY;y<h+spacing;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    // decorative arena boundary
    const topLeft=worldToScreen(0,0,v),bottomRight=worldToScreen(world.w,world.h,v);
    ctx.strokeStyle="#4c7188";ctx.lineWidth=3;ctx.setLineDash([8,8]);
    ctx.strokeRect(topLeft.x,topLeft.y,bottomRight.x-topLeft.x,bottomRight.y-topLeft.y);ctx.setLineDash([]);
    // telegraph drawn on floor before characters
    if(enemy&&enemy.telegraph)drawTelegraph(enemy,v);
    shockwaves.forEach(s=>{const p=worldToScreen(s.x,s.y,v);ctx.beginPath();ctx.ellipse(p.x,p.y,s.r*v.scale,s.r*v.scale*.72,0,0,Math.PI*2);ctx.strokeStyle=s.color;ctx.globalAlpha=Math.max(0,s.life/s.maxLife);ctx.lineWidth=4;ctx.stroke();ctx.globalAlpha=1;});
    if(enemy)drawEnemy(enemy,v);
    drawPlayer(v);
    particles.forEach(p=>drawParticle(p,v));
    damageTexts.forEach(t=>drawText(t,v));
    floatingLabels.forEach(t=>drawText(t,v));
    // mouse aim marker
    ctx.strokeStyle="#a7f4e9";ctx.globalAlpha=.5;ctx.beginPath();ctx.arc(mouse.x,mouse.y,7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.restore();
    drawMiniMap();
  }
  function drawTelegraph(e,v){
    const t=e.telegraph,p=worldToScreen(e.x,e.y,v),s=v.scale;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,.72);ctx.rotate(t.angle);
    ctx.fillStyle="#ff314b33";ctx.strokeStyle="#ff526c";ctx.lineWidth=2;
    if(t.type==="circle"){ctx.beginPath();ctx.arc(0,0,t.radius*s,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else if(t.type==="fan"){ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,t.radius*s,-Math.PI/4,Math.PI/4);ctx.closePath();ctx.fill();ctx.stroke();}
    else {ctx.beginPath();ctx.rect(0,-t.width*s/2,t.length*s,t.width*s);ctx.fill();ctx.stroke();}
    ctx.restore();
    ctx.fillStyle="#ff7383";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(`攻擊預備 ${(Math.max(0,t.remaining)).toFixed(1)}s`,p.x,p.y-e.r*s-28);
  }
  function drawShadow(x,y,r,v){
    const p=worldToScreen(x,y,v);ctx.fillStyle="#02070b77";ctx.beginPath();ctx.ellipse(p.x,p.y+5,r*v.scale*1.3,r*v.scale*.72,0,0,Math.PI*2);ctx.fill();
  }
  function drawPlayer(v){
    const p=worldToScreen(player.x,player.y,v),s=v.scale,r=player.r*s;
    drawShadow(player.x,player.y,player.r,v);
    // simple 2.5D body: feet ellipse + torso + head
    ctx.fillStyle="#40d9d5";ctx.beginPath();ctx.ellipse(p.x,p.y,r*1.2,r*.7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=(player.invulnerable>0&&Math.floor(playTime*18)%2===0)?"#b9fffa88":"#28b8c7";
    ctx.beginPath();ctx.ellipse(p.x,p.y-r*.55,r*.82,r*1.05,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#b9ffff";ctx.beginPath();ctx.arc(p.x,p.y-r*1.55,r*.55,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#d6ffff";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y-r*1.55,r*.55,0,Math.PI*2);ctx.stroke();
    if(player.invulnerable>0){ctx.strokeStyle="#b9ffffaa";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y-r*.5,r*1.6,r*2.2,0,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle="#d8ffff";ctx.font=`bold ${Math.max(10,12*s)}px sans-serif`;ctx.textAlign="center";ctx.fillText("你",p.x,p.y-r*2.3);
  }
  function drawEnemy(e,v){
    const p=worldToScreen(e.x,e.y,v),s=v.scale,r=e.r*s;
    drawShadow(e.x,e.y,e.r,v);
    ctx.fillStyle=e.isBoss?"#a855f7":"#ed5268";
    ctx.beginPath();ctx.ellipse(p.x,p.y-r*.45,r*1.05,r*1.35,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.isBoss?"#f0c9ff":"#ffd0d8";
    ctx.beginPath();ctx.arc(p.x,p.y-r*1.5,r*.62,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=e.isBoss?"#e5a5ff":"#ff9baa";ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y-r*1.5,r*.62,0,Math.PI*2);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font=`bold ${Math.max(10,12*s)}px sans-serif`;ctx.textAlign="center";ctx.fillText(e.isBoss?"首領":"敵",p.x,p.y-r*2.25);
    const bw=e.isBoss?90:64,bh=6;ctx.fillStyle="#261b2a";ctx.fillRect(p.x-bw/2,p.y-r*2.05,bw,bh);
    ctx.fillStyle=e.isBoss?"#d66bff":"#ff6177";ctx.fillRect(p.x-bw/2,p.y-r*2.05,bw*clamp(e.hp/e.maxHp,0,1),bh);
  }
  function drawParticle(p,v){
    if(p.type==="slash"){
      const o=worldToScreen(p.x,p.y,v),s=v.scale;
      ctx.save();ctx.translate(o.x,o.y);ctx.scale(1,.72);ctx.rotate(Math.atan2(p.dy,p.dx));
      ctx.strokeStyle=p.hit?(p.combo===3?"#ffe58c":"#b4ffff"):"#8ba9bd";ctx.globalAlpha=p.life/p.maxLife;ctx.lineWidth=p.combo===3?7:4;
      ctx.beginPath();ctx.arc(0,0,(p.combo===3?82:65)*s,-.8,.8);ctx.stroke();ctx.restore();ctx.globalAlpha=1;
    }else{
      const o=worldToScreen(p.x,p.y,v);ctx.globalAlpha=clamp(p.life/p.maxLife,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(o.x,o.y,p.size*v.scale,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    }
  }
  function drawText(t,v){
    const p=worldToScreen(t.x,t.y,v);ctx.globalAlpha=clamp(t.life/t.maxLife,0,1);
    ctx.fillStyle=t.color;ctx.font=`bold ${Math.max(12,t.size*v.scale)}px sans-serif`;ctx.textAlign="center";ctx.shadowColor="#000";ctx.shadowBlur=4;ctx.fillText(t.text,p.x,p.y);ctx.shadowBlur=0;ctx.globalAlpha=1;
  }
  function drawMiniMap(){
    const w=mini.width,h=mini.height,cx=w/2,cy=h/2,r=72;
    mctx.clearRect(0,0,w,h);mctx.fillStyle="#0a1420";mctx.fillRect(0,0,w,h);
    mctx.strokeStyle="#294158";mctx.lineWidth=1;
    for(let i=1;i<=3;i++){mctx.beginPath();mctx.arc(cx,cy,r*i/3,0,Math.PI*2);mctx.stroke();}
    mctx.beginPath();mctx.moveTo(cx-r,cy);mctx.lineTo(cx+r,cy);mctx.moveTo(cx,cy-r);mctx.lineTo(cx,cy+r);mctx.stroke();
    mctx.fillStyle="#4ce6df";mctx.beginPath();mctx.arc(cx,cy,5,0,Math.PI*2);mctx.fill();
    if(enemy){
      const dx=enemy.x-player.x,dy=enemy.y-player.y,scale=r/Math.max(world.w,world.h)*1.7;
      const ex=clamp(cx+dx*scale,cx-r,cx+r),ey=clamp(cy+dy*scale,cy-r,cy+r);
      mctx.fillStyle=enemy.isBoss?"#c57aff":"#ff536c";mctx.beginPath();mctx.arc(ex,ey,5,0,Math.PI*2);mctx.fill();
      if(Math.abs(ex-(cx+dx*scale))>.5||Math.abs(ey-(cy+dy*scale))>.5){mctx.strokeStyle="#ff536c";mctx.beginPath();mctx.moveTo(cx,cy);mctx.lineTo(ex,ey);mctx.stroke();}
    }
  }
  function updateHud(){
    if(!player)return;
    $("waveText").textContent=`第 ${wave} 波${enemy&&enemy.isBoss?" · BOSS":""}`;
    $("levelText").textContent=`Lv.${level}`;$("xpText").textContent=`EXP ${Math.floor(xp)} / ${xpNext}`;
    $("hpLabel").textContent=`${Math.max(0,Math.ceil(player.hp))} / ${player.maxHp}`;
    $("hpBar").style.width=`${clamp(player.hp/player.maxHp,0,1)*100}%`;
    $("xpLabel").textContent=`${Math.floor(xp)} / ${xpNext}`;$("xpBar").style.width=`${clamp(xp/xpNext,0,1)*100}%`;
    $("dashLabel").textContent=dashCooldown<=0?"就緒":formatTime(dashCooldown);
    $("dodgeLabel").textContent=dodgeCooldown<=0?"就緒":formatTime(dodgeCooldown);
    $("specialLabel").textContent=specialCooldown<=0?"就緒":formatTime(specialCooldown);
    $("enemyName").textContent=enemy?(enemy.isBoss?"✦ 裂境首領":"裂境獵兵"):"等待下一名敵人";
    $("enemyHpLabel").textContent=enemy?`${Math.max(0,Math.ceil(enemy.hp))} / ${Math.ceil(enemy.maxHp)}`:"—";
    $("enemyHpBar").style.width=enemy?`${clamp(enemy.hp/enemy.maxHp,0,1)*100}%`:"0%";
    $("enemyHint").textContent=enemy?(enemy.telegraph?`正在準備${{circle:"圓形",fan:"扇形",line:"狹長直線"}[enemy.telegraph.type]}攻擊！`:(dist(player,enemy)>enemy.detect?"尚未進入偵測範圍":"正在追擊／尋找攻擊時機")):"敵人正在重新集結。";
    $("upgradeStats").textContent=`攻擊 ${player.attack.toFixed(1)} · 移速 ${player.speed.toFixed(0)} · 攻速 ${player.attackSpeed.toFixed(2)}x`;
  }
  function endGame(){
    running=false;paused=true;cancelAnimationFrame(raf);showScreen("resultScreen");
    $("resultTitle").textContent="試煉結束";
    $("resultSummary").textContent="你的生命值已歸零。裂境仍在等待下一位挑戰者。";
    const mins=Math.floor(playTime/60),secs=Math.floor(playTime%60);
    $("resultStats").innerHTML=`<div><strong>${kills}</strong><span>擊敗敵人</span></div><div><strong>${bossKills}</strong><span>擊敗首領</span></div><div><strong>${level}</strong><span>最終等級</span></div><div><strong>${mins}:${String(secs).padStart(2,"0")}</strong><span>存活時間</span></div><div><strong>${Math.round(totalDamage)}</strong><span>造成傷害</span></div><div><strong>${Math.round(damageTaken)}</strong><span>承受傷害</span></div>`;
  }
  function loop(now){
    if(!running)return;
    const dt=Math.min(.033,Math.max(0,(now-lastTime)/1000));lastTime=now;
    if(!paused&&!upgradeOpen)update(dt);
    draw();
    raf=requestAnimationFrame(loop);
  }
  function togglePause(){
    if(!running||upgradeOpen)return;
    paused=!paused;$("pauseOverlay").classList.toggle("hidden",!paused);
    $("pauseBtn").textContent=paused?"繼續（Esc）":"暫停（Esc）";
    if(!paused)lastTime=performance.now();
  }

  $("startBtn").addEventListener("click",startGame);
  $("helpBtn").addEventListener("click",()=>showScreen("helpScreen"));
  $("settingsBtn").addEventListener("click",()=>showScreen("settingsScreen"));
  document.querySelectorAll(".backBtn").forEach(b=>b.addEventListener("click",()=>showScreen("homeScreen")));
  $("resetSettingsBtn").addEventListener("click",resetSettingsForm);
  $("saveSettingsBtn").addEventListener("click",()=>{config=readSettings();toast("設定已套用（下次開始遊戲時生效）");});
  $("pauseBtn").addEventListener("click",togglePause);
  $("resumeBtn").addEventListener("click",togglePause);
  $("quitBtn").addEventListener("click",()=>{running=false;cancelAnimationFrame(raf);showScreen("homeScreen");});
  $("returnHomeBtn").addEventListener("click",()=>{running=false;paused=false;cancelAnimationFrame(raf);showScreen("homeScreen");});
  window.addEventListener("resize",resizeCanvas);
  window.addEventListener("keydown",e=>{
    const k=e.key.toLowerCase();
    if([" ","arrowup","arrowdown","arrowleft","arrowright"].includes(k))e.preventDefault();
    if(k==="escape"){togglePause();return;}
    keys.add(k);
    if(e.repeat)return;
    if(k===" ")useDash();
    if(k==="shift")useDodge();
  });
  window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur",()=>{keys.clear();if(running&&!paused&&!upgradeOpen)togglePause();});
  canvas.addEventListener("mousemove",setMouse);
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  canvas.addEventListener("mousedown",e=>{
    setMouse(e);
    if(e.button===0)normalAttack();
    if(e.button===2)specialAttack();
  });
  // Prevent browser menu/selection from interfering with game controls.
  document.addEventListener("contextmenu",e=>{if(!$("gameScreen").classList.contains("hidden"))e.preventDefault();});
  // Initial canvas sizing is delayed until the game screen is visible.
  resetSettingsForm();
})();
