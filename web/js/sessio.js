// Fitxa professional de cada sessió: objectiu, mètriques clau, estructura per blocs i consells.
// Es genera a partir del text del pla (els marcadors {SU} {UM} {IN} {RMO}) i dels ritmes actuals.
import { stripHtml } from './shared/plan.js';
import { fitness, fmt } from './shared/pace.js';

export const ZONES = {
  SU:  { n: 'Suau',         z: 'Z2',    hr: '65–75 %', rpe: '3–4', c: 'e' },
  RMO: { n: 'Ritme marató', z: 'Z3',    hr: '78–85 %', rpe: '6',   c: 'l' },
  UM:  { n: 'Llindar',      z: 'Z4',    hr: '85–90 %', rpe: '7–8', c: 'q' },
  IN:  { n: 'Ritme 10K',    z: 'Z4–5',  hr: '90–95 %', rpe: '8–9', c: 't' },
  HL:  { n: 'Pujada',       z: 'Z4–5',  hr: '88–95 %', rpe: '8',   c: 'q' },
  MX:  { n: 'Màxim',        z: 'Z5',    hr: '> 92 %',  rpe: '9–10', c: 't' }
};

/** Ritmes numèrics (s/km) a partir dels tests i l'objectiu. */
export function paceSecs(tests, goal = 300) {
  const f = fitness(tests); const mp = f ? f.mp : 330;
  return { SU: [mp + 40, mp + 75], RMO: [goal, goal], UM: [f ? (f.hm + f.k10) / 2 : 310, f ? (f.hm + f.k10) / 2 : 310], IN: [f ? f.k10 : 300, f ? f.k10 : 300] };
}
const rng = p => p[0] === p[1] ? fmt(p[0]) : `${fmt(p[0])}–${fmt(p[1])}`;
const mid = p => (p[0] + p[1]) / 2;
const zoneOf = t => {
  const m = t.match(/\{(SU|UM|IN|RMO)\}/); if (m) return m[1];
  if (/pujada/i.test(t)) return 'HL';
  if (/alegre/i.test(t)) return 'UM';
  if (/màxim|a tope/i.test(t)) return 'MX';
  if (/suau|trot|escalfament|caminant|rectes/i.test(t)) return 'SU';
  return null;
};
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);

function objective(s, txt) {
  const t = s.title.toLowerCase();
  switch (s.type) {
    case 'e': return /córrer\/caminar/.test(t) ? 'Readaptar tendons i articulacions a l\'impacte després de l\'aturada. Constància abans que ritme.'
      : /rectes/.test(t) ? 'Base aeròbica amb rectes finals per millorar l\'economia i la tècnica de cursa sense fatiga.'
      : 'Construir base aeròbica (capil·lars, mitocòndries) i recuperar de la sessió anterior. Ha de ser fàcil.';
    case 'q': return /pujad/.test(t) ? 'Força específica de cursa i potència de gambada; protegeix els tendons abans de les sèries ràpides.'
      : /llindar/.test(t) ? 'Elevar el llindar làctic: sostenir ritmes ràpids més temps sense acumular fatiga.'
      : /fartlek/.test(t) ? 'Primer contacte amb els canvis de ritme, per sensacions i sense pressió.'
      : /ritme marató|ritme de mitja/.test(t) ? 'Automatitzar el ritme de cursa i aprendre a sostenir-lo relaxat.'
      : 'Millorar el VO₂màx i la velocitat; fa que el ritme marató se senti més còmode.';
    case 'l': return /ritme marató/.test(t) || /\{RMO\}/.test(txt) ? 'Resistència específica: ritme marató amb fatiga acumulada, com a la segona meitat de la cursa.'
      : 'Resistència: adaptar musculatura, tendons i metabolisme (ús de greixos) a passar moltes hores corrent.';
    case 't': return 'Mesurar la forma actual: el resultat recalcula els ritmes d\'entrenament i la predicció.';
    case 'r': return /marató vies verdes/i.test(t) ? 'El dia D. Executar el pla de ritme i nutrició assajat.' : 'Assaig de competició: ritme, avituallament i rutina prèvia.';
    case 'g': return /core|estabilitat|mobilitat/.test(t) ? 'Estabilitat del tronc i del maluc: millor transmissió de força i menys lesions.'
      : /potència/.test(t) ? 'Potència i reactivitat: més rigidesa útil del tendó i gambada més eficient.'
      : 'Força del tren inferior: economia de cursa i prevenció de lesions (genoll, tendó d\'Aquil·les).';
    case 'p': return 'Intensitat amb canvis de direcció: agilitat i potència. Compta com a sessió dura.';
  }
  return '';
}

