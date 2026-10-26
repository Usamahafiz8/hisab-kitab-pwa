/* Hisab Kitab service worker: offline app shell + reminder notifications. */
const CACHE = 'hk-v1';
const SHELL = ['/', '/ledger/', '/contact/', '/settings/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets never change: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      })),
    );
    return;
  }

  // Pages and everything else: network-first so updates arrive, cache when offline.
  event.respondWith(
    fetch(req).then(res => {
      if (res.ok && (req.mode === 'navigate' || url.pathname.match(/\.(png|webmanifest|txt|json|ico|woff2?)$/))) {
        const copy = res.clone();
        // Pages are cached without their query string (?id=…) — they're all client-rendered
        caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? url.pathname : req, copy));
      }
      return res;
    }).catch(async () => {
      if (req.mode === 'navigate') {
        return (await caches.match(url.pathname)) || (await caches.match('/'));
      }
      return caches.match(req);
    }),
  );
});

// ── Reminders ────────────────────────────────────────────────────────────────
// Reads the same IndexedDB the app writes (src/lib/db.ts). Never creates the DB.

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('hisab_kitab');
    req.onupgradeneeded = () => req.transaction.abort(); // app hasn't created it yet
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('reminders')) { db.close(); reject(new Error('no db')); return; }
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function reqP(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let checking = null;
function checkReminders() {
  if (checking) return checking;
  checking = (async () => {
    if (self.Notification && Notification.permission !== 'granted') return;
    let db;
    try { db = await openDb(); } catch { return; }
    try {
      const settingsTx = db.transaction('settings', 'readonly');
      const get = key => reqP(settingsTx.objectStore('settings').get(key)).then(r => (r ? r.value : null));
      const [notifOn, dailyOn, dailyLast, dailyTitle, dailyBody] = await Promise.all(
        ['notifications', 'dailySummary', 'dailySummaryLast', 'dailySummaryTitle', 'dailySummaryBody'].map(get),
      );
      if (notifOn !== 'on') return;

      const now = new Date();
      const due = (await reqP(db.transaction('reminders', 'readonly').objectStore('reminders').getAll()))
        .filter(r => !r.fired && r.fire_at <= now.getTime());
      for (const r of due) {
        await self.registration.showNotification(r.title, { body: r.body, icon: '/icon-192.png', badge: '/icon-192.png', tag: r.id });
        const tx = db.transaction('reminders', 'readwrite');
        tx.objectStore('reminders').put({ ...r, fired: true });
      }

      const today = localDate(now);
      if (dailyOn === 'on' && now.getHours() >= 9 && dailyLast !== today) {
        await self.registration.showNotification(dailyTitle || 'Daily Summary', {
          body: dailyBody || 'Tap to review your accounts', icon: '/icon-192.png', badge: '/icon-192.png', tag: 'daily_summary',
        });
        db.transaction('settings', 'readwrite').objectStore('settings').put({ key: 'dailySummaryLast', value: today });
      }
    } finally {
      db.close();
    }
  })().finally(() => { checking = null; });
  return checking;
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'check-reminders') event.waitUntil(checkReminders());
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'hk-reminders') event.waitUntil(checkReminders());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
