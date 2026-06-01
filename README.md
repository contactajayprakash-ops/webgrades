# WebGrades

A faster, cleaner grade portal for Frisco ISD's HAC — with a real **weighted GPA** that HAC doesn't show.

Built with **React + Vite**. It talks to your own HAC-scraping API (the Node/Express service that logs into HAC and returns JSON).

## Features

- **Dashboard** — calculated weighted GPA, official GPA, and class rank at a glance.
- **Classes** — every class with its average, expandable to show all assignments; per-class **what-if** mode to model hypothetical scores.
- **GPA Calculator** — semester GPA using the Frisco ISD formula. Weights auto-detected from class names (override anything), grades editable for "what-if" scenarios, classes can be toggled in/out.
- **Schedule**, **Rank & GPA**, **Transcript**, **Attendance** — straight from HAC.
- **Settings** — change the API URL, manage your session, test the weight detector.

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

The API URL is read from `VITE_API_URL` (see `.env`). You can also change it in-app under **Settings** or the login screen's **API settings** — that override is stored per-browser in `localStorage`.

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build
```

## Deploy (Vercel / Netlify)

1. Push this folder to a Git repo.
2. Import it into **Vercel** or **Netlify**.
   - Build command: `npm run build`
   - Output directory: `dist`
3. Set the env var `VITE_API_URL` to your API's URL.

SPA routing is already handled: `vercel.json` (Vercel) and `public/_redirects` (Netlify) rewrite all paths to `index.html` so deep links work.

> **Note on the API:** your Replit API must be awake and reachable. Replit free instances sleep — the first request may be slow or fail until it wakes. CORS is already open on the API (`app.use(cors())`), so the browser can call it directly.

## Security notes

- HAC credentials are sent to **your** API to scrape grades and are never sent anywhere else.
- "Remember me" stores your credentials in this browser's `localStorage` (plaintext). Don't enable it on shared Chromebooks. Leave it off and you re-enter each session.
