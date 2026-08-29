// ============================================================
// Thin client for the HAC scraping API.
//
// Endpoints (all POST, JSON body):
//   /login       { username, password } -> { success, userName }
//   /data        { username, password, type, quarter?, date? } -> { success, userName, data }
//   /ipr-dates   { username, password } -> { success, availableDates }
//
// type ∈ class | schedule | rank | transcript | week | attendance | ipr
// ============================================================

// Requests go to a SAME-ORIGIN path ("/api/…") by default: the CloudFront
// deploy has a /api/* behavior that proxies to the HAC backend server-side,
// and Vite's dev proxy does the same locally. That keeps the backend URL out
// of the client bundle entirely.
//
// Firebase Hosting can't proxy to an arbitrary external origin, so that build
// sets VITE_API_BASE to CloudFront's absolute /api URL (see `build:firebase`)
// and the calls go cross-origin. The backend answers preflights with
// `Access-Control-Allow-Origin: *`, so this needs no server change.
const BASE = import.meta.env.VITE_API_BASE || '/api';

// HAC's Classwork page can list the SAME course more than once — the S1 and S2
// sections of a year-long class, or an old + new section after a schedule change
// — which surfaces as duplicate rows (one real, one empty). Collapse them by the
// stable course key, keeping the richer entry (more assignments / a real grade).
import { courseKey } from '../lib/courses.js';

// HAC's Classwork table for each class ends with a "category averages" summary
// section (e.g. "Assessment of Learning" / "Progress Check for Learning" rows
// showing point totals). The scrape's row selector matches those too, so they
// leak in as bogus assignments (a "100.0" and a "300.0" for Social Studies
// Research, etc.). Real assignment rows always carry a due date; the summary
// rows don't — drop anything without one.
// HAC's Classwork table appends per-category SUBTOTAL rows after the real
// assignments (e.g. "400.00 | 93.750%", "100.00 | 100.000%") — points earned and
// the category percentage. They aren't assignments. The tell: their "category"
// cell is a bare percentage (never a real category like Assessment/Progress), and
// their "name" is a bare number. Drop those. (Real assignments with no due date
// are kept — the old date-only filter both missed these and dropped real rows.)
const DUE_DATE_RE = /\d{1,2}\/\d{1,2}\/\d{2,4}/;
const SUBTOTAL_CAT_RE = /^\s*-?\d+(?:\.\d+)?\s*%\s*$/;   // category is just a percentage
const BARE_NUMBER_RE = /^\s*-?\d+(?:\.\d+)?\s*$/;         // name is just a number
const cleanAssignments = (list) => (list || []).filter((a) => {
  if (SUBTOTAL_CAT_RE.test(String(a?.category ?? ''))) return false;
  if (BARE_NUMBER_RE.test(String(a?.assignmentName ?? '')) && !DUE_DATE_RE.test(a?.dateDue || '')) return false;
  return true;
});

// HAC's Classwork page can list the SAME course more than once — the S1 and S2
// sections of a year-long class, or an old + new section after a schedule change
// — which surfaces as duplicate rows (one real, one empty). Collapse them by the
// stable course key, keeping the richer entry (more assignments / a real grade).
function dedupeClasses(data) {
  if (!data || !Array.isArray(data.assignmentsData)) return data;
  const cleaned = data.assignmentsData.map((c) => ({ ...c, assignments: cleanAssignments(c.assignments) }));
  const rank = (c) => (c.assignments?.length || 0) * 10 + (/\d/.test(c.overallAverage || '') ? 1 : 0);
  const byKey = new Map();
  for (const c of cleaned) {
    const k = courseKey(c.courseName);
    const prev = byKey.get(k);
    if (!prev || rank(c) > rank(prev)) byKey.set(k, c);
  }
  return { ...data, assignmentsData: [...byKey.values()] };
}

// The API logs into HAC fresh on every request. Hitting it concurrently makes
// HAC reject the simultaneous logins ("Login failed"), so we funnel every call
// through a single serial queue — one request to HAC at a time, app-wide.
let queueTail = Promise.resolve();
function serialize(task) {
  const result = queueTail.then(task, task);
  queueTail = result.then(() => {}, () => {});
  return result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// CloudFront edges intermittently fail to resolve the Tailscale origin and
// answer with a 502/503/504 HTML error page - measured at roughly 1 request in
// 14, on a fully-deployed distribution. The backend is fine; the edge just
// needs asking again.
//
// This lives here rather than in post() for two reasons. A gateway error
// returns HTML, so res.json() throws before post() could ever classify it as
// transient. And /login passes retries = 0 on purpose - a wrong password must
// not be retried - yet it still has to survive a dud edge.
//
// Only gateway statuses are retried. A genuine connection failure still fails
// immediately, so going offline falls through to the cached-data path fast
// instead of stalling on retries that cannot succeed.
const GATEWAY_RETRIES = 2;
const isGatewayError = (status) => status === 502 || status === 503 || status === 504;

async function rawPost(path, body) {
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error('Could not reach the API. Is the server awake and the URL correct?');
    }
    if (isGatewayError(res.status) && attempt < GATEWAY_RETRIES) {
      await sleep(400 * (attempt + 1));
      continue;
    }
    break;
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`Bad response from API (HTTP ${res.status}).`);
  }
}

// `retries` retries a transient login failure (used for data calls where the
// credentials were already validated at sign-in). Login itself never retries.
function post(path, body, retries = 0) {
  return serialize(async () => {
    let last;
    for (let attempt = 0; attempt <= retries; attempt++) {
      last = await rawPost(path, body);
      const transient = !last?.success && /login failed|timeout|ECONN|socket/i.test(last?.message || '');
      if (last?.success || !transient || attempt === retries) return last;
      await sleep(900);
    }
    return last;
  });
}

export async function login(username, password) {
  const j = await post('/login', { username, password });
  if (!j.success) throw new Error(j.message || 'Login failed. Check your username and password.');
  return j; // { success, userName }
}

// Generic data fetch. `creds` = { username, password }.
export async function fetchData(creds, type, extra = {}) {
  const j = await post('/data', { ...creds, type, ...extra }, 2);
  if (!j.success) throw new Error(j.message || `Failed to load ${type}.`);
  return { data: type === 'class' ? dedupeClasses(j.data) : j.data, userName: j.userName };
}

export async function fetchIprDates(creds) {
  const j = await post('/ipr-dates', creds);
  if (!j.success) throw new Error(j.message || 'Failed to load IPR dates.');
  return j.availableDates;
}

// Batch fetch: one server round-trip that logs into HAC once and scrapes every
// requested resource. `requests` = [{ type, quarter?, date? }]. Returns the
// per-request results array (each { type, quarter?, success, data?, message? }).
export async function fetchBatch(creds, requests) {
  const j = await post('/batch', { ...creds, requests }, 1);
  if (!j.success) throw new Error(j.message || 'Batch request failed.');
  const results = (j.results || []).map((r) =>
    r.type === 'class' && r.success ? { ...r, data: dedupeClasses(r.data) } : r);
  return { userName: j.userName, results };
}

// Best-effort wake of a sleeping (Replit) server so the first real request
// doesn't eat the cold-start. Never throws.
export async function wake() {
  try { await fetch(BASE + "/ping", { method: 'GET' }) } catch (_) {}
}
