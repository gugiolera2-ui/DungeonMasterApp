// Service Worker per DM Tool - Gestione Cache Offline
const APP_VERSION = '1.0.0';
const CACHE_NAME = `dm-tool-cache-v${APP_VERSION}`;

// Risorse statiche da memorizzare in cache all'installazione
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './core/state.js',
  './manifest.json',
  './favicon.ico'
];

// Database JSON da memorizzare in cache
const DATABASE_ASSETS = [
  // Database Mostri
  './data/monsters/v35_low_cr.json',
  './data/monsters/v35_high_cr.json',
  './data/monsters/v5_low_cr.json',
  './data/monsters/v5_high_cr.json',
  // Database Magie
  './data/spells/v35_lvl0.json',
  './data/spells/v35_lvl1.json',
  './data/spells/v35_lvl2.json',
  './data/spells/v35_lvl3plus.json',
  './data/spells/v5_lvl0.json',
  './data/spells/v5_lvl1.json',
  './data/spells/v5_lvl2.json',
  './data/spells/v5_lvl3plus.json'
];

// Tutte le risorse da memorizzare in cache
const ALL_ASSETS = [...STATIC_ASSETS, ...DATABASE_ASSETS];

// ==================== EVENTO INSTALL ====================
self.addEventListener('install', event => {
  console.log('[Service Worker] Installazione in corso...');
  
  // Skip waiting per attivazione immediata
  self.skipWaiting();
  
  // Memorizza le risorse statiche in cache
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Memorizzazione risorse in cache...');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log('[Service Worker] Risorse statiche memorizzate');
      })
      .catch(error => {
        console.error('[Service Worker] Errore durante l\'installazione:', error);
      })
  );
});

// ==================== EVENTO ACTIVATE ====================
self.addEventListener('activate', event => {
  console.log('[Service Worker] Attivazione in corso...');
  
  event.waitUntil(
    // Pulisci vecchie cache
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Rimozione vecchia cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => {
      // Pre-carica i database JSON dopo l'attivazione
      console.log('[Service Worker] Pre-caricamento database...');
      return preloadDatabases();
    })
    .then(() => {
      // Prendi il controllo di tutte le pagine
      return self.clients.claim();
    })
    .then(() => {
      console.log('[Service Worker] Attivazione completata');
    })
  );
});

// ==================== EVENTO FETCH ====================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Strategia di caching differenziata
  if (request.method === 'GET') {
    // Per i file JSON (database), usa Cache-First con aggiornamento in background
    if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
      event.respondWith(serveDatabase(request));
    }
    // Per le risorse statiche, usa Cache-First
    else if (isStaticAsset(url)) {
      event.respondWith(serveStaticAsset(request));
    }
    // Per tutto il resto, usa Network-First con fallback alla cache
    else {
      event.respondWith(networkFirstWithFallback(request));
    }
  }
});

// ==================== STRATEGIE DI CACHING ====================

// Strategia per i database JSON
async function serveDatabase(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // 1. Prima controlla la cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // 2. In background, verifica se c'è un aggiornamento
      fetchAndUpdateCache(request, cache);
      return cachedResponse;
    }
    
    // 3. Se non in cache, scarica dalla rete
    const networkResponse = await fetch(request);
    
    // 4. Memorizza in cache per prossime volte
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[Service Worker] Errore fetch database:', error);
    // Fallback: ritorna risposta vuota o errore
    return new Response(
      JSON.stringify({ error: 'Database non disponibile offline' }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

// Strategia per risorse statiche
async function serveStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Fallback alla rete
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback generico per errori di rete
    return new Response('Risorsa non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// Strategia Network-First con fallback
async function networkFirstWithFallback(request) {
  try {
    // Prima prova la rete
    const networkResponse = await fetch(request);
    
    // Aggiorna la cache se la risposta è valida
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Se la rete fallisce, prova la cache
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se non c'è nemmeno in cache, ritorna errore
    return new Response('Risorsa non disponibile offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ==================== FUNZIONI AUSILIARIE ====================

// Pre-carica i database JSON in background
async function preloadDatabases() {
  const cache = await caches.open(CACHE_NAME);
  
  // Pre-carica solo i database non già in cache
  const promises = DATABASE_ASSETS.map(async (assetUrl) => {
    const cached = await cache.match(assetUrl);
    
    if (!cached) {
      try {
        const response = await fetch(assetUrl);
        if (response.ok) {
          await cache.put(assetUrl, response);
          console.log(`[Service Worker] Database precaricato: ${assetUrl}`);
        }
      } catch (error) {
        console.warn(`[Service Worker] Impossibile precaricare: ${assetUrl}`, error);
      }
    }
  });
  
  return Promise.all(promises);
}

// Aggiorna la cache in background per i database
async function fetchAndUpdateCache(request, cache) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Controlla se la risorsa è cambiata
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        const cachedETag = cachedResponse.headers.get('etag');
        const networkETag = networkResponse.headers.get('etag');
        
        // Aggiorna solo se è cambiata
        if (!cachedETag || cachedETag !== networkETag) {
          await cache.put(request, networkResponse);
          console.log(`[Service Worker] Database aggiornato: ${request.url}`);
        }
      } else {
        await cache.put(request, networkResponse);
      }
    }
  } catch (error) {
    // Silenzia errori di aggiornamento in background
    console.debug('[Service Worker] Aggiornamento fallito (probabilmente offline):', error);
  }
}

// Verifica se l'URL è una risorsa statica
function isStaticAsset(url) {
  const staticExtensions = ['.css', '.js', '.html', '.json', '.ico', '.png', '.jpg', '.svg'];
  return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// ==================== GESTIONE MESSAGGI ====================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    checkForUpdates().then(hasUpdate => {
      event.ports[0].postMessage({ hasUpdate });
    });
  }
});

// Controlla aggiornamenti
async function checkForUpdates() {
  try {
    const response = await fetch('./?v=' + Date.now(), { cache: 'no-store' });
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match('./');
    
    if (!cachedResponse) return false;
    
    const cachedText = await cachedResponse.text();
    const networkText = await response.text();
    
    return cachedText !== networkText;
  } catch (error) {
    return false;
  }
}