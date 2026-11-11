// Marató 2027 · aplicació principal.
import { CONFIG } from './config.js';
import * as store from './store.js';
import { buildPlan, iso, fromIso, addDays, catDate, DAY, DAYS, DAYS_L, TYPES, isRun, SLOT_ORDER, phaseOf, fdsOn, weekOfDate } from './shared/plan.js';
import { zones, fillPaces, fitness, fmt, fmtH } from './shared/pace.js';
import { computeModel, modelSessionsOn, isRunAct } from './shared/adapt.js';
import { buildFitxa } from './sessio.js';

// ---------- Estat ----------
let data = store.cached();
let auth = { user: null, owner: false };
let plan, model, Z;
let viewWeek = null;
let installEvt = null;
let addOpen = null;   // data (iso) amb el formulari d'activitat obert
const $ = s => document.querySelector(s);
const view = $('#view');

const todayIso = () => iso(new Date());
const today0 = () => fromIso(todayIso());
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const km1 = x => String(+(+x).toFixed(1)).replace('.', ',');
const fill = t => fillPaces(t, Z, v => `<b class="mono">${v}</b>`);
const dm = d => `${d.getDate()}/${d.getMonth() + 1}`;
const dShort = d => d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
const canWrite = () => auth.owner;
const actKm = a => (+a.distance || 0) / 1000;
const actDate = a => String(a.start_date_local || '').slice(0, 10);
// Temps en dues caselles: minuts + segons. Els km accepten coma o punt.
const numIn = v => { if (v === null || v === undefined) return null; const t = String(v).trim().replace(/\s/g, '').replace(',', '.'); return t === '' || isNaN(+t) ? null : +t; };
const timeFields = (secs, req = false) => {
  const m = secs ? Math.floor(Math.round(secs) / 60) : '', sx = secs ? Math.round(secs) % 60 : '';
  return `<div class="f timef"><span>Temps</span><div class="timebox">
    <label><input name="tmin" inputmode="numeric" pattern="[0-9]*" value="${m}" placeholder="0" aria-label="Minuts" ${req ? 'required' : ''}><span>min</span></label>
    <label><input name="tsec" inputmode="numeric" pattern="[0-9]*" value="${sx === '' ? '' : String(sx).padStart(2, '0')}" placeholder="00" aria-label="Segons" maxlength="2"><span>seg</span></label>
  </div></div>`;
};
const readTime = fd => { const m = numIn(fd.get('tmin')) || 0, sx = numIn(fd.get('tsec')) || 0; if (sx >= 60 || m < 0 || sx < 0) return NaN; const t = Math.round(m * 60 + sx); return t || null; };
const kmField = (v, ph = '') => `<label class="f">Km<input name="km" inputmode="decimal" autocomplete="off" value="${v == null || v === '' ? '' : String(v).replace('.', ',')}" placeholder="${ph}"></label>`;

function recompute() {
  plan = buildPlan(data.settings.race_date || undefined);
  model = computeModel(plan, data, todayIso());
  Z = zones(data.tests, data.settings.goal_pace || 300);
  if (viewWeek == null) viewWeek = model.curWeek;
  viewWeek = Math.min(25, Math.max(1, viewWeek));
}

// ---------- UI comuna ----------
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function setSync(st, title) { const e = $('#sync'); e.className = 'sync ' + st; e.title = title || ''; }

async function act(fn, okMsg) {
  if (!canWrite()) return;
  setSync('busy', 'Desant…');
  try {
    await fn();
    recompute(); render();
    setSync('ok', 'Sincronitzat');
    if (okMsg) toast(okMsg);
  } catch (e) {
    console.error(e);
    setSync('err', 'Error');
    toast('No s\'ha pogut desar: ' + (e.message || e));
    await refresh();
  }
}

async function refresh() {
  try {
    setSync('busy', 'Carregant…');
    data = await store.loadAll();
    setSync('ok', store.demo ? 'Mode demo' : 'Sincronitzat');
  } catch (e) {
    console.error(e);
    setSync('err', 'Sense connexió: mostrant l\'última còpia');
  }
  recompute(); render();
}

// ---------- Sessions ----------
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>';

function dateLabel(d) {
  const t = today0(); const diff = Math.round((d - t) / DAY);
  const rel = diff === 0 ? 'Avui' : diff === 1 ? 'Demà' : diff === -1 ? 'Ahir' : null;
  return `${rel ? rel + ' · ' : ''}${DAYS_L[(d.getDay() + 6) % 7]} ${dm(d)}`;
}

function actBlock(a, s) {
  if (!isRunAct(a)) return `<div class="actbox"><div class="actbox-h"><span><b>Registre</b> · ${esc(a.name || actKind(a).n)}</span><span class="muted mono">${a.moving_time ? fmtH(a.moving_time) : ''}</span></div>${canWrite() ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar</button></div>` : ''}</div>`;
  const k = actKm(a); const pace = a.moving_time && k ? a.moving_time / k : null;
  const hr = a.avg_hr ? `${Math.round(a.avg_hr)}${a.max_hr ? `<small class="muted">/${Math.round(a.max_hr)}</small>` : ''}` : '—';
  const opts = canWrite() ? assignSelect(a, s ? s.week : weekOfDate(plan, fromIso(actDate(a)))) : '';
  return `<div class="actbox" data-act="${a.id}">
    <div class="actbox-h"><span><b>Activitat</b> · ${esc(a.name || 'Cursa')}</span><span class="muted mono">${dShort(fromIso(actDate(a)))} ${String(a.start_date_local || '').slice(11, 16)}</span></div>
    <div class="metrics">
      <div><b>${km1(k)}</b><span>km</span></div>
      <div><b>${a.moving_time ? fmtH(a.moving_time) : '—'}</b><span>temps</span></div>
      <div><b>${pace ? fmt(pace) : '—'}</b><span>min/km</span></div>
      <div><b>${hr}</b><span>FC mitj/màx</span></div>
    </div>
    ${(a.polyline || (a.splits && a.splits.length)) ? `<details class="more actx" data-id="${a.id}"><summary>Mapa i parcials</summary>
      ${a.polyline ? `<div class="map" id="map-${a.id}"></div>` : ''}
      ${a.splits && a.splits.length ? splitsTable(a.splits) : ''}
    </details>` : ''}
    ${opts}
    ${canWrite() ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar activitat</button></div>` : ''}
  </div>`;
}

function splitsTable(splits) {
  const paces = splits.map(x => x.d > 50 ? x.t / (x.d / 1000) : null).filter(Boolean);
  const min = Math.min(...paces), max = Math.max(...paces);
  return `<table class="splits"><thead><tr><th>Km</th><th>Ritme</th><th></th><th>FC</th><th>Desn.</th></tr></thead><tbody>${splits.map(x => {
    const p = x.d > 50 ? x.t / (x.d / 1000) : null;
    const w = p && max > min ? 20 + 60 * (max - p) / (max - min) : 50;
    return `<tr><td>${x.km}${x.d < 950 ? ` <span class="muted">(${Math.round(x.d)} m)</span>` : ''}</td><td>${p ? fmt(p) : '—'}</td><td style="width:40%"><span class="pbar" style="width:${w}%"></span></td><td>${x.hr ? Math.round(x.hr) : '—'}</td><td>${x.el != null ? Math.round(x.el) : '—'}</td></tr>`;
  }).join('')}</tbody></table>`;
}

function assignSelect(a, week) {
  const runs = plan.sessions.filter(s => isRun(s.type) && model.active(s) && Math.abs(s.week - week) <= 1)
    .sort((x, y) => model.date(x) - model.date(y));
  const cur = a.session_id || '';
  return `<label class="f">Assignar a
    <select data-assign="${a.id}">
      <option value="" ${!cur ? 'selected' : ''}>Automàtic (per data)</option>
      <option value="none" ${cur === 'none' ? 'selected' : ''}>Dia extra (fora del pla)</option>
      ${runs.map(s => `<option value="${s.id}" ${cur === s.id ? 'selected' : ''}>S${s.week} · ${DAYS[(model.date(s).getDay() + 6) % 7]} ${dm(model.date(s))} · ${esc(model.title(s))}</option>`).join('')}
      <option value="__ignore">Ignorar aquesta activitat</option>
    </select></label>`;
}