/** Retorna la fitxa estructurada d'una sessió. */
export function buildFitxa(s, km, title, tests, goal) {
  const P = paceSecs(tests, goal);
  let txt = stripHtml(s.detail).replace(/\s+/g, ' ').trim();
  const tips = [];
  txt = txt.replace(/Si dissabte tens partit[^.]*\./, () => { tips.push('Si dissabte jugues a pàdel, la tirada passa a diumenge (interruptor de la setmana).'); return ''; }).trim();
  const run = ['e', 'q', 'l', 't', 'r'].includes(s.type);
  const blocks = [];
  let zoneMain = null;

  if (run) {
    // Separem frases finals ("Al migdia.", "Gel cada 40′.") de l'estructura
    let main = txt;
    const struct = txt.includes(' · ') || txt.includes(' + ');
    if (struct) {
      const idx = Math.max(txt.lastIndexOf(' · '), txt.lastIndexOf(' + '));
      const tail = txt.slice(idx + 3); const dot = tail.indexOf('. ');
      if (dot >= 0) { main = txt.slice(0, idx + 3) + tail.slice(0, dot); tail.slice(dot + 2).split(/(?<=\.)\s+/).forEach(x => x && tips.push(x)); }
      main = main.replace(/\.$/, '');
      const parts = main.split(/ · | \+ /).map(x => x.trim()).filter(Boolean)
        .reduce((acc, x) => { if (/^\d+ rectes$/i.test(x) && acc.length) acc[acc.length - 1] += ` + ${x}`; else acc.push(x); return acc; }, []);
      const isWarm = x => /^\d+′ (suau|escalfament)|escalfament/i.test(x);
      const isCool = x => /^\d+′ suau$/i.test(x);
      parts.forEach((p, i) => {
        const ph = (i === 0 && parts.length > 2 && isWarm(p)) ? 'Escalfament' : (i === parts.length - 1 && parts.length > 2 && isCool(p)) ? 'Tornada a la calma' : (parts.length > 1 ? `Bloc ${blocks.filter(b => b.main).length + 1}` : 'Part principal');
        const z = zoneOf(p) || (ph === 'Part principal' || ph.startsWith('Bloc') ? (s.type === 'l' ? 'SU' : null) : 'SU');
        blocks.push({ ph, txt: p, z, main: !/Escalfament|Tornada/.test(ph) });
      });
      // Si només hi ha un bloc principal, es diu "Part principal"
      const mains = blocks.filter(b => b.main); if (mains.length === 1) mains[0].ph = 'Part principal';
    } else {
      // Rodatges i sessions d'una sola peça: la frase principal és el títol
      const sentences = txt.split(/(?<=\.)\s+/).filter(Boolean);
      blocks.push({ ph: 'Part principal', txt: title.replace(/^(\d+)′ suau/, 'Rodatge continu de $1′').replace(/^(\d+(?:[.,]\d+)?) km suaus/, 'Rodatge continu de $1 km'), z: zoneOf(txt) || 'SU', main: true });
      if (/rectes/i.test(title)) { const n = (title.match(/(\d+) rectes/) || [])[1]; blocks.push({ ph: 'Final', txt: `${n} rectes de 20″ ràpides i relaxades, recuperant caminant`, z: null, main: false }); }
      sentences.forEach(x => { if (!/Ritme \{SU\}|^Suau, ritme|rectes: 20/.test(x)) tips.push(x); });
    }
    const mz = blocks.filter(b => b.main && b.z).map(b => b.z);
    zoneMain = mz.includes('IN') ? 'IN' : mz.includes('MX') ? 'MX' : mz.includes('HL') ? 'HL' : mz.includes('UM') ? 'UM' : mz.includes('RMO') ? 'RMO' : 'SU';
    if (s.type === 'e' && /córrer\/caminar/i.test(title)) tips.unshift('Si no pots parlar, camina més estona. L\'objectiu és acabar amb ganes.');
  }

  // Durada estimada
  let dur = null;
  const tm = title.match(/^(\d+)′/) || title.match(/\((\d+)′\)/);
  if (tm) dur = +tm[1];
  else if (run && km) {
    let secs = 0, kmLeft = km;
    for (const b of blocks) {
      const kmb = (b.txt.match(/^(\d+(?:[.,]\d+)?) km/) || [])[1];
      const mins = (b.txt.match(/^(\d+)′/) || [])[1];
      if (kmb) { const k = +kmb.replace(',', '.'); secs += k * mid(P[b.z] || P.SU); kmLeft -= k; }
      else if (mins) { secs += mins * 60; kmLeft -= mins * 60 / mid(P.SU); }
    }
    if (kmLeft > 0.3) secs += kmLeft * (s.type === 'q' || s.type === 't' ? (mid(P.SU) + mid(P[zoneMain] || P.SU)) / 2 : mid(P[zoneMain] || P.SU));
    dur = Math.round(secs / 60 / 5) * 5;
  } else if (s.type === 'p') dur = 75;

  // Consells segons el tipus
  if (s.type === 'l' && km >= 16) tips.push(km >= 24 ? 'Nutrició: esmorzar 2–3 h abans, gel cada 35–40′ des del minut 45 i aigua a cada font.' : 'Porta aigua; si passes de 90′, pren un gel a mitja tirada.');
  if (s.type === 'l' && km >= 26) tips.push('Assaja la roba i les sabatilles de cursa. Fes part del recorregut en via verda de terra.');
  if (s.type === 'q' || s.type === 't') tips.push('Abans de la primera repetició, fes 2–3 rectes. Si el ritme no surt, acaba a ritme suau: millor una sessió curta que una lesió.');
  if (s.type === 'g') tips.push('Tècnica abans que pes. Descans de 60–90″ entre sèries; acaba amb 5′ de mobilitat.');
  if (s.type === 'p') tips.push('Escalfa 10′ (trot + mobilitat d\'espatlla). No juguis el dia abans de la tirada llarga.');

  const Zm = zoneMain ? ZONES[zoneMain] : null;
  const kpis = [];
  if (run && km) kpis.push(['Distància', `${String(+(+km).toFixed(1)).replace('.', ',')} km`]);
  if (dur) kpis.push(['Durada', `≈ ${dur >= 60 ? `${Math.floor(dur / 60)} h ${String(dur % 60).padStart(2, '0')}′` : `${dur}′`}`]);
  if (run && Zm && P[zoneMain]) kpis.push([zoneMain === 'SU' ? 'Ritme' : Zm.n, `${rng(P[zoneMain])}/km`]);
  if (run && Zm) kpis.push(['Esforç', `RPE ${Zm.rpe}`], ['Zona', `${Zm.z} · ${Zm.hr}`]);
  if (s.type === 'g') kpis.push(['Esforç', 'RPE 6–7'], ['Focus', /core|mobilitat/i.test(title) ? 'Core' : /potència/i.test(title) ? 'Potència' : 'Força']);
  if (s.type === 'p') kpis.push(['Esforç', 'RPE 7–8'], ['Tipus', 'Intensitat']);

  return {
    objective: objective(s, txt), kpis,
    blocks: blocks.map(b => ({ ...b, zone: b.z ? ZONES[b.z] : null, pace: b.z && P[b.z] ? `${rng(P[b.z])}/km` : null })),
    tips: [...new Set(tips.map(t => cap(t.trim())).filter(t => t.length > 2))],
    zone: Zm
  };
}
