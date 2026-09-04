// Extra service-worker behavior imported into the generated Workbox SW.
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
