// Pla d'entrenament Marató Vies Verdes 2027 — 25 setmanes.
// Fitxer compartit: l'utilitza la web (copiat a web/js/shared/ en el desplegament)
// i les Edge Functions de Supabase (calendari i notificacions).
// És JavaScript pur, sense dependències, perquè funcioni al navegador i a Deno.

export const WEEKS = 25;
export const DAY = 864e5;
export const DAYS = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];
export const DAYS_L = ['dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte', 'diumenge'];
const MONTHS = ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'];

export const TYPES = {
  q: { n: 'Qualitat', icon: '⚡' },
  e: { n: 'Suau', icon: '🏃' },
  l: { n: 'Tirada llarga', icon: '🛤️' },
  g: { n: 'Gimnàs', icon: '🏋️' },
  p: { n: 'Pàdel', icon: '🎾' },
  t: { n: 'Test', icon: '⏱️' },
  r: { n: 'Cursa', icon: '🏅' }
};
export const isRun = t => ['q', 'e', 'l', 't', 'r'].includes(t);
export const SLOT_ORDER = ['mon', 'tue', 'tue-gym', 'wed', 'thu', 'thu-gym', 'fri', 'padel-fds', 'sat', 'sun'];

export const PHASES = [
  { id: 1, n: 'Retorn', w: [1, 6], txt: 'Tornar a córrer sense lesionar-se. Tot per sensacions: has de poder parlar. Construïm tendons i hàbit. El pàdel torna el {D:3:2}.' },
  { id: 2, n: 'Base aeròbica', w: [7, 11], txt: 'Entra el rodatge del dijous, primeres pujades i llindar curt. La tirada llarga puja fins als 18 km.' },
  { id: 3, n: 'Construcció', w: [12, 17], txt: 'Test de 10 km, sèries, llindar llarg i la Mitja de Barcelona com a assaig. Força pesada al gimnàs.' },
  { id: 4, n: 'Específic', w: [18, 22], txt: 'Ritme marató dins les tirades llargues. Pic de 32 km. Assaig general de nutrició i material.' },
  { id: 5, n: 'Afinament', w: [23, 25], txt: 'Abaixem volum, mantenim ritme. Arribar fresc a Girona.' }
];
export const phaseOf = w => PHASES.find(p => w >= p.w[0] && w <= p.w[1]);

const SHOULDER = '<p class="muted">Espatlla: res de press per sobre del cap ni fons fins que el teu fisio ho autoritzi. Afegeix-hi els exercicis que et pauti.</p>';
const GYM_A = {
  1: ['Gimnàs A · força, adaptació (45′)', '<ul><li>Esquat goblet 3×12 · Pes mort romanès amb manuelles 3×12</li><li>Step-up al banc 3×10/cama · Pont de glutis 3×15</li><li>Bessons dempeus 3×15 i asseguts (soli) 3×15</li><li>Core: dead bug 3×10, bird-dog 3×10/costat</li></ul>'],
  2: ['Gimnàs A · força, progressió (50′)', '<ul><li>Esquat amb barra o goblet 4×8–10 · Pes mort romanès 4×8–10</li><li>Gambada búlgara 3×8/cama · Hip thrust 3×10</li><li>Bessons unilateral 3×15 · Soli assegut 3×15</li><li>Core: pallof press 3×10/costat</li></ul>'],
  3: ['Gimnàs A · força màxima (50′)', '<ul><li>Esquat o premsa 4×5–6 pesat (et sobren 2 repeticions)</li><li>Pes mort romanès 4×6 · Gambada búlgara carregada 3×6/cama</li><li>Hip thrust 3×8 · Soli assegut pesat 3×12</li><li>Core 8′</li></ul>'],
  4: ['Gimnàs A · manteniment (40′)', '<ul><li>Esquat 3×5 · Pes mort romanès 3×5</li><li>Gambada búlgara 2×6/cama · Bessons/soli 2×12</li><li>Mai a la fallada: has d\'arribar fresc al dissabte</li></ul>'],
  5: ['Gimnàs A · activació (25′)', '<ul><li>Esquat goblet lleuger 2×8, pont de glutis 2×12, bessons 2×12</li><li>Mobilitat de maluc i turmell. Res de nou, res de pesat.</li></ul>']
};
const GYM_B = {
  1: ['Gimnàs B · core i estabilitat (40′)', '<ul><li>Pes mort a una cama 3×8/cama · Monster walk amb banda 3×12 passes</li><li>Tibial anterior 2×20 · Equilibri monopodal 3×30″</li><li>Core: planxa lateral (si l\'espatlla ho permet) o pallof 3×30″, dead bug 3×10</li><li>Agilitat de pàdel: 8′ de desplaçaments laterals, split-step i gambades en diagonal</li></ul>'],
  2: ['Gimnàs B · unilateral i agilitat (40′)', '<ul><li>Pes mort a una cama 3×8 · Esquat lateral (cosac) 3×6/costat</li><li>Copenhagen plank curta 3×15″ · Tibial 2×20</li><li>Pliometria suau: 3×20″ salts laterals sobre línia</li><li>Pàdel: 6 acceleracions de 5 m + canvis de direcció</li></ul>'],
  3: ['Gimnàs B · potència (40′)', '<ul><li>Salts al calaix 4×5 · Salts unipodals 3×6/cama</li><li>Step-up explosiu 3×6/cama · Copenhagen plank 3×20″</li><li>Core antirotació 10′</li><li>Pàdel: 4×20″ de desplaçaments a màxima velocitat</li></ul>'],
  4: ['Gimnàs B · potència lleugera i core (30′)', '<ul><li>Salts al calaix 3×4 · Skipping 3×20 m</li><li>Core 10′ · Tibial i soli 2×15</li><li>Si dilluns o dimarts van ser durs, fes només el core</li></ul>'],
  5: ['Gimnàs B · mobilitat i core (25′)', '<ul><li>Core suau 10′, mobilitat de maluc, turmell i columna toràcica</li></ul>']
};
const PADEL = {
  1: 'Tornada al pàdel. Escalfa 10′ amb trot i mobilitat d\'espatlla. Compta com a sessió d\'intensitat.',
  2: 'Partit o entrenament. És la teva sessió de canvis de ritme i agilitat.',
  3: 'Partit o entrenament normal.',
  4: 'Partit a mig gas: redueix remats si l\'espatlla avisa i no juguis més de 90′.',
  5: 'Peloteja suau 45–60′ o descansa. Res de tornejos.'
};

