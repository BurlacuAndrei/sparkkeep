// Sparkkeep service worker: app shell offline, network-first data.
const CACHE = 'sparkkeep-v2'
const SHELL = ['/', '/manifest.json', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/assets/')) {
    e.respondWith(networkFirst(req))
  }
})

// Network-first: fresh data when reachable, last-known copy offline.
// Navigations fall back to the cached shell so deep links still boot.
async function networkFirst(req) {
  try {
    const res = await fetch(req)
    if (res.ok) await put(req, res)
    return res
  } catch {
    return (await caches.match(req)) || (await caches.match('/'))
  }
}


async function put(req, res) {
  const c = await caches.open(CACHE)
  await c.put(req, res.clone())
}