# WebGrades — architecture and deployment

Context for agents working in this repo. Read before touching anything under
`.github/`, `firebase.json`, `src/api/`, or the build scripts.

## What this is

A React + Vite SPA (PWA) that fronts a self-hosted HAC scraping API. It shows
Frisco ISD grades with a real weighted GPA that HAC itself doesn't display.

It used to deploy to Vercel. It no longer does. The reason for everything below
is that **the school network blocks most deployment-platform domains** —
`vercel.app`, `onrender.com`, `pages.dev`, `web.app`, `is-a.dev` are all blocked
by the Lightspeed filter. Confirmed reachable: `cloudfront.net`,
`firebaseapp.com`, `s3.amazonaws.com`, `appspot.com`, `azurestaticapps.net`.

## Live deployments

Two front doors, both auto-deployed from `main`, both serving the same app.

| | URL | API path |
|---|---|---|
| CloudFront + S3 | `https://diatjuqtrbl82.cloudfront.net` | same-origin `/api`, proxied server-side |
| Firebase Hosting | `https://webgrades.firebaseapp.com` | cross-origin to CloudFront's `/api` |

Firebase also answers on `webgrades.web.app`, but **that domain is blocked at
school** — always give people the `firebaseapp.com` one.

## The `/api` mechanism — read this before editing `src/api/hac.js`

`hac.js` calls same-origin paths (`/api/login`, `/api/data`) so the backend URL
stays out of the client bundle. That requires a server-side proxy:

```js
const BASE = import.meta.env.VITE_API_BASE || '/api';
```

- **CloudFront build** (`npm run build`) — `VITE_API_BASE` unset, so `BASE` is
  `/api`. A CloudFront cache behavior on `/api/*` proxies to the Pi.
- **Firebase build** (`npm run build:firebase`) — sets `VITE_API_BASE` to
  CloudFront's absolute `/api` URL. Firebase Hosting rewrites can only target a
  file, a Cloud Function, or Cloud Run — never an arbitrary external origin — so
  it cannot proxy. Those calls go cross-origin instead; the backend sends
  `Access-Control-Allow-Origin: *`, so no server change was needed.

**Do not remove the `|| '/api'` fallback.** Hardcoding an absolute URL would
break the CloudFront deploy's same-origin design and put the backend hostname in
every bundle.

**Never deploy a plain `npm run build` to Firebase.** The result loads fine and
then fails every request, because nothing proxies `/api` there. Use
`npm run deploy:firebase`, which ties the correct build to the deploy.

## Infrastructure

```
S3 bucket                  webgrades-542284138566   (us-east-2, private, OAC only)
CloudFront distribution    E1UXDR6NZ2YRP5
CloudFront functions       webgrades-spa-rewrite    (viewer-request, default behavior)
                           webgrades-api-strip      (viewer-request, /api/* behavior)
IAM deploy user            webgrades-deploy         (scoped to that bucket + distribution)
Firebase project           webgrades
Backend origin             webgrades.taile915cc.ts.net
```

`webgrades-spa-rewrite` maps extensionless URIs to `/index.html` so client-side
routes resolve. `webgrades-api-strip` removes the `/api` prefix, because the
backend serves its routes at the root (`/login`, not `/api/login`) — it replaces
what `vercel.json` used to do.

The `/api/*` behavior uses cache policy `CachingDisabled` and origin request
policy `AllViewerExceptHostHeader`. That last one matters: Tailscale Funnel
routes on the Host header, and forwarding CloudFront's hostname breaks it.

### Invariants that will silently break things

- **CloudFront is load-bearing for both front doors** — it is the API proxy, not
  just a CDN. Deleting the distribution takes down `webgrades.firebaseapp.com`
  too, and the symptom is a page that loads and then fails every request.
- **Do not add distribution-level custom error responses.** They apply to every
  behavior, so API errors would come back as the HTML app shell.
- **Cache headers are deliberate.** Hashed assets get
  `max-age=31536000,immutable`; `index.html`, `sw.js`, `registerSW.js` and
  `manifest.webmanifest` get `no-store` and are invalidated on every deploy.
  Without that split the PWA service worker serves a stale build forever.

