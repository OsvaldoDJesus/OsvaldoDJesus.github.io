import {MAP,TOWERS} from './content.mjs';
import {createRun,build,upgrade,sell,upgradeCost,startWave,step,moveHero,pulse} from './engine.mjs';
import {loadProfile,saveProfile,buyPower,powerCost,settle} from './profile.mjs';
import {draw,mapPoint} from './render.mjs';
import {Sound} from './audio.mjs';
const $=id=>document.getElementById(id), sound=new Sound();
let storage;try{storage=window.localStorage;}catch{storage={getItem(){return null;},setItem(){throw Error('No disponible');}};}
const profile=loadProfile(storage), previewRun=createRun();
previewRun.towers=[{pad:1,type:'thorn',level:2},{pad:4,type:'frost',level:1},{pad:7,type:'spore',level:2}];
let run=null,selected=-1,speed=1,moving=false,last=0,accumulator=0,uiTime=0,closeAction=null,saveFailed=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function persist(){saveFailed=!saveProfile(storage,profile);if(saveFailed)toast('No se pudo guardar. El progreso sigue disponible durante esta sesión.');}
function homeUI(){ $('best').textContent=String(profile.best).padStart(2,'0');$('seeds').textContent=String(profile.seeds).padStart(2,'0');$('power-level').textContent=`${profile.power} / 5`;$('buy-power').textContent=profile.power>=5?'Nivel máximo':`Mejorar · ${powerCost(profile)} semillas`;$('buy-power').disabled=profile.power>=5||profile.seeds<powerCost(profile); }
function toast(text){$('toast').textContent=text;}
function modal(html,button='Continuar',onClose=null){$('modal-content').innerHTML=html;$('modal-close').textContent=button;closeAction=onClose;$('modal').showModal();}
function closeModal(){const callback=closeAction;closeAction=null;$('modal').close();callback?.();}
$('modal-close').onclick=closeModal;
$('modal').addEventListener('cancel',event=>{event.preventDefault();closeModal();});
$('help').onclick=()=>{if(run){run.paused=true;updateUI();}modal('<small>GUÍA DEL CLARO</small><h2>Cada luz cuenta.</h2><ol><li>Selecciona una parcela numerada y planta una defensa con tu luz.</li><li>Aguja ataca rápido; Rocío ralentiza; Espora daña grupos.</li><li>Inicia la oleada. Ganarás luz al derrotar enemigos y completar oleadas.</li><li>Toca el suelo para mover a Lyra y usa su pulso contra grupos cercanos.</li><li>Completa 12 oleadas. Las semillas ganadas al finalizar permiten mejorar el daño de futuras partidas.</li></ol><p>Teclado: 1–9 parcelas, A/R/E construir, flechas mover, Q pulso, espacio siguiente oleada, Esc pausa. Las compras y las oleadas también tienen botones.</p><p>El perfil se guarda al terminar una expedición y al comprar mejoras. La partida en curso no se guarda al cerrar.</p>','Entendido');};
$('sound').onclick=()=>{const enabled=sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Silenciar sonido':'Activar sonido');$('sound').textContent=enabled?'♫':'♪';};
$('buy-power').onclick=()=>{if(buyPower(profile)){persist();homeUI();sound.play('build');if(saveFailed)modal('<h2>Guardado no disponible</h2><p>La mejora se conserva durante esta sesión, pero el almacenamiento del dispositivo la ha rechazado.</p>');}};
$('play').onclick=()=>{run=createRun(profile.power);selected=-1;speed=1;accumulator=0;$('home').hidden=true;$('game').hidden=false;toast('Selecciona una parcela y planta una defensa. Tienes 230 de luz.');updateUI();$('arena').focus();};
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(run)retire();else window.scrollTo({top:0,behavior:'smooth'});};
function finish(){
  if(!run||run.settled)return;
  const phase=run.phase,reward=settle(profile,run);persist();homeUI();sound.play(phase==='won'?'win':'build');
  modal(`<small>EXPEDICIÓN ${phase==='won'?'COMPLETADA':'FINALIZADA'}</small><h2>${phase==='won'?'El bosque vuelve a respirar.':phase==='retired'?'De vuelta al refugio.':'La luz volverá a crecer.'}</h2><div class="result-number">${run.completed}<span> / 12</span></div><p>Oleadas completadas · ${run.kills} invasores detenidos.<br>Has conseguido <strong>${reward} semillas eternas</strong>.</p><p>${phase==='lost'?'Combina Rocío y Espora cerca de las curvas y mejora tus torres.':phase==='won'?'Has protegido la semilla ancestral y derrotado al Devoraluz.':'Las semillas corresponden a oleadas completadas.'}</p>${saveFailed?'<p>No se pudo guardar el perfil. El progreso solo está disponible en esta sesión.</p>':''}`,'Volver al refugio',()=>{run=null;$('game').hidden=true;$('home').hidden=false;homeUI();$('play').focus();});
}
function retire(){if(!run)return;run.paused=true;updateUI();modal('<h2>¿Volver al refugio?</h2><p>Conservarás las semillas de las oleadas completadas. Esta expedición terminará.</p><button id="confirm-retire" class="secondary">Terminar expedición</button>','Seguir jugando',()=>{if(run)run.paused=false;});$('confirm-retire').onclick=()=>{run.phase='retired';closeAction=()=>finish();closeModal();};}
$('retire').onclick=retire;
function pause(){if(!run||!['build','combat'].includes(run.phase))return;run.paused=!run.paused;updateUI();}
$('pause').onclick=pause;$('speed').onclick=()=>{speed=speed===1?2:1;updateUI();};
$('next-wave').onclick=()=>{if(startWave(run)){sound.play('build');toast(run.wave===12?'El Devoraluz se acerca. Protege la semilla.':`Oleada ${run.wave}: Lyra y las defensas atacan automáticamente.`);updateUI();}};
$('pulse').onclick=()=>{if(pulse(run)){sound.play('pulse');toast('¡Pulso de luz! Daño a invasores cercanos a Lyra.');updateUI();}};
$('hero-move').onclick=()=>{moving=true;toast('Toca el mapa para mover a Lyra.');};
function construct(type){if(!run)return;if(selected<0){toast('Primero selecciona una parcela vacía.');return;}if(build(run,selected,type)){sound.play('build');toast(`${TOWERS[type].name} plantada. ${TOWERS[type].description}.`);}else toast('Necesitas una parcela vacía, luz suficiente y la partida sin pausa.');updateUI();}
for(const [type,def] of Object.entries(TOWERS)){const b=document.createElement('button');b.className='tower-button';b.id=`build-${type}`;b.title=def.description;b.innerHTML=`<span class="symbol">${def.icon}</span><span>${def.short}<small>${def.cost} LUZ</small></span>`;b.onclick=()=>construct(type);$('build-buttons').append(b);}
for(let i=0;i<MAP.pads.length;i++){const b=document.createElement('button');b.textContent=String(i+1);b.setAttribute('aria-label',`Seleccionar parcela ${i+1}`);b.onclick=()=>{selected=i;updateUI();};$('plots').append(b);}
$('upgrade').onclick=()=>{if(upgrade(run,selected)){sound.play('build');toast('Defensa mejorada: más daño y alcance.');updateUI();}};
$('sell').onclick=()=>{if(sell(run,selected)){toast('Defensa retirada. Recuperaste el 65% de la luz invertida.');updateUI();}};
$('arena').addEventListener('pointerdown',e=>{if(!run||run.paused)return;const p=mapPoint($('arena'),e.clientX,e.clientY);if(p.x<0||p.x>1000||p.y<0||p.y>600)return;const pad=MAP.pads.findIndex(([x,y])=>Math.hypot(x-p.x,y-p.y)<36);if(pad>=0&&!moving){selected=pad;updateUI();}else{moveHero(run,p.x,p.y);moving=false;}});
function updateUI(){
  if(!run)return;
  $('health').textContent=run.health;$('gold').textContent=run.gold;$('speed').textContent=`${speed}×`;$('pause').textContent=run.paused?'▶':'Ⅱ';$('pause').setAttribute('aria-label',run.paused?'Reanudar partida':'Pausar partida');
  $('wave-label').textContent=run.wave?`Oleada ${String(run.wave).padStart(2,'0')} / 12`:'Prepara tu defensa';$('phase-label').textContent=run.paused?'PAUSA':run.phase==='build'?'PREPARACIÓN':'DEFENSA';
  $('next-wave').disabled=run.phase!=='build'||run.paused;$('next-wave').textContent=run.phase==='combat'?`${run.enemies.length+run.queue.length} invasores restantes`:`${run.wave?'Siguiente':'Comenzar'} oleada →`;
  $('pulse').disabled=run.phase!=='combat'||run.hero.pulse>0||run.paused;$('pulse').textContent=run.hero.pulse>0?`✧ Pulso · ${Math.ceil(run.hero.pulse)} s`:'✧ Pulso de luz';
  const tower=run.towers.find(t=>t.pad===selected);
  $('selection-label').textContent=selected<0?'SELECCIONA UNA PARCELA':tower?`PARCELA ${selected+1} · ${TOWERS[tower.type].name.toUpperCase()} · NIVEL ${tower.level}`:`PARCELA ${selected+1} · ELIGE UNA DEFENSA`;
  $('build-buttons').hidden=!!tower;$('tower-actions').hidden=!tower;
  for(const [type,def]of Object.entries(TOWERS))$(`build-${type}`).disabled=run.gold<def.cost||selected<0||run.paused;
  if(tower){$('upgrade').textContent=tower.level>=3?'Nivel máximo':`Mejorar · ${upgradeCost(tower)} luz`;$('upgrade').disabled=tower.level>=3||run.gold<upgradeCost(tower)||run.paused;$('sell').textContent=`Vender · +${Math.floor(tower.spent*.65)} luz`;$('sell').disabled=run.paused;}
  [...$('plots').children].forEach((b,i)=>{b.classList.toggle('selected',i===selected);b.setAttribute('aria-pressed',String(i===selected));});
}
document.addEventListener('keydown',e=>{if(!run||$('modal').open)return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape')pause();if(e.repeat&&!e.code.startsWith('Arrow'))return;if(e.code==='Space')$('next-wave').click();if(e.code==='KeyQ')$('pulse').click();const i=Number(e.key)-1;if(Number.isInteger(i)&&i>=0&&i<9){selected=i;updateUI();}if(e.code==='KeyA')construct('thorn');if(e.code==='KeyR')construct('frost');if(e.code==='KeyE')construct('spore');const d={ArrowLeft:[-40,0],ArrowRight:[40,0],ArrowUp:[0,-40],ArrowDown:[0,40]}[e.code];if(d)moveHero(run,run.hero.targetX+d[0],run.hero.targetY+d[1]);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&run){run.paused=true;accumulator=0;updateUI();}});
window.addEventListener('blur',()=>{if(run&&!$('modal').open){run.paused=true;updateUI();}});
function frame(now){
  const dt=Math.min((now-last)/1000||0,0.1);last=now;uiTime+=dt;
  if(run){const before=run.phase;accumulator=run.paused?0:accumulator+dt*speed;while(accumulator>=1/60){step(run,1/60);accumulator-=1/60;}if(before==='combat'&&run.phase==='build'){toast(`Oleada superada. Refuerza tus defensas antes de continuar.`);sound.play('build');}if(['lost','won'].includes(run.phase)&&!run.settled)finish();draw($('arena'),run,{time:now/1000,selected,reduced});if(uiTime>.12){updateUI();uiTime=0;}}
  else draw($('preview'),previewRun,{time:now/1000,preview:true,reduced});
  requestAnimationFrame(frame);
}
homeUI();requestAnimationFrame(frame);
