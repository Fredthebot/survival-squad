const canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d");
const menu=document.getElementById("menu"),game=document.getElementById("game"),nameInput=document.getElementById("name");
const waveText=document.getElementById("waveText"),statusText=document.getElementById("statusText"),message=document.getElementById("message");
let ws=null,myId=null,state={players:[],enemies:[],wave:0,waveState:"waiting",waveTimer:0};
const keys={up:false,down:false,left:false,right:false,shoot:false};

document.getElementById("play").onclick=()=>{
  const name=nameInput.value.trim()||"Player";
  menu.hidden=true;game.hidden=false;connect(name);
};
function connect(name){
  const proto=location.protocol==="https:"?"wss":"ws";
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{statusText.textContent="Connected"; send({type:"input",name,input:keys});};
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="welcome") myId=m.id;
    if(m.type==="state"){state=m;renderHUD();draw();}
    if(m.type==="event"){message.textContent=m.event==="won"?"🏆 SQUAD VICTORY":"☠ SQUAD DEFEATED";statusText.textContent="Match over — press R to restart";}
  };
  ws.onclose=()=>{statusText.textContent="Disconnected — reconnecting...";setTimeout(()=>connect(name),1500)};
}
function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m))}
function sync(){send({type:"input",input:keys})}
const mapKey={w:"up",a:"left",s:"down",d:"right",ArrowUp:"up",ArrowLeft:"left",ArrowDown:"down",ArrowRight:"right"," ":"shoot"};
addEventListener("keydown",e=>{
  const k=mapKey[e.key]; if(k){e.preventDefault();keys[k]=true;sync()}
  if(e.key.toLowerCase()==="r"&&state.waveState==="won")send({type:"restart"});
});
addEventListener("keyup",e=>{const k=mapKey[e.key];if(k){keys[k]=false;sync()}});
document.querySelectorAll("[data-up]").forEach(b=>b.onclick=()=>send({type:"buy",upgrade:b.dataset.up}));

function renderHUD(){
  const me=state.players.find(p=>p.id===myId); if(!me)return;
  waveText.textContent=`Wave ${state.wave}/10`;
  statusText.textContent=state.waveState==="waiting"?`Next wave in ${Math.max(0,state.waveTimer).toFixed(1)}s`:"SURVIVE!";
  document.getElementById("playerName").textContent=me.name;
  document.getElementById("hpBar").style.width=`${Math.max(0,me.hp/me.maxHp*100)}%`;
  document.getElementById("hpText").textContent=`${Math.ceil(me.hp)} / ${me.maxHp}`;
  document.getElementById("level").textContent=me.level;
  document.getElementById("xp").textContent=me.xp;
  document.getElementById("coins").textContent=me.coins;
  document.getElementById("players").textContent=`${state.players.filter(p=>p.alive).length} alive · ${state.players.length} players`;
  if(me.alive&&state.waveState!=="won"&&state.waveState!=="lost")message.textContent="";
}

function draw(){
  ctx.clearRect(0,0,900,900);
  ctx.fillStyle="#0a101b";ctx.fillRect(0,0,900,900);
  ctx.strokeStyle="#111e2f";ctx.lineWidth=1;
  for(let x=0;x<=900;x+=45){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke()}
  for(let y=0;y<=900;y+=45){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(900,y);ctx.stroke()}
  for(const e of state.enemies){
    const color=e.type==="boss"?"#f472b6":e.type==="tank"?"#f59e0b":e.type==="runner"?"#a78bfa":"#fb5d66";
    ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    ctx.fillStyle="#182235";ctx.fillRect(e.x-e.radius,e.y-e.radius-9,e.radius*2,4);
    ctx.fillStyle="#55e39b";ctx.fillRect(e.x-e.radius,e.y-e.radius-9,e.radius*2*Math.max(0,e.hp/e.maxHp),4);
    if(e.type==="boss"){ctx.strokeStyle="#f9a8d4";ctx.lineWidth=3;ctx.stroke()}
  }
  for(const p of state.players){
    ctx.globalAlpha=p.alive?1:.25;
    ctx.beginPath();ctx.arc(p.x,p.y,13,0,Math.PI*2);ctx.fillStyle=p.color;ctx.fill();
    ctx.lineWidth=p.id===myId?3:1;ctx.strokeStyle="#fff";ctx.stroke();
    ctx.globalAlpha=1;
    ctx.font="12px system-ui";ctx.textAlign="center";ctx.fillStyle="#dce8f5";ctx.fillText(p.name,p.x,p.y-19);
    ctx.fillStyle="#172234";ctx.fillRect(p.x-17,p.y+18,34,4);ctx.fillStyle="#55e39b";ctx.fillRect(p.x-17,p.y+18,34*Math.max(0,p.hp/p.maxHp),4);
  }
}
setInterval(draw,50);
