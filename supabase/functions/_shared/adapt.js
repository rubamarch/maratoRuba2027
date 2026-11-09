// Motor d'adaptació automàtica del pla.
// És una funció pura i determinista: a partir del pla base i de les dades reals
// (activitats de Strava, registres manuals, moviments i ajustos) calcula el pla
// efectiu d'avui. Així la web, el calendari .ics i les notificacions mostren sempre
// el mateix pla ajustat, i qualsevol canvi de dades el recalcula de zero.
//
// Regles (acordades):
//  · Més volum del previst amb esforç baix → puja amb prudència (+5 % per setmana, màxim +10 % sobre el pla).
//  · Menys volum o sessions saltades → baixa (−5 % / −10 %); setmana gairebé perduda → la següent repeteix el volum de l'anterior.
//  · Esforç mitjà alt (RPE ≥ 8) → la setmana següent −10 % (fatiga), sense tocar el multiplicador.
//  · Tirada llarga, qualitat o test saltats → es recol·loquen sols en un forat lliure de la mateixa setmana.
//    Si no hi ha forat, la tirada llarga substitueix un rodatge suau pendent. Els rodatges suaus saltats es perden.
//  · Dia extra (activitat fora del pla) → compta als km; si la sessió de qualitat següent és en ≤ 2 dies, es suavitza.
//  · Afinament (setmanes 23–25), tests i curses: mai no s'hi suma volum.
//  · La tirada llarga mai supera els 32 km.

import { DAY, iso, fromIso, addDays, isRun, isActive, effDate, catDate, DAYS_L } from './plan.js';

const M_MIN = 0.75, M_MAX = 1.10, LONG_MAX = 32, TAPER_FROM = 23;
const round05 = x => Math.round(x * 2) / 2;
const km1 = x => String(+(+x).toFixed(1)).replace('.', ',');
const actDate = a => String(a.start_date_local || a.start_date || '').slice(0, 10);
const actKm = a => (+a.distance || 0) / 1000;
/** Activitat de córrer (Strava o manual). Pàdel, gimnàs i altres no compten com a km de cursa. */
export const isRunAct = a => !a.sport_type || /run/i.test(a.sport_type);
const dayName = d => `${DAYS_L[(d.getDay() + 6) % 7]} ${catDate(d)}`;

/** Assigna activitats de Strava a sessions de córrer.
 *  1) Manual (activity.session_id), 2) mateix dia, 3) sessió no feta de la mateixa setmana (−3/+1 dies). */
function matchActivities(plan, data, moves) {
  const runs = plan.sessions.filter(s => isRun(s.type) && isActive(s, data.weeks));
  const dateOfS = s => iso(effDate(plan, s, moves, data.weeks));
  const match = {}; const extras = [];
  const acts = (data.activities || []).filter(a => !a.ignored).sort((a, b) => actDate(a).localeCompare(actDate(b)));
  const pending = [];
  for (const a of acts) {
    if (a.session_id === 'none') { extras.push(a); continue; }
    if (a.session_id && plan.byId[a.session_id]) { (match[a.session_id] ||= []).push(a); continue; }
    if (!isRunAct(a)) { extras.push(a); continue; }   // pàdel/gimnàs sense sessió assignada → dia extra
    pending.push(a);
  }
  const rest = [];
  for (const a of pending) {
    const d = actDate(a);
    const cands = runs.filter(s => dateOfS(s) === d);
    if (!cands.length) { rest.push(a); continue; }
    cands.sort((x, y) => Math.abs(x.km - actKm(a)) - Math.abs(y.km - actKm(a)));
    const free = cands.find(s => !match[s.id] && !(data.logs[s.id] && data.logs[s.id].done));
    (match[(free || cands[0]).id] ||= []).push(a);
  }
  for (const a of rest) {
    const d = fromIso(actDate(a));
    const cands = runs.filter(s => {
      if (match[s.id] || (data.logs[s.id] && data.logs[s.id].done)) return false;
      const sd = fromIso(dateOfS(s)); const diff = Math.round((d - sd) / DAY);
      const sameWeek = Math.floor(Math.round((sd - plan.start) / DAY) / 7) === Math.floor(Math.round((d - plan.start) / DAY) / 7);
      return sameWeek && diff >= -1 && diff <= 3;
    }).sort((x, y) => Math.abs(fromIso(dateOfS(x)) - d) - Math.abs(fromIso(dateOfS(y)) - d));
    if (cands.length) (match[cands[0].id] ||= []).push(a); else extras.push(a);
  }
  return { match, extras };
}

