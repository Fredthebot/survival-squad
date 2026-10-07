const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, "public")));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const TICK = 1000 / 30;
const SNAP = 1000 / 15;
const ARENA = 900;
const MAX_PLAYERS = 16;

const players = new Map();
const enemies = new Map();
let enemyId = 1;
let wave = 0;
let waveState = "waiting";
let waveTimer = 2;
let spawnTimer = 0;
let bossAlive = false;
let matchEnded = false;
let lastSnapshot = 0;

const ENEMY_TYPES = {
  grunt:  { hp: 35, speed: 70, damage: 8, radius: 14, xp: 10 },
  runner: { hp: 22, speed: 120, damage: 5, radius: 11, xp: 14 },
  tank:   { hp: 130, speed: 38, damage: 18, radius: 22, xp: 35 },
  boss:   { hp: 900, speed: 28, damage: 28, radius: 38, xp: 250 }
};

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function dist(a,b) { return Math.hypot(a.x-b.x, a.y-b.y); }
function randomEdge() {
  const side = Math.floor(Math.random()*4);
  if (side===0) return {x: Math.random()*ARENA, y:-25};
  if (side===1) return {x: ARENA+25, y:Math.random()*ARENA};
  if (side===2) return {x: Math.random()*ARENA, y:ARENA+25};
  return {x:-25, y:Math.random()*ARENA};
}
function alivePlayers() { return [...players.values()].filter(p=>p.alive); }
function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const p of players.values()) if (p.ws.readyState === 1) p.ws.send(data);
}
function levelForXp(xp) { return Math.floor(Math.sqrt(xp / 100)) + 1; }

function makePlayer(ws) {
  const id = Math.random().toString(36).slice(2,9);
  const colors = ["#6ee7ff","#a78bfa","#fbbf24","#34d399","#fb7185","#60a5fa"];
  return {
    id, ws, name: `Player-${id.slice(0,4)}`, x: ARENA/2 + (Math.random()*80-40),
    y: ARENA/2 + (Math.random()*80-40), hp: 100, maxHp: 100, alive: true,
    xp: 0, level: 1, coins: 0, speed: 190, damage: 20, fireRate: 420,
    lastShot: 0, input: {up:false,down:false,left:false,right:false},
    color: colors[players.size % colors.length]
  };
}

function resetMatch() {
  enemies.clear(); wave=0; waveState="waiting"; waveTimer=2; spawnTimer=0;
  bossAlive=false; matchEnded=false;
  for (const p of players.values()) {
    p.x=ARENA/2; p.y=ARENA/2; p.hp=p.maxHp=100; p.alive=true;
    p.xp=0; p.level=1; p.coins=0; p.speed=190; p.damage=20; p.fireRate=420;
  }
}

function spawnEnemy(type) {
  const eType = ENEMY_TYPES[type];
  const pos = randomEdge();
  const scale = 1 + (wave-1)*0.07;
  const hp = Math.round(eType.hp*scale);
  const e = { id: enemyId++, type, x:pos.x, y:pos.y, hp, maxHp:hp,
              speed:eType.speed*(1+(wave-1)*0.015), damage:eType.damage,
              radius:eType.radius, xp:eType.xp, hitFlash:0 };
  enemies.set(e.id,e);
  return e;
}

function startWave() {
  wave++;
  waveState="fighting";
  waveTimer=0;
  spawnTimer=0;
  bossAlive = wave % 5 === 0;
  if (bossAlive) spawnEnemy("boss");
}

function awardXp(p, amount) {
  if (!p.alive) return;
  const before = p.level;
  p.xp += amount;
  p.level = levelForXp(p.xp);
  if (p.level > before) {
    p.maxHp += 10;
    p.hp = Math.min(p.maxHp, p.hp + 25);
    p.damage += 4;
    p.coins += 20;
  }
}

function killEnemy(e, killer) {
  enemies.delete(e.id);
  if (killer) {
    awardXp(killer, e.xp);
    killer.coins += e.type === "boss" ? 100 : (e.type === "tank" ? 8 : 3);
  }
  if (e.type === "boss") bossAlive=false;
}

function nearestPlayer(e) {
  let best=null, bestD=Infinity;
  for (const p of alivePlayers()) {
    const d=dist(e,p);
    if (d<bestD) { best=p; bestD=d; }
  }
  return best;
}

function shoot(p) {
  const now=Date.now();
  if (!p.alive || now-p.lastShot<p.fireRate) return;
  p.lastShot=now;
  let target=null, best=260;
  for (const e of enemies.values()) {
    const d=dist(p,e);
    if (d<best) { best=d; target=e; }
  }
  if (!target) return;
  target.hp -= p.damage;
  target.hitFlash=100;
  if (target.hp<=0) killEnemy(target,p);
}