// ---------- Fitxa de la sessió ----------
function fitxaHtml(s, compact = false) {
  const f = buildFitxa(s, model.km(s), model.title(s), data.tests, data.settings.goal_pace || 300);
  const kp = f.kpis.length ? `<div class="kpis">${f.kpis.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : '';
  const st = f.blocks.length ? `<ol class="struct">${f.blocks.map(b => `<li class="${b.main ? 'is-main' : ''}" style="--zc:var(--t-${b.zone ? b.zone.c : 'o'})">
      <span class="ph">${b.ph}</span><span class="bt">${fill(esc(b.txt).replace(/\{(SU|UM|IN|RMO)\}/g, m => m))}</span>
      ${b.zone ? `<span class="bz"><b>${b.zone.z}</b>${b.pace ? ` · ${b.pace}` : ''}</span>` : ''}</li>`).join('')}</ol>` : '';
  if (compact) return `<div class="fitxa compact">${kp}${st || `<div class="detail">${fill(s.detail)}</div>`}</div>`;
  return `<div class="fitxa">
    ${kp}
    ${f.objective ? `<p class="obj"><span>Objectiu</span>${esc(f.objective)}</p>` : ''}
    ${st ? `<div class="sec"><span class="eyebrow">Estructura</span>${st}</div>` : `<div class="sec"><span class="eyebrow">${s.type === 'g' ? 'Exercicis' : 'Sessió'}</span><div class="detail">${fill(s.detail)}</div></div>`}
    ${f.tips.length ? `<div class="sec"><span class="eyebrow">Consells</span><ul class="tips">${f.tips.map(t => `<li>${fill(esc(t))}</li>`).join('')}</ul></div>` : ''}
  </div>`;
}

function sessCard(s) {
  const d = model.date(s); const t = TYPES[s.type]; const run = isRun(s.type);
  const log = data.logs[s.id] || {}; const acts = model.match[s.id] || [];
  const done = model.done(s.id); const auto = model.auto[s.id] || {}; const adj = model.adj[s.id];
  const skipped = !!log.skipped; const skipShown = skipped && !auto.moved;   // recol·locada: ja no es mostra com a no feta
  const isToday = iso(d) === todayIso();
  const kmNow = model.km(s); const kmChanged = run && kmNow !== s.km;
  const manualMove = data.moves[s.id];
  const byAct = acts.length > 0;
  const notes = [...(adj?.notes || [])];
  if (manualMove) notes.push(`Moguda per tu (era el ${DAYS_L[s.d]} ${dm(s.baseDate)}).`);
  const logBits = [log.km != null && log.km !== '' ? `${km1(log.km)} km` : '', log.min ? fmtH(log.min * 60) : '', log.rpe ? `esforç ${log.rpe}/10` : ''].filter(Boolean).join(' · ');
  const dayOpts = []; for (let i = 0; i < 7; i++) { const x = plan.dateOf(s.week, i); dayOpts.push(`<button type="button" data-mv="${s.id}" data-date="${iso(x)}" aria-pressed="${iso(x) === iso(d)}">${DAYS[i]} ${x.getDate()}</button>`); }
  return `<article class="sess t-${s.type} ${isToday ? 'today' : ''} ${done ? 'is-done' : ''} ${skipShown ? 'is-skipped' : ''} ${auto.lost || auto.dropped ? 'lost' : ''}" id="s-${s.id}">
    <div class="sess-h">
      <div>
        <div class="sess-meta"><span class="tchip">${t.n}</span><span>${dateLabel(d)}</span>${auto.moved ? '<span class="chip warn">recol·locada</span>' : ''}${skipShown ? '<span class="chip bad">✕ no feta</span>' : auto.lost ? '<span class="chip">perduda</span>' : ''}${adj?.soft ? '<span class="chip warn">suavitzada</span>' : ''}</div>
        <div class="sess-title"><h3>${esc(model.title(s))}</h3>${run && s.km ? `<span class="mono small">${kmChanged ? `<s>${km1(s.km)}</s> ` : ''}${km1(kmNow)} km</span>` : ''}</div>
      </div>
      <div class="marks">
        <button type="button" class="xmark ${canWrite() ? '' : 'ro'}" data-skip="${s.id}" aria-pressed="${skipped}" ${!canWrite() ? 'disabled' : ''}
          aria-label="${skipped ? 'Marcada com a no feta' : 'Marcar com a no feta'}" title="${skipped ? 'No feta (toca per desfer)' : 'No l\'he fet'}">${ICON_X}</button>
        <button type="button" class="check ${canWrite() ? '' : 'ro'}" data-done="${s.id}" aria-pressed="${done}" ${!canWrite() || (byAct && !skipped) ? 'disabled' : ''}
          aria-label="${done ? 'Feta' : 'Marcar com a feta'}" title="${byAct ? 'Registrada' : done ? 'Feta' : 'Marcar com a feta'}">${ICON_CHECK}</button>
      </div>
    </div>
    <div class="sess-b">
      ${fitxaHtml(s)}
      ${notes.length ? `<div class="adj">${notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
      ${acts.map(a => actBlock(a, s)).join('')}
      ${(logBits || log.note) && !canWrite() ? `<p class="small muted">${esc(logBits)}${log.note ? ` · «${esc(log.note)}»` : ''}</p>` : ''}
      ${canWrite() ? `<div class="menus">
      <details class="more menu"><summary>${logBits || log.note ? `📝 Registre: ${esc(logBits || 'nota')}` : '📝 Registrar'}</summary>
        <form class="subsec logform" data-id="${s.id}">
          <div class="formgrid">
            ${run ? kmField(log.km, byAct ? km1(model.sessionKm(s)) : km1(kmNow)) : ''}
            ${timeFields(log.min ? log.min * 60 : null)}
            <label class="f">Esforç 1–10<select name="rpe"><option value=""></option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option ${log.rpe === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="f wide">Nota<input name="note" maxlength="500" value="${esc(log.note || '')}" placeholder="Sensacions, espatlla…"></label>
          </div>
          <p class="small muted">Km amb coma o punt (6,5 o 6.5). L'esforç ajuda el pla a adaptar-se: 8 o més vol dir fatiga; 4 o menys, que vas sobrat.</p>
          <div class="row"><button class="btn primary sm" type="submit">Desar</button>${data.logs[s.id] ? `<button class="btn sm ghost" type="button" data-clear="${s.id}">Esborrar registre</button>` : ''}</div>
        </form>
      </details>
      <details class="more menu"><summary>${manualMove ? '📅 Moguda · canviar' : '📅 Moure'}</summary>
        <div class="subsec">
          <span class="eyebrow">Moure a un altre dia</span>
          <div class="daybtns">${dayOpts.join('')}</div>
          <div class="row"><input type="date" id="mvd-${s.id}" min="${iso(plan.start)}" max="${iso(plan.race)}" value="${iso(d)}" style="max-width:180px"><button class="btn sm" type="button" data-mvpick="${s.id}">Moure</button>${manualMove ? `<button class="btn sm ghost" type="button" data-mv="${s.id}" data-date="">Tornar al seu dia</button>` : ''}</div>
        </div>
      </details>
      </div>` : ''}
    </div>
  </article>`;
}

const actKind = a => {
  const t = String(a.sport_type || 'Run');
  if (/run/i.test(t)) return { n: 'Cursa', t: 'e' };
  if (/p[aà]del|tenn|racq|squash|pickle|badminton/i.test(t)) return { n: 'Pàdel', t: 'p' };
  if (/weight|strength|crossfit|hiit|workout|training|yoga|pilates/i.test(t) && !/^workout$/i.test(t)) return { n: 'Gimnàs', t: 'g' };
  if (/ride|bike|cycl/i.test(t)) return { n: 'Bici', t: 'l' };
  return { n: 'Activitat', t: 'o' };
};
function extraCard(a) {
  const d = fromIso(actDate(a)); const k = actKind(a); const km = actKm(a);
  const bits = [km ? `${km1(km)} km` : '', a.moving_time ? fmtH(a.moving_time) : '', a.rpe ? `esforç ${a.rpe}/10` : ''].filter(Boolean).join(' · ');
  return `<article class="sess t-${k.t} extra is-done">
    <div class="sess-h"><div><div class="sess-meta"><span class="tchip">Extra · ${k.n}</span><span>${dateLabel(d)}</span></div>
    <div class="sess-title"><h3>${esc(a.name || (isRunAct(a) ? 'Cursa fora del pla' : k.n))}</h3>${bits ? `<span class="mono small">${bits}</span>` : ''}</div></div>
    <span class="check" aria-hidden="true" style="--tc:var(--t-${k.t});background:var(--tc);border-color:var(--tc);color:#fff">${ICON_CHECK}</span></div>
    <div class="sess-b">${a.note ? `<p class="small">«${esc(a.note)}»</p>` : ''}
      <p class="small muted">${isRunAct(a) ? 'Compta als km de la setmana i el pla s\'adapta si cal.' : 'Queda registrada, però no suma km de cursa.'}</p>
      ${isRunAct(a) && canWrite() ? assignSelect(a, weekOfDate(plan, d)) : ''}${canWrite() ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar activitat</button></div>` : ''}
    </div></article>`;
}

// ---------- Afegir activitat a qualsevol dia ----------
const ADD_TYPES = [['Run', 'Córrer'], ['Padel', 'Pàdel'], ['WeightTraining', 'Gimnàs'], ['Ride', 'Bici'], ['Workout', 'Altres']];
function addBlock(date) {
  if (!canWrite()) return '';
  if (addOpen !== date) return `<button type="button" class="addbtn" data-add="${date}">+ Afegir activitat</button>`;
  return `<form class="card addform" id="addForm" data-date="${date}">
    <div class="row between"><span class="eyebrow">Nova activitat · ${dateLabel(fromIso(date))}</span></div>
    <div class="formgrid">
      <label class="f">Tipus<select name="type">${ADD_TYPES.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
      <label class="f wide">Nom<input name="name" maxlength="80" placeholder="Rodatge amb amics, partit…"></label>
      ${kmField('')}
      ${timeFields(null)}
      <label class="f">Esforç 1–10<select name="rpe"><option value=""></option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option>${v}</option>`).join('')}</select></label>
      <label class="f wide">Nota<input name="note" maxlength="500" placeholder="Sensacions, espatlla…"></label>
    </div>
    <div class="row"><button class="btn primary sm" type="submit">Afegir</button><button class="btn sm ghost" type="button" data-addcancel="1">Cancel·lar</button></div>
  </form>`;
}

// ---------- Vista: Avui ----------
function trackSvg() {
  const cw = model.curWeek; const t = today0();
  const frac = w => { const ss = plan.sessions.filter(x => x.week === w && model.active(x)); return ss.length ? ss.filter(x => model.done(x.id)).length / ss.length : 0; };
  const pct = Math.round(Math.min(1, Math.max(0, (t - plan.start) / (plan.race - plan.start))) * 100);
  const all = plan.sessions.filter(x => model.active(x) && model.date(x) < t);
  const comp = all.length ? Math.round(all.filter(x => model.done(x.id)).length / all.length * 100) : 0;
  const ph = phaseOf(cw);
  const cells = p => { let h = ''; for (let w = p.w[0]; w <= p.w[1]; w++) { const f = frac(w); h += `<i class="c ${w < cw ? 'past' : w === cw ? 'cur' : ''}" style="--f:${f.toFixed(2)}" title="Setmana ${w}: ${Math.round(f * 100)} % fet"></i>`; } return h; };
  return `<div class="prog" role="img" aria-label="Setmana ${cw} de 25, fase ${esc(ph.n)}, ${pct} % del camí">
    <div class="prog-top"><span><b>Setmana ${cw}</b><span class="dim"> / 25 · ${esc(ph.n)}</span></span><span><b>${pct} %</b><span class="dim"> del camí · ${comp} % compliment</span></span></div>
    <div class="prog-bar">
      ${plan.phases.map(p => `<div class="pg ${cw >= p.w[0] && cw <= p.w[1] ? 'on' : ''} ${cw > p.w[1] ? 'done' : ''}" style="flex:${p.w[1] - p.w[0] + 1}">
        <div class="cells">${cells(p)}</div>
        <div class="pg-l"><b>${esc(p.n)}</b><small>S${p.w[0]}–${p.w[1]}</small></div></div>`).join('')}
      <div class="goal" title="Girona · ${catDate(plan.race)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h1.5v1H19l-2.5 4.5L19 14H6.5v7z" fill="currentColor"/></svg></div>
    </div>
  </div>`;
}

function statsHtml() {
  const act = plan.sessions.filter(model.active);
  const past = act.filter(s => model.date(s) < today0());
  const doneN = act.filter(s => model.done(s.id)).length;
  const kmDone = Object.values(model.weekInfo).reduce((a, w) => a + w.actual, 0);
  const kmPlan = Object.values(model.weekInfo).reduce((a, w) => a + w.planned, 0);
  const f = fitness(data.tests);
  return `<div class="stats">
    <div class="stat"><span class="eyebrow">Sessions</span><span class="v num">${doneN}<small>/${act.length}</small></span><span class="s">Compliment ${past.length ? Math.round(past.filter(s => model.done(s.id)).length / past.length * 100) : 0} %</span></div>
    <div class="stat"><span class="eyebrow">Km</span><span class="v num">${Math.round(kmDone)}<small>/${Math.round(kmPlan)}</small></span><span class="s">del pla adaptat</span></div>
    <div class="stat"><span class="eyebrow">Setmana</span><span class="v num">${model.curWeek}<small>/25</small></span><span class="s">${phaseOf(model.curWeek).n}</span></div>
    <div class="stat"><span class="eyebrow">Projecció cursa</span><span class="v num">${f ? hm(projection(f).mid) : '—'}</span><span class="s">${f ? `rang ${hm(projection(f).fast)}–${hm(projection(f).slow)} · objectiu ${hm(data.settings.goal_pace * 42.195)}` : 'afegeix un test'}</span></div>
  </div>`;
}

function renderAvui() {
  const t = today0(); const daysLeft = Math.max(0, Math.round((plan.race - t) / DAY));
  const todayS = modelSessionsOn(plan, model, t).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const tomorrow = modelSessionsOn(plan, model, addDays(t, 1));
  let next = null;
  if (!todayS.length) for (let i = 1; i < 30 && !next; i++) { const ss = modelSessionsOn(plan, model, addDays(t, i)); if (ss.length) next = { d: addDays(t, i), ss }; }
  const ph = phaseOf(model.curWeek); const W = plan.weeks[model.curWeek - 1];
  const extrasToday = model.extras.filter(a => actDate(a) === todayIso());
  const recent = [...model.history].filter(h => h.week >= model.curWeek - 1).slice(-3);
  const before = t < plan.start;
  view.innerHTML = `<div class="lay-avui">
    <section class="hero">
      <div class="hero-top">
        <div class="countdown"><b class="num">${daysLeft}</b><span>dies per a Girona<br><span class="mono small">${catDate(plan.race)} ${plan.race.getFullYear()}</span></span></div>
        <div class="row"><span class="chip">${before ? 'Comença el ' + catDate(plan.start) : `S${model.curWeek} · ${ph.n}`}</span>${model.adaptOn ? '<span class="chip">↻ adaptatiu</span>' : ''}</div>
      </div>
      ${trackSvg()}
    </section>
    <div class="a-main">
    <div class="row between"><h2>Avui</h2><span class="muted small">${DAYS_L[(t.getDay() + 6) % 7]} ${catDate(t)}</span></div>
    ${todayS.length ? todayS.map(sessCard).join('') : `<div class="rest"><b>Descans</b><span>${next ? `Següent: ${next.ss.map(s => esc(model.title(s))).join(' + ')} · ${dateLabel(next.d)}` : 'Gaudeix-ne.'}</span></div>`}
    ${extrasToday.map(extraCard).join('')}
    ${addBlock(todayIso())}
    </div>
    <div class="a-side">
    ${todayS.length && tomorrow.length ? `<div class="card tight"><span class="eyebrow">Demà</span>${tomorrow.map(s => `<div class="row"><span class="dot t-${s.type}"></span><b>${esc(model.title(s))}</b><span class="muted small">${TYPES[s.type].n}${isRun(s.type) && model.km(s) ? ' · ' + km1(model.km(s)) + ' km' : ''}</span></div>`).join('')}</div>` : ''}
    ${fdsBox(W)}
    ${statsHtml()}
    ${recent.length ? `<div class="card"><div class="row between"><span class="eyebrow">Últims ajustos del pla</span><a class="small" href="#progres">Tots</a></div><div class="hist">${recent.map(histRow).join('')}</div></div>` : ''}
    </div></div>`;
}

function fdsBox(W) {
  if (!W || W.noFds || W.n < 3) return '';
  const on = fdsOn(data.weeks, W.n);
  return `<div class="card tight"><div class="row between"><span>Partit de pàdel dissabte (S${W.n})?</span>
    <div class="seg" role="group" aria-label="Partit dissabte"><button type="button" data-fds="${W.n}" data-v="0" aria-pressed="${!on}" ${canWrite() ? '' : 'disabled'}>No</button><button type="button" data-fds="${W.n}" data-v="1" aria-pressed="${on}" ${canWrite() ? '' : 'disabled'}>Sí</button></div></div>
    <span class="small muted">${on ? 'La tirada llarga passa a diumenge.' : 'Tirada llarga dissabte.'}</span></div>`;
}
const histRow = h => `<div><span class="k">S${h.week}</span><span class="${h.kind === 'up' ? 'up' : h.kind === 'down' || h.kind === 'lost' || h.kind === 'soft' ? 'down' : ''}">${esc(h.text)}</span></div>`;

// ---------- Vista: Setmana ----------
function renderSetmana() {
  const W = plan.weeks[viewWeek - 1]; const ph = phaseOf(W.n); const info = model.weekInfo[W.n];
  const s0 = plan.dateOf(W.n, 0), s6 = plan.dateOf(W.n, 6);
  let days = '';
  for (let i = 0; i < 7; i++) {
    const d = plan.dateOf(W.n, i);
    const ss = modelSessionsOn(plan, model, d).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    const lostHere = plan.sessions.filter(s => s.week === W.n && (model.auto[s.id]?.lost || model.auto[s.id]?.dropped) && iso(model.date(s)) === iso(d));
    const ex = model.extras.filter(a => actDate(a) === iso(d));
    const isT = iso(d) === todayIso();
    days += `<div class="day ${isT ? 'is-today' : ''}"><div class="dayhead ${isT ? 'today' : ''}"><b>${DAYS_L[i]}</b><span class="muted small mono">${dm(d)}${isT ? ' · avui' : ''}</span></div>`;
    const all = [...ss, ...lostHere.filter(x => !ss.includes(x))];
    days += all.length || ex.length ? all.map(sessCard).join('') + ex.map(extraCard).join('') : (addOpen === iso(d) ? '' : `<div class="rest"><span>Descans</span></div>`);
    days += addBlock(iso(d)) + '</div>';
  }
  const hist = model.history.filter(h => h.week === W.n);
  const pct = info.planned ? Math.min(100, info.actual / info.planned * 100) : 0;
  view.innerHTML = `
    <div class="weekhead">
      <div><span class="chip green">Fase ${ph.id} · ${ph.n}</span><h1 style="margin-top:6px">Setmana ${W.n}</h1><span class="muted mono small">${dShort(s0)} – ${dShort(s6)}</span></div>
      <div class="weeknav"><button class="btn sm" data-wk="-1" ${W.n <= 1 ? 'disabled' : ''} aria-label="Setmana anterior">←</button><button class="btn sm" data-wk="0">Avui</button><button class="btn sm" data-wk="1" ${W.n >= 25 ? 'disabled' : ''} aria-label="Setmana següent">→</button></div>
    </div>
    <div class="lay-week"><aside class="w-side">
    <div class="card tight">
      <div class="row between"><span class="eyebrow">Km de la setmana</span><span class="mono small"><b>${km1(info.actual)}</b> / ${km1(info.planned)} km${Math.abs(info.factor - 1) > 0.001 ? ` · <span class="chip warn">volum ${Math.round(info.factor * 100)} %</span>` : ''}</span></div>
      <div class="kmbar"><i style="width:${pct}%"></i></div>
    </div>
    ${W.note ? `<div class="note">${esc(W.note)}</div>` : ''}
    ${hist.length ? `<div class="card tight"><span class="eyebrow">Ajustos automàtics</span><div class="hist">${hist.map(histRow).join('')}</div></div>` : ''}
    ${fdsBox(W)}
    <p class="small muted">Si et saltes (o marques amb ✕) una tirada llarga o una sessió de qualitat, el pla la recol·loca sola dins la setmana. Els rodatges suaus no es recuperen.</p>
    </aside>
    <div class="days">${days}</div></div>`;
}

// ---------- Vista: Pla (per mesos) ----------
const monthName = d => { const m = d.toLocaleDateString('ca-ES', { month: 'long' }); return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear(); };
function weekRow(w) {
  const ss = plan.sessions.filter(s => s.week === w.n && model.active(s)).sort((a, b) => model.date(a) - model.date(b) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const f = ss.length ? ss.filter(s => model.done(s.id)).length / ss.length : 0;
  const info = model.weekInfo[w.n]; const long = ss.find(s => s.type === 'l' || s.type === 'r');
  const cur = w.n === model.curWeek; const ph = phaseOf(w.n);
  const mark = s => model.done(s.id) ? '<span class="ok">✓</span>' : (data.logs[s.id]?.skipped || model.auto[s.id]?.lost) ? '<span class="ko">✕</span>' : '<span class="muted">·</span>';
  return `<details class="wk ${cur ? 'cur' : ''}" ${cur ? 'open' : ''}><summary><b class="mono">S${w.n}</b>
    <span><span class="small"><b>${dShort(plan.dateOf(w.n, 0))}</b> · ${ph.n}</span><br><span class="muted small">${km1(info.planned)} km${long ? ` · ${long.type === 'r' ? 'cursa' : 'llarga'} ${km1(model.km(long))}` : ''}${Math.abs(info.factor - 1) > 0.001 ? ' · ↻ ajustada' : ''}${cur ? ' · <b class="cur-tag">aquesta setmana</b>' : ''}</span></span>
    <span class="kmbar" title="${Math.round(f * 100)} % fet"><i style="width:${f * 100}%"></i></span></summary>
    <div class="wkbody">${w.note ? `<p class="small muted">${esc(w.note)}</p>` : ''}
    ${ss.map(s => `<details class="wkd"><summary class="wkline"><b class="mono small">${DAYS[(model.date(s).getDay() + 6) % 7]}</b><span class="dot t-${s.type}"></span><span>${esc(model.title(s))}${isRun(s.type) && s.km ? ` <span class="muted small">${km1(model.km(s))} km</span>` : ''}</span><span class="mono">${mark(s)}</span></summary>${fitxaHtml(s, true)}</details>`).join('')}
    <button class="btn sm" style="align-self:flex-start;margin-top:6px" data-go="${w.n}">Obrir setmana</button></div></details>`;
}
function renderPla() {
  const months = [];
  for (const w of plan.weeks) {
    const key = plan.dateOf(w.n, 3); // el dijous decideix el mes de la setmana
    const k = `${key.getFullYear()}-${key.getMonth()}`;
    let m = months.find(x => x.k === k); if (!m) months.push(m = { k, d: key, weeks: [] });
    m.weeks.push(w);
  }
  view.innerHTML = `<div class="row between"><h1>Pla complet</h1><span class="muted small">25 setmanes · ${catDate(plan.start)} → ${catDate(plan.race)}</span></div>
    <div class="phasebar">${plan.phases.map(p => `<span class="ph ${model.curWeek >= p.w[0] && model.curWeek <= p.w[1] ? 'on' : ''}" title="${esc(p.txt)}"><b>${p.n}</b><small>S${p.w[0]}–${p.w[1]}</small></span>`).join('')}</div>
    <div class="months">${months.map(m => {
      const ss = plan.sessions.filter(s => m.weeks.some(w => w.n === s.week) && model.active(s));
      const doneN = ss.filter(s => model.done(s.id)).length;
      const km = m.weeks.reduce((a, w) => a + model.weekInfo[w.n].planned, 0);
      return `<section class="month"><div class="month-h"><h2>${monthName(m.d)}</h2><span class="muted small mono">S${m.weeks[0].n}–${m.weeks[m.weeks.length - 1].n} · ${Math.round(km)} km · ${doneN}/${ss.length} fetes</span></div>
        ${m.weeks.map(weekRow).join('')}</section>`;
    }).join('')}</div>`;
}

// ---------- Vista: Progrés ----------
function chartSvg() {
  const Wd = 900, H = 240, L = 40, R = 12, T = 14, B = 30;
  const wi = n => model.weekInfo[n];
  const orig = n => plan.sessions.filter(s => s.week === n && isRun(s.type)).reduce((a, s) => a + s.km, 0);
  const max = Math.ceil(Math.max(10, ...plan.weeks.map(w => Math.max(wi(w.n).planned, wi(w.n).actual, orig(w.n)))) / 10) * 10;
  const bw = (Wd - L - R) / 25; const Y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="Quilòmetres per setmana">`;
  for (let v = 0; v <= max; v += 10) s += `<line x1="${L}" x2="${Wd - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" font-family="var(--f-mono)" font-size="11" fill="var(--muted)">${v}</text>`;
  plan.weeks.forEach((w, i) => {
    const a = wi(w.n).actual; const x = L + i * bw;
    if (a > 0) s += `<rect x="${x + bw * .18}" y="${Y(a)}" width="${bw * .64}" height="${Y(0) - Y(a)}" fill="var(--primary)" rx="3"><title>S${w.n}: ${km1(a)} km fets</title></rect>`;
    s += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-family="var(--f-mono)" font-size="10" fill="${w.n === model.curWeek ? 'var(--accent)' : 'var(--muted)'}" font-weight="${w.n === model.curWeek ? 700 : 400}">${w.n}</text>`;
  });
  const pts = f => plan.weeks.map((w, i) => `${L + i * bw + bw / 2},${Y(f(w.n))}`).join(' ');
  s += `<polyline fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 4" points="${pts(orig)}"/>`;
  s += `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="6 4" points="${pts(n => wi(n).planned)}"/>`;
  plan.weeks.forEach((w, i) => { s += `<circle cx="${L + i * bw + bw / 2}" cy="${Y(wi(w.n).planned)}" r="3" fill="var(--accent)"><title>S${w.n} pla adaptat: ${km1(wi(w.n).planned)} km</title></circle>`; });
  return s + '</svg>';
}

function renderProgres() {
  const acts = [...data.activities].filter(a => !a.ignored).sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local))).slice(0, 30);
  const where = a => { const id = Object.keys(model.match).find(k => model.match[k].some(x => x.id === a.id)); return id ? model.title(plan.byId[id]) : 'Dia extra'; };
  view.innerHTML = `
    <h1>Progrés</h1>
    ${statsHtml()}
    <div class="card"><span class="eyebrow">Km per setmana</span><div class="chartwrap">${chartSvg()}</div>
      <div class="row small muted"><span><span class="dot" style="--tc:var(--primary);border-radius:2px"></span> Fets</span><span style="color:var(--accent)">- - Pla adaptat</span><span>··· Pla original</span></div></div>
    <div class="grid2">
    <div class="card"><span class="eyebrow">Historial d'ajustos ${model.adaptOn ? '' : '(adaptació desactivada)'}</span>
      <div class="hist">${model.history.length ? [...model.history].sort((a, b) => b.week - a.week).map(histRow).join('') : '<p class="muted small">Encara cap ajust: el pla s\'adapta quan acaba cada setmana i quan et saltes o afegeixes sessions.</p>'}</div></div>
    <div class="card"><span class="eyebrow">Activitats registrades</span>
      <div class="list">${acts.length ? acts.map(a => `<div class="li"><span><b class="mono">${km1(actKm(a))} km</b> · ${esc(a.name || '')}<br><span class="muted small">${dShort(fromIso(actDate(a)))} · ${a.moving_time && actKm(a) ? fmt(a.moving_time / actKm(a)) + '/km' : ''} → ${esc(where(a))}</span></span>${canWrite() ? `<a class="btn sm ghost" href="#setmana/${weekOfDate(plan, fromIso(actDate(a)))}">Veure</a>` : '<span></span>'}</div>`).join('') : '<p class="muted small">Encara no hi ha activitats extra. Afegeix-ne amb "+ Afegir activitat" a qualsevol dia.</p>'}</div></div>
    </div>`;
}