/**
 * data: { logs, moves, weeks, tests, activities, settings }
 * Retorna el model del pla efectiu.
 */
export function computeModel(plan, data, todayIso) {
  data = { logs: {}, moves: {}, weeks: {}, activities: [], settings: {}, ...data };
  const today = fromIso(todayIso);
  const adaptOn = data.settings.adapt !== false;
  const curWeek = Math.min(25, Math.max(1, Math.floor(Math.round((today - plan.start) / DAY) / 7) + 1));
  const moves = { ...data.moves };      // moviments manuals + virtuals
  const auto = {};                      // id → { moved?:iso, from?:iso, lost?, dropped?, replacedBy? }
  const adj = {};                       // id → { km, title, notes:[] }
  const history = [];                   // registre d'ajustos
  const weekInfo = {};

  const isDoneBy = (id, match) => !!(data.logs[id] && data.logs[id].done) || !!(match[id] && match[id].length);
  const sDate = s => effDate(plan, s, moves, data.weeks);

  // ---- 1a assignació, per saber què s'ha fet ----
  let { match } = matchActivities(plan, data, moves);

  // ---- Recol·locació de sessions clau saltades (setmana actual) ----
  if (adaptOn && today <= plan.race) {
    const w = curWeek; const sunday = plan.dateOf(w, 6);
    const wk = plan.sessions.filter(s => s.week === w && isActive(s, data.weeks));
    const runDays = () => new Set(wk.filter(s => isRun(s.type) && !auto[s.id]?.dropped && !auto[s.id]?.lost).map(s => iso(sDate(s))));
    const missed = wk.filter(s => isRun(s.type) && s.type !== 'r' && sDate(s) < today && !isDoneBy(s.id, match));
    // primer la tirada llarga, després test i qualitat
    missed.sort((a, b) => ['l', 't', 'q', 'e'].indexOf(a.type) - ['l', 't', 'q', 'e'].indexOf(b.type));
    for (const s of missed) {
      const from = sDate(s);
      if (s.type === 'e') { auto[s.id] = { lost: true, from: iso(from) }; continue; }
      const taken = runDays();
      const longS = wk.find(x => x.type === 'l' && x.id !== s.id && !auto[x.id]?.lost);
      const longD = longS ? iso(sDate(longS)) : null;
      const days = []; for (let d = new Date(today); d <= sunday; d = addDays(d, 1)) days.push(new Date(d));
      let target = null, replaced = null;
      if (s.type === 'l') {
        const free = days.filter(d => !taken.has(iso(d)));
        target = free.find(d => d.getDay() === 0) || free[free.length - 1] || null;
        if (!target) {
          const easy = wk.find(x => x.type === 'e' && sDate(x) >= today && !isDoneBy(x.id, match) && !auto[x.id]);
          if (easy) { target = sDate(easy); replaced = easy; }
        }
      } else {
        target = days.find(d => !taken.has(iso(d)) && iso(addDays(d, 1)) !== longD && iso(d) !== longD) || null;
      }
      if (target) {
        moves[s.id] = iso(target);
        auto[s.id] = { moved: iso(target), from: iso(from) };
        if (replaced) { auto[replaced.id] = { dropped: true, replacedBy: s.id }; }
        history.push({ week: w, kind: 'move', text: `${s.title}: no feta el ${dayName(from)} → recol·locada el ${dayName(target)}${replaced ? ' (substitueix el rodatge suau)' : ''}.` });
      } else {
        auto[s.id] = { lost: true, from: iso(from) };
        history.push({ week: w, kind: 'lost', text: `${s.title}: no feta i sense forat aquesta setmana. Es perd; no la recuperis doblant.` });
      }
    }
    if (Object.keys(auto).length) ({ match } = matchActivities(plan, data, moves));
  }
  // ---- Assignació definitiva ----
  const final = matchActivities(plan, data, moves);
  match = final.match; const extras = final.extras;
  const done = id => !auto[id]?.dropped && isDoneBy(id, match);
  const sessionKm = s => {
    const l = data.logs[s.id];
    if (l && l.km != null && l.km !== '') return +l.km;
    return (match[s.id] || []).filter(isRunAct).reduce((a, x) => a + actKm(x), 0);
  };

  // ---- Dies extra → suavitzar la qualitat propera ----
  if (adaptOn) for (const a of extras.filter(isRunAct)) {
    const d = fromIso(actDate(a));
    const q = plan.sessions.find(s => s.type === 'q' && isActive(s, data.weeks) && !done(s.id) && sDate(s) > d && (sDate(s) - d) / DAY <= 2);
    if (q) {
      (adj[q.id] ||= { notes: [] }).soft = true;
      adj[q.id].notes.push(`Dia extra el ${dayName(d)} (${km1(actKm(a))} km): fes-la a mig gas, una repetició menys.`);
      history.push({ week: q.week, kind: 'soft', text: `Dia extra el ${dayName(d)}: es suavitza "${q.title}".` });
    }
  }

  // ---- Multiplicador de volum setmana a setmana ----
  let m = 1; const oneOff = {};
  for (const W of plan.weeks) {
    const w = W.n;
    const f = adaptOn ? (w >= TAPER_FROM ? Math.min(m, 1) : m) * (oneOff[w] || 1) : 1;
    const sess = plan.sessions.filter(s => s.week === w && isActive(s, data.weeks) && !auto[s.id]?.dropped);
    let planned = 0;
    for (const s of sess) {
      if (!isRun(s.type)) continue;
      let km = s.km;
      if ((s.type === 'e' || s.type === 'l') && Math.abs(f - 1) > 0.001 && !done(s.id) && !auto[s.id]?.lost) {
        km = Math.min(s.type === 'l' ? LONG_MAX : 99, round05(s.km * f));
        if (km !== s.km) {
          const a = (adj[s.id] ||= { notes: [] });
          a.km = km;
          a.title = s.title.replace(/^(\d+(?:[.,]\d+)?) km/, `${km1(km)} km`).replace(/^(\d+)′/, (_, mm) => `${Math.max(15, Math.round(+mm * f / 5) * 5)}′`);
          a.notes.push(`Ajustat ${f > 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)} %: ${km1(s.km)} → ${km1(km)} km.`);
        }
      }
      if (adj[s.id]?.soft) km = round05(km * 0.85);
      if (!auto[s.id]?.lost) planned += km;
    }
    const wkExtras = extras.filter(a => { const d = fromIso(actDate(a)); return d >= plan.dateOf(w, 0) && d <= plan.dateOf(w, 6); });
    const actual = sess.filter(s => isRun(s.type)).reduce((a, s) => a + sessionKm(s), 0) + wkExtras.filter(isRunAct).reduce((a, x) => a + actKm(x), 0);
    const rpes = sess.filter(s => isRun(s.type) && data.logs[s.id] && data.logs[s.id].rpe).map(s => +data.logs[s.id].rpe);
    const rpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    const keyMissed = sess.filter(s => ['l', 'q', 't'].includes(s.type) && !done(s.id)).length;
    const ended = plan.dateOf(w, 6) < today;
    weekInfo[w] = { planned, actual, factor: f, rpe, keyMissed, ended, extras: wkExtras };

    if (!adaptOn || !ended || w >= 25) continue;
    const r = planned > 0 ? actual / planned : 1;
    const pct = v => `${Math.round(v * 100)} %`;
    const before = m;
    let text = null;
    if (planned > 0 && actual < 0.3 * planned) {
      const next = plan.weeks[w];
      const pk = plan.sessions.filter(s => s.week === w && isRun(s.type)).reduce((a, s) => a + s.km, 0);
      const nk = plan.sessions.filter(s => s.week === next.n && isRun(s.type)).reduce((a, s) => a + s.km, 0);
      if (nk > 0) oneOff[w + 1] = Math.min(1, pk / nk);
      m = Math.max(M_MIN, m * 0.95);
      text = `Setmana ${w} gairebé sense fer (${km1(actual)} de ${km1(planned)} km): la ${w + 1} repeteix el volum de la ${w}.`;
    } else if (r < 0.7) {
      m = Math.max(M_MIN, m * 0.9);
      text = `Setmana ${w} al ${pct(r)} del volum: les properes setmanes baixen.`;
    } else if (r < 0.9 || keyMissed >= 2) {
      m = Math.max(M_MIN, m * 0.95);
      text = keyMissed >= 2 ? `Setmana ${w}: ${keyMissed} sessions clau sense fer. Abaixem una mica.` : `Setmana ${w} al ${pct(r)} del volum: abaixem una mica.`;
    } else if (rpe != null && rpe >= 8) {
      oneOff[w + 1] = 0.9;
      text = `Setmana ${w} amb esforç mitjà ${rpe.toFixed(1)}/10: la ${w + 1} es descarrega un 10 % per fatiga.`;
    } else if (r > 1.15) {
      m = Math.min(M_MAX, m * 1.05);
      text = `Setmana ${w} al ${pct(r)} del volum amb bones sensacions: pugem amb prudència.`;
    } else if (rpe != null && rpe <= 4 && keyMissed === 0) {
      m = Math.min(M_MAX, m * 1.03);
      text = `Setmana ${w} completa i fàcil (esforç ${rpe.toFixed(1)}/10): pugem una mica.`;
    } else if (m < 1 && r >= 0.95) {
      m = Math.min(1, m * 1.05);
      text = `Setmana ${w} complerta: recuperem volum cap al pla original.`;
    }
    if (text) history.push({ week: w + 1, kind: m > before ? 'up' : m < before || oneOff[w + 1] ? 'down' : 'info', text: text + ` (volum ${pct(m)} del pla)` });
  }
  if (adaptOn && m >= M_MAX - 0.001) history.push({ week: curWeek, kind: 'info', text: 'Vas sobrat: si encara no l\'has fet, fes el pròxim test per ajustar els ritmes.' });

  // ---- Notes de sessions recol·locades / perdudes ----
  for (const [id, a] of Object.entries(auto)) {
    const n = (adj[id] ||= { notes: [] }).notes;
    if (a.moved) n.push(`Recol·locada automàticament (no feta el ${dayName(fromIso(a.from))}).`);
    if (a.lost) n.push('No feta. Es perd: segueix amb el pla.');
    if (a.dropped) n.push(`Substituïda per la tirada llarga recol·locada.`);
  }

  return {
    todayIso, curWeek, adaptOn, moves, auto, adj, match, extras, history, weekInfo,
    date: s => effDate(plan, s, moves, data.weeks),
    done, sessionKm,
    active: s => isActive(s, data.weeks) && !auto[s.id]?.dropped,
    title: s => adj[s.id]?.title || s.title,
    km: s => adj[s.id]?.km ?? s.km
  };
}

export function modelSessionsOn(plan, model, date) {
  const k = iso(date);
  return plan.sessions.filter(s => model.active(s) && iso(model.date(s)) === k);
}
