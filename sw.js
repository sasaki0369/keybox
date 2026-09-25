/* かぎ箱 service worker
   ・アプリ本体（index.html）をキャッシュして、電波がなくても起動できるようにする
   ・パスワードのデータには一切触れない（データは localStorage にあり、ここでは扱わない）
   ・通信できるときは常に新しい index.html を取りに行く（ネットワーク優先）ので、
     GitHub に上げた更新は次に開いたときに反映される */
const CACHE = 'kagibako-shell-v1';
const SHELL = ['./', './index.html'];
const TIMEOUT_MS = 3000; // 電波が弱いときは3秒待ってキャッシュに切り替える

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('kagibako-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // 外部には関与しない
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  if (!isPage) return; // index.html 以外（sw.js 自体など）はブラウザにまかせる

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req, { cache: 'no-cache' }), TIMEOUT_MS);
    if (res && res.ok && res.type === 'basic') {
      // 取れた最新版を保存（どのURLで開いても同じ本体を返せるよう ./ にまとめる）
      cache.put('./', res.clone());
    }
    return res;
  } catch (e) {
    const hit = (await cache.match('./')) || (await cache.match('./index.html'));
    if (hit) return hit;
    return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:sans-serif;padding:24px">オフラインです。一度インターネットにつないで開くと、次からは電波がなくても使えます。</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