// ---------- Predicció: equivalent d'avui i projecció al dia de la cursa ----------
// L'equivalent d'avui (Riegel) diu què faries avui en una marató amb la forma del test.
// La projecció suma la millora esperada si completes el pla: fins a un 0,4 % per setmana que queda (màx. 10 %),
// amb un rang conservador (la meitat) i un d'optimista. Com més a prop de la cursa sigui el test, més estret el rang.
const hm = x => { const m = Math.round(x / 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
function projection(f) {
  if (!f) return null;
  const wl = Math.max(0, (plan.race - fromIso(String(f.test.date).slice(0, 10))) / DAY / 7);
  const hi = Math.min(0.10, 0.004 * wl), lo = hi / 2;
  return { fast: f.pred * (1 - hi), slow: f.pred * (1 - lo), mid: f.pred * (1 - (hi + lo) / 2), weeks: Math.round(wl) };
}
function predPill(pr) {
  const goalT = data.settings.goal_pace * 42.195, maxT = 330 * 42.195;
  if (!pr) return '';
  return pr.slow <= goalT ? '<span class="chip green">En objectiu</span>'
    : pr.fast <= goalT ? '<span class="chip green">Objectiu assolible</span>'
    : pr.fast <= maxT ? '<span class="chip warn">Dins del teu màxim (5:30/km)</span>'
    : '<span class="chip orange">Encara més lent que 5:30/km</span>';
}

// ---------- Vista: Tests ----------
function renderTests() {
  const f = fitness(data.tests); const pr = projection(f);
  const planned = plan.sessions.filter(s => s.type === 't' || s.type === 'r').sort((a, b) => model.date(a) - model.date(b));
  const tests = [...data.tests].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  view.innerHTML = `
    <h1>Tests</h1>
    <div class="grid2">
      <div class="card"><span class="eyebrow">Afegir un test o una cursa</span>
        ${canWrite() ? `<form id="testForm" class="formgrid">
          <label class="f">Data<input type="date" name="date" required value="${todayIso()}"></label>
          <label class="f">Distància<select name="dist"><option value="5">5 km</option><option value="10">10 km</option><option value="21.0975">Mitja</option><option value="42.195">Marató</option></select></label>
          ${timeFields(null, true)}
          <label class="f wide">Nom<input name="label" placeholder="Test 5 km" maxlength="80"></label>
          <button class="btn primary wide" type="submit">Afegir test</button></form>
          <p class="small muted">Cada test recalcula els teus ritmes d'entrenament i la predicció.</p>` : '<p class="small muted">Inicia sessió per afegir tests.</p>'}
      </div>
      <div class="card"><span class="eyebrow">Predicció de marató</span>
        ${f ? `<div class="predbox">
          <span class="small muted">Projecció per al ${catDate(plan.race)} si completes el pla</span>
          <div class="pred"><b class="num">${hm(pr.fast)}–${hm(pr.slow)}</b>${predPill(pr)}</div>
          <span class="small mono">${fmt(pr.fast / 42.195)}–${fmt(pr.slow / 42.195)}/km</span>
        </div>
        <div class="eqbox"><span><b>Equivalent avui:</b> <b class="mono">${fmtH(f.pred)}</b> <span class="muted">(${fmt(f.pred / 42.195)}/km)</span></span>
          <span class="small muted">És el que faries si correguessis la marató avui, amb la forma del teu test de ${km1(f.test.dist)} km en ${fmtH(f.test.secs)} (${new Date(f.test.date).toLocaleDateString('ca-ES')}). La projecció hi afegeix la millora de les ${pr.weeks} setmanes d'entrenament que queden.${f.adj ? ' El test té més de 4 mesos: s\'hi sumen 12″/km de marge.' : ''}</span></div>`
        : '<p class="small muted">Registra un test (5 km, 10 km o mitja) per veure la predicció i ajustar els ritmes.</p>'}
        <p class="small">Objectiu ${fmt(data.settings.goal_pace)}/km → <b class="mono">${fmtH(data.settings.goal_pace * 42.195)}</b> · Màxim 5:30/km → <b class="mono">${fmtH(330 * 42.195)}</b></p>
        <div class="minipaces"><span>Els teus ritmes ara</span>
          <div><b>Suau</b><i class="mono">${Z.SU}</i></div><div><b>Llindar</b><i class="mono">${Z.UM}</i></div><div><b>Ritme 10K</b><i class="mono">${Z.IN}</i></div><div><b>Ritme marató</b><i class="mono">${Z.RMO}</i></div>
        </div>
      </div>
    </div>
    <div class="grid2">
      <div class="card"><span class="eyebrow">Els teus tests</span>
        <div class="list">${tests.map(t => `<div class="li"><span><b class="mono">${fmtH(t.secs)}</b> · ${esc(t.label || 'Test')} <span class="muted small">${km1(t.dist)} km · ${fmt(t.secs / t.dist)}/km · ${new Date(t.date).toLocaleDateString('ca-ES')}</span></span>${canWrite() ? `<button class="btn sm ghost" data-deltest="${t.id}">Esborrar</button>` : '<span></span>'}</div>`).join('') || '<p class="muted small">Encara no hi ha tests.</p>'}</div>
      </div>
      <div class="card"><span class="eyebrow">Tests i curses del pla</span>
        <p class="small muted">Fes-los quan toquen i apunta el temps aquí: així els ritmes s'ajusten a la teva forma real.</p>
        <div class="list">${planned.map(s => `<div class="li"><span><span class="dot t-${s.type}"></span> <b>${esc(model.title(s))}</b><br><span class="muted small">S${s.week} · ${dateLabel(model.date(s))}</span></span><span class="mono">${model.done(s.id) ? '<span class="ok">✓</span>' : '·'}</span></div>`).join('')}</div>
      </div>
    </div>
    <div class="card guide"><span class="eyebrow">Com funcionen els tests</span>
      <div class="guide-grid">
        <div><b>1 · Què és</b><p>Una prova al màxim que puguis sostenir (5 km, 10 km o una mitja). Mesura la teva forma d'avui.</p></div>
        <div><b>2 · Com fer-lo</b><p>Escalfa 10–15′ amb 3–4 rectes. Recorregut pla, ritme constant de principi a final, sense sortir massa ràpid. Apunta el temps net.</p></div>
        <div><b>3 · Què canvia</b><p>Recalcula els teus ritmes (suau, llindar, 10K) i la predicció. Totes les sessions mostren els ritmes nous a l'instant.</p></div>
        <div><b>4 · Com llegir la predicció</b><p><b>Equivalent avui</b>: el que faries ara mateix en una marató. <b>Projecció</b>: el rang esperat el dia de la cursa si completes el pla. Cada test nou l'afina.</p></div>
      </div>
      <p class="small muted">Un test de 5 km sol ser optimista per a la marató si encara no tens la resistència feta: per això el pla també té un test de 10 km (S12) i la Mitja de Barcelona (S15), que són més fiables.</p>
    </div>`;
}

// ---------- Vista: Ritmes ----------
function renderRitmes() {
  const f = fitness(data.tests);
  view.innerHTML = `
    <h1>Ritmes i guia</h1>
    <div class="card"><span class="eyebrow">Els teus ritmes</span>
      <p class="small muted">Es recalculen cada cop que afegeixes un test (pujar ritmes només amb tests: prudència). ${f && f.adj ? 'Ara inclouen marge per l\'aturada; el test de 5 km de la setmana 6 els ajustarà.' : ''} Les primeres 4 setmanes, oblida't del ritme: corre per sensacions.</p>
      <div style="overflow-x:auto"><table class="zones"><thead><tr><th>Zona</th><th>Ritme</th><th>Com es nota</th><th>On surt</th></tr></thead><tbody>
        <tr><td><b>Suau</b></td><td class="mono">${Z.SU}</td><td>Pots parlar amb frases senceres</td><td>Rodatges, tirades llargues</td></tr>
        <tr><td><b>Ritme marató</b></td><td class="mono">${Z.RMO}</td><td>Còmode-exigent, respiració controlada</td><td>Blocs a les llargues, sèries específiques</td></tr>
        <tr><td><b>Llindar</b></td><td class="mono">${Z.UM}</td><td>Frases curtes; aguantaries uns 50′</td><td>Llindar 3×8′ a 3×12′</td></tr>
        <tr><td><b>Ritme 10K</b></td><td class="mono">${Z.IN}</td><td>Dur, només paraules soltes</td><td>1600 m, 1 km</td></tr>
      </tbody></table></div></div>
    <div class="card"><span class="eyebrow">Com s'adapta el pla</span><ul class="tight">
      <li><b>Més volum amb poc esforç</b>: puja +5 % per setmana, com a màxim +10 % sobre el pla. La llarga mai passa de 32 km.</li>
      <li><b>Menys volum o sessions clau saltades</b>: baixa un 5–10 %. Una setmana gairebé perduda: la següent repeteix el volum de l'anterior.</li>
      <li><b>Esforç mitjà 8 o més</b>: la setmana següent es descarrega un 10 %.</li>
      <li><b>Tirada llarga, qualitat o test saltats</b>: es recol·loquen sols en un forat lliure de la setmana (mai el dia abans de la llarga). Els rodatges suaus es perden.</li>
      <li><b>Dia extra</b>: compta als km; si tens qualitat en 2 dies, se suavitza.</li>
      <li><b>Afinament (S23–25)</b>: mai s'hi afegeix volum.</li></ul>
      <p class="small muted">Pots desactivar l'adaptació a Ajustos. Els moviments que facis tu manen sobre els automàtics.</p></div>
    <div class="grid2">
      <div class="card"><span class="eyebrow">Punt de partida</span><ul class="tight">
        <li>Mitja Marató de Barcelona, 15/2/2026: <b class="mono">1:46:51</b> (5:04/km)</li>
        <li>Volum habitual: 2–3 sortides de 4–10 km per setmana; màxim fora de curses, 17 km</li>
        <li>Última cursa registrada: 5/6/2026 (6 km). Gairebé 5 mesos aturat.</li>
        <li>Experiència en trail: Miner de Ferro, La Cabrona, Oncotrail</li></ul>
        <p class="small muted">Amb aquest punt de partida, 5:30/km és molt assequible i 5:15 és realista. 5:00/km (3:31) demana que els tests de desembre i gener surtin clarament per sota de 22:30 en 5 km o 47:00 en 10 km.</p></div>
      <div class="card"><span class="eyebrow">Setmana tipus</span><ul class="tight">
        <li><b>Dilluns</b> · rodatge suau al migdia</li><li><b>Dimarts</b> · qualitat al migdia + gimnàs A (força)</li><li><b>Dimecres</b> · pàdel (des de la setmana 3)</li>
        <li><b>Dijous</b> · gimnàs B (core, potència, agilitat) + rodatge suau des de la setmana 7</li><li><b>Divendres</b> · descans</li><li><b>Dissabte</b> · tirada llarga</li><li><b>Diumenge</b> · descans, o tirada llarga si dissabte jugues</li></ul></div>
      <div class="card"><span class="eyebrow">Pàdel i espatlla</span><ul class="tight">
        <li>El pàdel compta com a sessió d'intensitat: no el posis el dia abans de la llarga.</li>
        <li>Si jugues dissabte, marca "Sí" a la setmana i la tirada passa a diumenge.</li>
        <li>Si l'espatlla molesta, redueix remats per dalt (safata, víbora, smash) i parla-ho amb el fisio.</li>
        <li>Des de la setmana 23, pàdel suau o res.</li></ul></div>
      <div class="card"><span class="eyebrow">Regles de seguretat</span><ul class="tight">
        <li>Dolor que et fa coixejar o canviar la gambada: para aquell dia.</li>
        <li>No recuperis quilòmetres doblant sessions.</li>
        <li>Si mous una qualitat, deixa-li com a mínim un dia suau o de descans abans de la llarga.</li>
        <li>La cursa és un 80 % de terra compactada: fes part de les llargues en via verda.</li></ul></div>
    </div>
    <p class="small muted">Pla orientatiu. Si notes dolor que et canvia la manera de córrer, para i consulta un professional.</p>`;
}

// ---------- Vista: Ajustos ----------
async function renderAjustos() {
  const s = data.settings;
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && CONFIG.VAPID_PUBLIC_KEY && !store.demo;
  const publicUrl = location.origin + location.pathname;
  const cal = store.calendarUrl();
  view.innerHTML = `
    <h1>Ajustos</h1>
    ${store.demo ? `<div class="note">Mode demo: les dades es desen en aquest navegador. Omple <span class="mono">web/js/config.js</span> amb les claus de Supabase (vegeu el README) per sincronitzar-ho tot.</div>` : ''}
    <div class="card"><span class="eyebrow">Compte</span>
      ${!store.demo && auth.user && store.recovery ? `<p><b>Crea la teva contrasenya</b></p>
        <form id="setpw" class="formgrid"><label class="f wide">Nova contrasenya (mínim 8 caràcters)<input type="password" name="pw" minlength="8" autocomplete="new-password" required></label>
        <button class="btn primary wide" type="submit">Desar contrasenya</button></form>` : ''}
      ${store.demo ? '<p class="small">Mode demo: tens permís d\'edició.</p>' : auth.user ? `<div class="row between"><span>${esc(auth.user.email)} ${auth.owner ? '<span class="chip green">propietari</span>' : '<span class="chip">només lectura</span>'}</span><button class="btn sm" id="logout">Tancar sessió</button></div>`
        : `<p class="small muted">Qualsevol persona amb l'enllaç veu el pla. Inicia sessió per editar.</p>
        <form id="login" class="formgrid"><label class="f wide">Correu<input type="email" name="email" autocomplete="username" required></label>
        <label class="f wide">Contrasenya<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary wide" type="submit">Iniciar sessió</button>
        <button class="btn ghost wide" type="button" id="sendPw">Primer cop o contrasenya oblidada? Envia'm un correu</button></form>`}
    </div>
    ${!store.demo && auth.owner && store.demoLeftovers() ? `<div class="card"><span class="eyebrow">Dades d'aquest mòbil</span>
      <p class="small">En aquest navegador hi ha ${store.demoLeftovers().n} registres del mode demo. Puja'ls al núvol perquè no es perdin.</p>
      <div class="row"><button class="btn primary sm" id="demoUp">Pujar-les al núvol</button><button class="btn ghost sm" id="demoDrop">Descartar</button></div></div>` : ''}
    <div class="card"><span class="eyebrow">Cursa i objectiu</span>
      <label class="f">Data de la marató (diumenge)<input type="date" id="raceDate" value="${s.race_date}" ${canWrite() ? '' : 'disabled'}></label>
      <p class="small muted">Si canvia la data, el pla de 25 setmanes es recalcula enrere des del nou diumenge.</p>
      <div class="f" style="display:flex;flex-direction:column;gap:6px"><span>Ritme objectiu</span>
        <div class="seg grid3" role="group" aria-label="Ritme objectiu">${[290, 300, 310, 315, 320, 330].map(v => `<button type="button" data-goal="${v}" aria-pressed="${s.goal_pace === v}" ${canWrite() ? '' : 'disabled'}>${fmt(v)}</button>`).join('')}</div>
        <span class="small muted mono">= ${fmtH(s.goal_pace * 42.195)} a meta</span></div>
      <label class="switch"><span><b>Adaptació automàtica</b><br><span class="small muted">El pla s'ajusta sol al que fas de veritat.</span></span><input type="checkbox" id="adapt" ${s.adapt !== false ? 'checked' : ''} ${canWrite() ? '' : 'disabled'}></label>
    </div>
    <div class="card"><span class="eyebrow">Les teves dades</span>
      <p class="small">${store.demo ? '<b>Mode demo:</b> les dades només es desen en aquest navegador. Si esborres les dades del navegador o canvies de mòbil, es perden. Fes còpies sovint o configura Supabase perquè es desin al núvol.' : 'Les dades es desen a la teva base de dades de Supabase i es veuen des de qualsevol dispositiu.'}</p>
      <p class="small muted mono">${Object.keys(data.logs).length} registres · ${data.activities.length} activitats · ${data.tests.length} tests · ${Object.keys(data.moves).length} moviments</p>
      ${canWrite() ? `<div class="row"><button class="btn sm" id="bkDown">Descarregar còpia de seguretat</button><label class="btn sm ghost filebtn">Restaurar una còpia<input type="file" id="bkIn" accept=".json,application/json" hidden></label></div>` : '<div class="row"><button class="btn sm" id="bkDown">Descarregar còpia de seguretat</button></div>'}
    </div>
    <div class="card"><span class="eyebrow">Notificacions</span>
      <p class="small muted">Avís a les 21:00 amb la sessió de demà i a les 8:00 amb la d'avui.</p>
      ${pushOk && canWrite() ? `<div class="row" id="pushRow"><span class="small muted">Comprovant…</span></div>` : `<p class="small muted">${store.demo ? 'Disponible quan configuris Supabase.' : !CONFIG.VAPID_PUBLIC_KEY ? 'Falta la clau VAPID a config.js.' : !canWrite() ? 'Inicia sessió per activar-les.' : 'Aquest navegador no admet notificacions push.'}</p>`}
    </div>
    <div class="card"><span class="eyebrow">Calendari</span>
      ${cal ? `<p class="small muted">Subscriu-t'hi i veuràs les sessions (amb els ajustos) al calendari del mòbil. Google Calendar → Altres calendaris → + → Des d'un URL.</p>
        <div class="copy"><input readonly value="${esc(cal)}" id="calUrl"><button class="btn sm" data-copy="calUrl">Copiar</button></div>
        <a class="btn sm" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(cal.replace(/^https:/, 'webcal:'))}" target="_blank" rel="noopener">Afegir a Google Calendar</a>`
        : '<p class="small muted">Disponible quan configuris Supabase.</p>'}
    </div>
    <div class="card"><span class="eyebrow">Compartir i instal·lar</span>
      <p class="small muted">Enllaç de només lectura per al teu entrenador, fisio o amics:</p>
      <div class="copy"><input readonly value="${esc(publicUrl)}" id="pubUrl"><button class="btn sm" data-copy="pubUrl">Copiar</button></div>
      ${installEvt ? '<button class="btn primary" id="install">Instal·lar l\'app al mòbil</button>' : '<p class="small muted">Per instal·lar-la a Android: menú de Chrome ⋮ → "Afegeix a la pantalla d\'inici".</p>'}
    </div>`;
  if (pushOk && canWrite()) renderPushRow();
}

async function renderPushRow() {
  const row = $('#pushRow'); if (!row) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  row.innerHTML = sub ? `<span class="chip green">Activades en aquest dispositiu</span><button class="btn sm" id="pushTest">Provar</button><button class="btn sm ghost" id="pushOff">Desactivar</button>`
    : `<button class="btn primary" id="pushOn">Activar notificacions</button>`;
}

const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };

// ---------- Mapa (Leaflet, càrrega diferida) ----------
let leafletP;
function leaflet() {
  if (!leafletP) leafletP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = () => res(window.L); s.onerror = rej; document.head.appendChild(s);
  });
  return leafletP;
}
function decodePolyline(str) {
  let i = 0, lat = 0, lng = 0; const out = [];
  while (i < str.length) {
    for (const k of [0, 1]) {
      let b, shift = 0, result = 0;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
async function drawMap(id) {
  const el = document.getElementById('map-' + id); if (!el || el.dataset.done) return;
  const a = data.activities.find(x => String(x.id) === String(id)); if (!a?.polyline) return;
  el.dataset.done = '1';
  try {
    const L = await leaflet();
    const pts = decodePolyline(a.polyline);
    const m = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(m);
    const line = L.polyline(pts, { color: '#ff5a4a', weight: 4 }).addTo(m);
    m.fitBounds(line.getBounds(), { padding: [12, 12] });
  } catch { el.textContent = 'No s\'ha pogut carregar el mapa.'; }
}

// ---------- Esdeveniments (delegats) ----------
view.addEventListener('click', async e => {
  const t = e.target.closest('button, a'); if (!t) return;
  const ds = t.dataset;
  if (ds.wk !== undefined) { viewWeek = ds.wk === '0' ? model.curWeek : viewWeek + +ds.wk; location.hash = 'setmana/' + viewWeek; return; }
  if (ds.go) { location.hash = 'setmana/' + ds.go; return; }
  if (ds.done) {
    const id = ds.done; const cur = data.logs[id] || {};
    const row = { done: !cur.done || !!cur.skipped, skipped: false, km: cur.km ?? null, min: cur.min ?? null, rpe: cur.rpe ?? null, note: cur.note ?? null };
    if (!row.done && row.km == null && row.min == null && row.rpe == null && !row.note) return act(() => store.saveLog(data, id, null), 'Desmarcada');
    return act(() => store.saveLog(data, id, row), row.done ? 'Feta ✓' : 'Desmarcada');
  }
  if (ds.skip) {
    const id = ds.skip; const cur = data.logs[id] || {};
    const row = { done: false, skipped: !cur.skipped, km: cur.km ?? null, min: cur.min ?? null, rpe: cur.rpe ?? null, note: cur.note ?? null };
    if (!row.skipped && row.km == null && row.min == null && row.rpe == null && !row.note) return act(() => store.saveLog(data, id, null), 'Desmarcada');
    return act(() => store.saveLog(data, id, row), row.skipped ? 'Marcada com a no feta ✕' : 'Desmarcada');
  }
  if (ds.add) { addOpen = addOpen === ds.add ? null : ds.add; render(); document.querySelector('#addForm [name=name]')?.focus(); return; }
  if (ds.addcancel) { addOpen = null; render(); return; }
  if (ds.delact) { if (confirm('Esborrar aquesta activitat?')) return act(() => store.deleteActivity(data, ds.delact), 'Activitat esborrada'); return; }
  if (ds.clear) return act(() => store.saveLog(data, ds.clear, null), 'Registre esborrat');
  if (ds.mv !== undefined && ds.date !== undefined) {
    const s = plan.byId[ds.mv]; const date = ds.date;
    const reset = !date || (date === iso(s.baseDate) && !fdsOn(data.weeks, s.week));
    return act(() => store.saveMove(data, s.id, reset ? null : date), reset ? 'Tornada al seu dia' : `Moguda al ${DAYS_L[(fromIso(date).getDay() + 6) % 7]} ${dm(fromIso(date))}`);
  }
  if (ds.mvpick) {
    const v = document.getElementById('mvd-' + ds.mvpick)?.value; if (!v) return toast('Tria una data');
    const d = fromIso(v); if (d < plan.start || d > plan.race) return toast('Tria una data dins del pla');
    viewWeek = weekOfDate(plan, d);
    await act(() => store.saveMove(data, ds.mvpick, v), `Moguda al ${dm(d)}`);
    location.hash = 'setmana/' + viewWeek; return;
  }
  if (ds.fds) return act(() => store.saveWeek(data, +ds.fds, ds.v === '1'), ds.v === '1' ? 'Tirada llarga a diumenge' : 'Tirada llarga a dissabte');
  if (ds.goal) return act(() => store.saveSettings(data, { goal_pace: +ds.goal }), 'Objectiu actualitzat');
  if (ds.deltest) { if (confirm('Esborrar aquest test?')) return act(() => store.deleteTest(data, ds.deltest), 'Test esborrat'); return; }
  if (ds.copy) { const i = document.getElementById(ds.copy); try { await navigator.clipboard.writeText(i.value); toast('Copiat'); } catch { i.select(); } return; }
  switch (t.id) {
    case 'bkDown': {
      const blob = new Blob([store.exportAll(data)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `marato27-copia-${todayIso()}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Còpia descarregada'); return;
    }
    case 'sendPw': {
      const email = view.querySelector('#login [name=email]')?.value.trim();
      if (!email) return toast('Escriu el teu correu primer');
      try { await store.sendPasswordEmail(email); toast('Correu enviat: obre l\'enllaç des d\'aquest mòbil'); } catch (err) { toast('Error: ' + err.message); }
      return;
    }
    case 'demoUp': { const d = store.demoLeftovers(); if (!d) return; return act(async () => { await store.importAll(data, d); store.clearDemo(); data = await store.loadAll(); }, 'Dades pujades al núvol ✓'); }
    case 'demoDrop': if (confirm('Descartar les dades del mode demo d\'aquest navegador?')) { store.clearDemo(); render(); } return;
    case 'logout': await store.signOut(); auth = await store.session(); recompute(); render(); return;
    case 'install': installEvt.prompt(); installEvt = null; return;
    case 'pushOn': {
      try {
        if (await Notification.requestPermission() !== 'granted') return toast('Permís denegat');
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CONFIG.VAPID_PUBLIC_KEY) });
        await store.savePushSub(sub); toast('Notificacions activades'); renderPushRow();
      } catch (err) { toast('Error: ' + err.message); }
      return;
    }
    case 'pushOff': {
      const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
      if (sub) { await store.deletePushSub(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
      toast('Notificacions desactivades'); renderPushRow(); return;
    }
    case 'pushTest': try { await store.invoke('push-cron', { test: true }); toast('Enviada'); } catch (err) { toast('Error: ' + err.message); } return;
  }
});

