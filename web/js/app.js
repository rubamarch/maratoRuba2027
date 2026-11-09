// Marató 2027 · aplicació principal.
import { CONFIG } from './config.js';
import * as store from './store.js';
import { buildPlan, iso, fromIso, addDays, catDate, DAY, DAYS, DAYS_L, TYPES, isRun, SLOT_ORDER, phaseOf, fdsOn, weekOfDate } from './shared/plan.js';
import { zones, fillPaces, fitness, fmt, fmtH, parseT } from './shared/pace.js';
import { computeModel, modelSessionsOn, isRunAct } from './shared/adapt.js';

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

function dateLabel(d) {
  const t = today0(); const diff = Math.round((d - t) / DAY);
  const rel = diff === 0 ? 'Avui' : diff === 1 ? 'Demà' : diff === -1 ? 'Ahir' : null;
  return `${rel ? rel + ' · ' : ''}${DAYS_L[(d.getDay() + 6) % 7]} ${dm(d)}`;
}

function stravaBlock(a, s) {
  if (!isRunAct(a)) return `<div class="strava"><div class="strava-h"><span><b>${a.source === 'manual' ? 'Registre' : 'Strava'}</b> · ${esc(a.name || actKind(a).n)}</span><span class="muted mono">${a.moving_time ? fmtH(a.moving_time) : ''}</span></div>${canWrite() && (a.source || +a.id < 0) ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar</button></div>` : ''}</div>`;
  const k = actKm(a); const pace = a.moving_time && k ? a.moving_time / k : null;
  const hr = a.avg_hr ? `${Math.round(a.avg_hr)}${a.max_hr ? `<small class="muted">/${Math.round(a.max_hr)}</small>` : ''}` : '—';
  const opts = canWrite() ? assignSelect(a, s ? s.week : weekOfDate(plan, fromIso(actDate(a)))) : '';
  return `<div class="strava" data-act="${a.id}">
    <div class="strava-h"><span><b>Strava</b> · ${esc(a.name || 'Cursa')}</span><span class="muted mono">${dShort(fromIso(actDate(a)))} ${String(a.start_date_local || '').slice(11, 16)}</span></div>
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
    ${+a.id > 0 ? `<a class="small" href="https://www.strava.com/activities/${a.id}" target="_blank" rel="noopener">Obre a Strava ↗</a>` : ''}
    ${canWrite() && (a.source || +a.id < 0) ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar activitat</button></div>` : ''}
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

function sessCard(s) {
  const d = model.date(s); const t = TYPES[s.type]; const run = isRun(s.type);
  const log = data.logs[s.id] || {}; const acts = model.match[s.id] || [];
  const done = model.done(s.id); const auto = model.auto[s.id] || {}; const adj = model.adj[s.id];
  const isToday = iso(d) === todayIso();
  const kmNow = model.km(s); const kmChanged = run && kmNow !== s.km;
  const manualMove = data.moves[s.id];
  const byStrava = acts.length > 0;
  const notes = [...(adj?.notes || [])];
  if (manualMove) notes.push(`Moguda per tu (era el ${DAYS_L[s.d]} ${dm(s.baseDate)}).`);
  const logBits = [log.km != null && log.km !== '' ? `${km1(log.km)} km` : '', log.min ? `${log.min}′` : '', log.rpe ? `esforç ${log.rpe}/10` : ''].filter(Boolean).join(' · ');
  const dayOpts = []; for (let i = 0; i < 7; i++) { const x = plan.dateOf(s.week, i); dayOpts.push(`<button type="button" data-mv="${s.id}" data-date="${iso(x)}" aria-pressed="${iso(x) === iso(d)}">${DAYS[i]} ${x.getDate()}</button>`); }
  return `<article class="sess t-${s.type} ${isToday ? 'today' : ''} ${done ? 'is-done' : ''} ${auto.lost || auto.dropped ? 'lost' : ''}" id="s-${s.id}">
    <div class="sess-h">
      <div>
        <div class="sess-meta"><span class="tchip">${t.n}</span><span>${dateLabel(d)}</span>${auto.moved ? '<span class="chip warn">recol·locada</span>' : ''}${auto.lost ? '<span class="chip">perduda</span>' : ''}${adj?.soft ? '<span class="chip warn">suavitzada</span>' : ''}</div>
        <div class="sess-title"><h3>${esc(model.title(s))}</h3>${run && s.km ? `<span class="mono small">${kmChanged ? `<s>${km1(s.km)}</s> ` : ''}${km1(kmNow)} km</span>` : ''}</div>
      </div>
      <button type="button" class="check ${canWrite() ? '' : 'ro'}" data-done="${s.id}" aria-pressed="${done}" ${!canWrite() || byStrava ? 'disabled' : ''}
        aria-label="${done ? 'Feta' : 'Marcar com a feta'}" title="${byStrava ? 'Registrada a Strava' : done ? 'Feta' : 'Marcar com a feta'}">${ICON_CHECK}</button>
    </div>
    <div class="sess-b">
      <div class="detail">${fill(s.detail)}</div>
      ${notes.length ? `<div class="adj">${notes.map(n => `<p>${esc(n)}</p>`).join('')}</div>` : ''}
      ${acts.map(a => stravaBlock(a, s)).join('')}
      ${(logBits || log.note) && !canWrite() ? `<p class="small muted">${esc(logBits)}${log.note ? ` · «${esc(log.note)}»` : ''}</p>` : ''}
      ${canWrite() ? `<details class="more"><summary>${logBits || log.note ? `Registre: ${esc(logBits || 'nota')}` : 'Registrar · moure'}</summary>
        <form class="subsec logform" data-id="${s.id}">
          <div class="formgrid">
            ${run ? `<label class="f">Km<input name="km" inputmode="decimal" value="${log.km ?? ''}" placeholder="${byStrava ? km1(model.sessionKm(s)) : km1(kmNow)}"></label>` : ''}
            <label class="f">Minuts<input name="min" inputmode="numeric" value="${log.min ?? ''}"></label>
            <label class="f">Esforç 1–10<select name="rpe"><option value=""></option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option ${log.rpe === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="f wide">Nota<input name="note" maxlength="500" value="${esc(log.note || '')}" placeholder="Sensacions, espatlla…"></label>
          </div>
          <p class="small muted">L'esforç ajuda el pla a adaptar-se: 8 o més vol dir fatiga; 4 o menys, que vas sobrat.</p>
          <div class="row"><button class="btn primary sm" type="submit">Desar</button>${data.logs[s.id] ? `<button class="btn sm ghost" type="button" data-clear="${s.id}">Esborrar registre</button>` : ''}</div>
        </form>
        <div class="subsec">
          <span class="eyebrow">Moure a un altre dia</span>
          <div class="daybtns">${dayOpts.join('')}</div>
          <div class="row"><input type="date" id="mvd-${s.id}" min="${iso(plan.start)}" max="${iso(plan.race)}" value="${iso(d)}" style="max-width:180px"><button class="btn sm" type="button" data-mvpick="${s.id}">Moure</button>${manualMove ? `<button class="btn sm ghost" type="button" data-mv="${s.id}" data-date="">Tornar al seu dia</button>` : ''}</div>
        </div>
      </details>` : ''}
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
  const api = +a.id > 0 && !a.source;
  return `<article class="sess t-${k.t} extra is-done">
    <div class="sess-h"><div><div class="sess-meta"><span class="tchip">Extra · ${k.n}</span><span>${dateLabel(d)}</span>${a.source === 'paste' || a.source === 'csv' || api ? '<span class="chip orange">Strava</span>' : ''}</div>
    <div class="sess-title"><h3>${esc(a.name || (isRunAct(a) ? 'Cursa fora del pla' : k.n))}</h3>${bits ? `<span class="mono small">${bits}</span>` : ''}</div></div>
    <span class="check" aria-hidden="true" style="--tc:var(--t-${k.t});background:var(--tc);border-color:var(--tc);color:#fff">${ICON_CHECK}</span></div>
    <div class="sess-b">${a.note ? `<p class="small">«${esc(a.note)}»</p>` : ''}
      <p class="small muted">${isRunAct(a) ? 'Compta als km de la setmana i el pla s\'adapta si cal.' : 'Queda registrada, però no suma km de cursa.'}</p>
      ${api ? stravaBlock(a, null) : `${isRunAct(a) && canWrite() ? assignSelect(a, weekOfDate(plan, d)) : ''}${canWrite() ? `<div class="row"><button class="btn sm ghost danger" data-delact="${a.id}">Esborrar activitat</button></div>` : ''}`}
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
      <label class="f">Km<input name="km" inputmode="decimal"></label>
      <label class="f">Minuts<input name="min" inputmode="numeric"></label>
      <label class="f">Esforç 1–10<select name="rpe"><option value=""></option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => `<option>${v}</option>`).join('')}</select></label>
      <label class="f wide">Nota<input name="note" maxlength="500" placeholder="Sensacions, espatlla…"></label>
    </div>
    <div class="row"><button class="btn primary sm" type="submit">Afegir</button><button class="btn sm ghost" type="button" data-addcancel="1">Cancel·lar</button></div>
  </form>`;
}

