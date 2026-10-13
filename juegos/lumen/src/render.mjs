import {MAP,TOWERS} from './content.mjs';
const TAU=Math.PI*2;
function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');circle(c,x,y,r,g);}
function diamond(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r*.6,y);c.lineTo(x,y+r);c.lineTo(x-r*.6,y);c.closePath();c.fill();}
function tree(c,x,y,size,shade){
  c.fillStyle='#06181944';c.beginPath();c.ellipse(x+12,y+12,size*.8,size*.3,-.2,0,TAU);c.fill();
  c.fillStyle='#253b34';c.fillRect(x-3,y-size*.55,6,size*.65);
  for(let i=0;i<3;i++){const tip=y-size*(1.7-i*.38),w=size*(.55+i*.17);c.fillStyle=shade[i%shade.length];c.beginPath();c.moveTo(x,tip);c.quadraticCurveTo(x-w*.25,tip+size*.6,x-w,tip+size*.86);c.quadraticCurveTo(x,tip+size*1.05,x+w,tip+size*.86);c.quadraticCurveTo(x+w*.25,tip+size*.6,x,tip);c.fill();}
  c.strokeStyle='#9ac3a214';c.lineWidth=1;c.beginPath();c.moveTo(x,y-size*1.48);c.lineTo(x,y-size*.3);c.stroke();
}
function mushroom(c,x,y,s,color){c.fillStyle='#9cb6a5';c.fillRect(x-s*.12,y-s*.1,s*.24,s*.6);glow(c,x,y,s*2,color+'22');c.fillStyle=color;c.beginPath();c.ellipse(x,y,s,s*.6,0,Math.PI,TAU);c.fill();circle(c,x-s*.35,y-s*.28,s*.1,'#efffdb99');circle(c,x+s*.3,y-s*.3,s*.08,'#efffdb99');}
let terrain;
function terrainCanvas(){
  if(terrain)return terrain;
  terrain=document.createElement('canvas');terrain.width=1000;terrain.height=600;
  const c=terrain.getContext('2d');
  c.fillStyle='#163232';c.fillRect(0,0,1000,600);
  const g=c.createRadialGradient(520,300,30,520,300,650);g.addColorStop(0,'#27463c');g.addColorStop(1,'#0b242b');c.fillStyle=g;c.fillRect(0,0,1000,600);
  // Deterministic decoration: visual randomness never touches combat.
  let seed=712;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<850;i++){const x=random()*1000,y=random()*600;circle(c,x,y,random()*2+.5,random()>.5?'#7d977514':'#0a242333');}
  c.lineCap='round';c.lineJoin='round';
  for(const [width,color] of [[62,'#112827'],[53,'#34443a'],[42,'#57604a'],[32,'#61674e']]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();MAP.path.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
  c.strokeStyle='#c6c58d18';c.lineWidth=1.5;c.setLineDash([3,14]);c.stroke();c.setLineDash([]);
  for(let i=0;i<150;i++){
    const x=random()*1000,y=random()*600;
    const close=MAP.path.some(([px,py],j)=>{if(!j)return false;const [ax,ay]=MAP.path[j-1],dx=px-ax,dy=py-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(x-ax-dx*t,y-ay-dy*t)<70;});
    if(close||MAP.pads.some(([px,py])=>Math.hypot(x-px,y-py)<58)||Math.hypot(x-940,y-320)<105)continue;
    if(i%3===0)mushroom(c,x,y,5+random()*6,i%2?'#80a7c0':'#8bbca6');
    else tree(c,x,y,18+random()*21,['#123a35','#1b443b','#245143']);
  }
  for(const [x,y] of [[35,80],[80,110],[950,100],[990,135],[35,550],[90,590],[960,560],[900,600]])tree(c,x,y,48,['#0a2d2c','#123832','#184137']);
  for(let i=0;i<30;i++){const x=random()*1000,y=random()*600;circle(c,x,y,1.2,'#c6e5ad44');}
  return terrain;
}
export function drawTower(c,x,y,type,level=1,time=0){
  const def=TOWERS[type];
  c.fillStyle='#071f2266';c.beginPath();c.ellipse(x+4,y+9,25,11,0,0,TAU);c.fill();
  c.strokeStyle='#789586';c.lineWidth=3;c.beginPath();c.ellipse(x,y+5,23,10,0,0,TAU);c.stroke();
  glow(c,x,y-14,45,def.color+'20');
  if(type==='thorn'){
    c.strokeStyle='#779971';c.lineWidth=7;c.beginPath();c.moveTo(x,y+4);c.quadraticCurveTo(x-8,y-12,x,y-31);c.stroke();
    diamond(c,x,y-34,19,def.color);diamond(c,x,y-34,9,'#fff8c9');
    c.strokeStyle='#779971';c.lineWidth=4;for(const d of [-1,1]){c.beginPath();c.moveTo(x,y-9);c.lineTo(x+d*15,y-22);c.stroke();diamond(c,x+d*15,y-24,7,'#99bf81');}
  }else if(type==='frost'){
    c.strokeStyle='#63a69a';c.lineWidth=5;c.beginPath();c.moveTo(x,y+5);c.lineTo(x,y-18);c.stroke();
    for(let i=0;i<6;i++){const a=i*TAU/6+time*.12;c.save();c.translate(x,y-25);c.rotate(a);c.fillStyle=def.color;c.beginPath();c.ellipse(0,-11,6,14,0,0,TAU);c.fill();c.restore();}circle(c,x,y-25,7,'#e1fff0');
  }else{mushroom(c,x,y-18,23,def.color);mushroom(c,x+18,y-3,10,'#827cb7');}
  for(let i=0;i<level;i++)diamond(c,x+(i-(level-1)/2)*8,y+17,3,def.color);
}
function drawHero(c,h,time){
  glow(c,h.x,h.y,42,'#b2efb322');c.strokeStyle='#b3e8bb66';c.lineWidth=1;c.beginPath();c.ellipse(h.x,h.y+9,16,6,0,0,TAU);c.stroke();
  c.fillStyle='#74b09d';c.beginPath();c.moveTo(h.x,h.y-19);c.lineTo(h.x-12,h.y+6);c.quadraticCurveTo(h.x,h.y+13,h.x+12,h.y+6);c.closePath();c.fill();circle(c,h.x,h.y-20,7,'#edd7af');
  c.strokeStyle='#bed6a3';c.lineWidth=2;c.beginPath();c.moveTo(h.x+12,h.y+6);c.lineTo(h.x+16,h.y-28);c.stroke();diamond(c,h.x+16,h.y-30,6,'#dbfac0');
  if(Math.hypot(h.targetX-h.x,h.targetY-h.y)>10){c.strokeStyle='#b3e8bb66';c.beginPath();c.arc(h.targetX,h.targetY,7+Math.sin(time*5)*2,0,TAU);c.stroke();}
}
export function draw(canvas,run,{time=0,selected=-1,preview=false,reduced=false}={}){
  const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
  if(w&&h&&(canvas.width!==w||canvas.height!==h)){canvas.width=w;canvas.height=h;}
  const c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,canvas.width,canvas.height);
  // Fit the full map; input uses the same transform, even in portrait mode.
  const scale=Math.min(canvas.width/1000,canvas.height/600),ox=(canvas.width-1000*scale)/2,oy=(canvas.height-600*scale)/2;
  c.fillStyle='#112b2c';c.fillRect(0,0,canvas.width,canvas.height);c.translate(ox,oy);c.scale(scale,scale);
  c.drawImage(terrainCanvas(),0,0);
  const t=reduced?0:time;
  glow(c,944,318,100,'#beffaf28');
  c.strokeStyle='#82b696';c.lineWidth=2;c.beginPath();c.ellipse(944,330,35,19,0,0,TAU);c.stroke();
  for(let i=0;i<5;i++){const a=i*TAU/5+t*.15;diamond(c,944+Math.cos(a)*23,311+Math.sin(a)*12,18,'#b6e4a344');}
  diamond(c,944,299+Math.sin(t*2)*3,31,'#bfe6a9');diamond(c,944,298+Math.sin(t*2)*3,17,'#efffce');
  c.fillStyle='#d6e8be';c.font='9px Arial';c.textAlign='center';c.fillText('SEMILLA ANCESTRAL',944,370);
  for(let i=0;i<MAP.pads.length;i++){
    const [x,y]=MAP.pads[i],tower=run.towers.find(t=>t.pad===i);
    if(i===selected){const range=tower?TOWERS[tower.type].range+(tower.level-1)*12:145;c.fillStyle='#c1e6b409';c.strokeStyle='#c1e6b440';c.lineWidth=1;c.beginPath();c.arc(x,y,range,0,TAU);c.fill();c.stroke();}
    if(tower)drawTower(c,x,y,tower.type,tower.level,t);
    else{c.fillStyle=i===selected?'#90b38340':'#16332dbb';c.beginPath();c.ellipse(x,y,26,18,0,0,TAU);c.fill();c.strokeStyle=i===selected?'#c1e6b4':'#84987b80';c.lineWidth=1.5;c.setLineDash([4,4]);c.stroke();c.setLineDash([]);c.fillStyle='#d3ddae';c.font='20px Georgia';c.fillText('+',x,y+5);}
    c.fillStyle='#b9c6acaa';c.font='9px Arial';c.fillText(String(i+1),x,y+32);
  }
  for(const e of run.enemies){
    c.save();c.translate(e.x,e.y);const bob=reduced?0:Math.sin(t*8+e.id)*2;c.translate(0,bob);
    circle(c,2,5,e.radius,'#08181b55');glow(c,0,0,e.radius*2,e.color+'18');
    c.fillStyle=e.color;c.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8,r=e.radius*(i%2?.8:1.2);i?c.lineTo(Math.cos(a)*r,Math.sin(a)*r):c.moveTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();
    circle(c,-4,-2,2,'#261e33');circle(c,4,-2,2,'#261e33');
    if(e.slow>0){c.strokeStyle='#7fe8e0';c.lineWidth=2;c.beginPath();c.arc(0,0,e.radius+4,0,TAU);c.stroke();}
    c.fillStyle='#112429';c.fillRect(-18,-e.radius-11,36,4);c.fillStyle=e.type==='boss'?'#f386ad':'#bfd29a';c.fillRect(-18,-e.radius-11,36*Math.max(0,e.hp/e.maxHp),4);c.restore();
  }
  drawHero(c,run.hero,t);
  for(const e of run.effects){c.globalAlpha=Math.max(0,e.life/e.maxLife);c.strokeStyle=e.color;c.lineWidth=e.kind==='bolt'?2:3;c.beginPath();if(e.kind==='bolt'){c.moveTo(e.x,e.y-20);c.lineTo(e.tx,e.ty);}else c.arc(e.x,e.y,(1-e.life/e.maxLife)*(e.kind==='pulse'?185:35)+5,0,TAU);c.stroke();}c.globalAlpha=1;
  if(!reduced)for(let i=0;i<22;i++){const x=(i*147.7+Math.sin(t*.4+i)*15)%1000,y=(i*83.9+Math.cos(t*.6+i)*12)%600,alpha=.25+.25*Math.sin(t*2+i);glow(c,x,y,9,`rgba(193,230,150,${alpha*.35})`);circle(c,x,y,1.4,`rgba(218,244,177,${alpha})`);}
  if(run.paused&&!preview){c.fillStyle='#091c22aa';c.fillRect(0,0,1000,600);c.fillStyle='#eceddf';c.font='34px Georgia';c.fillText('El bosque espera',500,285);c.font='14px Arial';c.fillText('Partida en pausa · Pulsa Ⅱ o Esc para continuar',500,320);}
}
export function mapPoint(canvas,clientX,clientY){const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/1000,r.height/600);return {x:(clientX-r.left-(r.width-1000*scale)/2)/scale,y:(clientY-r.top-(r.height-600*scale)/2)/scale};}