view.addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target; const fd = new FormData(f);
  const num = v => (v === null || v === '') ? null : +String(v).replace(',', '.');
  if (f.classList.contains('logform')) {
    const id = f.dataset.id; const cur = data.logs[id] || {};
    const km = numIn(fd.get('km')); const secs = readTime(fd);
    if (Number.isNaN(secs)) return toast('Els segons han d\'anar de 0 a 59');
    if (fd.get('km') && km == null) return toast('Escriu els km amb números (6,5 o 6.5)');
    const row = { done: (cur.done && !cur.skipped) || !!(km || secs), skipped: !!cur.skipped && !(km || secs), km, min: secs ? Math.round(secs / 60 * 100) / 100 : null, rpe: fd.get('rpe') ? +fd.get('rpe') : null, note: String(fd.get('note') || '').slice(0, 500) || null };
    return act(() => store.saveLog(data, id, row), 'Desat ✓');
  }
  if (f.id === 'addForm') {
    const date = f.dataset.date; const type = fd.get('type'); const km = numIn(fd.get('km')); const secs = readTime(fd);
    if (Number.isNaN(secs)) return toast('Els segons han d\'anar de 0 a 59');
    const name = String(fd.get('name') || '').trim().slice(0, 80) || (ADD_TYPES.find(x => x[0] === type) || [, 'Activitat'])[1];
    const a = { id: -Date.now(), name, sport_type: type, start_date: new Date(date + 'T12:00:00').toISOString(), start_date_local: `${date}T12:00:00Z`,
      distance: km ? Math.round(km * 1000) : 0, moving_time: secs || null, elapsed_time: secs || null,
      session_id: 'none', ignored: false, rpe: fd.get('rpe') ? +fd.get('rpe') : null, note: String(fd.get('note') || '').slice(0, 500) || null, source: 'manual' };
    addOpen = null;
    return act(() => store.addActivities(data, [a]), 'Activitat afegida ✓');
  }
  if (f.id === 'testForm') {
    const secs = readTime(fd); if (!secs || Number.isNaN(secs)) return toast('Escriu el temps: minuts i segons (0–59)');
    return act(() => store.addTest(data, { date: fd.get('date'), dist: +fd.get('dist'), secs, label: String(fd.get('label') || '').slice(0, 80) || null }), 'Test desat ✓ · ritmes recalculats');
  }
  if (f.id === 'setpw') {
    try { await store.setPassword(fd.get('pw')); auth = await store.session(); toast('Contrasenya desada ✓'); recompute(); render(); }
    catch (err) { toast('Error: ' + err.message); }
    return;
  }
  if (f.id === 'login') {
    try { auth = await store.signIn(fd.get('email'), fd.get('password')); toast(auth.owner ? 'Sessió iniciada' : 'Aquest compte no és el propietari'); recompute(); render(); }
    catch (err) { toast('No s\'ha pogut entrar: ' + err.message); }
  }
});

