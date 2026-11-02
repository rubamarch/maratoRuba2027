// Notificacions push. Es crida cada hora (pg_cron) amb la capçalera x-cron-secret.
// A les 21:00 (hora de Madrid) avisa de la sessió de demà; a les 8:00, de la d'avui.
// El propietari pot enviar una notificació de prova: POST { test: true } amb el seu JWT.
import webpush from 'npm:web-push@3.6.7';
import { admin, cors, env, json, loadPlanData, madridNow, requireOwner } from '../_shared/server.ts';
import { buildPlan, fromIso, addDays, iso, TYPES, isRun, SLOT_ORDER } from '../_shared/plan.js';
import { computeModel, modelSessionsOn } from '../_shared/adapt.js';

async function sendAll(payload: Record<string, unknown>) {
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const db = admin();
  const { data: subs } = await db.from('push_subscriptions').select('*');
  let sent = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push', code, e);
    }
  }
  return sent;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const isCron = req.headers.get('x-cron-secret') === env('CRON_SECRET');
    if (!isCron) {
      if (body.test && await requireOwner(req)) {
        const sent = await sendAll({ title: 'Marató 2027', body: 'Notificacions activades ✓', url: './#avui' });
        return json({ ok: true, sent });
      }
      return json({ error: 'No autoritzat' }, 401);
    }
    const now = madridNow();
    const mode = body.force || (now.hour === 21 ? 'evening' : now.hour === 8 ? 'morning' : null);
    if (!mode) return json({ ok: true, skipped: now.hour });
    const db = admin();
    const data = await loadPlanData(db);
    const plan = buildPlan(data.settings.race_date || undefined);
    const model = computeModel(plan, data, now.iso);
    const target = mode === 'evening' ? addDays(fromIso(now.iso), 1) : fromIso(now.iso);
    const ss = modelSessionsOn(plan, model, target)
      .filter(s => !model.done(s.id))
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
    if (!ss.length) return json({ ok: true, rest: true });
    const label = (s: typeof ss[number]) => `${TYPES[s.type as keyof typeof TYPES].icon} ${model.title(s)}${isRun(s.type) && model.km(s) ? ` (${String(model.km(s)).replace('.', ',')} km)` : ''}`;
    const sent = await sendAll({
      title: mode === 'evening' ? 'Demà toca entrenar' : 'Avui toca entrenar',
      body: ss.map(label).join('\n'),
      url: `./#dia/${iso(target)}`,
      tag: `ses-${iso(target)}-${mode}`
    });
    return json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
