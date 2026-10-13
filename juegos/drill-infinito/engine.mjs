import {validateStore as validateV2,blockInfo as legacyBlock} from './engine-v2.mjs';
import {ORES,PATTERN,BIOMES,POWERS,CONTRACTS,SKINS,SKIN_MAP,biomeAtDepth} from './content.mjs';
export {ORES,PATTERN,BIOMES,POWERS,CONTRACTS,SKINS,SKIN_MAP,biomeAtDepth};
export const VERSION='0.3.0',BALANCE_VERSION='manual-03';
export const UPGRADES={
  power:{name:'Broca reforzada',short:'POTENCIA',icon:'▼',base:8n,linear:8n,square:3n,max:null,description:'Más fuerza por golpe y por segundo.'},
  speed:{name:'Motor de precisión',short:'VELOCIDAD',icon:'»',base:20n,linear:10n,square:4n,max:null,description:'Cada rango suma 25 % de velocidad base.'},
  auto:{name:'Piloto automático',short:'AUTOMATIZACIÓN',icon:'⚙',base:65n,linear:0n,square:0n,max:1,description:'El taladro comienza a excavar solo.'},
  collector:{name:'Recolector de minerales',short:'RECOGIDA',icon:'◎',base:45n,linear:0n,square:0n,max:1,description:'Recoge y vende el botín automáticamente.'},
  refine:{name:'Refinería',short:'GANANCIAS',icon:'◆',base:35n,linear:25n,square:8n,max:null,description:'Mejora un 20 % el valor base por rango.'},
  bay:{name:'Batería de reserva',short:'SIN CONEXIÓN',icon:'▣',base:80n,linear:40n,square:10n,max:3,description:'Reserva de 2 a 8 horas cuando hay piloto automático.'},
};
const UNIT=4000n,oreKeys=Object.keys(ORES),zeroOres=()=>Object.fromEntries(oreKeys.map(key=>[key,'0']));
const CHUNK_BASE=PATTERN.reduce((sum,key)=>sum+ORES[key].hp,0n)*50n*UNIT;
const COUNTS=Object.fromEntries(oreKeys.map(key=>[key,BigInt(PATTERN.filter(v=>v===key).length)*50n]));
export function newStore(now=Date.now()){
  return{version:3,started:false,paused:true,seed:0,lastSeen:now,profile:{
    depth:'0',xp:'0',coins:'0',work:'0',energy:100000,upgrades:Object.fromEntries(Object.keys(UPGRADES).map(key=>[key,'0'])),
    ores:zeroOres(),pending:zeroOres(),skin:'copper-01',ownedSkins:['copper-01'],claimed:[],manualMs:0,turboMs:0,
    cooldowns:{magnet:0,turbo:0,seismic:0},stats:{manualTaps:'0',collected:'0',powersUsed:'0',coinsEarned:'0',activeMs:'0'},
    milestones:{firstOre:null,firstUpgrade:null,automation:null},events:[],settings:{sound:false,reducedMotion:false,autoEvolution:true},
  }};
}
function event(next,type,detail=''){next.profile.events.push({type,at:next.profile.stats.activeMs,detail});if(next.profile.events.length>128)next.profile.events.splice(0,next.profile.events.length-128);}
export function integerSqrt(n){if(n<0n)throw new RangeError('Raíz negativa.');if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2)),y=(x+n/x)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}
export function xpAtLevel(level){const k=BigInt(level)-1n;if(k<0n)throw new RangeError('El nivel empieza en 1.');return 5n*k*(k+5n);}
export function levelAtXp(xp){const n=BigInt(xp);if(n<0n)throw new RangeError('XP negativa.');return(integerSqrt(25n+4n*(n/5n))-5n)/2n+1n;}
export function progress(p){const xp=BigInt(p.xp),level=levelAtXp(xp),current=xp-xpAtLevel(level),needed=xpAtLevel(level+1n)-xpAtLevel(level);return{level,current,needed,percent:Number(current*1000n/needed)/10};}
export function miningRate(p){return(2n+3n*BigInt(p.upgrades.power))*(4n+BigInt(p.upgrades.speed));}
export function offlineLimit(p){return(2+2*Number(p.upgrades.bay))*3600000;}
export function blockInfo(store,depth=BigInt(store.profile.depth)){const type=PATTERN[Number((depth+BigInt(store.seed%20))%20n)],ore=ORES[type],needed=(ore.hp+depth/1000n)*UNIT;return{type,ore,needed,percent:Number(BigInt(store.profile.work)*1000n/needed)/10};}
export function upgradeCost(p,key){if(!Object.hasOwn(UPGRADES,key))throw new RangeError('Mejora desconocida.');const n=BigInt(p.upgrades[key]),u=UPGRADES[key],tail=n>4n?n-4n:0n;return u.base+u.linear*n+u.square*n*n+(['power','speed','refine'].includes(key)?12n*tail**4n:0n);}
export function upgradeLock(p,key){
  if(key==='auto'&&(BigInt(p.upgrades.power)<2n||BigInt(p.depth)<4n))return'Necesitas broca rango 2 y 4 metros.';
  if(key==='collector'&&BigInt(p.depth)<6n)return'Se desbloquea a 6 metros.';
  if(key==='bay'&&p.upgrades.auto==='0')return'Primero instala el piloto automático.';return null;
}
export function buyUpgrade(store,key){
  if(!Object.hasOwn(UPGRADES,key))return{store,ok:false,reason:'Mejora desconocida.'};
  const u=UPGRADES[key],rank=BigInt(store.profile.upgrades[key]),locked=upgradeLock(store.profile,key),cost=upgradeCost(store.profile,key);
  if(u.max!==null&&rank>=BigInt(u.max))return{store,ok:false,reason:'Mejora al máximo.'};if(locked)return{store,ok:false,reason:locked};
  if(BigInt(store.profile.coins)<cost)return{store,ok:false,reason:'Recoge minerales para reunir más monedas.'};
  const next=structuredClone(store),p=next.profile;p.coins=(BigInt(p.coins)-cost).toString();p.upgrades[key]=(rank+1n).toString();p.milestones.firstUpgrade??=p.stats.activeMs;
  if(key==='auto')p.milestones.automation??=p.stats.activeMs;if(key==='collector')settlePending(next,oreKeys);event(next,'upgrade_buy',key);return{store:next,ok:true,cost};
}
function settlePending(next,keys){
  const p=next.profile,factor=5n+BigInt(p.upgrades.refine);let coins=0n,xp=0n,count=0n;
  for(const key of keys){const amount=BigInt(p.pending[key]);coins+=amount*(ORES[key].value*factor/5n);xp+=amount*ORES[key].xp;count+=amount;p.pending[key]='0';}
  p.coins=(BigInt(p.coins)+coins).toString();p.xp=(BigInt(p.xp)+xp).toString();p.stats.coinsEarned=(BigInt(p.stats.coinsEarned)+coins).toString();p.stats.collected=(BigInt(p.stats.collected)+count).toString();if(count>0n)p.milestones.firstOre??=p.stats.activeMs;return{coins,xp,count};
}
function applyWork(store,added){
  const next=structuredClone(store),p=next.profile;let depth=BigInt(p.depth),work=BigInt(p.work)+added;const counts=Object.fromEntries(oreKeys.map(key=>[key,0n]));
  const clearOne=()=>{const info=blockInfo(next,depth);if(work<info.needed)return false;work-=info.needed;counts[info.type]++;depth++;return true;};
  while(depth%1000n!==0n&&clearOne()){}
  if(depth%1000n===0n){const a=2000000n,b=CHUNK_BASE+4000000n*(depth/1000n)-a,chunks=(integerSqrt(b*b+4n*a*work)-b)/(2n*a);if(chunks>0n){work-=a*chunks*chunks+b*chunks;depth+=chunks*1000n;for(const key of oreKeys)counts[key]+=COUNTS[key]*chunks;}}
  while(clearOne()){}
  for(const key of oreKeys){p.ores[key]=(BigInt(p.ores[key])+counts[key]).toString();p.pending[key]=(BigInt(p.pending[key])+counts[key]).toString();}
  p.depth=depth.toString();p.work=work.toString();if(p.upgrades.collector!=='0')settlePending(next,oreKeys);return next;
}
export function advance(store,elapsedMs){
  if(!Number.isSafeInteger(elapsedMs)||elapsedMs<0||elapsedMs>28800000)throw new RangeError('Intervalo no válido.');
  if(store.paused||!store.started){const next=structuredClone(store);next.lastSeen+=elapsedMs;return next;}
  const p=store.profile,boosted=Math.min(elapsedMs,p.turboMs),work=p.upgrades.auto==='0'?0n:miningRate(p)*BigInt(elapsedMs+2*boosted);
  const next=work>0n?applyWork(store,work):structuredClone(store),q=next.profile;q.energy=Math.min(100000,p.energy+elapsedMs*3);q.manualMs=Math.max(0,p.manualMs-elapsedMs);q.turboMs=Math.max(0,p.turboMs-elapsedMs);
  for(const key of Object.keys(POWERS))q.cooldowns[key]=Math.max(0,p.cooldowns[key]-elapsedMs);q.stats.activeMs=(BigInt(p.stats.activeMs)+BigInt(elapsedMs)).toString();next.lastSeen+=elapsedMs;return next;
}
export function manualDrill(store){
  if(!store.started||store.paused||store.profile.manualMs>0)return{store,ok:false};
  const next=applyWork(store,miningRate(store.profile)*250n*(store.profile.turboMs>0?3n:1n));next.profile.manualMs=450;next.profile.stats.manualTaps=(BigInt(next.profile.stats.manualTaps)+1n).toString();return{store:next,ok:true};
}
export function collectOre(store,key){if(!Object.hasOwn(ORES,key)||!store.started||store.paused||BigInt(store.profile.pending[key])===0n)return{store,ok:false};const next=structuredClone(store),reward=settlePending(next,[key]);event(next,'ore_collect',key);return{store:next,ok:true,...reward};}
export function activatePower(store,key){
  if(!Object.hasOwn(POWERS,key))return{store,ok:false,reason:'Poder desconocido.'};const power=POWERS[key],p=store.profile;
  if(!store.started||store.paused)return{store,ok:false,reason:'Reanuda el taladro.'};if(BigInt(p.depth)<power.at)return{store,ok:false,reason:`Se desbloquea a ${power.at} metros.`};
  if(p.cooldowns[key]>0)return{store,ok:false,reason:'El poder se está recargando.'};if(p.energy<power.cost)return{store,ok:false,reason:'Espera a que se recargue la energía.'};
  const next=key==='seismic'?applyWork(store,blockInfo(store).needed*3n):structuredClone(store);if(key==='magnet')settlePending(next,oreKeys);if(key==='turbo')next.profile.turboMs=power.duration;
  next.profile.energy-=power.cost;next.profile.cooldowns[key]=power.cooldown;next.profile.stats.powersUsed=(BigInt(next.profile.stats.powersUsed)+1n).toString();event(next,'power_use',key);return{store:next,ok:true};
}
export function burst(store){return activatePower(store,'turbo');}
export function setPaused(store,paused,now){const next=structuredClone(store);next.started=true;next.paused=paused;next.lastSeen=now;return next;}
export function resumeOffline(store,now){
  if(!Number.isSafeInteger(now)||now<0)throw new RangeError('Fecha no válida.');const ms=Math.min(offlineLimit(store.profile),Math.max(0,now-store.lastSeen)),next=advance(store,ms);next.lastSeen=now;next.profile.stats.activeMs=store.profile.stats.activeMs;
  const actual=store.paused||!store.started||store.profile.upgrades.auto==='0'?0:ms;
  return{store:next,ms:actual,coins:BigInt(next.profile.coins)-BigInt(store.profile.coins),depth:BigInt(next.profile.depth)-BigInt(store.profile.depth),xp:BigInt(next.profile.xp)-BigInt(store.profile.xp),pending:oreKeys.reduce((sum,key)=>sum+BigInt(next.profile.pending[key])-BigInt(store.profile.pending[key]),0n)};
}
export function claimContract(store,id){const c=CONTRACTS.find(item=>item.id===id);if(!c||store.profile.claimed.includes(id)||c.value(store.profile)<c.target)return{store,ok:false};const next=structuredClone(store);next.profile.claimed.push(id);next.profile.coins=(BigInt(next.profile.coins)+c.reward).toString();event(next,'contract_claim',id);return{store:next,ok:true,reward:c.reward};}
export function skinLock(p,id){const skin=SKIN_MAP.get(id);if(!skin)return'Aspecto desconocido.';if(BigInt(p.depth)<skin.at)return`Explora hasta ${skin.at} m.`;if(BigInt(p.upgrades.power)+BigInt(p.upgrades.speed)<BigInt(skin.rank))return`Necesitas ${skin.rank} rangos de broca y motor.`;return null;}
export function buySkin(store,id){
  const skin=SKIN_MAP.get(id);if(!skin)return{store,ok:false,reason:'Aspecto desconocido.'};if(store.profile.ownedSkins.includes(id)){const next=structuredClone(store);next.profile.skin=id;next.profile.settings.autoEvolution=false;return{store:next,ok:true,cost:0n};}
  const locked=skinLock(store.profile,id);if(locked)return{store,ok:false,reason:locked};if(BigInt(store.profile.coins)<skin.price)return{store,ok:false,reason:'Necesitas más monedas.'};
  const next=structuredClone(store);next.profile.coins=(BigInt(next.profile.coins)-skin.price).toString();next.profile.ownedSkins.push(id);next.profile.skin=id;next.profile.settings.autoEvolution=false;event(next,'skin_equip',id);return{store:next,ok:true,cost:skin.price};
}
export function evolution(p){const skin=SKIN_MAP.get(p.skin),rank=BigInt(p.upgrades.power)+BigInt(p.upgrades.speed);return p.settings.autoEvolution?Math.min(25,Math.max(skin.stage,1+Number(rank>24n?24n:rank))):skin.stage;}
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,1023})$/.test(value),object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value),int=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const eventTypes=new Set(['upgrade_buy','ore_collect','power_use','contract_claim','skin_equip']);
export function migrateV2(input){
  const old=validateV2(input),next=newStore(old.lastSeen),p=next.profile,q=old.profile;next.started=old.started;next.paused=old.paused;next.seed=old.seed;
  if(!old.started&&q.depth==='0'){p.settings={...q.settings,autoEvolution:true};return next;}
  for(const key of ['depth','xp','coins','energy'])p[key]=q[key];for(const key of ['speed','refine','bay'])p.upgrades[key]=q.upgrades[key];p.upgrades.power=(BigInt(q.upgrades.power)+3n).toString();p.upgrades.auto='1';p.upgrades.collector='1';
  for(const key of Object.keys(q.ores))p.ores[key]=q.ores[key];p.stats.collected=q.depth;p.stats.powersUsed=q.stats.bursts;p.stats.coinsEarned=q.stats.coinsEarned;p.settings={...q.settings,autoEvolution:true};p.work=(BigInt(q.work)*blockInfo(next).needed/legacyBlock(old).needed).toString();return next;
}
export function validateStore(input){
  if(input?.version===2)return validateStore(migrateV2(input));const fail=()=>{throw new TypeError('Este respaldo no es válido para Drill Infinito.');};
  if(!object(input)||input.version!==3||typeof input.started!=='boolean'||typeof input.paused!=='boolean'||!int(input.lastSeen,8640000000000000)||!int(input.seed,4294967295)||!object(input.profile))fail();const p=input.profile;
  for(const key of ['upgrades','ores','pending','stats','settings','cooldowns','milestones'])if(!object(p[key]))fail();const clean=newStore(input.lastSeen),q=clean.profile;clean.started=input.started;clean.paused=input.paused;clean.seed=input.seed;
  for(const key of ['depth','xp','coins','work']){if(!decimal(p[key]))fail();q[key]=p[key];}
  for(const key of Object.keys(UPGRADES)){if(!decimal(p.upgrades[key])||(UPGRADES[key].max!==null&&BigInt(p.upgrades[key])>BigInt(UPGRADES[key].max)))fail();q.upgrades[key]=p.upgrades[key];}
  for(const key of oreKeys){if(!decimal(p.ores[key])||!decimal(p.pending[key])||BigInt(p.pending[key])>BigInt(p.ores[key]))fail();q.ores[key]=p.ores[key];q.pending[key]=p.pending[key];}
  for(const key of Object.keys(q.stats)){if(!decimal(p.stats[key]))fail();q.stats[key]=p.stats[key];}for(const key of Object.keys(q.milestones)){if(p.milestones[key]!==null&&!decimal(p.milestones[key]))fail();q.milestones[key]=p.milestones[key];}
  if(!int(p.energy,100000)||!int(p.manualMs,450)||!int(p.turboMs,8000))fail();q.energy=p.energy;q.manualMs=p.manualMs;q.turboMs=p.turboMs;for(const[key,value]of Object.entries(POWERS)){if(!int(p.cooldowns[key],value.cooldown))fail();q.cooldowns[key]=p.cooldowns[key];}
  if(typeof p.settings.sound!=='boolean'||typeof p.settings.reducedMotion!=='boolean'||typeof p.settings.autoEvolution!=='boolean')fail();q.settings={sound:p.settings.sound,reducedMotion:p.settings.reducedMotion,autoEvolution:p.settings.autoEvolution};
  if(!Array.isArray(p.ownedSkins)||p.ownedSkins.length<1||p.ownedSkins.length>300||new Set(p.ownedSkins).size!==p.ownedSkins.length||p.ownedSkins.some(id=>typeof id!=='string'||!SKIN_MAP.has(id))||!p.ownedSkins.includes(p.skin))fail();q.ownedSkins=[...p.ownedSkins];q.skin=p.skin;
  if(!Array.isArray(p.claimed)||p.claimed.length>CONTRACTS.length||new Set(p.claimed).size!==p.claimed.length||p.claimed.some(id=>!CONTRACTS.some(c=>c.id===id)))fail();q.claimed=[...p.claimed];
  if(!Array.isArray(p.events)||p.events.length>128)fail();q.events=p.events.map(item=>{if(!object(item)||!eventTypes.has(item.type)||!decimal(item.at)||typeof item.detail!=='string'||item.detail.length>64||! /^[a-z0-9-]*$/.test(item.detail))fail();return{type:item.type,at:item.at,detail:item.detail};});
  const total=oreKeys.reduce((sum,key)=>sum+BigInt(q.ores[key]),0n),pending=oreKeys.reduce((sum,key)=>sum+BigInt(q.pending[key]),0n);if(BigInt(q.work)>=blockInfo(clean).needed||total!==BigInt(q.depth)||BigInt(q.stats.collected)+pending!==total||(!clean.started&&!clean.paused))fail();return clean;
}