// ---------- Definició de les setmanes ----------
const S = (slot, d, type, title, detail, km = 0) => ({ slot, d, type, title, detail, km });
const E = (slot, d, min, km, extra = '') => S(slot, d, 'e', `${min}′ suau${extra ? ' + ' + extra : ''}`,
  `Al migdia. Ritme {SU}, conversacional.${extra.includes('rectes') ? ' Les rectes: 20″ ràpides però relaxades, torna caminant.' : ''}`, km);
const LONG = ' Si dissabte tens partit, activa-ho a dalt i la tirada passa a diumenge.';

const DEF = [];
function wk(n, phase, note, runs, o = {}) { DEF.push({ n, phase, note, runs, o }); }

// Fase 1 · Retorn
wk(1, 1, 'Setmana de tornada i sense pàdel. Corre sense mirar el ritme: només temps i sensacions.', [
  S('mon', 0, 'e', 'Córrer/caminar 4×(5′ trot + 1′ caminant)', 'Trot molt suau (has de poder parlar). Acaba amb 5′ caminant.', 4),
  S('wed', 2, 'e', '25′ trot suau', 'Pla. Si et costa, posa-hi 1′ caminant a la meitat.', 4),
  S('sat', 5, 'l', '30′ trot continu', 'Primera sortida contínua. Terreny pla o via verda.', 5)]);
wk(2, 1, 'Segona setmana sense pàdel: dimecres toca rodatge curt.', [
  S('mon', 0, 'e', 'Córrer/caminar 4×(7′ trot + 1′ caminant)', 'Suau, ritme conversacional.', 5),
  S('wed', 2, 'e', '30′ suau', '', 5),
  S('sat', 5, 'l', '40′ suau', 'Continu.' + LONG, 6.5)]);
wk(3, 1, 'Torna el pàdel el dimecres {D:3:2}.', [
  E('mon', 0, 35, 6),
  E('tue', 1, 30, 5, '4 rectes'),
  S('sat', 5, 'l', '45′ suau', 'Porta aigua.' + LONG, 7.5)]);
wk(4, 1, '', [
  E('mon', 0, 40, 7),
  E('tue', 1, 35, 6, '6 rectes'),
  S('sat', 5, 'l', '10 km suaus', 'A {SU}. Si vas bé, els últims 2 km una mica més vius.' + LONG, 10)]);
