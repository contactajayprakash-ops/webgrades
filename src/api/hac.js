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

async function rawPost(path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error('Could not reach the API. Is the server awake and the URL correct?');
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
  return { data: j.data, userName: j.userName };
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
  return { userName: j.userName, results: j.results || [] };
}

// Best-effort wake of a sleeping (Replit) server so the first real request
// doesn't eat the cold-start. Never throws.
export async function wake() {
  try { await fetch(BASE + "/ping", { method: 'GET' }) } catch (_) {}
}