view.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.assign) {
    const v = t.value;
    const patch = v === '__ignore' ? { ignored: true } : { session_id: v || null, ignored: false };
    return act(() => store.setActivity(data, t.dataset.assign, patch), 'Activitat reassignada');
  }
  if (t.id === 'raceDate' && t.value) {
    if (fromIso(t.value).getDay() !== 0) { toast('La marató ha de ser en diumenge'); t.value = data.settings.race_date; return; }
    if (!confirm('Canviar la data recalcula tot el pla. Els moviments manuals de dates es mantenen tal qual. Continuar?')) { t.value = data.settings.race_date; return; }
    viewWeek = null;
    return act(() => store.saveSettings(data, { race_date: t.value }), 'Data actualitzada');
  }
  if (t.id === 'bkIn' && t.files[0]) {
    const file = t.files[0]; t.value = '';
    file.text().then(txt => {
      let j; try { j = JSON.parse(txt); } catch { return toast('Aquest fitxer no és una còpia del pla'); }
      if (j.app !== 'marato27') return toast('Aquest fitxer no és una còpia del pla');
      if (!confirm(`Restaurar la còpia del ${String(j.exported || '').slice(0, 10)}? S'afegeixen les dades i se substitueixen les que coincideixin.`)) return;
      act(async () => { await store.importAll(data, j); if (!store.demo) data = await store.loadAll(); }, 'Còpia restaurada ✓');
    });
    return;
  }
  if (t.id === 'adapt') return act(() => store.saveSettings(data, { adapt: t.checked }), t.checked ? 'Adaptació activada' : 'Adaptació desactivada');
});

