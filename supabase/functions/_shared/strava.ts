// Client mínim de l'API de Strava.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { env } from './server.ts';

const API = 'https://www.strava.com/api/v3';
export const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];

export async function exchangeCode(code: string) {
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), code, grant_type: 'authorization_code' })
  });
  if (!r.ok) throw new Error(`Strava token: ${r.status} ${await r.text()}`);
  return await r.json();
}

/** Retorna un access token vàlid (el renova si cal). */
export async function accessToken(db: SupabaseClient): Promise<string | null> {
  const { data: t } = await db.from('strava_tokens').select('*').eq('id', 1).maybeSingle();
  if (!t || !t.refresh_token) return null;
  if (t.expires_at && t.expires_at - 120 > Date.now() / 1000) return t.access_token;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env('STRAVA_CLIENT_ID'), client_secret: env('STRAVA_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: t.refresh_token })
  });
  if (!r.ok) throw new Error(`Strava refresh: ${r.status}`);
  const j = await r.json();
  await db.from('strava_tokens').update({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, updated_at: new Date().toISOString() }).eq('id', 1);
  return j.access_token;
}

export async function stravaGet(token: string, path: string) {
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Strava ${path}: ${r.status}`);
  return await r.json();
}

/** Desa una activitat detallada (només si és de córrer). No toca session_id ni ignored. */
export async function upsertActivity(db: SupabaseClient, a: any) {
  if (!RUN_TYPES.includes(a.sport_type || a.type)) {
    await db.from('activities').delete().eq('id', a.id); // per si ha canviat de tipus
    return false;
  }
  const row = {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type || a.type,
    start_date: a.start_date,
    start_date_local: a.start_date_local,
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    avg_hr: a.average_heartrate ?? null,
    max_hr: a.max_heartrate ?? null,
    elevation: a.total_elevation_gain ?? null,
    polyline: a.map?.polyline || a.map?.summary_polyline || null,
    splits: (a.splits_metric || []).map((s: any) => ({
      km: s.split, d: s.distance, t: s.moving_time, hr: s.average_heartrate ?? null, el: s.elevation_difference ?? null
    })),
    updated_at: new Date().toISOString()
  };
  const { error } = await db.from('activities').upsert(row, { onConflict: 'id' });
  if (error) throw error;
  return true;
}

/** Importa les curses des d'una data (epoch en segons). Retorna quantes s'han desat. */
export async function backfill(db: SupabaseClient, afterEpoch: number, maxDetail = 80) {
  const token = await accessToken(db);
  if (!token) throw new Error('Strava no connectat');
  const { data: have } = await db.from('activities').select('id');
  const known = new Set((have || []).map((r: any) => String(r.id)));
  let saved = 0, detail = 0;
  for (let page = 1; page <= 5; page++) {
    const list = await stravaGet(token, `/athlete/activities?after=${afterEpoch}&per_page=100&page=${page}`);
    if (!list || !list.length) break;
    for (const s of list) {
      if (!RUN_TYPES.includes(s.sport_type || s.type)) continue;
      if (known.has(String(s.id)) || detail >= maxDetail) {
        if (!known.has(String(s.id))) { await upsertActivity(db, s); saved++; }
        continue;
      }
      const full = await stravaGet(token, `/activities/${s.id}`); detail++;
      if (full && await upsertActivity(db, full)) saved++;
    }
    if (list.length < 100) break;
  }
  await db.from('strava_tokens').update({ last_sync: new Date().toISOString() }).eq('id', 1);
  return saved;
}