wk(5, 1, '', [
  E('mon', 0, 45, 8),
  S('tue', 1, 'q', 'Fartlek 6×1′', '10′ suau · 6×1′ alegre amb 2′ trot · 5′ suau. Al migdia.', 7),
  S('sat', 5, 'l', '12 km suaus', 'Practica beure cada 20′.' + LONG, 12)]);
wk(6, 1, 'Setmana de descàrrega amb test: anota el resultat a "Progrés" per recalcular els teus ritmes.', [
  E('mon', 0, 35, 6),
  S('tue', 1, 't', 'Test 5 km', '10′ escalfament + 4 rectes · 5 km al màxim que puguis sostenir · 5′ suau. Apunta el temps com a test.', 8),
  S('sat', 5, 'l', '10 km suaus', LONG.trim(), 10)], { gymA: 1, gymB: 0 });
// Fase 2 · Base aeròbica
wk(7, 2, 'Des d\'aquesta setmana, el dijous també corres al migdia.', [
  E('mon', 0, 45, 8),
  S('tue', 1, 'q', 'Pujades 8×45″', '10′ suau · 8×45″ en pujada (6–8 %) fort, baixada trotant · 5′ suau.', 8),
  E('thu', 3, 30, 5),
  S('sat', 5, 'l', '14 km suaus', 'A {SU}.' + LONG, 14)]);
wk(8, 2, 'Setmana de Nadal: descàrrega. Si no pots anar al gimnàs, fes el core a casa.', [
  E('mon', 0, 40, 7),
  E('tue', 1, 45, 8, '6 rectes'),
  S('sat', 5, 'l', '12 km suaus', LONG.trim(), 12)], { gymB: 0, padel: 1 });
wk(9, 2, '', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', 'Llindar 3×8′', '10′ suau · 3×8′ a {UM} amb 2′ trot · 5′ suau.', 9),
  E('thu', 3, 35, 6),
  S('sat', 5, 'l', '16 km suaus', LONG.trim(), 16)]);
wk(10, 2, '', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', 'Pujades 10×45″', '10′ suau · 10×45″ en pujada · 5′ suau.', 9),
  E('thu', 3, 35, 6),
  S('sat', 5, 'l', '17 km suaus', LONG.trim(), 17)]);
wk(11, 2, '', [
  E('mon', 0, 55, 10),
  S('tue', 1, 'q', 'Llindar 3×10′', '10′ suau · 3×10′ a {UM} amb 2′ trot · 5′ suau.', 10),
  E('thu', 3, 40, 7),
  S('sat', 5, 'l', '18 km: els últims 3 a ritme marató', '15 km a {SU} + 3 km a {RMO}.' + LONG, 18)]);
// Fase 3 · Construcció
wk(12, 3, 'Descàrrega amb test de 10 km dissabte. Anota\'l: recalcula els teus ritmes i la predicció.', [
  E('mon', 0, 40, 7),
  E('tue', 1, 40, 7.5, '6 rectes'),
  S('sat', 5, 't', 'Test 10 km', '15′ escalfament · 10 km a tope controlat (o una cursa popular) · 10′ suau.' + LONG, 14)], { gymB: 0 });
wk(13, 3, '', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', '4×1600 m a ritme 10K', '10′ suau · 4×1600 a {IN} amb 2′ trot · 5′ suau.', 10),
  E('thu', 3, 40, 7),
  S('sat', 5, 'l', '20 km: els últims 5 a ritme marató', '15 km a {SU} + 5 km a {RMO}. Prova un gel al km 12.' + LONG, 20)]);
wk(14, 3, '', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', 'Llindar 2×15′', '10′ suau · 2×15′ a {UM} amb 3′ trot · 5′ suau.', 10),
  E('thu', 3, 45, 8),
  S('sat', 5, 'l', '22 km suaus', 'A {SU}. Gel cada 40′.' + LONG, 22)]);
wk(15, 3, 'Mitja Marató de Barcelona el diumenge 14 de febrer. Si no tens dorsal, fes diumenge 21 km amb els 12 centrals a ritme marató. Aquesta setmana, sense pàdel el cap de setmana.', [
  E('mon', 0, 45, 8),
  S('tue', 1, 'q', '3×2 km a ritme de mitja', '10′ suau · 3×2 km a {UM} amb 2′ trot · 5′ suau.', 9),
  E('thu', 3, 30, 5),
  S('sat', 5, 'e', '20′ suau + 4 rectes', 'Activació precursa.', 4),
  S('sun', 6, 'r', 'Mitja Marató Barcelona', 'Surt a {RMO} els primers 5 km i, si vas bé, accelera de mica en mica. És un test, no una final. Apunta-la a "Progrés".', 21.1)], { gymB: 4, noFds: true });
