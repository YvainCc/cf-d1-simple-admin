const CACHE_NAME = 'dmn-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/member',
  '/manifest.json',
  '/icons/19f734a3d8000319d1fa98d12fab4ce1.png',
  '/icons/b542b5d7dcafe6d6905e1d8bf5d7b8b3.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('Cache addAll error', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  // 只处理 GET 请求，且不处理 API 请求
  if (request.method !== 'GET' || request.url.includes('/api/')) {
    return;
  }
  event.respondWith(
    fetch(request).then(response => {
      // 只缓存成功的响应（状态码 200），避免缓存重定向或错误页面
      if (response.status === 200) {
        const clonedResponse = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, clonedResponse);
        });
      }
      return response;
    }).catch(() => {
      // 如果网络请求失败，尝试从缓存中获取
      return caches.match(request);
    })
  );
});
