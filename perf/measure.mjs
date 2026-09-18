// Cold-open perf harness for PERF-PLAN.md. Drives the system Chrome via
// puppeteer-core with Slow-4G + 4x-CPU throttling (Lighthouse mobile profile),
// optionally seeds a signed-in session. Headline metric is CONTENT_ms — the time
// from navigation until the primary content actually paints (login form when
// signed out, grade tiles when signed in) — which is what the user waits for.
// Also reports TBT (main-thread blocking) and CLS. Chrome's LCP is unreliable for
// this animated SPA in an automated context, so CONTENT_ms is the source of truth.
//
// Usage: node perf/measure.mjs <url> [--signed-in <user> <pass>] [--runs N]
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const args = process.argv.slice(2)
const url = args[0]
const si = args.indexOf('--signed-in')
const signedIn = si !== -1
const user = signedIn ? args[si + 1] : null
const pass = signedIn ? args[si + 2] : null
const ri = args.indexOf('--runs')
const RUNS = ri !== -1 ? Number(args[ri + 1]) : 5
// Simulate the school's Lightspeed filter blocking Google Fonts: abort those
// requests so we can see how long the render-blocking stylesheet stalls paint.
const blockFonts = args.includes('--block-fonts')

const NET = { offline: false, latency: 150, downloadThroughput: Math.floor((1638.4 * 1024) / 8), uploadThroughput: Math.floor((750 * 1024) / 8) }
const CPU_RATE = 4
// Primary content: the actual grade rows/tiles when signed in (what the user is
// waiting for — post snapshot-hydration); the login form otherwise. First
// appearance (confirmed painted via double rAF) = CONTENT.
const CONTENT_SEL = signedIn ? '.grade-badge, .gt-pct' : 'form, #root input, #root h1, #root h2'

const INJECT = (sel) => `
  window.__m = { cls: 0, tbt: 0, content: null };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { const b = e.duration - 50; if (b > 0) window.__m.tbt += b; } }).observe({ type: 'longtask', buffered: true });
  const check = () => {
    if (window.__m.content != null) return;
    if (document.querySelector(${JSON.stringify(sel)})) {
      requestAnimationFrame(() => requestAnimationFrame(() => { if (window.__m.content == null) window.__m.content = performance.now(); }));
    } else { requestAnimationFrame(check); }
  };
  requestAnimationFrame(check);
`

const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }

async function once() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] })
  try {
    const page = await browser.newPage()
    if (blockFonts) {
      await page.setRequestInterception(true)
      page.on('request', (req) => {
        // Slow-walk (hang past the measurement window), the worst case for a
        // render-blocking stylesheet — not a fast abort the browser recovers from.
        if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(req.url())) setTimeout(() => req.abort().catch(() => {}), 20000)
        else req.continue()
      })
    }
    const client = await page.target().createCDPSession()
    await client.send('Network.enable')
    await client.send('Network.emulateNetworkConditions', NET)
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_RATE })
    if (signedIn) {
      const profiles = JSON.stringify([{ username: user, password: pass, userName: 'Perf Test' }])
      await page.evaluateOnNewDocument((profs, active) => {
        try { localStorage.setItem('wg_profiles', profs); localStorage.setItem('wg_active', active) } catch (e) {}
      }, profiles, user)
    }
    await page.evaluateOnNewDocument(INJECT(CONTENT_SEL))
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
    await new Promise((r) => setTimeout(r, 7000))
    return await page.evaluate(() => window.__m)
  } finally { await browser.close() }
}

const results = []
for (let i = 0; i < RUNS; i++) { process.stderr.write(`  run ${i + 1}/${RUNS}...\n`); results.push(await once()) }
const contentMed = median(results.map((r) => r.content))
console.log(JSON.stringify({
  url, mode: signedIn ? `signed-in(${user})` : 'signed-out', runs: RUNS,
  CONTENT_ms: contentMed != null ? Math.round(contentMed) : null,
  TBT_ms: Math.round(median(results.map((r) => r.tbt)) ?? 0),
  CLS: Number((median(results.map((r) => r.cls)) ?? 0).toFixed(3)),
  content_all: results.map((r) => (r.content != null ? Math.round(r.content) : null)),
}))
