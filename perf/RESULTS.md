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

### F — boot skeleton (perceived speed)

New metric **PAINT_ms** = first non-blank paint (skeleton shows). The skeleton is
inline in the HTML, so it paints as soon as the render-blocking CSS resolves,
long before React mounts and the real grades hydrate.

| | PAINT_ms (shape appears) | CONTENT_ms (real grades) |
|---|---:|---:|
| signed-in, **+F** | **513 ms** | 2028 ms |

The user sees the app's shape at ~0.5 s instead of a blank page until ~2 s. CLS
stayed 0.077 (skeleton→app swap adds none). Signed-out clears the skeleton
synchronously so the login card doesn't flash a dashboard shape.

### A — snapshot preflight (grades paint)

| | CONTENT_ms (grades) |
|---|---:|
| baseline | 2041 ms |
| +B+C+F | 2028 ms |
| **+A preflight** | **1776 ms** |

Starting the Firestore fetch from `<head>` (before the bundle downloads/parses)
overlaps the snapshot read with boot instead of doing it after React mounts —
~265 ms off grades-paint here, and more on a higher-latency real network (the
fetch fully hides behind bundle download). Parity: `test:credkey` now covers the
inline hash too (client=pi=inline). Profile-switch verified: preflight fetches
the active account; switching accounts shows the switched-to account's own data,
no bleed.

Entry chunk (task D target): **345 KB / 106.9 KB gzip**. CSS 12 KB gz. Firebase
(cloudSync) 32 KB gz, lazy.

Key reads from the baseline:
- On a normal network the client boot is ~1.5s to login, ~2.0s to grades. The
  ~500 ms grades-vs-shell gap is the post-mount snapshot fetch (task A target).
- **With fonts blocked the app hangs ~20s** — the render-blocking Google Fonts
  `<link>` is the single biggest real-world problem (task B).