// ---------- Importar de Strava (sense connexió: enganxar la taula o activities.csv) ----------
const MES = { ene: 0, gen: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, mai: 4, jun: 5, jul: 6, ago: 7, aug: 7, set: 8, sep: 8, sept: 8, oct: 9, nov: 10, dic: 11, des: 11, dec: 11 };
const two = n => String(n).padStart(2, '0');
function hashId(str) { let h1 = 0xdeadbeef, h2 = 0x41c6ce57; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); } h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909); return -(4294967296 * (2097151 & h2) + (h1 >>> 0)) || -1; }
function sportCat(s) {
  s = s.toLowerCase();
  if (/carrera|cursa|run|c[oó]rrer|trail/.test(s)) return 'run';
  if (/p[aàá]del|tenis|tennis|squash|pickle|r[aàá]quet|racquet|b[aàá]dminton/.test(s)) return 'padel';
  if (/pesas|peses|weight|entrenamiento|entrenament|workout|crossfit|hiit|strength|fuerza|for[cç]a|pilates|yoga/.test(s)) return 'gym';
  if (/bici|ride|cycl|cicl/.test(s)) return 'ride';
  return 'other';
}
function parsePaste(text) {
  const re = /^\s*(.+?)\s+(?:[a-zà-úé]{2,4}\.?,\s*)?(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(.+?)\s+((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s+([\d.,]+)\s*(km|mi))?/i;
  let lines = text.split(/\r?\n/).map(l => l.replace(/\t/g, ' '));
  if (!lines.some(l => re.test(l))) lines = text.replace(/\s+/g, ' ').split(/Editar\s+Eliminar(?:\s+Compartir)?|Edit\s+Delete(?:\s+Share)?|Edita\s+Elimina(?:\s+Comparteix)?/i);
  const out = [];
  for (const line of lines) {
    const m = line.match(re); if (!m) continue;
    const [, sport, dd, mo, y, name, time, dist, unit] = m;
    if (/^(deporte|esport|sport)$/i.test(sport.trim())) continue;
    const date = `${y}-${two(mo)}-${two(dd)}`; const secs = parseT(time);
    let km = dist ? parseFloat(dist.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) : null;
    if (km != null && unit && unit.toLowerCase() === 'mi') km *= 1.609;
    out.push({ id: hashId(`${date}|${sport.trim()}|${secs}|${name.trim()}`), date, sport: sport.trim(), name: name.trim(), km: km > 0 ? km : null, secs });
  }
  return out;
}
function parseCsvDate(s) {
  s = String(s || '').trim().toLowerCase(); let m;
  if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/(\d{1,2})\s+(?:de\s+)?([a-z]{3,4})\.?\s+(?:de\s+)?(\d{4})/)) && MES[m[2]] != null) return `${m[3]}-${two(MES[m[2]] + 1)}-${two(m[1])}`;
  if ((m = s.match(/([a-z]{3,4})\.?\s+(\d{1,2}),?\s+(\d{4})/)) && MES[m[1]] != null) return `${m[3]}-${two(MES[m[1]] + 1)}-${two(m[2])}`;
  return null;
}
function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return null;
  const h = rows[0].map(x => x.trim().toLowerCase());
  const find = (...n) => { for (const x of n) { const i = h.indexOf(x); if (i >= 0) return i; } return -1; };
  const iId = find('activity id', 'id de la actividad', 'id de l\'activitat'), iDate = find('activity date', 'fecha de la actividad', 'data de l\'activitat');
  const iName = find('activity name', 'nombre de la actividad', 'nom de l\'activitat'), iType = find('activity type', 'tipo de actividad', 'tipus d\'activitat');
  const iDist = find('distance', 'distancia', 'distància'), iEl = find('elapsed time', 'tiempo transcurrido', 'temps transcorregut');
  const iMov = Math.max(h.lastIndexOf('moving time'), h.lastIndexOf('tiempo en movimiento'), h.lastIndexOf('temps en moviment'));
  if (iDate < 0 || iType < 0) return null;
  return rows.slice(1).filter(r => r.length > iType).map(r => {
    const date = parseCsvDate(r[iDate]); if (!date) return null;
    let km = iDist >= 0 ? parseFloat(String(r[iDist]).replace(',', '.')) : NaN; if (km > 300) km /= 1000;
    const secs = Math.round(+(iMov >= 0 && r[iMov] ? r[iMov] : r[iEl] || 0)) || null;
    const id = iId >= 0 && /^\d+$/.test(String(r[iId]).trim()) ? +String(r[iId]).trim() : hashId(`${date}|${r[iType]}|${secs}`);
    return { id, date, sport: r[iType].trim(), name: iName >= 0 ? r[iName].trim() : r[iType].trim(), km: km > 0 ? km : null, secs };
  }).filter(Boolean);
}
async function importStrava(list, source) {
  const have = new Set(data.activities.map(a => String(a.id)));
  const inPlan = list.filter(a => a.date >= iso(addDays(plan.start, -14)) && a.date <= iso(plan.race));
  const rows = [];
  for (const a of inPlan) {
    if (have.has(String(a.id)) || rows.some(r => r.id === a.id)) continue;
    const cat = sportCat(a.sport);
    const sport_type = cat === 'run' ? (/trail|montaña|muntanya/i.test(a.sport) ? 'TrailRun' : 'Run') : cat === 'padel' ? 'Padel' : cat === 'gym' ? 'WeightTraining' : cat === 'ride' ? 'Ride' : 'Workout';
    let session_id = null;
    if (cat !== 'run') {
      const want = cat === 'padel' ? 'p' : cat === 'gym' ? 'g' : null;
      const s = want && modelSessionsOn(plan, model, fromIso(a.date)).find(x => x.type === want && !model.done(x.id) && !rows.some(r => r.session_id === x.id));
      session_id = s ? s.id : 'none';
    }
    rows.push({ id: a.id, name: a.name || a.sport, sport_type, start_date: new Date(a.date + 'T12:00:00').toISOString(), start_date_local: `${a.date}T12:00:00Z`,
      distance: a.km ? Math.round(a.km * 1000) : 0, moving_time: a.secs, elapsed_time: a.secs, session_id, ignored: false, source });
  }
  await store.addActivities(data, rows);
  return { added: rows.length, dup: inPlan.length - rows.length, outside: list.length - inPlan.length };
}
function stravaDialog() {
  let dlg = document.getElementById('stDlg');
  if (!dlg) {
    dlg = document.createElement('dialog'); dlg.id = 'stDlg'; dlg.className = 'dlg';
    dlg.innerHTML = `<form method="dialog" class="dlg-in" id="stForm">
      <div class="row between"><h2>Importar de Strava</h2><button class="iconbtn close" value="cancel" aria-label="Tancar">×</button></div>
      <ol class="steps">
        <li>Obre <a href="https://www.strava.com/athlete/training" target="_blank" rel="noopener">strava.com/athlete/training</a> (Les meves activitats).</li>
        <li>Selecciona la taula d'activitats, de la primera fila a l'última, i copia-la.</li>
        <li>Enganxa-la aquí i prem <b>Importar</b>. Cada cursa, partit o sessió de gimnàs marca la sessió d'aquell dia; la resta entra com a dia extra.</li>
      </ol>
      <textarea id="stPaste" rows="6" placeholder="Carrera  lun, 9/11/2026  Morning Run  32:10  6,02 km  12 m"></textarea>
      <div class="row"><button type="button" class="btn accent" id="stPasteGo">Importar</button>
        <label class="btn sm ghost filebtn">Pujar activities.csv<input type="file" id="stCsv" accept=".csv,text/csv" hidden></label></div>
      <p class="small muted" id="stMsg">L'activities.csv ve a l'exportació gratuïta de Strava (Configuració → El meu compte → Descarrega les teves dades). Les activitats ja importades no es dupliquen.</p>
      <p class="small muted">Vols que arribin soles? Connecta Strava a Ajustos: l'API de Strava és gratuïta, no cal subscripció.</p>
    </form>`;
    document.body.appendChild(dlg);
    const msg = t => { dlg.querySelector('#stMsg').textContent = t; };
    const run = async (list, source) => {
      if (!list || !list.length) { msg('No hi he trobat activitats. Copia la taula de "Les meves activitats" o puja l\'activities.csv.'); return; }
      try {
        setSync('busy', 'Desant…');
        const r = await importStrava(list, source); recompute(); render(); setSync('ok', 'Sincronitzat');
        msg(`${r.added} activitats importades${r.dup ? ` · ${r.dup} ja hi eren` : ''}${r.outside ? ` · ${r.outside} fora del pla` : ''}.`);
        toast(`Strava: ${r.added} activitats importades`);
      } catch (e) { console.error(e); setSync('err', 'Error'); msg('No s\'ha pogut desar: ' + (e.message || e)); }
    };
    dlg.querySelector('#stPasteGo').onclick = () => run(parsePaste(dlg.querySelector('#stPaste').value), 'paste');
    dlg.querySelector('#stCsv').onchange = async e => { const f = e.target.files[0]; if (!f) return; const l = parseCsv(await f.text()); if (!l) return msg('Aquest CSV no sembla l\'activities.csv de Strava.'); run(l, 'csv'); e.target.value = ''; };
  }
  dlg.querySelector('#stPaste').value = '';
  dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', '');
}
const stravaBtn = () => canWrite() ? `<button type="button" class="btn strava-btn" id="stImport"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 3 4 15h3.6L10 10.2 12.4 15H16zm6 12-1.8 3.6L12.4 15H9.8l4.4 8.6 4.4-8.6z"/></svg>${data.strava?.connected ? 'Sincronitzar Strava' : 'Importar de Strava'}</button>` : '';

