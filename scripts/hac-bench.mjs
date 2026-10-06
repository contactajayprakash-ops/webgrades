// Where does a sync's time go? Times every HAC round-trip and every HTML parse
// the Pi does for a cold "current quarter" scrape, and answers the yes/no
// questions the speed-up depends on. Read-only against HAC; prints timings only.
//
// Run ON THE PI (it measures the Pi's CPU + link), from a scratch dir:
//   mkdir -p ~/wgbench && cd ~/wgbench && cp <repo>/scripts/hac-bench.mjs .
//   npm i jsdom node-html-parser node-fetch fetch-cookie tough-cookie
//   HAC_USER=... HAC_PASS=... node hac-bench.mjs
// Credentials come only from the environment and are never printed or written.
// Optional: API=http://localhost:3000 also times the live server's /batch.
import fetchOrig from "node-fetch";
import fetchCookie from "fetch-cookie";
import { CookieJar } from "tough-cookie";
import { JSDOM } from "jsdom";
import { parse } from "node-html-parser";
import https from "https";
import os from "os";

const USER = process.env.HAC_USER, PASS = process.env.HAC_PASS;
if (!USER || !PASS) { console.error("set HAC_USER and HAC_PASS"); process.exit(1); }
const UA = { "User-Agent": "Mozilla/5.0" };
const BASE = "https://hac.friscoisd.org";
const LOGON = `${BASE}/HomeAccess/Account/LogOn?ReturnUrl=%2fHomeAccess%2f`;
const CLASSWORK = `${BASE}/HomeAccess/Classes/Classwork`;
const ASSIGN = `${BASE}/HomeAccess/Content/Student/Assignments.aspx`;
const TRANSCRIPT = `${BASE}/HomeAccess/Content/Student/Transcript.aspx`;
const SCHEDULE = `${BASE}/HomeAccess/Content/Student/Classes.aspx`;
const ATTEND = `${BASE}/HomeAccess/Content/Attendance/MonthlyView.aspx`;

const agent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const newClient = () => fetchCookie((u, o = {}) => fetchOrig(u, { agent, ...o }), new CookieJar());
const ms = (t) => `${Math.round(performance.now() - t)}ms`;
const rows = [];
const log = (k, v) => { rows.push([k, v]); console.log(k.padEnd(44), v); };
const timed = async (label, fn) => { const t = performance.now(); const r = await fn(); log(label, ms(t)); return r; };
const getText = async (f, url, opts = {}) => {
  const res = await f(url, { headers: { ...UA, ...(opts.headers || {}) }, ...opts });
  return { res, html: await res.text() };
};
const parseBoth = (label, html) => {
  let t = performance.now(); const jd = new JSDOM(html).window.document; const tj = ms(t);
  t = performance.now(); const np = parse(html); const tn = ms(t);
  log(`  parse ${label} (${Math.round(html.length / 1024)}KB)`, `jsdom ${tj}  node-html-parser ${tn}`);
  return { jd, np };
};
const val = (el) => el?.getAttribute("value") ?? "";
const loggedOut = (doc) => !!doc.querySelector('input[name="LogOnDetails.UserName"]');

// Same shape as the server's parseClasswork, written against either DOM.
const parseClasswork = (doc) => Array.from(doc.querySelectorAll(".AssignmentClass")).map((c) => ({
  course: c.querySelector(".sg-header-heading")?.textContent.replace(/\s+/g, " ").trim(),
  avg: c.querySelector(".sg-header-heading.sg-right")?.textContent.trim(),
  rows: Array.from(c.querySelectorAll("tr.sg-asp-table-data-row")).map((r) =>
    Array.from(r.querySelectorAll("td")).map((td, i) =>
      (i === 2 ? td.querySelector("a")?.textContent.trim() || td.textContent.trim() : td.textContent.trim()))),
}));
const parseTranscript = (doc) => Array.from(doc.querySelectorAll(".sg-transcript-group")).map((g) => ({
  year: g.querySelector('[id*="lblYearValue"]')?.textContent.trim(),
  rows: Array.from(g.querySelectorAll("tr.sg-asp-table-data-row")).map((r) =>
    Array.from(r.querySelectorAll("td")).map((td) => td.textContent.trim())),
  gpa: doc.querySelector("#plnMain_rpTranscriptGroup_lblGPACum1")?.textContent.trim(),
}));
const same = (label, a, b) => log(`  parity ${label}`, JSON.stringify(a) === JSON.stringify(b) ? "IDENTICAL" : "DIFFERENT");

// Log in. withHome=false stops after the 302 to test whether the home GET is needed.
const login = async (f, withHome = true, quiet = false) => {
  const T = quiet ? (l, fn) => fn() : timed;
  const { html } = await T("login: GET LogOn page", () => getText(f, LOGON, { redirect: "manual" }));
  const token = val(parse(html).querySelector('input[name="__RequestVerificationToken"]'));
  const body = new URLSearchParams({
    __RequestVerificationToken: token, "LogOnDetails.UserName": USER, "LogOnDetails.Password": PASS,
    Database: "10", VerificationOption: "UsernamePassword",
  });
  const res = await T("login: POST credentials", () => f(LOGON, {
    method: "POST", body, redirect: "manual",
    headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded", Referer: LOGON },
  }));
  if (res.status !== 302) throw new Error(`login failed (${res.status})`);
  if (withHome) {
    const home = new URL(res.headers.get("location"), LOGON).href;
    const { html: h } = await T("login: GET home (only for the name)", () => getText(f, home, { headers: { Referer: LOGON } }));
    if (!quiet) parseBoth("home", h);
  }
};

