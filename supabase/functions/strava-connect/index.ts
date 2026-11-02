// POST (propietari): { code } connecta Strava · { action: 'sync', full? } importa curses · { action: 'disconnect' }
import { admin, cors, json, requireOwner } from '../_shared/server.ts';
import { exchangeCode, backfill, accessToken } from '../_shared/strava.ts';
import { buildPlan } from '../_shared/plan.js';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!(await requireOwner(req))) return json({ error: 'Només el propietari' }, 401);
    const body = await req.json().catch(() => ({}));
    const db = admin();
    const { data: s } = await db.from('settings').select('race_date').eq('id', 1).maybeSingle();
    const plan = buildPlan(s?.race_date || undefined);
    // importem des de 2 setmanes abans de l'inici del pla
    const after = Math.floor((plan.start.getTime() - 14 * 864e5) / 1000);

    if (body.code) {
      const t = await exchangeCode(String(body.code));
      await db.from('strava_tokens').upsert({
        id: 1, athlete_id: t.athlete?.id ?? null, access_token: t.access_token, refresh_token: t.refresh_token,
        expires_at: t.expires_at, updated_at: new Date().toISOString()
      });
      const saved = await backfill(db, after);
      return json({ ok: true, saved });
    }
    if (body.action === 'sync') {
      const saved = await backfill(db, after, body.full ? 200 : 40);
      return json({ ok: true, saved });
    }
    if (body.action === 'disconnect') {
      const token = await accessToken(db).catch(() => null);
      if (token) await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      await db.from('strava_tokens').delete().eq('id', 1);
      return json({ ok: true });
    }
    return json({ error: 'Petició no vàlida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
