// Calendari .ics públic amb el pla adaptat. Subscriu-t'hi des de Google Calendar.
import { admin, cors, loadPlanData, madridNow } from '../_shared/server.ts';
import { buildPlan, iso, addDays, TYPES, isRun, stripHtml } from '../_shared/plan.js';
import { zones, fillPaces } from '../_shared/pace.js';
import { computeModel } from '../_shared/adapt.js';

const esc = (s: string) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const out: string[] = []; let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur); return out.join('\r\n');
}
const ymd = (d: Date) => iso(d).replace(/-/g, '');

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = admin();
  const data = await loadPlanData(db);
  const plan = buildPlan(data.settings.race_date || undefined);
  const model = computeModel(plan, data, madridNow().iso);
  const z = zones(data.tests, data.settings.goal_pace || 300);
  const site = Deno.env.get('SITE_URL') || '';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//maratoRuba2027//CA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Marató Vies Verdes 2027', 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  for (const s of plan.sessions) {
    if (!model.active(s)) continue;
    const d = model.date(s);
    const km = model.km(s);
    const t = TYPES[s.type as keyof typeof TYPES];
    const done = model.done(s.id) ? '✓ ' : '';
    const summary = `${done}${t.icon} ${model.title(s)}${isRun(s.type) && km ? ` · ${String(km).replace('.', ',')} km` : ''}`;
    const notes = (model.adj[s.id]?.notes || []).join('\n');
    const desc = `${t.n} · Setmana ${s.week}\n\n${stripHtml(fillPaces(s.detail, z))}${notes ? '\n\n' + notes : ''}${site ? '\n\n' + site + '#setmana/' + s.week : ''}`;
    lines.push('BEGIN:VEVENT', `UID:${s.id}@maratoruba2027`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(addDays(d, 1))}`,
      fold(`SUMMARY:${esc(summary)}`), fold(`DESCRIPTION:${esc(desc)}`), 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return new Response(lines.join('\r\n') + '\r\n', {
    headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="marato-2027.ics"', 'Cache-Control': 'max-age=900' }
  });
});