const main = async () => {
  log("host", `${os.hostname()} ${os.arch()} cpus=${os.cpus().length} node=${process.version} load=${os.loadavg().map((x) => x.toFixed(2)).join(",")}`);

  // 1. Today's path, step by step.
  console.log("\n== 1. today's cold path: login + current quarter ==");
  const t0 = performance.now();
  const f = newClient();
  await login(f, true);
  const { html: land } = await timed("classwork: GET landing page", () => getText(f, CLASSWORK));
  const L = parseBoth("landing", land);
  const src = L.np.querySelector("iframe")?.getAttribute("src");
  log("  iframe src", src || "(none)");
  log("  name on landing page", L.np.querySelector(".sg-menu-element-identity span") ? "yes" : "no");
  const { html: ifr } = await timed("classwork: GET iframe (Assignments.aspx)", () => getText(f, ASSIGN, { headers: { Referer: CLASSWORK } }));
  const I = parseBoth("iframe", ifr);
  same("classwork (default view)", parseClasswork(I.jd), parseClasswork(I.np));
  const sel = (id) => I.np.querySelector(`#${id} option[selected]`);
  const run = sel("plnMain_ddlReportCardRuns");
  log("  default run selected", `${run?.textContent.trim()} (${val(run)})`);
  log("  default filters", ["plnMain_ddlClasses", "plnMain_ddlCompetencies", "plnMain_ddlOrderBy"].map((id) => `${id.replace("plnMain_ddl", "")}=${val(sel(id)) || "?"}`).join(" "));
  const form = new URLSearchParams({
    __EVENTTARGET: "ctl00$plnMain$btnRefreshView", __EVENTARGUMENT: "",
    __VIEWSTATE: val(I.np.querySelector("#__VIEWSTATE")),
    __VIEWSTATEGENERATOR: val(I.np.querySelector("#__VIEWSTATEGENERATOR")),
    __EVENTVALIDATION: val(I.np.querySelector("#__EVENTVALIDATION")),
    "ctl00$plnMain$ddlReportCardRuns": val(run), "ctl00$plnMain$ddlClasses": "ALL",
    "ctl00$plnMain$ddlCompetencies": "ALL", "ctl00$plnMain$ddlOrderBy": "Class",
  });
  const { html: posted } = await timed("classwork: POST same quarter", () => getText(f, ASSIGN, {
    method: "POST", body: form.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: ASSIGN },
  }));
  const P = parseBoth("quarter POST", posted);
  same("POST result vs default view", parseClasswork(P.np), parseClasswork(I.np));
  log("TOTAL today's path (incl. both parsers)", ms(t0));

  // 2. Shortcuts: skip the home GET and the landing page.
  console.log("\n== 2. shortcut: no home GET, no landing, no POST ==");
  const t1 = performance.now();
  const g = newClient();
  await login(g, false);
  const { html: direct } = await timed("classwork: GET iframe directly", () => getText(g, ASSIGN));
  const D = parse(direct);
  log("  logged in without home + landing", loggedOut(D) ? "NO (bounced to LogOn)" : "yes");
  same("direct vs today's default view", parseClasswork(D), parseClasswork(I.np));
  log("TOTAL shortcut path", ms(t1));

  // 3. Other pages, sequential vs parallel in ONE session vs separate sessions.
  console.log("\n== 3. does HAC serialize requests within one session? ==");
  const pages = [TRANSCRIPT, SCHEDULE, ATTEND];
  await timed("3 pages sequential, one session", async () => { for (const u of pages) await getText(f, u); });
  await timed("3 pages parallel, one session", () => Promise.all(pages.map((u) => getText(f, u))));
  const extra = [newClient(), newClient()];
  await timed("2 extra logins in parallel (no home)", () => Promise.all(extra.map((c) => login(c, false, true))));
  await timed("3 pages parallel, three sessions", () => Promise.all(pages.map((u, i) => getText([f, ...extra][i], u))));
  const { html: tr } = await getText(f, TRANSCRIPT);
  const T = parseBoth("transcript", tr);
  same("transcript", parseTranscript(T.jd), parseTranscript(T.np));

  // 4. The live server, end to end, as the app calls it today.
  if (process.env.API) {
    console.log("\n== 4. live server /batch (what the app waits on) ==");
    const q = val(run) ? run.textContent.trim().replace(/\D.*/, "") : "1";
    const call = (requests) => fetchOrig(`${process.env.API}/batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: USER, password: PASS, requests }),
    }).then((r) => r.json());
    const r1 = await timed(`/batch hot wave class q${q} (warm session?)`, () => call([{ type: "class", quarter: q }]));
    log("  ok", String(r1.success));
    const r2 = await timed("/batch gpa wave (rank, transcript, 3 quarters)", () => call([
      { type: "rank" }, { type: "transcript" },
      ...["1", "2", "3", "4"].filter((x) => x !== q).map((quarter) => ({ type: "class", quarter })),
    ]));
    log("  ok", `${r2.results?.filter((x) => x.success).length}/${r2.results?.length}`);
  }
  log("load after", os.loadavg().map((x) => x.toFixed(2)).join(","));
};

main().catch((e) => { console.error("bench failed:", e.message); process.exit(1); });
