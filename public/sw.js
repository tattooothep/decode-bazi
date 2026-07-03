/*
 * Hourkey PWA Service Worker · r376 (Phase A · canary)
 * vanilla — ไม่มี workbox/CDN (CSP same-origin เท่านั้น)
 *
 * กติกาเหล็ก (ตาม docs/PWA-PLAN-r376.md §1.2):
 *   1. method !== GET            → ไม่แตะ
 *   2. cross-origin              → ไม่แตะ
 *   3. /api/*                    → ไม่แตะเด็ดขาด (sifu stream / fusion poll / maps-script)
 *   4. navigation (HTML)         → network-ONLY · ออฟไลน์เท่านั้นถึงเสิร์ฟ offline.html
 *   5. static ?v= + /icons/*     → cache-first (ยกเว้น hk-user-menu.js + mobile-safe.css)
 *   6. อื่น ๆ                     → ไม่แตะ
 */

const HK_SW_VERSION = 'r376';
const CACHE_NAME = 'hk-pwa-' + HK_SW_VERSION;

const PRECACHE_URLS = [
  '/offline.html',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon-180.png'
];

/* 2 ไฟล์ kill-switch เดิม (no-store) — ห้าม SW cache เด็ดขาด */
const NEVER_CACHE_PATHS = ['/js/hk-user-menu.js', '/css/mobile-safe.css'];

const CACHEABLE_DESTINATIONS = ['script', 'style', 'image', 'font'];

const FLAG_URL = '/pwa-flag.json';
const FLAG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; /* 24 ชม. */
let lastFlagCheckAt = 0;

/* ---- kill-switch: flag=off → unregister ตัวเอง + ล้าง cache ---- */
async function checkPwaFlag() {
  lastFlagCheckAt = Date.now();
  try {
    const res = await fetch(FLAG_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.pwa === 'off') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
    }
  } catch (_) {
    /* เน็ตล่ม/parse พัง → เงียบ · รอบหน้าเช็คใหม่ */
  }
}

function maybeRecheckFlag(event) {
  if (Date.now() - lastFlagCheckAt > FLAG_CHECK_INTERVAL_MS) {
    try { event.waitUntil(checkPwaFlag()); } catch (_) {}
  }
}

/* ---- install: precache offline.html + icons · skipWaiting ไม่มีเงื่อนไข ---- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
    } catch (_) {
      /* precache fail บางไฟล์ (mixed-version window ระหว่าง rolling restart)
         → ไม่ block install · offline fallback มี guard ฝั่ง fetch อยู่แล้ว */
    }
    await self.skipWaiting();
  })());
});

/* ---- activate: ลบ cache เวอร์ชันเก่า + claim + เช็ค flag ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.indexOf('hk-pwa-') === 0 && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      );
    } catch (_) {}
    await self.clients.claim();
    await checkPwaFlag();
  })());
});

/* ---- fetch: ด่านตัดเรียงตามลำดับ · หลุดทุกด่าน = return (browser จัดการเองเหมือนไม่มี SW) ---- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  /* ด่าน 1: GET เท่านั้น */
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  /* ด่าน 2: same-origin เท่านั้น (Google Maps/jsdelivr/fonts ไม่แตะ) */
  if (url.origin !== self.location.origin) return;

  /* ด่าน 3: /api/* ไม่แตะเด็ดขาด — return ทันที ก่อนเข้า logic ใด ๆ */
  if (url.pathname.startsWith('/api/')) return;

  /* ด่าน 4: navigation (HTML) = network-ONLY + offline fallback */
  if (req.mode === 'navigate') {
    maybeRecheckFlag(event);
    event.respondWith(
      fetch(req).catch(async () => {
        try {
          const cache = await caches.open(CACHE_NAME);
          const offline = await cache.match('/offline.html');
          if (offline) return offline;
        } catch (_) {}
        return new Response('offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
    );
    return;
  }

  /* ด่าน 5: cache-first เฉพาะ icons/favicon + static ที่มี ?v= */
  const isIconAsset = url.pathname.startsWith('/icons/') || url.pathname === '/favicon.svg';
  const isVersionedStatic =
    url.searchParams.has('v') &&
    CACHEABLE_DESTINATIONS.indexOf(req.destination) !== -1 &&
    NEVER_CACHE_PATHS.indexOf(url.pathname) === -1;

  if (isIconAsset || isVersionedStatic) {
    event.respondWith(cacheFirst(req));
    return;
  }

  /* ด่าน 6: อื่น ๆ ทั้งหมด — ไม่แตะ */
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  try {
    if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
      await cache.put(req, res.clone());
    }
  } catch (_) {}
  return res;
}