wk(16, 3, 'Setmana de recuperació després de la mitja.', [
  E('mon', 0, 40, 7),
  E('tue', 1, 45, 8, '6 rectes'),
  E('thu', 3, 35, 6),
  S('sat', 5, 'l', '18 km suaus', LONG.trim(), 18)], { gymA: 2, gymB: 2 });
wk(17, 3, '', [
  E('mon', 0, 55, 10),
  S('tue', 1, 'q', '6×1 km ràpids', '10′ suau · 6×1 km a {IN} −5″ amb 90″ trot · 5′ suau.', 10),
  E('thu', 3, 45, 8),
  S('sat', 5, 'l', '24 km: els últims 8 a ritme marató', '16 km a {SU} + 8 km a {RMO}.' + LONG, 24)]);
// Fase 4 · Específic
wk(18, 4, '', [
  E('mon', 0, 55, 10),
  S('tue', 1, 'q', '2×4 km a ritme marató ràpid', '10′ suau · 2×4 km a {RMO} −10″ amb 3′ trot · 5′ suau.', 11),
  E('thu', 3, 45, 8),
  S('sat', 5, 'l', '26 km suaus', 'A {SU}. Assaja l\'esmorzar de cursa.' + LONG, 26)]);
wk(19, 4, '', [
  E('mon', 0, 55, 10),
  S('tue', 1, 'q', 'Llindar 3×12′', '10′ suau · 3×12′ a {UM} amb 2′ trot · 5′ suau.', 11),
  E('thu', 3, 50, 9),
  S('sat', 5, 'l', '28 km amb 2×6 km a ritme marató', '8 km {SU} · 6 km {RMO} · 4 km {SU} · 6 km {RMO} · 4 km {SU}.' + LONG, 28)]);
wk(20, 4, 'Descàrrega abans del pic.', [
  E('mon', 0, 45, 8),
  E('tue', 1, 45, 8, '6 rectes'),
  E('thu', 3, 35, 6),
  S('sat', 5, 'l', '20 km amb 10 a ritme marató', '5 km {SU} + 10 km {RMO} + 5 km {SU}.' + LONG, 20)], { gymB: 5 });
wk(21, 4, 'Setmana pic.', [
  E('mon', 0, 55, 10),
  S('tue', 1, 'q', '4×2 km a llindar', '10′ suau · 4×2 km a {UM} amb 2′ trot · 5′ suau.', 11),
  E('thu', 3, 50, 9),
  S('sat', 5, 'l', '32 km suaus', 'La més llarga. A {SU}, sense mirar el ritme els últims 8 km. Gel cada 35–40′.' + LONG, 32)]);
wk(22, 4, 'Assaig general: sabatilles, roba, gels i esmorzar de cursa.', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', '6×1 km a ritme marató ràpid', '10′ suau · 6×1 km a {RMO} −15″ amb 1′ trot · 5′ suau.', 10),
  E('thu', 3, 45, 8),
  S('sat', 5, 'l', '28 km amb 16 a ritme marató', '6 km {SU} + 16 km {RMO} + 6 km {SU}. Millor en via verda de terra: serà com el dia de la cursa.' + LONG, 28)]);
// Fase 5 · Afinament
wk(23, 5, '', [
  E('mon', 0, 50, 9),
  S('tue', 1, 'q', '2×4 km a ritme marató', '10′ suau · 2×4 km a {RMO} amb 2′ trot · 5′ suau.', 11),
  E('thu', 3, 40, 7),
  S('sat', 5, 'l', '22 km amb 8 a ritme marató', LONG.trim(), 22)], { gymA: 4, gymB: 5 });
wk(24, 5, '', [
  E('mon', 0, 45, 8),
  S('tue', 1, 'q', '5×1 km a ritme marató ràpid', '10′ suau · 5×1 km a {RMO} −10″ amb 1′ trot · 5′ suau.', 9),
  E('thu', 3, 35, 6),
  S('sat', 5, 'l', '16 km amb 6 a ritme marató', LONG.trim(), 16)]);