// ---------- Vista: Avui ----------
function trackSvg() {
  const W = 340, x0 = 8, x1 = 332, y = 26; const X = w => x0 + (x1 - x0) * (w - 1) / 25;
  const frac = Math.min(25, Math.max(0, (today0() - plan.start) / DAY / 7));
  let s = `<svg class="track" viewBox="0 0 ${W} 58" role="img" aria-label="Progrés del pla: setmana ${model.curWeek} de 25">`;
  s += `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="rgb(255 255 255 / .18)" stroke-width="6" stroke-linecap="round"/>`;
  for (let w = 1; w <= 25; w++) {
    const ss = plan.sessions.filter(x => x.week === w && model.active(x)); const f = ss.length ? ss.filter(x => model.done(x.id)).length / ss.length : 0;
    if (f > 0) s += `<line x1="${X(w)}" y1="${y}" x2="${X(w) + (X(w + 1) - X(w)) * f}" y2="${y}" stroke="#4cc185" stroke-width="6"/>`;
  }
  plan.phases.forEach((p, i) => { const xx = X(p.w[0]); s += `<circle cx="${xx}" cy="${y}" r="4.5" fill="#0f3d2a" stroke="#f4f3ee" stroke-width="2"/><text x="${xx}" y="${y + 22}" font-size="9.5" fill="rgb(244 243 238 / .75)" text-anchor="${i === 0 ? 'start' : 'middle'}">${p.n.split(' ')[0].toUpperCase()}</text>`; });
  s += `<rect x="${x1 - 6}" y="${y - 6}" width="12" height="12" fill="#e8611a" transform="rotate(45 ${x1} ${y})"/>`;
  const tx = x0 + (x1 - x0) * frac / 25;
  s += `<line x1="${tx}" y1="${y - 14}" x2="${tx}" y2="${y + 4}" stroke="#e8611a" stroke-width="2.5"/><circle cx="${tx}" cy="${y - 14}" r="4" fill="#e8611a"/>`;
  return s + '</svg>';
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
    <div class="stat"><span class="eyebrow">Predicció</span><span class="v num">${f ? fmtH(f.pred) : '—'}</span><span class="s">${f ? `objectiu ${fmtH(data.settings.goal_pace * 42.195)}` : 'afegeix un test'}</span></div>
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
  view.innerHTML = `
    <section class="hero">
      <div class="hero-top">
        <div class="countdown"><b class="num">${daysLeft}</b><span>dies per a Girona<br><span class="mono small">${catDate(plan.race)} ${plan.race.getFullYear()}</span></span></div>
        <div class="row"><span class="chip">${before ? 'Comença el ' + catDate(plan.start) : `S${model.curWeek} · ${ph.n}`}</span>${model.adaptOn ? '<span class="chip">↻ adaptatiu</span>' : ''}</div>
      </div>
      ${trackSvg()}
    </section>
    ${store.demo ? '' : ''}
    <div class="row between"><h2>Avui</h2><span class="muted small">${DAYS_L[(t.getDay() + 6) % 7]} ${catDate(t)}</span></div>
    ${todayS.length ? todayS.map(sessCard).join('') : `<div class="rest"><b>Descans</b><span>${next ? `Següent: ${next.ss.map(s => esc(model.title(s))).join(' + ')} · ${dateLabel(next.d)}` : 'Gaudeix-ne.'}</span></div>`}
    ${extrasToday.map(extraCard).join('')}
    <div class="row">${stravaBtn()}${addBlock(todayIso())}</div>
    ${todayS.length && tomorrow.length ? `<div class="card tight"><span class="eyebrow">Demà</span>${tomorrow.map(s => `<div class="row"><span class="dot t-${s.type}"></span><b>${esc(model.title(s))}</b><span class="muted small">${TYPES[s.type].n}${isRun(s.type) && model.km(s) ? ' · ' + km1(model.km(s)) + ' km' : ''}</span></div>`).join('')}</div>` : ''}
    ${fdsBox(W)}
    ${statsHtml()}
    ${recent.length ? `<div class="card"><div class="row between"><span class="eyebrow">Últims ajustos del pla</span><a class="small" href="#progres">Tots</a></div><div class="hist">${recent.map(histRow).join('')}</div></div>` : ''}
  `;
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
    days += `<div class="dayhead ${isT ? 'today' : ''}"><b>${DAYS_L[i]}</b><span class="muted small mono">${dm(d)}${isT ? ' · avui' : ''}</span></div>`;
    const all = [...ss, ...lostHere.filter(x => !ss.includes(x))];
    days += all.length || ex.length ? all.map(sessCard).join('') + ex.map(extraCard).join('') : (addOpen === iso(d) ? '' : `<div class="rest"><span>Descans</span></div>`);
    days += addBlock(iso(d));
  }
  const hist = model.history.filter(h => h.week === W.n);
  const pct = info.planned ? Math.min(100, info.actual / info.planned * 100) : 0;
  view.innerHTML = `
    <div class="weekhead">
      <div><span class="chip green">Fase ${ph.id} · ${ph.n}</span><h1 style="margin-top:6px">Setmana ${W.n}</h1><span class="muted mono small">${dShort(s0)} – ${dShort(s6)}</span></div>
      <div class="weeknav"><button class="btn sm" data-wk="-1" ${W.n <= 1 ? 'disabled' : ''} aria-label="Setmana anterior">←</button><button class="btn sm" data-wk="0">Avui</button><button class="btn sm" data-wk="1" ${W.n >= 25 ? 'disabled' : ''} aria-label="Setmana següent">→</button></div>
    </div>
    <div class="card tight">
      <div class="row between"><span class="eyebrow">Km de la setmana</span><span class="mono small"><b>${km1(info.actual)}</b> / ${km1(info.planned)} km${Math.abs(info.factor - 1) > 0.001 ? ` · <span class="chip warn">volum ${Math.round(info.factor * 100)} %</span>` : ''}</span></div>
      <div class="kmbar"><i style="width:${pct}%"></i></div>
    </div>
    ${W.note ? `<div class="note">${esc(W.note)}</div>` : ''}
    ${hist.length ? `<div class="card tight"><span class="eyebrow">Ajustos automàtics</span><div class="hist">${hist.map(histRow).join('')}</div></div>` : ''}
    ${fdsBox(W)}
    <div class="row">${stravaBtn()}</div>
    ${days}
    <p class="small muted">Si et saltes una tirada llarga o una sessió de qualitat, el pla la recol·loca sola dins la setmana. Els rodatges suaus no es recuperen.</p>`;
}

