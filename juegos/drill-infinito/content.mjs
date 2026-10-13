export const ORES = {
  rock: { name:'Roca', color:'#b5afc4', hp:28n, value:8n, xp:8n },
  copper: { name:'Cobre', color:'#f29b65', hp:38n, value:14n, xp:12n },
  gold: { name:'Oro', color:'#ffd16f', hp:52n, value:24n, xp:20n },
  gem: { name:'Amatista', color:'#c589ff', hp:68n, value:50n, xp:28n },
  diamond: { name:'Diamante', color:'#7aeaff', hp:92n, value:90n, xp:45n },
  ember: { name:'Brasa', color:'#ff8054', hp:84n, value:70n, xp:38n },
  aether: { name:'Éter', color:'#a3b3ff', hp:116n, value:160n, xp:60n },
  void: { name:'Cristal del vacío', color:'#ee80ee', hp:140n, value:240n, xp:90n },
};
export const PATTERN = ['rock','copper','rock','gold','rock','copper','gem','rock','diamond','rock','copper','ember','rock','gold','rock','aether','copper','rock','void','gem'];
export const BIOMES = [
  {name:'Mina del bosque',at:0n,color:'#f4b16c',rock:'#493d39'},
  {name:'Galería dorada',at:15n,color:'#ffc864',rock:'#514132'},
  {name:'Catedral de diamante',at:50n,color:'#7adfff',rock:'#354454'},
  {name:'Ríos de magma',at:150n,color:'#ff795c',rock:'#4d3038'},
  {name:'El inframundo',at:350n,color:'#ef6476',rock:'#442c3c'},
  {name:'Abismo bioluminiscente',at:650n,color:'#77e6bf',rock:'#253f48'},
  {name:'Frontera astral',at:1200n,color:'#baacff',rock:'#383052'},
  {name:'Nexo dimensional',at:2200n,color:'#e59eff',rock:'#483150'},
];
export function biomeAtDepth(depth){const n=BigInt(depth);let index=0;for(let i=1;i<BIOMES.length;i++)if(n>=BIOMES[i].at)index=i;return{index,...BIOMES[index],next:BIOMES[index+1]||null};}
export const FAMILIES = [
  {id:'copper',name:'Cobre',color:'#f3a469',at:0n},
  {id:'iron',name:'Hierro',color:'#bcc7cf',at:5n},
  {id:'silver',name:'Plateado',color:'#dcecff',at:15n},
  {id:'gold',name:'Dorado',color:'#ffd16e',at:30n},
  {id:'diamond',name:'Diamante',color:'#87e9ff',at:50n},
  {id:'obsidian',name:'Obsidiana',color:'#bf87ff',at:100n},
  {id:'magma',name:'Magma',color:'#ff855d',at:150n},
  {id:'emerald',name:'Esmeralda',color:'#92ea76',at:250n},
  {id:'astral',name:'Astral',color:'#a4a9ff',at:1200n},
  {id:'abyss',name:'Abisal',color:'#71d9d0',at:650n},
  {id:'dimensional',name:'Dimensional',color:'#e091ff',at:2200n},
  {id:'infinity',name:'Infinito',color:'#ffdf8d',at:4000n},
];
export const SKINS = FAMILIES.flatMap((family,familyIndex)=>Array.from({length:25},(_,i)=>({
  id:`${family.id}-${String(i+1).padStart(2,'0')}`,name:`${family.name} · E${String(i+1).padStart(2,'0')}`,
  family:family.id,familyIndex,stage:i+1,color:family.color,at:family.at+BigInt(i*i*2),rank:i,
  price:BigInt(familyIndex*35+i*8+i*i*3),asset:`assets/evolutions/${family.id}-${String(i+1).padStart(2,'0')}.png`,
})));
export const SKIN_MAP = new Map(SKINS.map(skin=>[skin.id,skin]));
export const POWERS = {
  magnet:{name:'Imán de minerales',icon:'◎',at:1n,cost:25000,cooldown:12000,description:'Recoge todos los minerales del escenario.'},
  turbo:{name:'Sobrecarga',icon:'ϟ',at:12n,cost:40000,cooldown:35000,duration:8000,description:'Triplica la perforación durante 8 segundos.'},
  seismic:{name:'Onda sísmica',icon:'✦',at:40n,cost:50000,cooldown:45000,description:'Rompe varias vetas con un golpe profundo.'},
};
export const CONTRACTS = [
  {id:'first-ore',name:'Una veta en tus manos',hint:'Recoge tu primer mineral',reward:6n,value:p=>BigInt(p.stats.collected),target:1n},
  {id:'first-tool',name:'Herramienta de verdad',hint:'Compra una broca reforzada',reward:12n,value:p=>BigInt(p.upgrades.power),target:1n},
  {id:'strong-tool',name:'Aprendiz de perforación',hint:'Alcanza rango 2 de broca',reward:18n,value:p=>BigInt(p.upgrades.power),target:2n},
  {id:'auto-miner',name:'Que trabaje la máquina',hint:'Instala piloto automático',reward:25n,value:p=>BigInt(p.upgrades.auto),target:1n},
  {id:'auto-collect',name:'Una mina organizada',hint:'Instala el recolector',reward:30n,value:p=>BigInt(p.upgrades.collector),target:1n},
  {id:'first-power',name:'Energía bajo tierra',hint:'Usa un superpoder',reward:25n,value:p=>BigInt(p.stats.powersUsed),target:1n},
  {id:'new-rig',name:'Una máquina a tu gusto',hint:'Consigue un segundo aspecto',reward:35n,value:p=>BigInt(p.ownedSkins.length),target:2n},
  {id:'lava',name:'El corazón de la tierra',hint:'Alcanza los ríos de magma',reward:150n,value:p=>BigInt(p.depth),target:150n},
];