wk(25, 5, 'Setmana de cursa. Dorm, menja hidrats des de dijous i no estrenis res.', [
  E('mon', 0, 40, 7),
  S('tue', 1, 'q', '2×3 km a ritme marató', '10′ suau · 2×3 km a {RMO} amb 2′ trot · 5′ suau.', 9),
  E('thu', 3, 20, 4, '4 rectes'),
  S('sun', 6, 'r', 'MARATÓ VIES VERDES', 'Primers 10 km a {RMO} +5″, sense ansietat. Del 10 al 32, a {RMO}. Des del 32, el que quedi. Gel cada 35–40′ i aigua a cada avituallament.', 42.195)], { gymB: 0, noFds: true });

// ---------- Dates ----------
export function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function fromIso(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function catDate(d) { const m = MONTHS[d.getMonth()]; return `${d.getDate()} ${/^[aeiouà]/.test(m) ? "d'" : 'de '}${m}`; }

export const DEFAULT_RACE = '2027-04-25';

/** Construeix el pla complet a partir de la data de la cursa (diumenge de la setmana 25). */
export function buildPlan(raceIso = DEFAULT_RACE) {
  const race = fromIso(raceIso);
  const start = addDays(race, -((WEEKS - 1) * 7 + 6)); // dilluns de la setmana 1
  const dateOf = (w, d) => addDays(start, (w - 1) * 7 + d);
  const tpl = txt => String(txt || '').replace(/\{D:(\d+):(\d)\}/g, (_, w, d) => catDate(dateOf(+w, +d)));
  const weeks = [];
  const sessions = [];
  for (const { n, phase, note, runs, o } of DEF) {
    const sess = runs.map(r => ({ ...r }));
    const ga = o.gymA === undefined ? phase : o.gymA;
    const gb = o.gymB === undefined ? phase : o.gymB;
    if (ga) sess.push(S('tue-gym', 1, 'g', GYM_A[ga][0], (runs.some(r => r.slot === 'tue') ? '<p>Si corres al migdia, fes el gimnàs a la tarda.</p>' : '') + GYM_A[ga][1] + SHOULDER));
    if (gb) sess.push(S('thu-gym', 3, 'g', GYM_B[gb][0], (runs.some(r => r.slot === 'thu') ? '<p>Corre al migdia i gimnàs a la tarda, o just després si et quadra millor.</p>' : '') + GYM_B[gb][1] + SHOULDER));
    if (n >= 3 && !o.noPadel) sess.push(S('wed', 2, 'p', 'Pàdel', PADEL[o.padel || phase]));
    if (n >= 3 && !o.noFds) sess.push({ ...S('padel-fds', 5, 'p', 'Pàdel de cap de setmana', PADEL[phase] + ' Per això la tirada llarga va diumenge.'), fds: true });
    for (const s of sess) {
      s.week = n; s.id = `w${n}-${s.slot}`; s.baseDate = dateOf(n, s.d); s.detail = tpl(s.detail);
      sessions.push(s);
    }
    weeks.push({ n, phase, note: tpl(note), noFds: !!o.noFds });
  }
  const phases = PHASES.map(p => ({ ...p, txt: tpl(p.txt) }));
  const byId = Object.fromEntries(sessions.map(s => [s.id, s]));
  return { start, race, raceIso: iso(race), dateOf, weeks, sessions, byId, phases };
}

export const weekOfDate = (plan, d) => Math.floor(Math.round((d - plan.start) / DAY) / 7) + 1;

/** weeksState: { [n]: { padel_sat: bool } } · moves: { [sessionId]: 'YYYY-MM-DD' } */
export const fdsOn = (weeksState, n) => !!(weeksState && weeksState[n] && weeksState[n].padel_sat);
export const isActive = (s, weeksState) => !s.fds || fdsOn(weeksState, s.week);
export function effDate(plan, s, moves, weeksState) {
  const m = moves && moves[s.id];
  if (m) return fromIso(m);
  if (s.slot === 'sat' && fdsOn(weeksState, s.week)) return plan.dateOf(s.week, 6);
  return s.baseDate;
}
export function sessionsOnDate(plan, date, moves, weeksState) {
  const k = iso(date);
  return plan.sessions
    .filter(s => isActive(s, weeksState) && iso(effDate(plan, s, moves, weeksState)) === k)
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}
export const plannedKm = (plan, w) => plan.sessions.filter(s => s.week === w && isRun(s.type)).reduce((a, s) => a + s.km, 0);
export const stripHtml = h => String(h || '').replace(/<li>/g, '\n• ').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();
