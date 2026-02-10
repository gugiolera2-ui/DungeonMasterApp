// Service Worker per DM Tool - Versione Robusta e Perfetta
const APP_VERSION = '2.0.0';
const CACHE_NAME = `dm-tool-cache-v${APP_VERSION}`;
const INSTALL_LOG = '[Service Worker]';

// === 1. RISORSE CRITICHE (minimo indispensabile) ===
// Solo queste sono necessarie per far partire l'app
const CRITICAL_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json'
  // NOTA: favicon.ico è stato rimosso perché potrebbe non esistere nel repository
  // Se aggiungi una favicon in futuro, puoi reinserirla qui
];

// === 2. DATABASE OPZIONALI (precaricati in background) ===
// Questi NON bloccano l'installazione se mancano
const DATABASE_ASSETS = [
  './data/monsters/v35_low_cr.json',
  './data/monsters/v35_high_cr.json',
  './data/monsters/v5_low_cr.json',
  './data/monsters/v5_high_cr.json',
  './data/spells/v35_lvl0.json',
  './data/spells/v35_lvl1.json',
  './data/spells/v35_lvl2.json',
  './data/spells/v35_lvl3plus.json',
  './data/spells/v5_lvl0.json',
  './data/spells/v5_lvl1.json',
  './data/spells/v5_lvl2.json',
  './data/spells/v5_lvl3plus.json'
];

// === 3. INSTALLAZIONE (a prova di errore) ===
self.addEventListener('install', event => {
  console.log(`${INSTALL_LOG} Installazione in corso...`);
  
  // Attivazione immediata (non aspettare il reload)
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`${INSTALL_LOG} Memorizzazione risorse critiche...`);
        
        // APPROCCIO ROBUSTO: Prova ogni risorsa singolarmente
        // Se una fallisce, l'installazione continua lo stesso
        const cachePromises = CRITICAL_ASSETS.map(asset => {
          return cache.add(asset).catch(error => {
            console.warn(`${INSTALL_LOG} Fallito: ${asset}`, error);
            // Non lanciare l'errore, continua con le altre
            return Promise.resolve();
          });
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log(`${INSTALL_LOG} Installazione completata (anche con errori parziali)`);
        // Non facciamo fallire l'evento anche se alcuni file non esistono
      })
      .catch(error => {
        // Questo catch cattura solo errori GRAVI (es: cache non disponibile)
        console.error(`${INSTALL_LOG} Errore critico durante l'installazione:`, error);
        // Anche qui non facciamo fallire l'evento
      })
  );
});

// === 4. ATTIVAZIONE ===
self.addEventListener('activate', event => {
  console.log(`${INSTALL_LOG} Attivazione in corso...`);
  
  event.waitUntil(
    Promise.all([
      // 1. Pulizia delle vecchie cache
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cache => {
            if (cache !== CACHE_NAME) {
              console.log(`${INSTALL_LOG} Rimozione cache obsoleta: ${cache}`);
              return caches.delete(cache);
            }
          })
        );
      }),
      
      // 2. Precaricamento "gentile" dei database (in background, non blocca)
      preloadDatabases(),
      
      // 3. Prendi controllo immediato di tutti i client
      self.clients.claim()
    ]).then(() => {
      console.log(`${INSTALL_LOG} Attivazione completata`);
      // Notifica all'app che il SW è pronto
      sendMessageToClients({ type: 'SW_READY', version: APP_VERSION });
    })
  );
});

