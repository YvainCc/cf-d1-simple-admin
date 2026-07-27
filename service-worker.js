// service-worker.js
// 版本号：v2（修改此版本号可强制所有用户更新缓存）

const CACHE_NAME = 'dmn-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/member.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// ========== 安装时缓存关键资源 ==========
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 缓存静态资源成功');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch(err => {
        console.warn('[SW] 缓存失败', err);
        // 即使缓存失败，也不阻塞安装
      })
  );
  // 跳过等待，立即激活
  self.skipWaiting();
});

// ========== 激活时清理旧缓存 ==========
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] 删除旧缓存:', key);
              return caches.delete(key);
            })
      );
    })
  );
  // 立即控制所有客户端
  self.clients.claim();
});

// ========== 拦截请求，优先从缓存返回 ==========
self.addEventListener('fetch', event => {
  const request = event.request;
  
  // 只处理 GET 请求
  if (request.method !== 'GET') {
    return;
  }
  
  // 对于 API 请求，直接走网络，不缓存
  if (request.url.includes('/api/')) {
    return;
  }
  
  // 对于 HTML 页面请求，优先走网络（保证最新），网络失败则走缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // 克隆响应并缓存
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }
  
  // 对于其他静态资源（图片、CSS、JS等），优先从缓存读取
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) {
          return cached;
        }
        // 如果缓存没有，则从网络获取
        return fetch(request).then(response => {
          // 缓存新资源（仅成功响应）
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
      .catch(() => {
        // 如果网络和缓存都失败，返回离线提示
        return new Response('网络连接失败，请检查网络后重试', { 
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
