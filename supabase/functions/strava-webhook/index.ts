// Webhook de Strava: GET = validació de la subscripció · POST = esdeveniment d'activitat.
import { admin, env } from '../_shared/server.ts';
import { accessToken, stravaGet, upsertActivity } from '../_shared/strava.ts';

async function handle(ev: any) {
  const db = admin();
  const { data: t } = await db.from('strava_tokens').select('athlete_id').eq('id', 1).maybeSingle();
  if (!t || String(t.athlete_id) !== String(ev.owner_id)) return; // no és el nostre atleta
  if (ev.object_type === 'athlete' && ev.updates?.authorized === 'false') {
    await db.from('strava_tokens').delete().eq('id', 1);
    return;
  }
  if (ev.object_type !== 'activity') return;
  if (ev.aspect_type === 'delete') { await db.from('activities').delete().eq('id', ev.object_id); return; }
  const token = await accessToken(db);
  if (!token) return;
  const a = await stravaGet(token, `/activities/${ev.object_id}`);
  if (a) await upsertActivity(db, a);
  else await db.from('activities').delete().eq('id', ev.object_id);
  await db.from('strava_tokens').update({ last_sync: new Date().toISOString() }).eq('id', 1);
}

Deno.serve(async req => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('STRAVA_VERIFY_TOKEN')) {
      return new Response(JSON.stringify({ 'hub.challenge': url.searchParams.get('hub.challenge') }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Forbidden', { status: 403 });
  }
  if (req.method === 'POST') {
    const ev = await req.json().catch(() => null);
    if (ev) {
      // Strava vol resposta en < 2 s: processem en segon pla.
      const p = handle(ev).catch(e => console.error('webhook', e));
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) rt.waitUntil(p); else await p;
    }
    return new Response('ok');
  }
  return new Response('Method not allowed', { status: 405 });
});