## Backend — the Pi

A Raspberry Pi 3 on the tailnet running `server.mjs`: Express on port 3000
(hardcoded, no `PORT` env), Node 18, scraping `hac.friscoisd.org` with
`node-fetch` + `fetch-cookie` + `jsdom` (plus `firebase-admin` +
`@google-cloud/firestore` for snapshot sync, when enabled). Routes: `GET /ping`,
`POST /login`, `/data`, `/batch`, `/ipr-dates`, `/push/subscribe`,
`/push/unsubscribe`, `/push/test`, `/push/poll`, `/snapshot/run`. Keeps
logged-in cookie jars in memory for 3 minutes, keyed by username and re-checked
against the password.

### Web Push (grade notifications)

Server-sent Web Push so a student gets notified when a grade posts even with the
app closed — the only way to do it on iPhone (iOS freezes backgrounded PWAs and
has no Background Sync; the client-side notifier in `AuthContext` only fires
while the app runs). Standard VAPID push — **no Firebase, no Apple Developer
account**. Delivery is cheap; the cost is the poll.

- **Deps/config:** needs `web-push` installed on the Pi and `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` in the process env (public key is also hardcoded in
  `src/lib/push.js` — the pair must match). Push is a no-op if the env is unset.
- **Store:** `push-subs.json` next to `server.mjs`, `username -> { password,
  kinds, subs[], lastSeen }`. Credentials are stored **in plaintext by explicit
  choice** (file is written `chmod 600`) — the Pi is the private place to hold
  them; a cloud poller would be worse. Every existing "HAC API" scrapes with the
  password too — there is no token to store instead.
- **Poller:** every 15 min (`PUSH_POLL_MS`), 6am–11pm CT daily (coarse gate —
  teachers grade evenings/weekends), staggered per user; diffs current `class`
  grades against `lastSeen` and pushes
  new ones matching each user's `aol`/`pc`/`both` choice. Never blasts the whole
  gradebook on the first poll after subscribing.
- **Client:** `src/lib/push.js` subscribes via `PushManager`; the SW `push` +
  `notificationclick` handlers live in `public/wg-sw-ext.js` (injected into the
  generated Workbox SW via `workbox.importScripts`). Enable/opt-in is in
  Settings → Notifications (default off).

### Server-side grade snapshots (fast cold open)

The cold open used to run ~9 scrape units in 3 serial waves — ~22 HAC page loads
on a Pi 3, and worst exactly when the cache is empty (first load, new device,
borrowed Chromebook). The fix inverts it: the Pi is the canonical writer, the
browser reads a snapshot.

```
before:  browser -> CloudFront -> Pi -> HAC        (every open, ~22 page loads)
after:   Pi -> HAC -> writes snapshot -> Firestore (grades/<credKey>)
         browser -> Firestore (1 gzipped doc read, instant paint)
         browser -> CloudFront -> Pi  only for login + live revalidate
```

The Pi is NOT retired — it matters more. Firestore can't log into HAC or run
JSDOM. Scraping, Web Push, VAPID and `push-subs.json` are unchanged.

- **Feature flag:** the whole subsystem is a **no-op unless a Firebase service
  account is present** on the Pi (`FIREBASE_SA` → a JSON key path, or
  `GOOGLE_APPLICATION_CREDENTIALS`), the same way push is a no-op without VAPID.
  `firebase-admin` is imported **lazily**, so the server runs identically without
  the package or the key. On the Pi: `firebase-sa.json` (`chmod 600`, gitignored),
  `FIREBASE_SA` set in `ecosystem.config.cjs`. `firebase-admin` needs
  `@google-cloud/firestore` installed **explicitly** — it's an optional dep that
  npm skips on the 32-bit `armv7l` Pi.
