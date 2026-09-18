# Cold-open perf — before/after (PERF-PLAN.md)

Measured with `perf/measure.mjs` (puppeteer-core → system Chrome, **Slow-4G +
4× CPU**, Lighthouse mobile profile), against a local `vite preview` production
build. Headline metric **CONTENT_ms** = time from navigation until the primary
content actually paints (login form when signed out; current-class grade badges
when signed in). Median of 4–5 runs. `224732` used for signed-in (has a snapshot).

"fonts slow-walked" = `--block-fonts`, which hangs `fonts.googleapis.com` past
the measurement window — simulating the school's Lightspeed filter, which the
plan identifies as why it's dramatically worse at school.

| Step | signed-out | signed-in (grades) | signed-out, fonts blocked | signed-in, fonts blocked | TBT | CLS |
|------|-----------:|-------------------:|--------------------------:|-------------------------:|----:|----:|
| **Baseline** (`371079e`) | 1493 ms | 2041 ms | **20319 ms** | **20826 ms** | ~16 ms | 0 / 0.077 |
| **+B+C** self-host fonts + Firestore preconnect | 1455 ms | 1975 ms | **1473 ms** | **2000 ms** | ~15 ms | 0 / 0.077 |

**B+C is the headline win:** with the Google Fonts request blocked (the school
network) the app went from **~20 s to ~1.5–2 s** — self-hosted fonts can't be
blocked. Normal-network shaved a little via the Firestore preconnect. No CLS
regression from the font swap.

Entry chunk (task D target): **345 KB / 106.9 KB gzip**. CSS 12 KB gz. Firebase
(cloudSync) 32 KB gz, lazy.

Key reads from the baseline:
- On a normal network the client boot is ~1.5s to login, ~2.0s to grades. The
  ~500 ms grades-vs-shell gap is the post-mount snapshot fetch (task A target).
- **With fonts blocked the app hangs ~20s** — the render-blocking Google Fonts
  `<link>` is the single biggest real-world problem (task B).
