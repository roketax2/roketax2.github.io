/*
 * StalZone Calc AI — работа без сети (2026-10-18).
 *
 * Один раз открытый сайт дальше открывается и считает даже без интернета или при плохой связи:
 * подбор, калькулятор и ТТК считают в браузере, нужны только страница, скрипты и данные.
 *  - Страница, данные расчёта, описания, список изменений — сначала сеть (чтобы после выкладки
 *    сразу было новое), а без сети или если сеть молчит дольше 6 секунд — сохранённая копия.
 *  - Скрипты /_next/static, шрифты и картинки сайта — из копии: их имена меняются вместе с
 *    содержимым, сами файлы — никогда.
 *  - Чужие адреса (API аккаунтов и счётчика, картинки предметов с CDN, YouTube) не трогаем.
 * Меняешь логику — подними VERSION: старые копии удалятся.
 */
const VERSION = "v1";
const PAGES = `stalzone-pages-${VERSION}`;
const STATIC = `stalzone-static-${VERSION}`;
const STATIC_LIMIT = 400;
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  // Главное — сразу: тогда сайт откроется без сети даже после первого же захода.
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.addAll(["/", "/engine-data.json"]))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      for (const key of await caches.keys()) if (key.startsWith("stalzone-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

const isStatic = (path) =>
  path.startsWith("/_next/static/") || /\.(?:webp|png|jpe?g|svg|woff2?|ico)$/.test(path) || path === "/icon" || path === "/apple-icon";
const isData = (path) =>
  path === "/" ||
  path.endsWith(".html") ||
  path.endsWith(".txt") ||
  path === "/engine-data.json" ||
  path === "/patch-notes.json" ||
  path === "/manifest.webmanifest" ||
  path.startsWith("/api/item-description/");

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    // Страница у сайта одна — копия хранится под «/», с какими бы параметрами её ни открыли (?b=…).
    event.respondWith(networkFirst(request, url.pathname === "/" ? "/" : null));
    return;
  }
  if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isData(url.pathname)) event.respondWith(networkFirst(request, null));
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(PAGES);
  const key = cacheKey ?? request;
  const network = fetch(request).then((response) => {
    if (response.ok && response.type === "basic") cache.put(key, response.clone()).catch(() => undefined);
    return response;
  });
  const cached = await cache.match(key, { ignoreSearch: cacheKey !== null });
  if (!cached) return network;
  return Promise.race([
    network.catch(() => cached),
    new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS)),
  ]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone()).catch(() => undefined);
    trim(cache);
  }
  return response;
}

/** Старые чанки прошлых выкладок копятся — держим не больше STATIC_LIMIT файлов. */
async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - STATIC_LIMIT; i++) await cache.delete(keys[i]);
}
