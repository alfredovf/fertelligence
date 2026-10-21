// Service worker mínimo: hace la app instalable. El modo sin conexión queda para más adelante.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
