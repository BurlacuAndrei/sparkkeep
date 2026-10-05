// Sparkkeep service worker: app shell offline, network-first data,
// cache-first hashed bundles.
const CACHE = 'sparkkeep-v1'
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

  if (req.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req))
  } else if (url.pathname.startsWith('/assets/')) {
    e.respondWith(cacheFirst(req))
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

// Cache-first: /assets/* filenames are content-hashed by the build.
async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await put(req, res)
  return res
}

async function put(req, res) {
  const c = await caches.open(CACHE)
  await c.put(req, res.clone())
}