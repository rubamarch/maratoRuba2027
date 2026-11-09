// Service worker: app instal·lable, funciona sense cobertura i rep notificacions push.
const VERSION = 'v3';
const SHELL = `marato27-shell-${VERSION}`;
const RUNTIME = 'marato27-runtime';
const FILES = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/config.js',
  'js/shared/plan.js', 'js/shared/pace.js', 'js/shared/adapt.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('marato27-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Dades de Supabase i Strava: sempre xarxa (l'app ja guarda una còpia local).
  if (url.hostname.endsWith('supabase.co') || url.hostname.includes('strava.com')) return;
  if (url.origin === location.origin) {
    // Xarxa primer per tenir sempre la darrera versió; si no hi ha connexió, la còpia.
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(SHELL).then(ca => ca.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('index.html'))));
    return;
  }
  // CDN (llibreries, fonts, mapes): còpia primer.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(RUNTIME).then(ca => ca.put(req, c)); }
    return r;
  })));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Marató 2027', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Marató 2027', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, data: { url: d.url || './#avui' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#avui', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