// === 5. FETCH (strategia intelligente) ===
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo per richieste GET
  if (request.method !== 'GET') return;
  
  // STRATEGIA CACHE-FIRST PER APP OFFLINE
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        // 1. Prima cerca in cache
        if (cachedResponse) {
          // Per i database JSON, verifica aggiornamenti in background
          if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
            fetchAndUpdateCache(request);
          }
          return cachedResponse;
        }
        
        // 2. Se non in cache, vai in rete
        return fetch(request)
          .then(networkResponse => {
            // Se la risposta è valida, memorizzala in cache
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(error => {
            // 3. Fallback per file mancanti (soprattutto database)
            if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
              console.log(`${INSTALL_LOG} Database non disponibile: ${url.pathname}`);
              return new Response(
                JSON.stringify({ 
                  error: 'Database non disponibile offline',
                  path: url.pathname 
                }),
                { 
                  status: 404,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            }
            
            // 4. Per le pagine HTML, fallback alla home
            if (request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // 5. Per altri errori
            return new Response('Risorsa non disponibile offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// === 6. FUNZIONI AUSILIARIE ===

// Precaricamento "gentile" dei database (non blocca se fallisce)
async function preloadDatabases() {
  console.log(`${INSTALL_LOG} Precaricamento database in background...`);
  
  const cache = await caches.open(CACHE_NAME);
  
  // Per ogni database, prova a caricarlo ma non bloccare se fallisce
  const promises = DATABASE_ASSETS.map(async (assetUrl) => {
    try {
      // Prima controlla se è già in cache
      const alreadyCached = await cache.match(assetUrl);
      if (alreadyCached) return;
      
      // Prova a scaricarlo
      const response = await fetch(assetUrl, { cache: 'no-cache' });
      
      if (response.ok) {
        await cache.put(assetUrl, response);
        console.log(`${INSTALL_LOG} Database precaricato: ${assetUrl}`);
      }
    } catch (error) {
      // Silenzioso - il database sarà caricato on-demand quando necessario
      console.debug(`${INSTALL_LOG} Database non disponibile: ${assetUrl}`);
    }
  });
  
  await Promise.allSettled(promises); // Non fallisce mai, anche se tutti i promise falliscono
  console.log(`${INSTALL_LOG} Precaricamento database completato`);
}

// Aggiornamento cache in background (solo per database)
async function fetchAndUpdateCache(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response);
      console.debug(`${INSTALL_LOG} Database aggiornato in background: ${request.url}`);
    }
  } catch (error) {
    // Silenzioso - siamo probabilmente offline
  }
}

// Messaggistica con i client (pagine aperte)
function sendMessageToClients(message) {
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage(message);
    });
  });
}

// === 7. GESTIONE MESSAGGI DALL'APP ===
self.addEventListener('message', event => {
  const { data } = event;
  
  if (!data || !data.type) return;
  
  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME)
        .then(() => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true });
          }
        });
      break;
      
    case 'CHECK_UPDATE':
      checkForUpdates()
        .then(hasUpdate => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ hasUpdate });
          }
        });
      break;
      
    case 'GET_CACHE_INFO':
      caches.open(CACHE_NAME)
        .then(cache => cache.keys())
        .then(keys => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ 
              cacheName: CACHE_NAME,
              version: APP_VERSION,
              cachedItems: keys.map(k => k.url),
              count: keys.length
            });
          }
        });
      break;
  }
});

// Controlla aggiornamenti dell'app
async function checkForUpdates() {
  try {
    // Usa una richiesta "no-cache" per forzare il controllo
    const networkResponse = await fetch('./index.html', { 
      cache: 'no-store',
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    
    const cachedResponse = await caches.match('./index.html');
    
    if (!cachedResponse) return true;
    
    const networkText = await networkResponse.text();
    const cachedText = await cachedResponse.text();
    
    // Confronto semplice (potresti usare ETag/Last-Modified nella realtà)
    return networkText !== cachedText;
    
  } catch (error) {
    console.debug(`${INSTALL_LOG} Controllo aggiornamenti fallito:`, error);
    return false;
  }
}

// === 8. GESTIONE ERRORI GLOBALI ===
self.addEventListener('error', event => {
  console.error(`${INSTALL_LOG} Errore non gestito:`, event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error(`${INSTALL_LOG} Promise rejection non gestita:`, event.reason);
});