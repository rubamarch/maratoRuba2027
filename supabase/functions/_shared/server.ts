// Utilitats comunes de les Edge Functions.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const env = (k: string, required = true) => {
  const v = Deno.env.get(k);
  if (!v && required) throw new Error(`Falta el secret ${k}`);
  return v || '';
};

export const admin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

/** Comprova que la petició ve del propietari (JWT d'usuari a la taula owners). */
export async function requireOwner(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  const db = admin();
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) return false;
  const { data: row } = await db.from('owners').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return !!row;
}

/** Data d'avui i hora a Europe/Madrid. */
export function madridNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false
  }).formatToParts(d).map(x => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}

/** Carrega totes les dades necessàries per calcular el pla adaptat. */
export async function loadPlanData(db: SupabaseClient) {
  const [settings, logs, moves, weeks, tests, acts] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).maybeSingle(),
    db.from('logs').select('*'),
    db.from('moves').select('*'),
    db.from('weeks').select('*'),
    db.from('tests').select('*'),
    db.from('activities').select('id,start_date_local,distance,moving_time,session_id,ignored')
  ]);
  return {
    settings: settings.data || {},
    logs: Object.fromEntries((logs.data || []).map(r => [r.session_id, r])),
    moves: Object.fromEntries((moves.data || []).map(r => [r.session_id, r.date])),
    weeks: Object.fromEntries((weeks.data || []).map(r => [r.week, r])),
    tests: tests.data || [],
    activities: acts.data || []
  };
}