// ---------- Vista: Pla ----------
function renderPla() {
  view.innerHTML = `<h1>Pla complet</h1>` + plan.phases.map(p => `<section class="phase">
    <div class="row between"><h2>${p.id}. ${p.n}</h2><span class="muted mono small">S${p.w[0]}–${p.w[1]}</span></div>
    <p class="muted">${esc(p.txt)}</p>
    ${plan.weeks.filter(w => w.phase === p.id).map(w => {
      const ss = plan.sessions.filter(s => s.week === w.n && model.active(s)).sort((a, b) => model.date(a) - model.date(b) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
      const f = ss.length ? ss.filter(s => model.done(s.id)).length / ss.length : 0;
      const info = model.weekInfo[w.n]; const long = ss.find(s => s.type === 'l' || s.type === 'r');
      const cur = w.n === model.curWeek;
      return `<details class="wk ${cur ? 'cur' : ''}" ${cur ? 'open' : ''}><summary><b class="mono">S${w.n}</b>
        <span><span class="small">${dShort(plan.dateOf(w.n, 0))}</span> · <span class="muted small">${km1(info.planned)} km${long ? ` · ${long.type === 'r' ? 'cursa' : 'llarga'} ${km1(model.km(long))}` : ''}${Math.abs(info.factor - 1) > 0.001 ? ' · ↻' : ''}</span></span>
        <span class="kmbar" title="${Math.round(f * 100)} % fet"><i style="width:${f * 100}%"></i></span></summary>
        <div class="wkbody">${w.note ? `<p class="small muted">${esc(w.note)}</p>` : ''}
        ${ss.map(s => `<div class="wkline"><b class="mono small">${DAYS[(model.date(s).getDay() + 6) % 7]}</b><span class="dot t-${s.type}"></span><span>${esc(model.title(s))}${isRun(s.type) && s.km ? ` <span class="muted small">${km1(model.km(s))} km</span>` : ''}</span><span class="mono">${model.done(s.id) ? '✓' : model.auto[s.id]?.lost ? '✕' : '·'}</span></div>`).join('')}
        <button class="btn sm" style="align-self:flex-start;margin-top:6px" data-go="${w.n}">Obrir setmana</button></div></details>`;
    }).join('')}</section>`).join('');
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
  const f = fitness(data.tests); const goalT = data.settings.goal_pace * 42.195, maxT = 330 * 42.195;
  const pill = f ? (f.pred <= goalT ? '<span class="chip green">En objectiu</span>' : f.pred <= maxT ? '<span class="chip warn">Dins el màxim (5:30)</span>' : '<span class="chip orange">Per sobre de 5:30/km</span>') : '';
  const acts = [...data.activities].filter(a => !a.ignored).sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local))).slice(0, 30);
  const where = a => { const id = Object.keys(model.match).find(k => model.match[k].some(x => x.id === a.id)); return id ? model.title(plan.byId[id]) : 'Dia extra'; };
  view.innerHTML = `
    <h1>Progrés</h1>
    <div class="grid2">
      <div class="card"><span class="eyebrow">Predicció de marató</span>
        <div class="pred"><b class="num">${f ? fmtH(f.pred) : '—'}</b>${pill}</div>
        <p class="small muted">${f ? `A partir de ${esc(f.test.label || 'test')} (${km1(f.test.dist)} km en ${fmtH(f.test.secs)}, ${new Date(f.test.date).toLocaleDateString('ca-ES')}). Ritme previst ${fmt(f.pred / 42.195)}/km.${f.adj ? ' Com que fa més de 4 mesos, s\'hi sumen 12″/km.' : ''}` : 'Registra un test (5 km, 10 km o mitja) per veure la predicció i ajustar els ritmes.'}</p>
        <p class="small">Objectiu ${fmt(data.settings.goal_pace)}/km → <b class="mono">${fmtH(goalT)}</b> · Màxim 5:30/km → <b class="mono">${fmtH(maxT)}</b></p>
      </div>
      <div class="card"><span class="eyebrow">Tests i curses</span>
        ${canWrite() ? `<form id="testForm" class="formgrid">
          <label class="f">Data<input type="date" name="date" required value="${todayIso()}"></label>
          <label class="f">Distància<select name="dist"><option value="5">5 km</option><option value="10">10 km</option><option value="21.0975">Mitja</option><option value="42.195">Marató</option></select></label>
          <label class="f">Temps<input name="time" placeholder="24:30" required inputmode="numeric"></label>
          <label class="f">Nom<input name="label" placeholder="Test 5 km" maxlength="80"></label>
          <button class="btn primary sm wide" type="submit">Afegir test</button></form>` : ''}
        <div class="list">${[...data.tests].sort((a, b) => String(b.date).localeCompare(String(a.date))).map(t => `<div class="li"><span><b class="mono">${fmtH(t.secs)}</b> · ${esc(t.label || 'Test')} <span class="muted small">${km1(t.dist)} km · ${new Date(t.date).toLocaleDateString('ca-ES')}</span></span>${canWrite() ? `<button class="btn sm ghost" data-deltest="${t.id}">Esborrar</button>` : '<span></span>'}</div>`).join('') || '<p class="muted small">Encara no hi ha tests.</p>'}</div>
      </div>
    </div>
    <div class="card"><span class="eyebrow">Km per setmana</span><div class="chartwrap">${chartSvg()}</div>
      <div class="row small muted"><span><span class="dot" style="--tc:var(--primary);border-radius:2px"></span> Fets</span><span style="color:var(--accent)">- - Pla adaptat</span><span>··· Pla original</span></div></div>
    <div class="card"><span class="eyebrow">Historial d'ajustos ${model.adaptOn ? '' : '(adaptació desactivada)'}</span>
      <div class="hist">${model.history.length ? [...model.history].sort((a, b) => b.week - a.week).map(histRow).join('') : '<p class="muted small">Encara cap ajust: el pla s\'adapta quan acaba cada setmana i quan et saltes o afegeixes sessions.</p>'}</div></div>
    <div class="card"><div class="row between"><span class="eyebrow">Activitats de Strava</span>${stravaBtn()}</div><div class="row between">${data.strava?.last_sync ? `<span class="muted small">Sincronitzat ${new Date(data.strava.last_sync).toLocaleString('ca-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>` : ''}</div>
      <div class="list">${acts.length ? acts.map(a => `<div class="li"><span><b class="mono">${km1(actKm(a))} km</b> · ${esc(a.name || '')}<br><span class="muted small">${dShort(fromIso(actDate(a)))} · ${a.moving_time ? fmt(a.moving_time / actKm(a)) + '/km' : ''}${a.avg_hr ? ' · ' + Math.round(a.avg_hr) + ' ppm' : ''} → ${esc(where(a))}</span></span>${canWrite() ? `<a class="btn sm ghost" href="#setmana/${weekOfDate(plan, fromIso(actDate(a)))}">Veure</a>` : '<span></span>'}</div>`).join('') : `<p class="muted small">${data.strava?.connected ? 'Encara no hi ha curses importades.' : 'Strava no està connectat (Ajustos).'}</p>`}</div></div>`;
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
      <div class="card"><span class="eyebrow">Punt de partida (Strava)</span><ul class="tight">
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
  const s = data.settings; const st = data.strava || {};
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && CONFIG.VAPID_PUBLIC_KEY && !store.demo;
  const publicUrl = location.origin + location.pathname;
  const cal = store.calendarUrl();
  view.innerHTML = `
    <h1>Ajustos</h1>
    ${store.demo ? `<div class="note">Mode demo: les dades es desen en aquest navegador. Omple <span class="mono">web/js/config.js</span> amb les claus de Supabase (vegeu el README) per sincronitzar-ho tot i connectar Strava.</div>` : ''}
    <div class="card"><span class="eyebrow">Compte</span>
      ${store.demo ? '<p class="small">Mode demo: tens permís d\'edició.</p>' : auth.user ? `<div class="row between"><span>${esc(auth.user.email)} ${auth.owner ? '<span class="chip green">propietari</span>' : '<span class="chip">només lectura</span>'}</span><button class="btn sm" id="logout">Tancar sessió</button></div>`
        : `<p class="small muted">Qualsevol persona amb l'enllaç veu el pla. Inicia sessió per editar.</p>
        <form id="login" class="formgrid"><label class="f wide">Correu<input type="email" name="email" autocomplete="username" required></label>
        <label class="f wide">Contrasenya<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary wide" type="submit">Iniciar sessió</button></form>`}
    </div>
    <div class="card"><span class="eyebrow">Cursa i objectiu</span>
      <label class="f">Data de la marató (diumenge)<input type="date" id="raceDate" value="${s.race_date}" ${canWrite() ? '' : 'disabled'}></label>
      <p class="small muted">Si canvia la data, el pla de 25 setmanes es recalcula enrere des del nou diumenge.</p>
      <div class="f" style="display:flex;flex-direction:column;gap:6px"><span>Ritme objectiu</span>
        <div class="seg grid3" role="group" aria-label="Ritme objectiu">${[290, 300, 310, 315, 320, 330].map(v => `<button type="button" data-goal="${v}" aria-pressed="${s.goal_pace === v}" ${canWrite() ? '' : 'disabled'}>${fmt(v)}</button>`).join('')}</div>
        <span class="small muted mono">= ${fmtH(s.goal_pace * 42.195)} a meta</span></div>
      <label class="switch"><span><b>Adaptació automàtica</b><br><span class="small muted">El pla s'ajusta sol al que fas de veritat.</span></span><input type="checkbox" id="adapt" ${s.adapt !== false ? 'checked' : ''} ${canWrite() ? '' : 'disabled'}></label>
    </div>
    <div class="card"><span class="eyebrow">Strava</span>
      ${st.connected ? `<p><span class="chip green">Connectat</span> ${st.last_sync ? `<span class="small muted">Última sincronització: ${new Date(st.last_sync).toLocaleString('ca-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>` : ''}</p>
        <p class="small muted">Les curses noves arriben soles (webhook). Si en falta alguna, sincronitza.</p>
        ${canWrite() ? `<div class="row"><button class="btn sm" id="stSync">Sincronitzar ara</button><button class="btn sm ghost" id="stOff">Desconnectar</button></div>` : ''}`
        : `<p class="small muted">Connecta Strava i cada cursa es marcarà sola amb km, temps, ritme, FC, mapa i parcials.</p>
        ${canWrite() ? `<div class="row"><button class="btn accent" id="stOn" ${store.demo || !CONFIG.STRAVA_CLIENT_ID ? 'disabled' : ''}>Connectar amb Strava</button>${stravaBtn()}</div>
        <p class="small muted">${store.demo || !CONFIG.STRAVA_CLIENT_ID ? 'La connexió automàtica (gratuïta, sense subscripció) s\'activa quan configures Supabase i l\'app de Strava (vegeu el README). Mentrestant, "Importar de Strava" et deixa enganxar la taula d\'activitats o pujar l\'activities.csv.' : ''}</p>` : ''}`}
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
    const line = L.polyline(pts, { color: '#e8611a', weight: 4 }).addTo(m);
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
    const row = { done: !cur.done, km: cur.km ?? null, min: cur.min ?? null, rpe: cur.rpe ?? null, note: cur.note ?? null };
    if (!row.done && row.km == null && row.min == null && row.rpe == null && !row.note) return act(() => store.saveLog(data, id, null), 'Desmarcada');
    return act(() => store.saveLog(data, id, row), row.done ? 'Feta ✓' : 'Desmarcada');
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
    case 'stImport':
      if (data.strava?.connected) {
        t.disabled = true;
        try { const r = await store.invoke('strava-connect', { action: 'sync' }); toast(`${r.saved} curses actualitzades`); await refresh(); } catch (err) { toast('Error: ' + err.message); t.disabled = false; }
        return;
      }
      stravaDialog(); return;
    case 'bkDown': {
      const blob = new Blob([store.exportAll(data)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `marato27-copia-${todayIso()}.json`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Còpia descarregada'); return;
    }
    case 'logout': await store.signOut(); auth = await store.session(); recompute(); render(); return;
    case 'install': installEvt.prompt(); installEvt = null; return;
    case 'stOn': {
      const redirect = location.origin + location.pathname;
      location.href = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(CONFIG.STRAVA_CLIENT_ID)}&response_type=code&approval_prompt=auto&scope=read,activity:read_all&state=strava&redirect_uri=${encodeURIComponent(redirect)}`;
      return;
    }
    case 'stSync': {
      t.disabled = true; t.textContent = 'Sincronitzant…';
      try { const r = await store.invoke('strava-connect', { action: 'sync' }); toast(`${r.saved} curses actualitzades`); await refresh(); } catch (err) { toast('Error: ' + err.message); t.disabled = false; t.textContent = 'Sincronitzar ara'; }
      return;
    }
    case 'stOff': if (confirm('Desconnectar Strava? Les curses ja importades es mantenen.')) { try { await store.invoke('strava-connect', { action: 'disconnect' }); await refresh(); toast('Strava desconnectat'); } catch (err) { toast('Error: ' + err.message); } } return;
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
    const row = { done: cur.done || !!(num(fd.get('km')) || num(fd.get('min'))), km: num(fd.get('km')), min: num(fd.get('min')), rpe: fd.get('rpe') ? +fd.get('rpe') : null, note: String(fd.get('note') || '').slice(0, 500) || null };
    return act(() => store.saveLog(data, id, row), 'Desat ✓');
  }
  if (f.id === 'addForm') {
    const date = f.dataset.date; const type = fd.get('type'); const km = num(fd.get('km')); const min = num(fd.get('min'));
    const name = String(fd.get('name') || '').trim().slice(0, 80) || (ADD_TYPES.find(x => x[0] === type) || [, 'Activitat'])[1];
    const a = { id: -Date.now(), name, sport_type: type, start_date: new Date(date + 'T12:00:00').toISOString(), start_date_local: `${date}T12:00:00Z`,
      distance: km ? Math.round(km * 1000) : 0, moving_time: min ? Math.round(min * 60) : null, elapsed_time: min ? Math.round(min * 60) : null,
      session_id: 'none', ignored: false, rpe: fd.get('rpe') ? +fd.get('rpe') : null, note: String(fd.get('note') || '').slice(0, 500) || null, source: 'manual' };
    addOpen = null;
    return act(() => store.addActivities(data, [a]), 'Activitat afegida ✓');
  }
  if (f.id === 'testForm') {
    const secs = parseT(fd.get('time')); if (!secs) return toast('Escriu el temps com mm:ss o h:mm:ss');
    return act(() => store.addTest(data, { date: fd.get('date'), dist: +fd.get('dist'), secs, label: String(fd.get('label') || '').slice(0, 80) || null }), 'Test desat ✓ · ritmes recalculats');
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
const TABS = ['avui', 'setmana', 'pla', 'progres', 'ritmes', 'ajustos'];
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
  ({ avui: renderAvui, setmana: renderSetmana, pla: renderPla, progres: renderProgres, ritmes: renderRitmes, ajustos: renderAjustos })[tab]();
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
  // Tornada de l'autorització de Strava
  const qs = new URLSearchParams(location.search);
  if (qs.get('state') === 'strava') {
    history.replaceState(null, '', location.pathname + '#ajustos');
    if (qs.get('code') && auth.owner) {
      toast('Connectant amb Strava…');
      try { const r = await store.invoke('strava-connect', { code: qs.get('code') }); toast(`Strava connectat · ${r.saved} curses importades`); }
      catch (e) { toast('Error amb Strava: ' + e.message); }
    } else if (qs.get('error')) toast('Connexió amb Strava cancel·lada');
  }
  await refresh();
  // Refresca en tornar a l'app i a mitjanit
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (route().tab === 'ajustos') render(); });
