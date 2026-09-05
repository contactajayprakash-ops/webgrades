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
`node-fetch` + `fetch-cookie` + `jsdom`. Routes: `GET /ping`, `POST /login`,
`/data`, `/batch`, `/ipr-dates`, `/push/subscribe`, `/push/unsubscribe`. Keeps
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
