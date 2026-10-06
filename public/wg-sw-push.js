// Extra service-worker behavior imported into the generated Workbox SW.

// Server-sent Web Push: show the grade notification the Pi pushed. Fires even
// when the app is fully closed (installed PWA) — this is what makes iPhone work.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (_) {}
  const title = data.title || 'New grade posted'
  const options = {
    body: data.body || '',
    tag: data.tag || 'wg-grades',
    renotify: true,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Focus the app (or open it) when a grade notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsList) {
      if ('focus' in client) {
        try { await client.navigate(url) } catch (_) {}
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url)
  })())
})