- **Doc:** `grades/<credKey>` where `credKey` = SHA-256 of `` `${username} ${password}` ``
  — computed identically on the Pi (`node:crypto`) and the browser
  (`src/lib/cloudSync.js`, Web Crypto). If these drift, every client reads a
  missing doc and silently falls back to the slow path. Guarded by
  `npm run test:credkey` (runs both code paths). Doc shape:
  `{ codec:'gzip', data:<base64>, hash, updatedAt, v }`; `data` gunzips to the
  client's exact cache-key shape (`class:{}`, `class:{"quarter":"3"}`, `rank:{}`,
  …). Written **only when the payload hash changed** (write-budget) — unchanged
  scrapes log `changed=n` and skip the write.
- **Registry:** `snapshot-subs.json` (plaintext, `chmod 600`, gitignored),
  **independent of push** — auto-populated on every verified `/login` and
  `/batch` (product decision: fast loading for everyone). A user can have fast
  loads without notifications and vice versa.
- **Poller tiers** (budgeted against HAC, not Firestore — env-configurable):
  current quarter refreshes each cycle; the other quarters + rank + transcript +
  schedule + attendance re-scrape ~daily (a HOT poll patches just the current
  quarter onto the last full data, kept in memory). Active users (<48h) poll
  every cycle, dormant hourly, very dormant daily (from `seenAt`). A small worker
  pool (`POLL_CONCURRENCY`, default 2) with a per-user stagger. First poll after
  a restart is forced FULL.
- **Rules** (`firestore.rules`): `grades/{id}` allows `get` on a known id, no
  `list`, no client `write` — only the Pi writes, via the Admin SDK (bypasses
  rules). The client `getDoc`s by its own credential hash.
- **Client tier:** `AuthContext.hydrateFromSnapshot` is a third cache tier
  between `localStorage` and the live scrape — one `getDoc`, gunzip via native
  `DecompressionStream`, merged only when **newer** than the local cache;
  `syncedAt` comes from the snapshot's own `updatedAt` (honest "as of Xm ago").
  The first live `syncAll` of a session suppresses notifications so a
  snapshot-hydrated cache can't fire a gradebook-wide burst. Any failure
  (offline, no doc, browser without gunzip) falls through silently. Gated by the
  `wg_snapshot_read` rollout flag (now on by default) **and** `syncAllowedFor`.

`HACFAKESERVERNORUN.txt` in this repo is a copy of that source. **Nothing keeps
it in sync** — if the Pi is edited and this file isn't, the copy becomes fiction.

Exposed publicly via **Tailscale Funnel** (`tailscale funnel --bg 3000`), so the
Pi accepts no inbound connections and needs no port forwarding. Managed by pm2,
persisted with `pm2 startup systemd` + `pm2 save`.

Path on the Pi: `/home/ajay/webgrades`. SSH: `ssh ajay@webgrades`.

### Renaming the Pi

Three steps, and skipping either of the last two takes the app down:

1. Rename in the Tailscale admin console (untick auto-generate from OS hostname).
2. On the Pi: `tailscale serve reset` then `tailscale funnel --bg 3000`. **Funnel
   config does not follow a rename** — it stays bound to the old name and serves
   nothing.
3. Update the CloudFront `hac-api` origin's `DomainName`.

## Offline behavior — do not "add" a cache, one already exists

The service worker (`vite-plugin-pwa`, `generateSW`) precaches the shell only. It
will never hold grade data: every HAC call is a POST, and the Cache API cannot
store POST responses.

Offline data comes from the **application layer**, not the SW:

- `AuthContext.jsx` writes every fetched resource to `localStorage` under
  `wg_data_<username>`; `hydrateCache` reads it back on load; `peekData` serves
  it synchronously.
- `useHacData.js` renders that cache instantly and, on a cache hit, does not call
  the network at all.
- A fully-failed sync refuses to stamp a new "synced" time, so freshness stays
  honest.
- `OfflineBanner` and `LastUpdated` in `ui.jsx` already surface the stale state.

Adding an IndexedDB cache would duplicate all of this.

## Client cold-open boot path

The snapshot pipeline made the *data* path fast; a second round (`PERF-PLAN.md`)
fixed the *boot* path. The current cold open, in order:

1. **Repeat opens skip the network for the shell.** The SW (`generateSW`,
   `navigateFallback: '/index.html'`) serves the precached `index.html` from the
   workbox precache — verified `fromServiceWorker`. The `no-store` header and the
   precache don't conflict (Cache API ignores `no-store`). First-ever open still
   hits the network.