function update(dt) {
  if (matchEnded) return;

  const alive = alivePlayers();
  if (players.size && alive.length===0) {
    matchEnded=true; waveState="lost"; broadcast({type:"event",event:"lost"});
    return;
  }

  if (waveState==="waiting") {
    waveTimer-=dt;
    if (waveTimer<=0 && alive.length) startWave();
  }

  if (waveState==="fighting") {
    const targetCount = 5 + wave*3 + (wave%5===0 ? 2 : 0);
    if (enemies.size < targetCount && !bossAlive) {
      spawnTimer-=dt;
      if (spawnTimer<=0) {
        const roll=Math.random();
        let type="grunt";
        if (wave>=3 && roll<0.18) type="runner";
        if (wave>=4 && roll>0.82) type="tank";
        spawnEnemy(type);
        spawnTimer=Math.max(0.12, 0.55-wave*0.018);
      }
    }
    if (enemies.size===0 && !bossAlive) {
      if (wave>=10) {
        matchEnded=true; waveState="won"; broadcast({type:"event",event:"won"});
      } else {
        waveState="waiting"; waveTimer=3.5;
        for (const p of players.values()) if (p.alive) p.hp=Math.min(p.maxHp,p.hp+20);
      }
    }
  }

  for (const p of players.values()) {
    if (!p.alive) continue;
    let dx=(p.input.right?1:0)-(p.input.left?1:0);
    let dy=(p.input.down?1:0)-(p.input.up?1:0);
    const mag=Math.hypot(dx,dy)||1;
    p.x=clamp(p.x+dx/mag*p.speed*dt,20,ARENA-20);
    p.y=clamp(p.y+dy/mag*p.speed*dt,20,ARENA-20);
  }

  for (const e of enemies.values()) {
    const p=nearestPlayer(e);
    if (!p) continue;
    const d=dist(e,p);
    if (d>e.radius+15) {
      e.x += (p.x-e.x)/d*e.speed*dt;
      e.y += (p.y-e.y)/d*e.speed*dt;
    } else {
      p.hp -= e.damage*dt;
      if (p.hp<=0) { p.hp=0; p.alive=false; }
    }
    e.hitFlash=Math.max(0,e.hitFlash-dt*1000);
  }

  for (const p of players.values()) {
    if (p.alive && p.input.shoot) shoot(p);
  }
}

function snapshot() {
  return {
    type:"state", arena:ARENA, wave, waveState, waveTimer,
    players:[...players.values()].map(p=>({
      id:p.id,name:p.name,x:p.x,y:p.y,hp:p.hp,maxHp:p.maxHp,alive:p.alive,
      xp:p.xp,level:p.level,coins:p.coins,damage:p.damage,color:p.color
    })),
    enemies:[...enemies.values()].map(e=>({
      id:e.id,type:e.type,x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,radius:e.radius,hitFlash:e.hitFlash
    }))
  };
}

wss.on("connection",(ws)=>{
  if (players.size>=MAX_PLAYERS) { ws.close(1013,"Server full"); return; }
  const p=makePlayer(ws); players.set(p.id,p);
  ws.send(JSON.stringify({type:"welcome",id:p.id,serverTick:30}));
  ws.on("message",(raw)=>{
    try {
      const m=JSON.parse(raw);
      if (m.type==="input") {
        p.input={...p.input,...m.input};
        if (typeof m.name==="string") p.name=m.name.slice(0,18)||p.name;
      } else if (m.type==="buy") {
        if (!p.alive) return;
        const costs={damage:30,health:35,speed:40,fireRate:45};
        const key=m.upgrade;
        if (!costs[key] || p.coins<costs[key]) return;
        p.coins-=costs[key];
        if (key==="damage") p.damage+=5;
        if (key==="health") { p.maxHp+=20; p.hp=p.maxHp; }
        if (key==="speed") p.speed+=15;
        if (key==="fireRate") p.fireRate=Math.max(140,p.fireRate-45);
      } else if (m.type==="restart" && matchEnded) {
        resetMatch();
      }
    } catch {}
  });
  ws.on("close",()=>players.delete(p.id));
});

let last=Date.now();
setInterval(()=>{
  const now=Date.now(); const dt=Math.min(0.05,(now-last)/1000); last=now;
  update(dt);
  if (now-lastSnapshot>=1000/15) { broadcast(snapshot()); lastSnapshot=now; }
},TICK);

server.listen(PORT,()=>console.log(`Survival Squad running on port ${PORT}`));
