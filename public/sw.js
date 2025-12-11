// Empty service worker - prevents 404 errors
// This app doesn't use service workers, but browsers may request this file
self.addEventListener('install', () => {
  // Skip waiting - don't activate this worker
  self.skipWaiting()
})

self.addEventListener('activate', () => {
  // Take control immediately
  return self.clients.claim()
})

// Don't handle fetch events - let requests go through normally
self.addEventListener('fetch', () => {
  // No-op - let browser handle requests normally
})
