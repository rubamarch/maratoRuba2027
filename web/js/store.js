// Capa de dades: Supabase si està configurat; si no, "mode demo" amb localStorage.
import { CONFIG } from './config.js';

const CACHE = 'marato27-cache-v1';
const DEMO = 'marato27-demo-v1';
const empty = () => ({ settings: { race_date: '2027-04-25', goal_pace: 300, adapt: true }, logs: {}, moves: {}, weeks: {}, tests: [], activities: [], strava: { connected: false } });
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sense espai o bloquejat */ } };

export const demo = !CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_ANON_KEY;
let sb = null;

export async function init() {
  // Demana al navegador que no esborri les dades locals (cau i mode demo) quan falta espai.
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* no disponible */ }
  if (demo) return { user: { email: 'demo' }, owner: true };
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return await session();
}

export async function session() {
  if (demo) return { user: { email: 'demo' }, owner: true };
  const { data } = await sb.auth.getSession();
  const user = data.session?.user || null;
  let owner = false;
  if (user) { const r = await sb.rpc('is_owner'); owner = r.data === true; }
  return { user, owner };
}
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return await session();
}
export async function signOut() { await sb.auth.signOut(); }

export const cached = () => lsGet(demo ? DEMO : CACHE) || empty();

export async function loadAll() {
  if (demo) return lsGet(DEMO) || empty();
  const q = t => sb.from(t).select('*');
  const [settings, logs, moves, weeks, tests, acts, strava] = await Promise.all([
    sb.from('settings').select('*').eq('id', 1).maybeSingle(), q('logs'), q('moves'), q('weeks'), q('tests'),
    sb.from('activities').select('*').order('start_date_local'), sb.rpc('strava_status')
  ]);
  for (const r of [settings, logs, moves, weeks, tests, acts]) if (r.error) throw r.error;
  const data = {
    settings: { ...empty().settings, ...(settings.data || {}) },
    logs: Object.fromEntries(logs.data.map(r => [r.session_id, r])),
    moves: Object.fromEntries(moves.data.map(r => [r.session_id, r.date])),
    weeks: Object.fromEntries(weeks.data.map(r => [r.week, r])),
    tests: tests.data,
    activities: acts.data,
    strava: strava.data || { connected: false }
  };
  lsSet(CACHE, data);
  return data;
}

// ---- Escriptures. Reben l'estat local (ja actualitzat de manera optimista). ----
const persistDemo = d => lsSet(DEMO, d);
const chk = r => { if (r.error) throw r.error; return r; };

