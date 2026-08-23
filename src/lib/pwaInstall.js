// Single source of truth for PWA install. The browser fires `beforeinstallprompt`
// once, early, and only lets you call .prompt() on that exact event — so we catch
// it at module load (imported via the static App -> InstallPrompt chain) and stash
// it here. Both the first-load prompt AND the Settings "Install" button read from
// this, so dismissing the popup doesn't lose the ability to install later.
let deferred = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

export const isIos = () => /iphone|ipod|ipad/i.test(navigator.userAgent || '');
export const isAndroid = () => /android/i.test(navigator.userAgent || '');
export const isStandalone = () =>
  window.navigator.standalone === true ||
  window.matchMedia?.('(display-mode: standalone)')?.matches === true;
export const isInstalled = () => installed || isStandalone();

export const canInstall = () => !!deferred;
export function subscribeInstall(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Fire the browser's native install dialog. Resolves with the user's choice
// ({ outcome: 'accepted' | 'dismissed' | 'unavailable' }). The event is
// single-use, so we consume it immediately; the browser re-fires
// beforeinstallprompt on a later load if the user dismissed and wants it again.
export async function promptInstall() {
  if (!deferred) return { outcome: 'unavailable' };
  const e = deferred;
  deferred = null;
  notify();
  e.prompt();
  try { return await e.userChoice; } catch (_) { return { outcome: 'dismissed' }; }
}