2. **Fonts are self-hosted** (`public/fonts/*.woff2`, `@font-face` in `index.css`,
   `font-display: swap`). The old render-blocking Google Fonts `<link>` was
   slow-walked by the school's Lightspeed filter and **hung first paint ~20 s** —
   the biggest real-world regression. Never re-add an external font `<link>`.
3. **Snapshot preflight** — a `<head>` IIFE (`window.__wgSnap` in `index.html`)
   hashes the active profile's creds and starts the Firestore `grades/<credKey>`
   fetch *before the bundle exists*. `src/lib/snapshotRead.js` awaits it and reuses
   the doc only when `pre.username === username` (a profile switch must not paint
   the prefletched account's data), else falls through to its own fetch. Preceded
   by a `preconnect` to `firestore.googleapis.com`. The inline hash is a **third**
   copy of the credKey string — `scripts/test-credkey-parity.mjs` covers it.
4. **Boot skeleton** painted from the HTML itself (inline `<style>` + markup in
   `#root`), theme-aware via `data-theme`. Cleared synchronously for signed-out.
   React replaces `#root` on mount. Shape on screen ~0.5 s vs blank-until-React.
5. **Route-split entry chunk** — `App.jsx` lazy-loads all views except `Dashboard`
   and lazy-loads the classic shell (`LayoutLegacy`); each shell wraps its
   `<Outlet>` in `<Suspense>` so navigation keeps the nav. Entry chunk ~88 KB gz.
6. **Settings sync is deferred** to `requestIdleCallback` (`useSettingsSync`) so
   its firebase chunk doesn't contend during boot. Its last-write-wins reconcile
   (`8e43258`) is load-bearing — don't touch it.

Before/after numbers live in `perf/RESULTS.md`; re-measure with `perf/measure.mjs`
(needs `npm i --no-save puppeteer-core`; Slow-4G + 4× CPU; `--block-fonts`
simulates the school network).

## Known issue — CloudFront gateway errors

CloudFront edges intermittently fail to resolve the Tailscale origin and return
a 502 HTML page. Measured at 3 failures in 22 calls on a fully-deployed
distribution, before and after a hostname rename — it's the edge, not the Pi.

`rawPost` in `hac.js` retries 502/503/504 twice with 400ms/800ms backoff, taking
the effective failure rate to roughly 1 in 2,900. Connection failures are
deliberately **not** retried so the offline path falls through to cache
immediately. Don't "simplify" this into `post()`'s retry loop — a gateway error
returns HTML, so `res.json()` throws before that loop can classify it, and
`/login` passes `retries = 0` on purpose.

## Commands

```bash
npm run dev              # vite dev server
npm run build            # CloudFront build — same-origin /api
npm run build:firebase   # Firebase build — absolute CloudFront /api
npm run deploy:firebase  # build:firebase + firebase deploy (note: firebase-tools, not firebase)
git push origin main     # deploys BOTH hosts via .github/workflows/deploy.yml
```

The workflow has two independent jobs, `cloudfront` and `firebase`, each running
its own build. Independent on purpose: if one host fails to deploy, the other
still updates.

Repo secrets required: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`,
`CLOUDFRONT_DISTRIBUTION_ID`, `FIREBASE_SERVICE_ACCOUNT_WEBGRADES`.

## Credentials — known, accepted

HAC has no token API, so the client sends username and password on **every**
request and the server holds them in its 3-minute session map. CloudFront
terminates TLS at the edge, so the request body is briefly in the clear inside
AWS. This was equally true under Vercel; proxying inherently means the proxy sees
the payload. It's the cost of keeping the backend URL out of the bundle.

## Odds and ends

- `vercel.json` is **legacy**. Vercel is not a deploy target. It's kept only as a
  record of the original rewrite rules.
- `email-runner/` is a separate Mac-local tool (trigger Claude Code by email).
  Unrelated to the app or its deployment.
- A prose runbook for the Pi and tunnel lives at
  https://claude.ai/code/artifact/3290b171-baba-4813-8463-14f3447a1e43