export async function saveLog(d, id, row) {
  if (row) d.logs[id] = { session_id: id, ...row }; else delete d.logs[id];
  if (demo) return persistDemo(d);
  if (row) chk(await sb.from('logs').upsert({ session_id: id, ...row, updated_at: new Date().toISOString() }));
  else chk(await sb.from('logs').delete().eq('session_id', id));
}
export async function saveMove(d, id, date) {
  if (date) d.moves[id] = date; else delete d.moves[id];
  if (demo) return persistDemo(d);
  if (date) chk(await sb.from('moves').upsert({ session_id: id, date }));
  else chk(await sb.from('moves').delete().eq('session_id', id));
}
export async function saveWeek(d, week, padel_sat) {
  d.weeks[week] = { week, padel_sat };
  if (demo) return persistDemo(d);
  chk(await sb.from('weeks').upsert({ week, padel_sat }));
}
export async function saveSettings(d, patch) {
  Object.assign(d.settings, patch);
  if (demo) return persistDemo(d);
  chk(await sb.from('settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1));
}
export async function addTest(d, t) {
  if (demo) { d.tests.push({ id: 't' + Date.now(), ...t }); return persistDemo(d); }
  const r = chk(await sb.from('tests').insert(t).select().single());
  d.tests.push(r.data);
}
export async function deleteTest(d, id) {
  d.tests = d.tests.filter(t => t.id !== id);
  if (demo) return persistDemo(d);
  chk(await sb.from('tests').delete().eq('id', id));
}
export async function setActivity(d, id, patch) {
  const a = d.activities.find(x => String(x.id) === String(id)); if (a) Object.assign(a, patch);
  if (demo) return persistDemo(d);
  chk(await sb.from('activities').update(patch).eq('id', id));
}
// ---- Activitats manuals i importades (pàdel, gimnàs, curses fora del pla, Strava sense connexió) ----
const ACT_COLS = ['id', 'name', 'sport_type', 'start_date', 'start_date_local', 'distance', 'moving_time', 'elapsed_time', 'avg_hr', 'max_hr', 'elevation', 'polyline', 'splits', 'session_id', 'ignored', 'rpe', 'note', 'source'];
const actRow = a => Object.fromEntries(ACT_COLS.filter(k => a[k] !== undefined).map(k => [k, a[k]]));
export async function addActivities(d, list) {
  if (!list.length) return;
  const have = new Set(d.activities.map(a => String(a.id)));
  const fresh = list.filter(a => !have.has(String(a.id)));
  if (!fresh.length) return;
  if (!demo) chk(await sb.from('activities').upsert(fresh.map(actRow), { onConflict: 'id', ignoreDuplicates: true }));
  d.activities.push(...fresh);
  if (demo) persistDemo(d);
}
export async function deleteActivity(d, id) {
  d.activities = d.activities.filter(a => String(a.id) !== String(id));
  if (demo) return persistDemo(d);
  chk(await sb.from('activities').delete().eq('id', id));
}

// ---- Còpia de seguretat ----
export function exportAll(d) {
  return JSON.stringify({ app: 'marato27', version: 1, exported: new Date().toISOString(), ...d, strava: undefined }, null, 1);
}
export async function importAll(d, j) {
  if (!j || j.app !== 'marato27') throw new Error('Aquest fitxer no és una còpia del pla.');
  const logs = j.logs || {}, moves = j.moves || {}, weeks = j.weeks || {};
  const tests = j.tests || [], acts = j.activities || [];
  if (demo) {
    Object.assign(d.settings, j.settings || {}); Object.assign(d.logs, logs); Object.assign(d.moves, moves); Object.assign(d.weeks, weeks);
    const tIds = new Set(d.tests.map(t => String(t.id))); d.tests.push(...tests.filter(t => !tIds.has(String(t.id))));
    const aIds = new Set(d.activities.map(a => String(a.id))); d.activities.push(...acts.filter(a => !aIds.has(String(a.id))));
    return persistDemo(d);
  }
  if (j.settings) { const { race_date, goal_pace, adapt } = j.settings; chk(await sb.from('settings').update({ race_date, goal_pace, adapt, updated_at: new Date().toISOString() }).eq('id', 1)); }
  const lr = Object.entries(logs).map(([id, r]) => ({ session_id: id, done: !!r.done, km: r.km ?? null, min: r.min ?? null, rpe: r.rpe ?? null, note: r.note ?? null }));
  if (lr.length) chk(await sb.from('logs').upsert(lr));
  const mr = Object.entries(moves).map(([id, date]) => ({ session_id: id, date }));
  if (mr.length) chk(await sb.from('moves').upsert(mr));
  const wr = Object.values(weeks).map(w => ({ week: w.week, padel_sat: !!w.padel_sat }));
  if (wr.length) chk(await sb.from('weeks').upsert(wr));
  const tIds = new Set(d.tests.map(t => `${t.date}|${t.dist}|${t.secs}`));
  const tr = tests.filter(t => !tIds.has(`${t.date}|${t.dist}|${t.secs}`)).map(({ date, dist, secs, label }) => ({ date, dist, secs, label: label ?? null }));
  if (tr.length) chk(await sb.from('tests').insert(tr));
  if (acts.length) chk(await sb.from('activities').upsert(acts.map(actRow), { onConflict: 'id', ignoreDuplicates: true }));
}

export async function invoke(fn, body) {
  if (demo) throw new Error('Configura Supabase per fer servir aquesta funció.');
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j.error) msg = j.error; } catch { /* resposta sense JSON */ }
    throw new Error(msg);
  }
  return data;
}
export async function savePushSub(sub) {
  const j = sub.toJSON();
  chk(await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }));
}
export async function deletePushSub(endpoint) { chk(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)); }
export const calendarUrl = () => demo ? '' : `${CONFIG.SUPABASE_URL}/functions/v1/calendar`;
