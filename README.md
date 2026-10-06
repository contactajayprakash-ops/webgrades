# WebGrades

A faster, cleaner grade portal for Frisco ISD's HAC — with a real **weighted GPA** that HAC doesn't show.

Built with **React + Vite**. It talks to your own HAC-scraping API (the Node/Express service that logs into HAC and returns JSON).

## Features

- **Dashboard** — calculated weighted GPA, official GPA, and class rank at a glance.
- **Classes** — every class with its average, expandable to show all assignments; per-class **what-if** mode to model hypothetical scores.
- **GPA Calculator** — semester GPA using the Frisco ISD formula. Weights auto-detected from class names (override anything), grades editable for "what-if" scenarios, classes can be toggled in/out.
- **Schedule**, **Rank & GPA**, **Transcript**, **Attendance** — straight from HAC.
- **Settings** — appearance, performance, grade notifications, and your session.

## GPA formula

```
per-class GPA = (weight − (100 − grade) × 0.1) × credit
weighted GPA  = Σ(per-class GPA) / Σ(credit)
```

- `grade` = average of both quarters in the semester (Q1+Q2 or Q3+Q4)
- `credit` = 0.5 per semester course
- `weight` (auto-detected, editable): AP/IB/Dual = **6.0**, PAP/GT/Honors/Advanced = **5.5**, Regular = **5.0**

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

The app calls the API through a same-origin `/api` path, so the backend URL never ships in the client bundle. In dev, Vite proxies `/api/*` to the backend and strips the prefix (`/api/login` becomes `/login`). Set the proxy target with `VITE_API_URL` in `.env` (see `.env.example`); it defaults to `http://localhost:3000` and is only read by the dev server.

## Build

```bash
npm run build            # CloudFront build: same-origin /api
npm run build:firebase   # Firebase build: absolute CloudFront /api URL
npm run preview          # preview the production build
```

The client's API base is `VITE_API_BASE`, falling back to `/api` when unset (`src/api/hac.js`). Only the Firebase build sets it.

## Deploy

Pushing to `main` deploys both hosts via `.github/workflows/deploy.yml`. The two jobs are independent, so if one host fails the other still updates.

| Host | URL | API path |
|---|---|---|
| CloudFront + S3 | `https://diatjuqtrbl82.cloudfront.net` | same-origin `/api`, proxied server-side |
| Firebase Hosting | `https://webgrades.firebaseapp.com` | cross-origin to CloudFront's `/api` |

- **CloudFront** serves the static build from S3 and has a `/api/*` behavior that proxies to the backend. Its CloudFront Functions (`cloudfront/`) handle SPA routing and strip the `/api` prefix.
- **Firebase Hosting** can't proxy to an external origin, so its build points `VITE_API_BASE` at CloudFront's `/api` and calls go cross-origin. To deploy it by hand, use `npm run deploy:firebase`. Never deploy a plain `npm run build` to Firebase: the page loads and then every request fails.
- Use `webgrades.firebaseapp.com`, not `webgrades.web.app`; the school network blocks `web.app`, as well as Vercel, Render and Cloudflare Pages domains.

CloudFront is the API proxy for both hosts, so deleting the distribution takes both down. One-time AWS setup is in [DEPLOY.md](DEPLOY.md); architecture and invariants are in [CLAUDE.md](CLAUDE.md). `vercel.json` is kept only as a record of the old rewrite rules.

## Security notes

- HAC credentials are sent to **your** API to scrape grades and are never sent anywhere else.
- "Remember me" stores your credentials in this browser's `localStorage` (plaintext). Don't enable it on shared Chromebooks. Leave it off and you re-enter each session.
