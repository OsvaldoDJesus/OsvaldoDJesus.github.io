import {MAP, TOWERS, ENEMIES, wavePlan} from './content.mjs';
const segments = MAP.path.slice(1).map((p,i) => Math.hypot(p[0]-MAP.path[i][0],p[1]-MAP.path[i][1]));
export const PATH_LENGTH = segments.reduce((a,b)=>a+b,0);
export function pointAt(distance) {
  let d = Math.max(0,distance);
  for (let i=0;i<segments.length;i++) {
    if(d<=segments[i]) { const t=d/segments[i]; return {x:MAP.path[i][0]+(MAP.path[i+1][0]-MAP.path[i][0])*t,y:MAP.path[i][1]+(MAP.path[i+1][1]-MAP.path[i][1])*t}; }
    d-=segments[i];
  }
  return {x:1025,y:320};
}
export function createRun(power=0) {
  return {phase:'build',wave:0,completed:0,health:20,gold:230,towers:[],enemies:[],effects:[],queue:[],spawn:0,elapsed:0,kills:0,power:Math.max(0,Math.min(5,power)),hero:{x:510,y:480,targetX:510,targetY:480,cooldown:0,pulse:0},settled:false,nextId:1,paused:false};
}
export function build(run,pad,type) {
  const def=TOWERS[type];
  if(!['build','combat'].includes(run.phase)||run.paused||!Number.isInteger(pad)||!MAP.pads[pad]||!def||run.gold<def.cost||run.towers.some(t=>t.pad===pad)) return false;
  run.gold-=def.cost; run.towers.push({pad,type,level:1,cooldown:0,spent:def.cost}); return true;
}
export function upgradeCost(tower) { return Math.round(TOWERS[tower.type].cost * (tower.level===1?0.8:1.25)); }
export function upgrade(run,pad) {
  const tower=run.towers.find(t=>t.pad===pad);
  if(!tower||tower.level>=3||run.paused||!['build','combat'].includes(run.phase))return false;
  const cost=upgradeCost(tower); if(run.gold<cost)return false;
  run.gold-=cost;tower.spent+=cost;tower.level++;return true;
}
export function sell(run,pad) {
  const i=run.towers.findIndex(t=>t.pad===pad);
  if(i<0||run.paused||!['build','combat'].includes(run.phase))return false;
  run.gold+=Math.floor(run.towers[i].spent*0.65);run.towers.splice(i,1);return true;
}
export function startWave(run) {
  if(run.phase!=='build'||run.paused||run.wave>=12)return false;
  run.wave++;run.queue=wavePlan(run.wave);run.spawn=0;run.phase='combat';return true;
}
export function moveHero(run,x,y) {
  if(run.paused||!['combat','build'].includes(run.phase)||!Number.isFinite(x)||!Number.isFinite(y))return;
  run.hero.targetX=Math.max(35,Math.min(960,x));run.hero.targetY=Math.max(50,Math.min(555,y));
}
export function pulse(run) {
  if(run.phase!=='combat'||run.paused||run.hero.pulse>0)return false;
  run.hero.pulse=18;
  for(const e of run.enemies)if(Math.hypot(e.x-run.hero.x,e.y-run.hero.y)<185)e.hp-=95*(1+run.power*0.08);
  effect(run,{kind:'pulse',x:run.hero.x,y:run.hero.y,color:'#aaffcf',life:0.7,maxLife:0.7});
  return true;
}
function effect(run,e){if(run.effects.length<160)run.effects.push(e);}
export function step(run,dt) {
  if(run.paused||!['combat','build'].includes(run.phase)||!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,0.05);run.elapsed+=dt;
  run.effects=run.effects.filter(e=>(e.life-=dt)>0);
  const h=run.hero, dx=h.targetX-h.x,dy=h.targetY-h.y, length=Math.hypot(dx,dy);
  if(length>1){const speed=Math.min(length,145*dt);h.x+=dx/length*speed;h.y+=dy/length*speed;}
  h.pulse=Math.max(0,h.pulse-dt);h.cooldown=Math.max(0,h.cooldown-dt);
  if(run.phase!=='combat')return;
  run.spawn-=dt;
  if(run.queue.length&&run.spawn<=0&&run.enemies.length<64){
    const type=run.queue.shift(), def=ENEMIES[type],hp=def.hp*(1+(run.wave-1)*0.14);
    run.enemies.push({...def,...pointAt(0),type,hp,maxHp:hp,distance:0,slow:0,id:run.nextId++});run.spawn=0.85;
  }
  for(const tower of run.towers){
    tower.cooldown=Math.max(0,tower.cooldown-dt);
    if(tower.cooldown>0)continue;
    const def=TOWERS[tower.type],[x,y]=MAP.pads[tower.pad],range=def.range+(tower.level-1)*12;
    const target=run.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-x,e.y-y)<=range).sort((a,b)=>b.distance-a.distance)[0];
    if(!target)continue;
    const damage=def.damage*(1+(tower.level-1)*0.65)*(1+run.power*0.08);
    target.hp-=damage;
    if(tower.type==='frost')target.slow=1.6;
    if(def.splash)for(const e of run.enemies)if(e!==target&&Math.hypot(e.x-target.x,e.y-target.y)<def.splash)e.hp-=damage*0.7;
    effect(run,{kind:'bolt',x,y,tx:target.x,ty:target.y,color:def.color,life:0.18,maxLife:0.18});
    if(def.splash)effect(run,{kind:'burst',x:target.x,y:target.y,color:def.color,life:0.35,maxLife:0.35});
    tower.cooldown=def.interval;
  }
  if(h.cooldown===0){
    const target=run.enemies.find(e=>e.hp>0&&Math.hypot(e.x-h.x,e.y-h.y)<145);
    if(target){target.hp-=12*(1+run.power*0.08);h.cooldown=0.7;effect(run,{kind:'bolt',x:h.x,y:h.y,tx:target.x,ty:target.y,color:'#aaffcf',life:0.18,maxLife:0.18});}
  }
  for(const e of run.enemies){
    if(e.hp<=0){run.gold+=e.reward;run.kills++;effect(run,{kind:'burst',x:e.x,y:e.y,color:e.color,life:0.4,maxLife:0.4});continue;}
    e.distance+=e.speed*(e.slow>0?0.5:1)*dt;e.slow=Math.max(0,e.slow-dt);Object.assign(e,pointAt(e.distance));
    if(e.distance>=PATH_LENGTH){run.health=Math.max(0,run.health-e.damage);e.escaped=true;}
  }
  run.enemies=run.enemies.filter(e=>e.hp>0&&!e.escaped);
  if(run.health<=0){run.phase='lost';return;}
  if(run.enemies.length===0&&run.queue.length===0){run.completed=run.wave;run.gold+=35+run.wave*5;run.phase=run.wave===12?'won':'build';}
}
