// Minimal service worker: makes the app installable. It deliberately caches NOTHING:
// every page and API response carries personal financial data and must always come from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