view.addEventListener('toggle', e => { const d = e.target; if (d.classList?.contains('actx') && d.open) drawMap(d.dataset.id); }, true);

// ---------- Rutes ----------
const TABS = ['avui', 'setmana', 'pla', 'progres', 'tests', 'ritmes', 'ajustos'];
function route() {
  const [r, arg] = location.hash.slice(1).split('/');
  if (r === 'dia' && arg) { viewWeek = weekOfDate(plan, fromIso(arg)); return { tab: 'setmana', focus: arg }; }
  if (r === 'setmana' && arg) viewWeek = Math.min(25, Math.max(1, +arg || model.curWeek));
  return { tab: TABS.includes(r) ? r : 'avui' };
}
let lastTab = null;
function render() {
  if (!plan) return;
  const { tab } = route();
  view.className = 'view v-' + tab;
  ({ avui: renderAvui, setmana: renderSetmana, pla: renderPla, progres: renderProgres, tests: renderTests, ritmes: renderRitmes, ajustos: renderAjustos })[tab]();
  document.querySelectorAll('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  $('#brandSub').textContent = `S${model.curWeek}/25 · ${Math.max(0, Math.round((plan.race - today0()) / DAY))} dies`;
  const bn = $('#banner');
  if (store.demo && tab !== 'ajustos') { bn.hidden = false; bn.innerHTML = 'Mode demo · les dades només es desen en aquest navegador. <a href="#ajustos">Fes una còpia o activa el núvol</a>'; }
  else if (!auth.owner) { bn.hidden = false; bn.innerHTML = auth.user ? 'Sessió sense permís d\'edició.' : 'Només lectura · <a href="#ajustos">inicia sessió</a> per editar.'; }
  else bn.hidden = true;
  if (tab !== lastTab) { window.scrollTo(0, 0); lastTab = tab; }
}
window.addEventListener('hashchange', () => { lastTab = null; render(); });

// ---------- Inici ----------
recompute(); render();
(async () => {
  try { auth = await store.init(); } catch (e) { console.error(e); setSync('err', 'Sense connexió'); }
  if (store.recovery) { history.replaceState(null, '', location.pathname + '#ajustos'); toast('Crea la teva contrasenya a Ajustos'); }
  await refresh();
  // Refresca en tornar a l'app i a mitjanit
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (route().tab === 'ajustos') render(); });
