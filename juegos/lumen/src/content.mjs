export const VERSION = 1;
export const MAP = {
  width: 1000, height: 600,
  path: [[-25,270],[160,270],[240,180],[420,180],[495,365],[685,365],[770,245],[870,245],[945,320],[1025,320]],
  pads: [[150,170],[265,285],[375,85],[435,290],[560,255],[605,465],[720,165],[810,355],[875,145]],
};
export const TOWERS = {
  thorn: {name:'Aguja solar', short:'AGUJA', icon:'✦', cost:65, damage:15, range:158, interval:0.65, color:'#f9d38b', description:'Disparo rápido · un objetivo'},
  frost: {name:'Flor de rocío', short:'ROCÍO', icon:'❋', cost:85, damage:7, range:140, interval:0.9, color:'#7fe8e0', description:'Ralentiza 50% durante 1,6 s'},
  spore: {name:'Hongo astral', short:'ESPORA', icon:'◈', cost:110, damage:26, range:150, interval:1.8, splash:64, color:'#bd9dff', description:'Daño de área · grupos cercanos'},
};
export const ENEMIES = {
  mite: {name:'Errante', hp:38, speed:48, reward:7, damage:1, radius:11, color:'#ed9f96'},
  runner: {name:'Centella', hp:28, speed:85, reward:8, damage:1, radius:9, color:'#edce82'},
  brute: {name:'Coraza', hp:150, speed:31, reward:17, damage:3, radius:17, color:'#aa92bc'},
  boss: {name:'El Devoraluz', hp:1550, speed:20, reward:100, damage:20, radius:30, color:'#f386ad'},
};
export function wavePlan(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > 12) return [];
  const plan = Array.from({length: 6 + wave * 2}, (_, i) => wave >= 4 && i % 5 === 4 ? 'brute' : wave >= 2 && i % 3 === 2 ? 'runner' : 'mite');
  if (wave === 12) plan.push('boss');
  return plan;
}
