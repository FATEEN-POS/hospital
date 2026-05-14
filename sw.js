// ============================================================
// SERVICE WORKER — مستشفى النيل
// يحفظ كل الملفات في cache أول مرة بالإنترنت
// وبعدين يشتغل أوفلاين بدون نت خالص
// ============================================================

const CACHE_NAME = 'hospital-nile-v1';

// كل الملفات اللي محتاجين نحفظها
const URLS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js',
  'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;900&family=Tajawal:wght@300;400;500;700;900&display=swap',
];

// ============================================================
// INSTALL — أول تشغيل: حفظ كل الملفات في الكاش
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] جاري حفظ الملفات في الكاش...');
      // نحفظ كل ملف على حدة عشان لو ملف واحد فشل ميوقفش الباقي
      return Promise.allSettled(
        URLS_TO_CACHE.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] فشل حفظ:', url, err.message)
          )
        )
      );
    }).then(() => {
      console.log('[SW] تم التثبيت بنجاح ✅');
      return self.skipWaiting(); // ابدأ فوراً بدون انتظار
    })
  );
});

// ============================================================
// ACTIVATE — تنظيف الكاشات القديمة
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] حذف كاش قديم:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — كل طلب: ابحث في الكاش أولاً
// ============================================================
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // موجود في الكاش → رجّعه فوراً بدون نت
        return cached;
      }

      // مش في الكاش → حاول تجيبه من النت وتحفظه
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200) return response;

          // حفظ النسخة الجديدة في الكاش
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache =>
            cache.put(event.request, toCache)
          );

          return response;
        })
        .catch(() => {
          // أوفلاين وملف مش متحفظ
          console.warn('[SW] لا يوجد اتصال وملف غير محفوظ:', event.request.url);
          // لو طلب صفحة HTML → رجّع الصفحة الرئيسية
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
    })
  );
});
