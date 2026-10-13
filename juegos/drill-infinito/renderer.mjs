import {ORES,SKIN_MAP,blockInfo,biomeAtDepth,evolution} from './engine.mjs';
const atlas=new Image(),scenes=new Image(),fallback=new Image();
atlas.src='./rigs-atlas.png';scenes.src='./biomes-atlas.png';fallback.src='./drill-sprite.png';
const modules=new Map(),cameras=new WeakMap();
const rect=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
const hash=(x,y)=>{let n=Math.imul(x^19437,374761393)+Math.imul(y^87571,668265263);n=Math.imul(n^n>>>13,1274126177);return(n^n>>>16)>>>0;};
function moduleImage(id){if(!modules.has(id)){const img=new Image();img.src=`./assets/evolutions/${id}.png`;modules.set(id,img);if(modules.size>16)modules.delete(modules.keys().next().value);}return modules.get(id);}
export function lootLayout(width,height){return Object.keys(ORES).map((key,i)=>({key,x:width/2+(i%4-1.5)*108,y:height-60-Math.floor(i/4)*90,width:88,height:64}));}
export function drawRig(ctx,id,stage,x,y,width,height){
  const skin=SKIN_MAP.get(id),family=skin.familyIndex,col=family%3,row=Math.floor(family/3);
  if(atlas.complete&&atlas.naturalWidth){const sw=atlas.naturalWidth/3,sh=atlas.naturalHeight/4;ctx.drawImage(atlas,col*sw,row*sh,sw,sh,x,y,width,height);}
  else if(fallback.complete&&fallback.naturalWidth)ctx.drawImage(fallback,x,y,width,height);
  const overlay=moduleImage(`${skin.family}-${String(stage).padStart(2,'0')}`);
  if(overlay.complete&&overlay.naturalWidth)ctx.drawImage(overlay,x,y,width,height);
}
function crystal(ctx,x,y,size,color,type=0){
  const s=Math.max(2,Math.floor(size/8));
  rect(ctx,x-3*s,y+2*s,6*s,2*s,'#121923');rect(ctx,x-2*s,y-2*s,4*s,5*s,color);
  rect(ctx,x-s,y-4*s,2*s,2*s,color);rect(ctx,x-3*s,y,1*s,3*s,color);
  rect(ctx,x+2*s,y-s,1*s,4*s,color);rect(ctx,x-s,y-3*s,s,3*s,'#edfaff');
  rect(ctx,x+s,y,s,2*s,'#ffffff55');if(type%2)rect(ctx,x-4*s,y+s,2*s,s,color);
}
export function drawMine(canvas,store,now,impactUntil=0){
  const began=performance.now(),width=canvas.clientWidth>500?768:480,height=width===768?512:560;
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
  const p=store.profile,info=blockInfo(store),biome=biomeAtDepth(p.depth);
  const quiet=p.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const running=store.started&&!store.paused&&(p.upgrades.auto!=='0'||now<impactUntil);
  const target=Number(BigInt(p.depth)%100000n)+info.percent/100;
  let camera=cameras.get(canvas);
  if(!camera){camera={depth:target,time:now,frames:0,total:0,worst:0};cameras.set(canvas,camera);}
  const dt=Math.min(100,Math.max(0,now-camera.time));camera.time=now;
  if(quiet||Math.abs(target-camera.depth)>20)camera.depth=target;else camera.depth+=(target-camera.depth)*(1-Math.exp(-dt/140));
  const scroll=camera.depth*18,cx=width/2,rigY=Math.round(height*.2),rigW=width===768?192:164,rigH=width===768?252:226,tip=rigY+rigH;
  rect(ctx,0,0,width,height,'#101725');
  if(scenes.complete&&scenes.naturalWidth){const sw=scenes.naturalWidth/4,sh=scenes.naturalHeight/2;ctx.drawImage(scenes,(biome.index%4)*sw,Math.floor(biome.index/4)*sh,sw,sh,0,0,width,height);}
  rect(ctx,0,0,width,height,'#11172422');
  // Foreground strata at the sides. Absolute world rows keep them continuous.
  for(let row=-1;row<Math.ceil(height/24)+1;row++)for(let side of [0,1]){
    const gy=Math.floor(scroll/24)+row,n=hash(side,gy),x=side?width-28:0,y=row*24-scroll%24;
    rect(ctx,x,y,28,24,biome.rock);rect(ctx,x+3,y+2,23,2,'#8d87912e');rect(ctx,x+5+n%7,y+8,8,3,'#11172488');
    if(n%9===0)crystal(ctx,x+14,y+14,12,biome.color,n);
  }
  // The excavated hole, cables and timber progress with the camera.
  rect(ctx,cx-62,0,124,tip+7,'#10182480');rect(ctx,cx-60,0,2,tip,'#a3a0a340');rect(ctx,cx+59,0,2,tip,'#a3a0a340');
  const beamStep=86;
  for(let y=-beamStep;y<tip-12;y+=beamStep){const sy=y-scroll%beamStep;
    if(sy<-30)continue;
    rect(ctx,cx-71,sy,9,71,'#483026');rect(ctx,cx+62,sy,9,71,'#483026');
    rect(ctx,cx-72,sy,145,9,'#795238');rect(ctx,cx-72,sy,145,2,'#c39356');
    for(let v=0;v<3;v++){rect(ctx,cx-67,sy+20+v*15,2,9,'#bd86553d');rect(ctx,cx+65,sy+18+v*15,2,8,'#bd86553d');}
    rect(ctx,cx-86,sy+22,9,16,'#322735');rect(ctx,cx-84,sy+25,5,8,'#ffce69');rect(ctx,cx-94,sy+23,24,15,'#ffd37a19');
  }
  rect(ctx,cx-27,0,2,rigY+18,'#6d707e');rect(ctx,cx+30,0,2,rigY+18,'#686878');
  const bob=running&&!quiet?Math.sin(now/47)*1.5:0;
  drawRig(ctx,p.skin,evolution(p),cx-rigW/2,rigY+bob,rigW,rigH);
  // Mineral front with fine fractures, clear causal drill feedback.
  rect(ctx,cx-47,tip+8,94,43,biome.rock);rect(ctx,cx-45,tip+9,90,3,'#a39a8266');
  for(let i=0;i<5;i++)crystal(ctx,cx-28+i*14,tip+26+(i%2)*4,12,info.ore.color,i);
  for(let i=0;i<Math.floor(info.percent/18);i++){const x=cx-38+i*14;rect(ctx,x,tip+10+i%3*4,2,18,'#101826');rect(ctx,x,tip+27+i%3*4,9,2,'#101826');}
  if(!quiet&&running){for(let i=0;i<14;i++){const phase=(now/110+i*7)%25,x=cx+Math.sin(i*17+now/170)*phase*1.4,y=tip+4+phase;rect(ctx,x,y,i%4===0?3:2,2,i%3?'#ffd079':'#e89664');}}
  if(!quiet&&biome.index===3){for(let i=0;i<10;i++){const y=(now/21+i*45)%height;rect(ctx,45+i*5,y,2,4,'#ffb06266');}}
  if(!quiet&&p.turboMs>0){rect(ctx,cx-rigW/2-5,rigY+38,3,70,'#b3eeff');rect(ctx,cx+rigW/2+2,rigY+38,3,70,'#b3eeff');}
  // Ores stay on the floor until the player or collector picks them up.
  for(const spot of lootLayout(width,height))if(BigInt(p.pending[spot.key])>0n){
    const hover=quiet?0:Math.sin(now/300+spot.x)*2;rect(ctx,spot.x-30,spot.y+16,60,4,'#0a101daa');
    crystal(ctx,spot.x,spot.y-2+hover,27,ORES[spot.key].color,Object.keys(ORES).indexOf(spot.key));
    crystal(ctx,spot.x-19,spot.y+10+hover,14,ORES[spot.key].color,1);
  }
  const cost=performance.now()-began;camera.frames++;camera.total+=cost;camera.worst=Math.max(camera.worst,cost);
  if(camera.frames%30===0){canvas.dataset.renderAverageMs=(camera.total/camera.frames).toFixed(2);canvas.dataset.renderWorstMs=camera.worst.toFixed(2);canvas.dataset.renderFrames=String(camera.frames);}
}
